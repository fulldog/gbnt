package service

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"gbnt/backend/internal/config"
	"gbnt/backend/internal/model"
)

// AttachService 附件：分片上传 + 文件关联组（业务只存 ref_uuid）。
type AttachService struct {
	DB  *gorm.DB
	Cfg config.UploadConfig
}

// FileItem 上传/反查返回的单文件项。
type FileItem struct {
	UUID string `json:"uuid"`
	URL  string `json:"url"`
}

// AttachInitReq 初始化请求。
type AttachInitReq struct {
	FileName    string `json:"file_name" binding:"required"`
	Size        int64  `json:"size" binding:"required"`
	ContentType string `json:"content_type"`
	MD5         string `json:"md5"`
}

// AttachInitResp 初始化响应（上传过程态）。
type AttachInitResp struct {
	UUID           string `json:"uuid"`
	ChunkSize      int64  `json:"chunk_size"`
	TotalChunks    int    `json:"total_chunks"`
	UploadedChunks []int  `json:"uploaded_chunks"`
	Status         string `json:"status"`
	URL            string `json:"url"` // 未完成前为空
}

// FileURL 生成附件访问路径（相对 /api，前端拼 API_BASE_URL）。
func (s *AttachService) FileURL(fileUUID string) string {
	return "/api/attachments/" + fileUUID + "/download"
}

func (s *AttachService) ensureRoot() error {
	return os.MkdirAll(s.Cfg.Root, 0o755)
}

// Init 创建上传任务。
func (s *AttachService) Init(req AttachInitReq, uploaderID uint64) (*AttachInitResp, error) {
	if req.Size <= 0 {
		return nil, errors.New("size 无效")
	}
	if s.Cfg.MaxFileSize > 0 && req.Size > s.Cfg.MaxFileSize {
		return nil, errors.New("文件超过大小限制")
	}
	if err := s.ensureRoot(); err != nil {
		return nil, err
	}
	chunkSize := s.Cfg.ChunkSize
	if chunkSize <= 0 {
		chunkSize = 2 << 20
	}
	total := int((req.Size + chunkSize - 1) / chunkSize)
	id := uuid.NewString()
	dir := filepath.Join(s.Cfg.Root, id)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, err
	}
	att := &model.Attachment{
		UUID:        id,
		FileName:    req.FileName,
		ContentType: req.ContentType,
		Size:        req.Size,
		ChunkSize:   chunkSize,
		TotalChunks: total,
		MD5:         req.MD5,
		Status:      "uploading",
		UploaderID:  uploaderID,
		StoragePath: dir,
	}
	if err := s.DB.Create(att).Error; err != nil {
		return nil, err
	}
	return &AttachInitResp{
		UUID: id, ChunkSize: chunkSize, TotalChunks: total,
		UploadedChunks: []int{}, Status: att.Status,
	}, nil
}

// BatchInit 批量初始化。
func (s *AttachService) BatchInit(files []AttachInitReq, uploaderID uint64) ([]*AttachInitResp, error) {
	out := make([]*AttachInitResp, 0, len(files))
	for _, f := range files {
		r, err := s.Init(f, uploaderID)
		if err != nil {
			return out, err
		}
		out = append(out, r)
	}
	return out, nil
}

func (s *AttachService) get(uuidStr string) (*model.Attachment, error) {
	var att model.Attachment
	if err := s.DB.Where("uuid = ?", uuidStr).First(&att).Error; err != nil {
		return nil, errors.New("附件不存在")
	}
	return &att, nil
}

func parseBits(s string) map[int]struct{} {
	m := map[int]struct{}{}
	for _, p := range strings.Split(s, ",") {
		p = strings.TrimSpace(p)
		if p == "" {
			continue
		}
		i, err := strconv.Atoi(p)
		if err == nil {
			m[i] = struct{}{}
		}
	}
	return m
}

func bitsToCSV(m map[int]struct{}) string {
	arr := make([]int, 0, len(m))
	for k := range m {
		arr = append(arr, k)
	}
	sort.Ints(arr)
	ss := make([]string, len(arr))
	for i, v := range arr {
		ss[i] = strconv.Itoa(v)
	}
	return strings.Join(ss, ",")
}

// Status 进度与缺失分片。
func (s *AttachService) Status(uuidStr string) (map[string]interface{}, error) {
	att, err := s.get(uuidStr)
	if err != nil {
		return nil, err
	}
	uploaded := parseBits(att.UploadedBits)
	missing := []int{}
	for i := 0; i < att.TotalChunks; i++ {
		if _, ok := uploaded[i]; !ok {
			missing = append(missing, i)
		}
	}
	upList := make([]int, 0, len(uploaded))
	for k := range uploaded {
		upList = append(upList, k)
	}
	sort.Ints(upList)
	url := ""
	if att.Status == "ready" {
		url = s.FileURL(att.UUID)
	}
	return map[string]interface{}{
		"uuid":            att.UUID,
		"status":          att.Status,
		"total_chunks":    att.TotalChunks,
		"uploaded_chunks": upList,
		"missing_chunks":  missing,
		"chunk_size":      att.ChunkSize,
		"size":            att.Size,
		"file_name":       att.FileName,
		"url":             url,
	}, nil
}

