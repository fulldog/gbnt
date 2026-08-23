package handler

import (
	"io"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"

	"gbnt/backend/internal/service"
	"gbnt/backend/pkg/response"
)

// AttachInit 初始化单个上传任务，返回 uuid。
func (d *Deps) AttachInit(c *gin.Context) {
	var req service.AttachInitReq
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, 400, response.CodeBadReq, "参数错误")
		return
	}
	out, err := d.Attach.Init(req, userID(c))
	if err != nil {
		response.Fail(c, 400, response.CodeBadReq, err.Error())
		return
	}
	response.OK(c, out)
}

// AttachBatchInit 批量初始化，每个文件一个 uuid。
func (d *Deps) AttachBatchInit(c *gin.Context) {
	var req struct {
		Files []service.AttachInitReq `json:"files" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, 400, response.CodeBadReq, "参数错误")
		return
	}
	list, err := d.Attach.BatchInit(req.Files, userID(c))
	if err != nil {
		response.Fail(c, 400, response.CodeBadReq, err.Error())
		return
	}
	response.OK(c, gin.H{"list": list})
}

// AttachStatus 查询上传进度与缺失分片。
func (d *Deps) AttachStatus(c *gin.Context) {
	out, err := d.Attach.Status(c.Param("uuid"))
	if err != nil {
		response.Fail(c, 404, response.CodeNotFound, err.Error())
		return
	}
	response.OK(c, out)
}

// AttachChunk 上传分片（支持断点续传）。
func (d *Deps) AttachChunk(c *gin.Context) {
	idx, err := strconv.Atoi(c.Param("index"))
	if err != nil || idx < 0 {
		response.Fail(c, 400, response.CodeBadReq, "无效分片序号")
		return
	}
	data, err := io.ReadAll(c.Request.Body)
	if err != nil {
		response.Fail(c, 400, response.CodeBadReq, "读取分片失败")
		return
	}
	if err := d.Attach.UploadChunk(c.Param("uuid"), idx, data); err != nil {
		response.Fail(c, 400, response.CodeBadReq, err.Error())
		return
	}
	response.OK(c, gin.H{"chunk_index": idx})
}

// AttachComplete 合并分片，状态变为 ready。
func (d *Deps) AttachComplete(c *gin.Context) {
	out, err := d.Attach.Complete(c.Param("uuid"))
	if err != nil {
		response.Fail(c, 400, response.CodeBadReq, err.Error())
		return
	}
	response.OK(c, out)
}

// AttachMeta 附件元数据。
func (d *Deps) AttachMeta(c *gin.Context) {
	out, err := d.Attach.Meta(c.Param("uuid"))
	if err != nil {
		response.Fail(c, 404, response.CodeNotFound, err.Error())
		return
	}
	response.OK(c, out)
}

// AttachDownload 下载已就绪附件。
func (d *Deps) AttachDownload(c *gin.Context) {
	path, name, ctype, err := d.Attach.FilePath(c.Param("uuid"))
	if err != nil {
		response.Fail(c, 404, response.CodeNotFound, err.Error())
		return
	}
	if ctype != "" {
		c.Header("Content-Type", ctype)
	}
	c.Header("Content-Disposition", "attachment; filename=\""+name+"\"")
	c.File(path)
	// 手动补耗时头（File 不走 response.OK）
	_ = http.StatusOK
}
