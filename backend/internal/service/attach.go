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

// AttachService 附件：批量 init + 分片断点续传，业务只存 uuid。
type AttachService struct {
	DB  *gorm.DB
	Cfg config.UploadConfig
}

// AttachInitReq 初始化请求。
type AttachInitReq struct {
	FileName    string `json:"file_name" binding:"required"`
	Size        int64  `json:"size" binding:"required"`
	ContentType string `json:"content_type"`
	MD5         string `json:"md5"`
}

// AttachInitResp 初始化响应。
type AttachInitResp struct {
	UUID           string `json:"uuid"`
	ChunkSize      int64  `json:"chunk_size"`
	TotalChunks    int    `json:"total_chunks"`
	UploadedChunks []int  `json:"uploaded_chunks"`
	Status         string `json:"status"`
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
	return map[string]interface{}{
		"uuid":            att.UUID,
		"status":          att.Status,
		"total_chunks":    att.TotalChunks,
		"uploaded_chunks": upList,
		"missing_chunks":  missing,
		"chunk_size":      att.ChunkSize,
		"size":            att.Size,
		"file_name":       att.FileName,
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

// Complete 合并分片。
func (s *AttachService) Complete(uuidStr string) (*AttachInitResp, error) {
	att, err := s.get(uuidStr)
	if err != nil {
		return nil, err
	}
	if att.Status == "ready" {
		return &AttachInitResp{UUID: att.UUID, ChunkSize: att.ChunkSize, TotalChunks: att.TotalChunks, Status: att.Status}, nil
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
	return &AttachInitResp{
		UUID: att.UUID, ChunkSize: att.ChunkSize, TotalChunks: att.TotalChunks,
		Status: "ready",
	}, nil
}

// Meta 元数据。
func (s *AttachService) Meta(uuidStr string) (*model.Attachment, error) {
	att, err := s.get(uuidStr)
	if err != nil {
		return nil, err
	}
	return att, nil
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
