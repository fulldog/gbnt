package service

import (
	"context"
	"crypto/md5"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"os"
	"path/filepath"
	"strings"
	"time"
	"unicode"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"gbnt/backend/internal/config"
	"gbnt/backend/internal/database"
	"gbnt/backend/internal/model"
	"gbnt/backend/internal/watermark"
)

const (
	maxDirectImages = 20
	uploadURLPrefix = "/uploads"
)

// AttachService 图片直传附件。
type AttachService struct {
	DB  *gorm.DB
	Cfg config.UploadConfig
	WM  *watermark.Renderer
}

// FileItem 直传/反查返回项。
type FileItem struct {
	FileID string `json:"file_id"` // 文件业务 UUID
	URL    string `json:"url"`     // 可访问相对路径 /uploads/y/m/d/...
}

// WatermarkInput 图片水印参数（姓名取自登录上下文）。
type WatermarkInput struct {
	Lat     *float64 `json:"lat" form:"lat"`         // 纬度（可选）
	Lng     *float64 `json:"lng" form:"lng"`         // 经度（可选）
	Address string   `json:"address" form:"address"` // 定位地址（可选）
}

func (w WatermarkInput) toMeta(userName string) watermark.Meta {
	var lat, lng float64
	if w.Lat != nil {
		lat = *w.Lat
	}
	if w.Lng != nil {
		lng = *w.Lng
	}
	return watermark.Meta{
		UserName: strings.TrimSpace(userName),
		Lat:      lat,
		Lng:      lng,
		Address:  strings.TrimSpace(w.Address),
	}
}

func (s *AttachService) ensureRoot() error {
	return os.MkdirAll(s.Cfg.Root, 0o755)
}

func (s *AttachService) renderer() *watermark.Renderer {
	if s.WM != nil {
		return s.WM
	}
	return watermark.NewRenderer(s.Cfg.Font)
}

func now() time.Time {
	return time.Now()
}

// dateRelDir 返回 y/m/d（本地时区，月日两位）。
func dateRelDir(t time.Time) string {
	t = t.In(time.Local)
	return fmt.Sprintf("%d/%02d/%02d", t.Year(), int(t.Month()), t.Day())
}

// uploadURLPath 可浏览器直接打开的相对 URL（与 storage_path 一致）。
func uploadURLPath(rel string) string {
	rel = strings.ReplaceAll(rel, "\\", "/")
	rel = strings.TrimLeft(rel, "/")
	return uploadURLPrefix + "/" + rel
}

func diskPath(root, rel string) string {
	return filepath.Join(append([]string{root}, strings.Split(rel, "/")...)...)
}

// storedFileName 落盘名：原始名称_{user_id}_{毫秒时间戳}，扩展名保留在末尾。
func storedFileName(orig string, userID int, ms int64) string {
	ext := filepath.Ext(orig)
	base := strings.TrimSuffix(orig, ext)
	if base == "" {
		base = "image"
	}
	return fmt.Sprintf("%s_%d_%d%s", base, userID, ms, ext)
}

func uniqueStoredFileName(dir, orig string, userID int, ms int64) string {
	for i := 0; i < 1000; i++ {
		name := storedFileName(orig, userID, ms+int64(i))
		p := filepath.Join(dir, name)
		_, err := os.Stat(p)
		if err != nil && os.IsNotExist(err) {
			return name
		}
	}
	return storedFileName(orig, userID, ms)
}

// sanitizeUploadFileName 保留上传文件名，替换 URL/路径非法字符。
func sanitizeUploadFileName(name string) string {
	name = filepath.Base(strings.TrimSpace(name))
	if name == "" || name == "." || name == ".." {
		return "image.jpg"
	}
	var b strings.Builder
	for _, r := range name {
		switch {
		case unicode.IsControl(r):
			continue
		case r == '\\', r == '/', r == ':', r == '*', r == '?', r == '"', r == '<', r == '>', r == '|':
			b.WriteRune('_')
		case r == ' ', r == '#', r == '%', r == '&', r == '+':
			b.WriteRune('_')
		default:
			b.WriteRune(r)
		}
	}
	out := strings.Trim(b.String(), "._")
	if out == "" {
		return "image.jpg"
	}
	return out
}

func fileMD5(path string) (string, error) {
	f, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer f.Close()
	h := md5.New()
	if _, err := io.Copy(h, f); err != nil {
		return "", err
	}
	return hex.EncodeToString(h.Sum(nil)), nil
}

func (s *AttachService) db(ctx context.Context) *gorm.DB {
	if ctx == nil {
		return s.DB
	}
	return s.DB.WithContext(ctx)
}

// SaveImages 批量直传：逐张打水印、落盘、写库，返回 file_id + 可访问 url。
func (s *AttachService) SaveImages(ctx context.Context, headers []*multipart.FileHeader, meta WatermarkInput) ([]FileItem, error) {
	user, err := database.UserFromContext(ctx)
	if err != nil {
		return nil, err
	}
	if len(headers) == 0 {
		return nil, errors.New("请至少上传 1 张图片")
	}
	if len(headers) > maxDirectImages {
		return nil, fmt.Errorf("一次最多上传 %d 张图片", maxDirectImages)
	}
	if err := s.ensureRoot(); err != nil {
		return nil, err
	}
	list := make([]FileItem, 0, len(headers))
	for i, fh := range headers {
		item, err := s.saveOneImage(ctx, fh, meta, user)
		if err != nil {
			return list, fmt.Errorf("第 %d 张: %w", i+1, err)
		}
		list = append(list, item)
	}
	return list, nil
}

