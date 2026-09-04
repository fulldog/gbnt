package handler

import (
	"errors"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"

	"gbnt/apps/server/internal/database"
	"gbnt/apps/server/internal/service"
	"gbnt/apps/server/pkg/response"
)

func (d *Deps) registerAttach(api *gin.RouterGroup) {
	att := api.Group("/attachments")
	att.POST("/images", d.AttachUploadImages)
}

func parseOptionalFloat(s string) (*float64, error) {
	s = strings.TrimSpace(s)
	if s == "" {
		return nil, nil
	}
	v, err := strconv.ParseFloat(s, 64)
	if err != nil {
		return nil, err
	}
	return &v, nil
}

// parseFormBool 解析表单布尔；空串用 defaultVal（兼容未传 watermark 时默认打水印）。
func parseFormBool(s string, defaultVal bool) (bool, error) {
	s = strings.TrimSpace(strings.ToLower(s))
	if s == "" {
		return defaultVal, nil
	}
	switch s {
	case "1", "true", "yes", "on", "y":
		return true, nil
	case "0", "false", "no", "off", "n":
		return false, nil
	default:
		return false, errors.New("watermark 参数无效，请传 1/0 或 true/false")
	}
}

func watermarkFromForm(c *gin.Context) (service.WatermarkInput, error) {
	var meta service.WatermarkInput
	enabled, err := parseFormBool(c.PostForm("watermark"), true)
	if err != nil {
		return meta, err
	}
	meta.Enabled = enabled
	meta.Address = strings.TrimSpace(c.PostForm("address"))
	lat, err := parseOptionalFloat(c.PostForm("lat"))
	if err != nil {
		return meta, errors.New("经纬度参数无效")
	}
	lng, err := parseOptionalFloat(c.PostForm("lng"))
	if err != nil {
		return meta, errors.New("经纬度参数无效")
	}
	meta.Lat = lat
	meta.Lng = lng
	return meta, nil
}

// AttachUploadImages POST /api/attachments/images — 批量直传图片（multipart files/file + 可选 watermark/lat/lng/address）。
func (d *Deps) AttachUploadImages(c *gin.Context) {
	maxMem := d.Cfg.Upload.MaxFileSize
	if maxMem <= 0 {
		maxMem = 32 << 20
	}
	if err := c.Request.ParseMultipartForm(maxMem); err != nil {
		response.Fail(c, 400, response.CodeBadReq, "读取上传表单失败")
		return
	}
	form := c.Request.MultipartForm
	if form == nil {
		response.Fail(c, 400, response.CodeBadReq, "请使用 multipart 上传图片")
		return
	}
	headers := form.File["files"]
	if len(headers) == 0 {
		headers = form.File["file"]
	}
	meta, err := watermarkFromForm(c)
	if err != nil {
		response.Fail(c, 400, response.CodeBadReq, err.Error())
		return
	}
	list, err := d.Attach.SaveImages(c.Request.Context(), headers, meta)
	if err != nil {
		if errors.Is(err, database.ErrUnauth) {
			response.Fail(c, 401, response.CodeUnauth, err.Error())
			return
		}
		response.Fail(c, 400, response.CodeBadReq, err.Error())
		return
	}
	d.OpLog.Mark(c, "上传图片", "")
	response.OK(c, gin.H{"list": list})
}
