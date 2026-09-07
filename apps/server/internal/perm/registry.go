package perm

import "gbnt/apps/server/internal/model"

// Entry API 注册项（单一事实来源，同步到 sys_apis）。
type Entry struct {
	Method string
	Path   string
	Name   string
	Module string
	Action string
	Sort   int
	IsJWT  bool // 是否需要 JWT；与 sys_apis.is_jwt 对应
	IsRBAC bool // 是否需要角色授权；与 sys_apis.is_rbac 对应
}

func joinEntries(groups ...[]Entry) []Entry {
	n := 0
	for _, g := range groups {
		n += len(g)
	}
	out := make([]Entry, 0, n)
	for _, g := range groups {
		out = append(out, g...)
	}
	return out
}

// joinProtected 将管理端业务接口标为 JWT+RBAC，避免 Entry 布尔零值漏标成公开。
func joinProtected(groups ...[]Entry) []Entry {
	out := joinEntries(groups...)
	for i := range out {
		out[i].IsJWT = true
		out[i].IsRBAC = true
	}
	return out
}

// Registry 全部 HTTP 接口目录（含公开、JWT-only、RBAC）。
var Registry = joinEntries(
	apisPublic,
	apisAuth,
	apisSession,
	apisApp,
	joinProtected(
		apisWorkbench,
		apisRectify,
		apisLedgerStreet,
		apisLedgerSurvey,
		apisSysOrg,
		apisSysStaff,
		apisSysRoles,
		apisSysLogs,
	),
)

// ToSysAPI 转为内存中的 SysAPI（测试与静态索引）。
func (e Entry) ToSysAPI() model.SysAPI {
	return model.SysAPI{
		Method:  e.Method,
		Path:    e.Path,
		Name:    e.Name,
		Module:  e.Module,
		Action:  e.Action,
		Sort:    e.Sort,
		Enabled: true,
		IsJWT:   e.IsJWT,
		IsRBAC:  e.IsRBAC,
	}
}

// RegistryAsSysAPIs 将 Registry 转为 SysAPI 切片。
func RegistryAsSysAPIs() []model.SysAPI {
	out := make([]model.SysAPI, 0, len(Registry))
	for _, e := range Registry {
		out = append(out, e.ToSysAPI())
	}
	return out
}