func (s *AttachService) saveOneImage(ctx context.Context, fh *multipart.FileHeader, meta WatermarkInput, user *database.UserInfo) (FileItem, error) {
	var empty FileItem
	fileName := sanitizeUploadFileName(fh.Filename)
	ctype := fh.Header.Get("Content-Type")
	if !watermark.IsImage(ctype, fileName) {
		return empty, errors.New("仅支持 jpg/png/gif/webp 图片")
	}
	if s.Cfg.MaxFileSize > 0 && fh.Size > s.Cfg.MaxFileSize {
		return empty, errors.New("文件超过大小限制")
	}

	fileID := uuid.NewString()
	relDir := dateRelDir(now())
	dir := diskPath(s.Cfg.Root, relDir)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return empty, err
	}
	userID := int(user.ID)
	storedName := uniqueStoredFileName(dir, fileName, userID, now().UnixMilli())
	rel := relDir + "/" + storedName
	finalPath := diskPath(s.Cfg.Root, rel)

	src, err := fh.Open()
	if err != nil {
		return empty, err
	}
	defer src.Close()

	out, err := os.Create(finalPath)
	if err != nil {
		return empty, err
	}
	max := s.Cfg.MaxFileSize
	if max <= 0 {
		max = 100 << 20
	}
	written, copyErr := io.Copy(out, io.LimitReader(src, max+1))
	closeErr := out.Close()
	if copyErr != nil {
		_ = os.Remove(finalPath)
		return empty, copyErr
	}
	if closeErr != nil {
		_ = os.Remove(finalPath)
		return empty, closeErr
	}
	if written > max {
		_ = os.Remove(finalPath)
		return empty, errors.New("文件超过大小限制")
	}
	if written == 0 {
		_ = os.Remove(finalPath)
		return empty, errors.New("空文件")
	}

	if err := s.renderer().ApplyFile(finalPath, ctype, storedName, meta.toMeta(user.Name)); err != nil {
		_ = os.Remove(finalPath)
		return empty, fmt.Errorf("watermark: %w", err)
	}

	md5Val, err := fileMD5(finalPath)
	if err != nil {
		_ = os.Remove(finalPath)
		return empty, err
	}
	st, err := os.Stat(finalPath)
	if err != nil {
		_ = os.Remove(finalPath)
		return empty, err
	}

	urlPath := uploadURLPath(rel)
	att := &model.Attachment{
		FileID:      fileID,
		OrigName:    fileName,
		FileName:    storedName,
		ContentType: ctype,
		Size:        st.Size(),
		MD5:         md5Val,
		Status:      "success",
		StoragePath: urlPath,
	}
	if err := s.db(ctx).Create(att).Error; err != nil {
		_ = os.Remove(finalPath)
		return empty, err
	}
	return FileItem{FileID: fileID, URL: urlPath}, nil
}

// Bind 用 file_id 列表创建关联组，返回 att_id。
func (s *AttachService) Bind(ctx context.Context, fileIDs []string) (attID string, list []FileItem, err error) {
	if len(fileIDs) == 0 {
		return "", nil, errors.New("文件 file_id 列表不能为空")
	}
	seen := map[string]struct{}{}
	clean := make([]string, 0, len(fileIDs))
	for _, id := range fileIDs {
		id = strings.TrimSpace(id)
		if id == "" {
			continue
		}
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		clean = append(clean, id)
	}
	if len(clean) == 0 {
		return "", nil, errors.New("文件 file_id 列表不能为空")
	}

	list = make([]FileItem, 0, len(clean))
	for _, id := range clean {
		var att model.Attachment
		if err := s.db(ctx).Where("file_id = ?", id).First(&att).Error; err != nil {
			return "", nil, fmt.Errorf("文件不存在: %s", id)
		}
		if att.Status != "success" {
			return "", nil, fmt.Errorf("文件未就绪: %s", id)
		}
		list = append(list, FileItem{FileID: att.FileID, URL: att.StoragePath})
	}

	attID = uuid.NewString()
	err = s.db(ctx).Transaction(func(tx *gorm.DB) error {
		for _, id := range clean {
			item := model.AttachmentRefItem{AttID: attID, FileID: id}
			if err := tx.Create(&item).Error; err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return "", nil, err
	}
	return attID, list, nil
}

// Resolve 按 att_id 反查文件 list。
func (s *AttachService) Resolve(attID string) ([]FileItem, error) {
	if attID == "" {
		return []FileItem{}, nil
	}
	var items []model.AttachmentRefItem
	if err := s.DB.Where("att_id = ?", attID).Order("id ASC").Find(&items).Error; err != nil {
		return nil, err
	}
	if len(items) == 0 {
		return nil, errors.New("关联记录不存在或无文件")
	}
	list := make([]FileItem, 0, len(items))
	for _, it := range items {
		var att model.Attachment
		if err := s.DB.Where("file_id = ?", it.FileID).First(&att).Error; err != nil {
			return nil, fmt.Errorf("关联文件缺失: %s", it.FileID)
		}
		list = append(list, FileItem{FileID: att.FileID, URL: att.StoragePath})
	}
	return list, nil
}
