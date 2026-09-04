package handler

import (
	"github.com/gin-gonic/gin"

	"gbnt/backend/pkg/response"
)

func (d *Deps) registerHealth(api *gin.RouterGroup) {
	// GET /api/health — 健康检查（无需登录）
	api.GET("/health", d.Health)
}

// Health GET /api/health — 健康检查（公开），返回 {status:up}。
func (d *Deps) Health(c *gin.Context) {
	response.OK(c, gin.H{"status": "ok"})
}
