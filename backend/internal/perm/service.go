package perm

import (
	"fmt"
	"sync"
	"time"

	"gorm.io/gorm"

	"gbnt/backend/internal/cachex"
	"gbnt/backend/internal/model"
)

// Service RBAC 权限校验与 API 目录。
type Service struct {
	DB    *gorm.DB
	Cache *cachex.Store
	mu    sync.RWMutex
	byKey map[string]model.SysAPI // method+"\x00"+path
}

// NewStaticService 用内存 API 索引构造（测试或跳过 DB 加载）。
func NewStaticService(cache *cachex.Store, apis []model.SysAPI) *Service {
	m := make(map[string]model.SysAPI, len(apis))
	for _, a := range apis {
		m[apiKey(a.Method, a.Path)] = a
	}
	if cache == nil {
		cache = cachex.New(0, 0)
	}
	return &Service{Cache: cache, byKey: m}
}

// NewService 创建权限服务。
func NewService(db *gorm.DB, cache *cachex.Store) *Service {
	s := &Service{DB: db, Cache: cache, byKey: map[string]model.SysAPI{}}
	_ = s.ReloadAPIIndex()
	return s
}

func apiKey(method, path string) string {
	return method + "\x00" + path
}

// ReloadAPIIndex 从 DB 重建 API 索引（sync 后调用）。
func (s *Service) ReloadAPIIndex() error {
	var list []model.SysAPI
	if err := s.DB.Where("enabled = ?", true).Find(&list).Error; err != nil {
		return err
	}
	m := make(map[string]model.SysAPI, len(list))
	for _, a := range list {
		m[apiKey(a.Method, a.Path)] = a
	}
	s.mu.Lock()
	s.byKey = m
	s.mu.Unlock()
	return nil
}

// FindAPI 按 method + gin FullPath 查找 API。
func (s *Service) FindAPI(method, path string) (*model.SysAPI, bool) {
	s.mu.RLock()
	a, ok := s.byKey[apiKey(method, path)]
	s.mu.RUnlock()
	if !ok {
		return nil, false
	}
	return &a, true
}

type roleGrantCache struct {
	ModuleActions map[string]map[string]bool
	APIIDs        []uint64
}

func (s *Service) loadRoleGrants(roleID uint64) (*roleGrantCache, error) {
	if roleID == SuperAdminRoleID {
		return &roleGrantCache{ModuleActions: map[string]map[string]bool{}, APIIDs: nil}, nil
	}
	key := fmt.Sprintf("perm:role:%d", roleID)
	if v, ok := s.Cache.Get(key); ok {
		if c, ok2 := v.(*roleGrantCache); ok2 {
			return c, nil
		}
	}
	var apiIDs []uint64
	if err := s.DB.Model(&model.SysRoleAPI{}).Where("role_id = ?", roleID).Pluck("api_id", &apiIDs).Error; err != nil {
		return nil, err
	}
	var apis []model.SysAPI
	if len(apiIDs) > 0 {
		if err := s.DB.Where("id IN ? AND enabled = ?", apiIDs, true).Find(&apis).Error; err != nil {
			return nil, err
		}
	}
	grants := map[string]map[string]bool{}
	for _, a := range apis {
		if grants[a.Module] == nil {
			grants[a.Module] = map[string]bool{}
		}
		grants[a.Module][a.Action] = true
	}
	out := &roleGrantCache{ModuleActions: grants, APIIDs: apiIDs}
	s.Cache.Set(key, out, 5*time.Minute)
	return out, nil
}

// InvalidateRole 清除角色权限缓存。
func (s *Service) InvalidateRole(roleID uint64) {
	s.Cache.Delete(fmt.Sprintf("perm:role:%d", roleID))
}

// Allow 校验 role 是否可访问指定 API。
func (s *Service) Allow(roleID uint64, api *model.SysAPI) (bool, error) {
	if roleID == SuperAdminRoleID {
		return true, nil
	}
	if api == nil {
		return false, nil
	}
	grants, err := s.loadRoleGrants(roleID)
	if err != nil {
		return false, err
	}
	return actionSatisfies(grants.ModuleActions, api.Module, api.Action), nil
}

// ListAPIIDsForRole 返回角色已授权 API id 列表；超管返回 nil 表示全部。
func (s *Service) ListAPIIDsForRole(roleID uint64) ([]uint64, error) {
	if roleID == SuperAdminRoleID {
		return nil, nil
	}
	grants, err := s.loadRoleGrants(roleID)
	if err != nil {
		return nil, err
	}
	return grants.APIIDs, nil
}

// ListAllAPIs 返回启用中的 API 目录。
func (s *Service) ListAllAPIs() ([]model.SysAPI, error) {
	var list []model.SysAPI
	err := s.DB.Where("enabled = ?", true).Order("sort ASC, id ASC").Find(&list).Error
	return list, err
}
