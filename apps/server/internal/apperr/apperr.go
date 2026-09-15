// Package apperr 存放可被中间件与业务层共用的哨兵错误，避免 pkg/middleware 依赖 service。
package apperr

import "errors"

// ErrMiniappSuperAdmin 超级管理员禁止登录小程序及访问 /api/app 业务接口。
var ErrMiniappSuperAdmin = errors.New("超级管理员不能登录小程序")