// UploadChunk 写入分片（已存在则覆盖，支持续传）。
func (s *AttachService) UploadChunk(uuidStr string, index int, data []byte) error {
	att, err := s.get(uuidStr)
	if err != nil {
		return err
	}
	if att.Status == "ready" {
		return errors.New("附件已完成，不可再传分片")
	}
	if index < 0 || index >= att.TotalChunks {
		return errors.New("分片序号越界")
	}
	chunkPath := filepath.Join(att.StoragePath, fmt.Sprintf("%d.part", index))
	if err := os.WriteFile(chunkPath, data, 0o644); err != nil {
		return err
	}
	var chunk model.AttachmentChunk
	err = s.DB.Where("uuid = ? AND chunk_index = ?", uuidStr, index).First(&chunk).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		chunk = model.AttachmentChunk{UUID: uuidStr, ChunkIndex: index, Size: int64(len(data)), Path: chunkPath}
		if err := s.DB.Create(&chunk).Error; err != nil {
			return err
		}
	} else if err != nil {
		return err
	} else {
		_ = s.DB.Model(&chunk).Updates(map[string]interface{}{"size": len(data), "path": chunkPath}).Error
	}
	bits := parseBits(att.UploadedBits)
	bits[index] = struct{}{}
	return s.DB.Model(att).Update("uploaded_bits", bitsToCSV(bits)).Error
}

// Complete 合并分片；成功返回 list[{uuid,url}]。
func (s *AttachService) Complete(uuidStr string) ([]FileItem, error) {
	att, err := s.get(uuidStr)
	if err != nil {
		return nil, err
	}
	if att.Status == "ready" {
		return []FileItem{{UUID: att.UUID, URL: s.FileURL(att.UUID)}}, nil
	}
	uploaded := parseBits(att.UploadedBits)
	if len(uploaded) < att.TotalChunks {
		return nil, fmt.Errorf("分片未齐：已传 %d/%d", len(uploaded), att.TotalChunks)
	}
	finalPath := filepath.Join(att.StoragePath, "file")
	out, err := os.Create(finalPath)
	if err != nil {
		return nil, err
	}
	defer out.Close()
	for i := 0; i < att.TotalChunks; i++ {
		part := filepath.Join(att.StoragePath, fmt.Sprintf("%d.part", i))
		b, err := os.ReadFile(part)
		if err != nil {
			return nil, fmt.Errorf("读取分片 %d 失败: %w", i, err)
		}
		if _, err := out.Write(b); err != nil {
			return nil, err
		}
	}
	if err := s.DB.Model(att).Updates(map[string]interface{}{
		"status": "ready", "storage_path": finalPath,
	}).Error; err != nil {
		return nil, err
	}
	return []FileItem{{UUID: att.UUID, URL: s.FileURL(att.UUID)}}, nil
}

// CompleteMany 批量完成（校验均已 ready 或逐个合并），返回统一 list。
func (s *AttachService) CompleteMany(uuids []string) ([]FileItem, error) {
	list := make([]FileItem, 0, len(uuids))
	for _, id := range uuids {
		items, err := s.Complete(id)
		if err != nil {
			return list, err
		}
		list = append(list, items...)
	}
	return list, nil
}

// Bind 用文件 uuid 列表创建一对多关联；任一不存在或未就绪则报错。返回关联 ref_uuid 与文件 list。
func (s *AttachService) Bind(fileUUIDs []string) (refUUID string, list []FileItem, err error) {
	if len(fileUUIDs) == 0 {
		return "", nil, errors.New("文件 uuid 列表不能为空")
	}
	seen := map[string]struct{}{}
	clean := make([]string, 0, len(fileUUIDs))
	for _, id := range fileUUIDs {
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
		return "", nil, errors.New("文件 uuid 列表不能为空")
	}

	list = make([]FileItem, 0, len(clean))
	for _, id := range clean {
		att, err := s.get(id)
		if err != nil {
			return "", nil, fmt.Errorf("文件不存在: %s", id)
		}
		if att.Status != "ready" {
			return "", nil, fmt.Errorf("文件未就绪: %s", id)
		}
		list = append(list, FileItem{UUID: att.UUID, URL: s.FileURL(att.UUID)})
	}

	refUUID = uuid.NewString()
	err = s.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(&model.AttachmentRef{RefUUID: refUUID}).Error; err != nil {
			return err
		}
		for i, id := range clean {
			item := model.AttachmentRefItem{RefUUID: refUUID, FileUUID: id, Sort: i}
			if err := tx.Create(&item).Error; err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return "", nil, err
	}
	return refUUID, list, nil
}

// Resolve 按关联 ref_uuid 反查真实文件 uuid 与 url 列表。
func (s *AttachService) Resolve(refUUID string) ([]FileItem, error) {
	if refUUID == "" {
		return []FileItem{}, nil
	}
	var items []model.AttachmentRefItem
	if err := s.DB.Where("ref_uuid = ?", refUUID).Order("sort ASC, id ASC").Find(&items).Error; err != nil {
		return nil, err
	}
	if len(items) == 0 {
		return nil, errors.New("关联记录不存在或无文件")
	}
	list := make([]FileItem, 0, len(items))
	for _, it := range items {
		att, err := s.get(it.FileUUID)
		if err != nil {
			return nil, fmt.Errorf("关联文件缺失: %s", it.FileUUID)
		}
		list = append(list, FileItem{UUID: att.UUID, URL: s.FileURL(att.UUID)})
	}
	return list, nil
}

// Meta 元数据。
func (s *AttachService) Meta(uuidStr string) (*model.Attachment, error) {
	return s.get(uuidStr)
}

// FilePath 已就绪文件路径。
func (s *AttachService) FilePath(uuidStr string) (path, name, ctype string, err error) {
	att, err := s.get(uuidStr)
	if err != nil {
		return "", "", "", err
	}
	if att.Status != "ready" {
		return "", "", "", errors.New("附件未就绪")
	}
	return att.StoragePath, att.FileName, att.ContentType, nil
}
