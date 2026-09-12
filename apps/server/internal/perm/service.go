package perm

import (
	"fmt"
	"sort"
	"time"

	"gorm.io/gorm"

	"gbnt/apps/server/internal/cachex"
	"gbnt/apps/server/internal/model"
)

const cacheKeySysAPIs = "sys_apis:catalog"

// apiCatalog sys_apis 启用目录的进程内缓存快照。
type apiCatalog struct {
	List  []model.SysAPI
	ByKey map[string]model.SysAPI // method+"\x00"+path
	ByID  map[uint64]model.SysAPI
}

// Service RBAC 权限校验与 API 目录。
type Service struct {
	DB    *gorm.DB
	Cache *cachex.Store
}

// NewStaticService 用内存 API 索引构造（测试或跳过 DB 加载），并写入 sys_apis 缓存。
func NewStaticService(cache *cachex.Store, apis []model.SysAPI) *Service {
	if cache == nil {
		cache = cachex.New(0, 0)
	}
	s := &Service{Cache: cache}
	s.storeCatalog(buildAPICatalog(apis))
	return s
}

// NewService 创建权限服务；启动时加载 sys_apis 进缓存。
func NewService(db *gorm.DB, cache *cachex.Store) *Service {
	s := &Service{DB: db, Cache: cache}
	_ = s.ReloadAPIIndex()
	return s
}

func apiKey(method, path string) string {
	return method + "\x00" + path
}

func buildAPICatalog(list []model.SysAPI) *apiCatalog {
	byKey := make(map[string]model.SysAPI, len(list))
	byID := make(map[uint64]model.SysAPI, len(list))
	for _, a := range list {
		byKey[apiKey(a.Method, a.Path)] = a
		if a.ID != 0 {
			byID[a.ID] = a
		}
	}
	return &apiCatalog{List: list, ByKey: byKey, ByID: byID}
}

func (s *Service) storeCatalog(cat *apiCatalog) {
	if s == nil || cat == nil {
		return
	}
	s.Cache.Set(cacheKeySysAPIs, cat, cachex.NoExpiration)
}

// loadSysAPICatalog 先读缓存，未命中再查库并回填。
func (s *Service) loadSysAPICatalog() (*apiCatalog, error) {
	if s == nil {
		return &apiCatalog{ByKey: map[string]model.SysAPI{}, ByID: map[uint64]model.SysAPI{}}, nil
	}
	if v, ok := s.Cache.Get(cacheKeySysAPIs); ok {
		if c, ok2 := v.(*apiCatalog); ok2 && c != nil {
			return c, nil
		}
	}
	return s.loadSysAPICatalogFromDB()
}

func (s *Service) loadSysAPICatalogFromDB() (*apiCatalog, error) {
	if s == nil || s.DB == nil {
		cat := buildAPICatalog(nil)
		s.storeCatalog(cat)
		return cat, nil
	}
	var list []model.SysAPI
	if err := s.DB.Where("enabled = ?", true).Order("sort ASC, id ASC").Find(&list).Error; err != nil {
		return nil, err
	}
	cat := buildAPICatalog(list)
	s.storeCatalog(cat)
	return cat, nil
}

// ReloadAPIIndex 从 DB 重建 sys_apis 缓存（sync 后调用）。
func (s *Service) ReloadAPIIndex() error {
	_, err := s.loadSysAPICatalogFromDB()
	return err
}

// FindAPI 按 method + gin FullPath 查找 API；先走 sys_apis 缓存。
func (s *Service) FindAPI(method, path string) (*model.SysAPI, bool) {
	cat, err := s.loadSysAPICatalog()
	if err != nil || cat == nil {
		return nil, false
	}
	a, ok := cat.ByKey[apiKey(method, path)]
	if !ok {
		return nil, false
	}
	cp := a
	return &cp, true
}

type roleGrantCache struct {
	ModuleActions map[string]map[string]bool
	APIIDs        []uint64
}

func (s *Service) loadRoleGrants(roleID uint64) (*roleGrantCache, error) {
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
	cat, err := s.loadSysAPICatalog()
	if err != nil {
		return nil, err
	}
	grants := map[string]map[string]bool{}
	addGrant := func(a model.SysAPI) {
		if grants[a.Module] == nil {
			grants[a.Module] = map[string]bool{}
		}
		grants[a.Module][a.Action] = true
	}
	var missing []uint64
	for _, id := range apiIDs {
		if a, ok := cat.ByID[id]; ok {
			addGrant(a)
			continue
		}
		missing = append(missing, id)
	}
	if len(missing) > 0 && s.DB != nil {
		var extra []model.SysAPI
		if err := s.DB.Where("id IN ? AND enabled = ?", missing, true).Find(&extra).Error; err != nil {
			return nil, err
		}
		for _, a := range extra {
			addGrant(a)
		}
	}
	out := &roleGrantCache{ModuleActions: grants, APIIDs: apiIDs}
	s.Cache.Set(key, out, 5*time.Minute)
	return out, nil
}

// InvalidateRole 清除角色权限缓存。
func (s *Service) InvalidateRole(roleID uint64) {
	s.Cache.Delete(fmt.Sprintf("perm:role:%d", roleID))
}

// Allow 校验是否可访问指定 API；用户 is_super_admin 时放行全部。
func (s *Service) Allow(roleID uint64, isSuperAdmin bool, api *model.SysAPI) (bool, error) {
	if isSuperAdmin {
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

// ListAPIIDsForRole 返回角色已授权 API id 列表。
func (s *Service) ListAPIIDsForRole(roleID uint64) ([]uint64, error) {
	grants, err := s.loadRoleGrants(roleID)
	if err != nil {
		return nil, err
	}
	return grants.APIIDs, nil
}

// ModuleActionsForRole 返回角色按模块聚合的操作授权副本，供登录态前端直接做展示控制。
func (s *Service) ModuleActionsForRole(roleID uint64) (map[string][]string, error) {
	grants, err := s.loadRoleGrants(roleID)
	if err != nil {
		return nil, err
	}
	out := make(map[string][]string, len(grants.ModuleActions))
	for module, actions := range grants.ModuleActions {
		for action, enabled := range actions {
			if enabled {
				out[module] = append(out[module], action)
			}
		}
		sort.Strings(out[module])
	}
	return out, nil
}

// CanAssignRole 判断当前角色是否覆盖目标角色的全部模块操作，防止工作人员管理产生权限提升。
func (s *Service) CanAssignRole(actorRoleID uint64, isSuperAdmin bool, targetRoleID uint64) (bool, error) {
	if targetRoleID == 0 {
		return false, nil
	}
	if isSuperAdmin {
		return true, nil
	}
	actor, err := s.loadRoleGrants(actorRoleID)
	if err != nil {
		return false, err
	}
	target, err := s.loadRoleGrants(targetRoleID)
	if err != nil {
		return false, err
	}
	for module, actions := range target.ModuleActions {
		for action, enabled := range actions {
			if enabled && !actionSatisfies(actor.ModuleActions, module, action) {
				return false, nil
			}
		}
	}
	return true, nil
}

// ListAllAPIs 返回启用中的 API 目录；先走 sys_apis 缓存。
func (s *Service) ListAllAPIs() ([]model.SysAPI, error) {
	cat, err := s.loadSysAPICatalog()
	if err != nil {
		return nil, err
	}
	out := make([]model.SysAPI, len(cat.List))
	copy(out, cat.List)
	return out, nil
}
