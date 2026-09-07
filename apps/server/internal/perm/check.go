package perm

// actionSatisfies 校验 module 下是否满足 target action（view 可被高阶 action 隐含）。
func actionSatisfies(grants map[string]map[string]bool, module, target string) bool {
	acts, ok := grants[module]
	if !ok {
		return false
	}
	if acts[target] {
		return true
	}
	if target != "view" {
		return false
	}
	for _, a := range []string{"create", "edit", "delete", "import", "export"} {
		if acts[a] {
			return true
		}
	}
	return false
}

// AllowAdminWebLogin 管理端登录：RBAC 关闭、权限服务未就绪或超管则放行；其余须拥有 POST /api/auth/login。
func AllowAdminWebLogin(svc *Service, enabled bool, roleID uint64, isSuperAdmin bool) (bool, error) {
	if !enabled || svc == nil || isSuperAdmin {
		return true, nil
	}
	api, ok := svc.FindAPI("POST", "/api/auth/login")
	if !ok {
		return false, nil
	}
	return svc.Allow(roleID, false, api)
}
