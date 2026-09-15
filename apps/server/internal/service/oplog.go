package service

import (
	"context"
	"strings"

	"gorm.io/gorm"

	"gbnt/apps/server/internal/database"
	"gbnt/apps/server/internal/model"
	"gbnt/apps/server/internal/perm"
)

// OpLogService 操作日志。
type OpLogService struct {
	DB *gorm.DB
}

const maxOpBody = 16384

type opMarkKey struct{}

type opMark struct {
	Action string
	Detail string
}

// OpLogRecord 写入操作日志的结构化入参；由 HTTP 适配层从请求组装。
type OpLogRecord struct {
	Action   string // 动作名；空则用 HTTP method
	Detail   string // 补充说明
	Path     string // 请求路径
	TraceID  string // 链路 ID
	IP       string // 客户端 IP
	Request  string // 已脱敏请求体
	Response string // 已脱敏响应体
}

// ContextWithMark 将操作文案写入 context，供 Persist 读取。
func ContextWithMark(ctx context.Context, action, detail string) context.Context {
	if ctx == nil {
		ctx = context.Background()
	}
	return context.WithValue(ctx, opMarkKey{}, opMark{Action: action, Detail: detail})
}

// ContextKeepCatalogMark 目录动作名；已有非空 Mark 时不覆盖。
func ContextKeepCatalogMark(ctx context.Context, catalogName string) context.Context {
	if ctx == nil {
		ctx = context.Background()
	}
	prev, _ := ctx.Value(opMarkKey{}).(opMark)
	if strings.TrimSpace(prev.Action) != "" {
		return ctx
	}
	name := strings.TrimSpace(catalogName)
	if name == "" {
		return ctx
	}
	return context.WithValue(ctx, opMarkKey{}, opMark{Action: name, Detail: prev.Detail})
}

// MarkFromContext 读取 Mark 写入的动作与说明。
func MarkFromContext(ctx context.Context) (action, detail string) {
	if ctx == nil {
		return "", ""
	}
	prev, _ := ctx.Value(opMarkKey{}).(opMark)
	return prev.Action, prev.Detail
}

// CatalogAction 按 sys_apis 目录解析动作名。
func (s *OpLogService) CatalogAction(method, fullPath string, permSvc *perm.Service) string {
	if s == nil || permSvc == nil || fullPath == "" {
		return ""
	}
	api, ok := permSvc.FindAPI(method, fullPath)
	if !ok {
		return ""
	}
	return strings.TrimSpace(api.Name)
}

// Persist 写入操作日志（含脱敏后的请求/响应体）。
func (s *OpLogService) Persist(ctx context.Context, rec OpLogRecord) error {
	if s == nil || s.DB == nil {
		return nil
	}
	if ctx == nil {
		ctx = context.Background()
	}
	act := strings.TrimSpace(rec.Action)
	if act == "" {
		act, rec.Detail = MarkFromContext(ctx)
	}
	if act == "" {
		return nil
	}
	uid := uint64(0)
	uname := ""
	if u, err := database.UserFromContext(ctx); err == nil {
		uid = u.ID
		uname = u.Username
	}
	return s.DB.WithContext(ctx).Create(&model.OpLog{
		UserID:   uid,
		Username: uname,
		Action:   act,
		Detail:   rec.Detail,
		Path:     rec.Path,
		TraceID:  rec.TraceID,
		IP:       rec.IP,
		Request:  clipOpBody(rec.Request),
		Response: clipOpBody(rec.Response),
	}).Error
}

func clipOpBody(s string) string {
	s = strings.TrimSpace(s)
	if len(s) <= maxOpBody {
		return s
	}
	return s[:maxOpBody] + "..."
}

// List 分页查询。
func (s *OpLogService) List(keyword string, page, size int) ([]model.OpLog, int64, error) {
	q := s.DB.Model(&model.OpLog{})
	if keyword != "" {
		like := "%" + keyword + "%"
		q = q.Where("action LIKE ? OR detail LIKE ? OR username LIKE ?", like, like, like)
	}
	var total int64
	if err := q.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var list []model.OpLog
	err := q.Order("id DESC").Offset((page - 1) * size).Limit(size).Find(&list).Error
	return list, total, err
}
