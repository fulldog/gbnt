package database

import (
	"context"
	"errors"
	"reflect"

	"gorm.io/gorm"
)

type ctxKeyUser struct{}

var userInfoKey = ctxKeyUser{}

// ErrUnauth 请求上下文中没有登录用户。
var ErrUnauth = errors.New("未登录或凭证无效")

// UserInfo 写入 request context 的当前登录用户（不含密码）。
type UserInfo struct {
	ID           uint64
	Username     string
	Name         string
	Phone        string
	OrgID        uint64
	RoleID       uint64
	TokenVer     int
	AppTokenVer  int
	IsSuperAdmin bool
}

// WithUser 把当前用户写入 context，供审计字段与业务层读取。
func WithUser(ctx context.Context, info *UserInfo) context.Context {
	if ctx == nil {
		ctx = context.Background()
	}
	return context.WithValue(ctx, userInfoKey, info)
}

// UserFromContext 读取登录用户；找不到则返回 ErrUnauth。
func UserFromContext(ctx context.Context) (*UserInfo, error) {
	if ctx == nil {
		return nil, ErrUnauth
	}
	v, ok := ctx.Value(userInfoKey).(*UserInfo)
	if !ok || v == nil || v.ID == 0 {
		return nil, ErrUnauth
	}
	return v, nil
}

// UserIDFromContext 读取审计用户 id；未登录时为 0（GORM 回调不强制登录）。
func UserIDFromContext(ctx context.Context) int {
	u, err := UserFromContext(ctx)
	if err != nil {
		return 0
	}
	return int(u.ID)
}

// RegisterAuditCallbacks 创建时写 created_id+updated_id，更新时写 updated_id。
func RegisterAuditCallbacks(db *gorm.DB) {
	_ = db.Callback().Create().Before("gorm:create").Register("gbnt:created_id", fillCreatedAudit)
	_ = db.Callback().Update().Before("gorm:update").Register("gbnt:updated_id", fillUpdateAudit)
}

func fillCreatedAudit(db *gorm.DB) {
	if db.Statement == nil || db.Statement.Schema == nil {
		return
	}
	uid := UserIDFromContext(db.Statement.Context)
	if uid == 0 {
		return
	}
	created := db.Statement.Schema.LookUpField("CreatedID")
	updated := db.Statement.Schema.LookUpField("UpdatedID")
	if created == nil && updated == nil {
		return
	}
	// 批量 Create([]T) 时 ReflectValue 是 slice，不能按结构体 Field 赋值。
	for _, dest := range auditDestValues(db.Statement.ReflectValue) {
		if created != nil {
			_ = created.Set(db.Statement.Context, dest, uid)
		}
		if updated != nil {
			_ = updated.Set(db.Statement.Context, dest, uid)
		}
	}
}

func auditDestValues(rv reflect.Value) []reflect.Value {
	if !rv.IsValid() {
		return nil
	}
	for rv.Kind() == reflect.Ptr {
		if rv.IsNil() {
			return nil
		}
		rv = rv.Elem()
	}
	switch rv.Kind() {
	case reflect.Slice, reflect.Array:
		out := make([]reflect.Value, 0, rv.Len())
		for i := 0; i < rv.Len(); i++ {
			item := rv.Index(i)
			if item.Kind() == reflect.Ptr {
				if item.IsNil() {
					continue
				}
				item = item.Elem()
			}
			out = append(out, item)
		}
		return out
	default:
		return []reflect.Value{rv}
	}
}

func fillUpdateAudit(db *gorm.DB) {
	if db.Statement == nil || db.Statement.Schema == nil {
		return
	}
	if db.Statement.Schema.LookUpField("UpdatedID") == nil {
		return
	}
	uid := UserIDFromContext(db.Statement.Context)
	if uid == 0 {
		return
	}
	db.Statement.SetColumn("updated_id", uid)
}
