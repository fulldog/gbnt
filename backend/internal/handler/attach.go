package handler

import (
	"errors"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"

	"gbnt/backend/internal/database"
	"gbnt/backend/internal/service"
	"gbnt/backend/pkg/response"
)

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

func watermarkFromForm(c *gin.Context) (service.WatermarkInput, error) {
	var meta service.WatermarkInput
	meta.Address = strings.TrimSpace(c.PostForm("address"))
	lat, err := parseOptionalFloat(c.PostForm("lat"))
	if err != nil {
		return meta, err
	}
	lng, err := parseOptionalFloat(c.PostForm("lng"))
	if err != nil {
		return meta, err
	}
	meta.Lat = lat
	meta.Lng = lng
	return meta, nil
}

// AttachUploadImages POST /api/attachments/images — 批量直传图片（multipart files/file + lat/lng/address）；水印姓名取登录用户。
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
		response.Fail(c, 400, response.CodeBadReq, "经纬度参数无效")
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
