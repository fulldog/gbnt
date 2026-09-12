package service

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"strings"
	"unicode/utf8"

	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"gbnt/apps/server/internal/model"
	"gbnt/apps/server/internal/rolecode"
)

// CreateRoleInput 创建角色；传 api_ids 时按职责自动命名并原子保存授权。
type CreateRoleInput struct {
	Code   *string  `json:"code"`    // 忽略客户端传入；服务端生成独立英文标识
	Name   string   `json:"name"`    // 旧客户端必填名称；传 api_ids 时忽略，使用自动名称
	Desc   string   `json:"desc"`    // 角色备注，可空，最多255字
	Status int      `json:"status"`  // 兼容旧请求的0/1；新建始终默认启用
	APIIDs []uint64 `json:"api_ids"` // 选填；省略为旧创建流程，空数组为无职责角色
}

// UpdateRoleInput 部分更新角色；未传字段保持不变，权限空数组表示清空。
type UpdateRoleInput struct {
	Code   *string  `json:"code"`    // 忽略；英文标识创建后不可改
	Name   *string  `json:"name"`    // 兼容旧客户端改名；新页面不提交，修改授权不重命名
	Desc   *string  `json:"desc"`    // 选填备注；空字符串表示清空，最多255字
	Status *int     `json:"status"`  // 选填状态，1启用、0停用
	APIIDs []uint64 `json:"api_ids"` // 选填权限；省略保持不变，空数组清空全部授权
}

// RoleDuty API所属顶级职责；目录展示与创建时命名共用该元数据。
type RoleDuty struct {
	Key      string `json:"key"`       // 顶级职责标识
	Label    string `json:"label"`     // 顶级菜单名称
	RoleName string `json:"role_name"` // 角色称谓；基础权限为空，不参与业务职责命名
	Sort     int    `json:"sort"`      // 菜单排序，越小越靠前
}

// RoleCatalogAPI 授权目录响应，保留原API字段并附加职责；不改变数据库结构。
type RoleCatalogAPI struct {
	model.SysAPI
	Duty              *RoleDuty `json:"duty,omitempty"`      // 已知模块的顶级职责；未知模块省略
	RoleCodeSupported bool      `json:"role_code_supported"` // 服务支持英文角色ID，供新前端阻止旧服务忽略code
}

func roleDutyForModule(module string) *RoleDuty {
	switch module {
	case "web.auth":
		return &RoleDuty{Key: "basic", Label: "基础权限", Sort: 0}
	case "web.workbench":
		return &RoleDuty{Key: "workbench", Label: "工作台", Sort: 1}
	case "web.rectify":
		return &RoleDuty{Key: "rectify", Label: "专项整改", RoleName: "专项整改员", Sort: 2}
	case "web.ledger-street", "web.ledger-survey":
		return &RoleDuty{Key: "ledger", Label: "汇总管理", RoleName: "汇总管理员", Sort: 3}
	case "web.sys-org", "web.sys-staff", "web.sys-roles", "web.sys-logs":
		return &RoleDuty{Key: "system", Label: "系统配置", RoleName: "系统配置员", Sort: 4}
	default:
		return nil
	}
}

// ListRoleCatalog 返回授权API目录及职责元数据，兼容原数组响应。
func (s *SysService) ListRoleCatalog() ([]RoleCatalogAPI, error) {
	apis, err := s.ListAPIs()
	if err != nil {
		return nil, err
	}
	list := make([]RoleCatalogAPI, 0, len(apis))
	for _, api := range apis {
		list = append(list, RoleCatalogAPI{SysAPI: api, Duty: roleDutyForModule(api.Module), RoleCodeSupported: true})
	}
	return list, nil
}

func roleNameForAPIs(apis []model.SysAPI) (string, error) {
	groups := map[string]RoleDuty{}
	workbench := false
	for _, api := range apis {
		duty := roleDutyForModule(api.Module)
		if duty == nil {
			return "", fmt.Errorf("权限模块 %s 尚未配置顶级职责", api.Module)
		}
		workbench = workbench || api.Module == "web.workbench"
		if duty.RoleName != "" {
			groups[duty.Key] = *duty
		}
	}
	ordered := make([]RoleDuty, 0, len(groups))
	for _, group := range groups {
		ordered = append(ordered, group)
	}
	sort.Slice(ordered, func(i, j int) bool { return ordered[i].Sort < ordered[j].Sort })
	names := make([]string, 0, len(ordered))
	for _, group := range ordered {
		names = append(names, group.RoleName)
	}
	if len(names) > 0 {
		return strings.Join(names, "、"), nil
	}
	if workbench {
		return "工作台查看员", nil
	}
	return "未分配职责", nil
}

func validateRoleText(name, desc string) error {
	if name == "" || utf8.RuneCountInString(name) > 64 {
		return errors.New("角色名称须为1～64字")
	}
	if utf8.RuneCountInString(desc) > 255 {
		return errors.New("角色备注不能超过255字")
	}
	return nil
}

// validateRoleAPIs 校验新增授权；历史目录外/停用关联仅允许原样保留。
func validateRoleAPIs(tx *gorm.DB, requested, previous []uint64) ([]uint64, []model.SysAPI, error) {
	ids := make([]uint64, 0, len(requested))
	seen, retained := map[uint64]bool{}, map[uint64]bool{}
	for _, id := range previous {
		retained[id] = true
	}
	for _, id := range requested {
		if id == 0 {
			return nil, nil, errors.New("权限ID必须为正整数")
		}
		if !seen[id] {
			seen[id] = true
			ids = append(ids, id)
		}
	}
	if len(ids) == 0 {
		return ids, nil, nil
	}
	var catalog []model.SysAPI
	if err := tx.Where("id IN ?", ids).Find(&catalog).Error; err != nil {
		return nil, nil, err
	}
	valid := make(map[uint64]bool, len(catalog))
	active := make([]model.SysAPI, 0, len(catalog))
	for _, api := range catalog {
		if api.Enabled && api.IsRBAC {
			valid[api.ID] = true
			active = append(active, api)
		}
	}
	for _, id := range ids {
		if !valid[id] && !retained[id] {
			return nil, nil, fmt.Errorf("权限ID %d 不存在、已停用或不可授权", id)
		}
	}
	return ids, active, nil
}

func replaceRoleAPIs(tx *gorm.DB, id uint64, ids []uint64) error {
	// 唯一索引含软删除记录，沿用原授权服务的物理替换，仅在角色事务内执行。
	if err := tx.Unscoped().Where("role_id = ?", id).Delete(&model.SysRoleAPI{}).Error; err != nil {
		return err
	}
	return insertRoleAPIs(tx, id, ids)
}

func insertRoleAPIs(tx *gorm.DB, id uint64, ids []uint64) error {
	if len(ids) == 0 {
		return nil
	}
	rows := make([]model.SysRoleAPI, 0, len(ids))
	for _, apiID := range ids {
		rows = append(rows, model.SysRoleAPI{RoleID: id, APIID: apiID})
	}
	return tx.Create(&rows).Error
}

// CreateRole 原子创建角色及授权；兼容省略api_ids的旧客户端。
func (s *SysService) CreateRole(ctx context.Context, in CreateRoleInput) (*model.SysRole, error) {
	if in.Status != 0 && in.Status != 1 {
		return nil, errors.New("角色状态只能为0或1")
	}
	// 英文标识仅服务端生成，客户端传入的 code 一律忽略。
	code := "role-" + uuid.NewString()
	role := &model.SysRole{Name: strings.TrimSpace(in.Name), Desc: strings.TrimSpace(in.Desc), Status: 1, Code: &code}
	err := s.db(ctx).Transaction(func(tx *gorm.DB) error {
		var ids []uint64
		if in.APIIDs != nil {
			var selected []model.SysAPI
			var err error
			ids, selected, err = validateRoleAPIs(tx, in.APIIDs, nil)
			if err != nil {
				return err
			}
			role.Name, err = roleNameForAPIs(selected)
			if err != nil {
				return err
			}
		}
		if err := validateRoleText(role.Name, role.Desc); err != nil {
			return err
		}
		if err := tx.Create(role).Error; err != nil {
			return err
		}
		return insertRoleAPIs(tx, role.ID, ids)
	})
	if err != nil {
		if rolecode.IsDuplicate(err) {
			return nil, errors.New("角色ID已存在，请使用其他英文标识")
		}
		return nil, err
	}
	return role, nil
}

// UpdateRole 事务内部分更新角色和授权；授权变化不触发职责重命名。
func (s *SysService) UpdateRole(ctx context.Context, id uint64, in UpdateRoleInput) (*model.SysRole, error) {
	if in.Status != nil && *in.Status != 0 && *in.Status != 1 {
		return nil, errors.New("角色状态只能为0或1")
	}
	var role model.SysRole
	err := s.db(ctx).Transaction(func(tx *gorm.DB) error {
		// 与其他授权修改串行，防止校验历史权限和替换授权之间发生竞争。
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&role, id).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return errors.New("角色不存在")
			}
			return err
		}
		updates := map[string]any{}
		if in.Name != nil {
			role.Name = strings.TrimSpace(*in.Name)
			updates["name"] = role.Name
		}
		if in.Desc != nil {
			role.Desc = strings.TrimSpace(*in.Desc)
			updates["desc"] = role.Desc
		}
		if in.Status != nil {
			role.Status = *in.Status
			updates["status"] = role.Status
		}
		if err := validateRoleText(role.Name, role.Desc); err != nil {
			return err
		}
		if in.APIIDs != nil {
			var previous []uint64
			if err := tx.Model(&model.SysRoleAPI{}).Where("role_id = ?", id).Pluck("api_id", &previous).Error; err != nil {
				return err
			}
			ids, _, err := validateRoleAPIs(tx, in.APIIDs, previous)
			if err != nil {
				return err
			}
			if err := replaceRoleAPIs(tx, id, ids); err != nil {
				return err
			}
		}
		if len(updates) > 0 {
			return tx.Model(&role).Updates(updates).Error
		}
		return nil
	})
	if err != nil {
		if rolecode.IsDuplicate(err) {
			return nil, errors.New("角色ID已存在，请使用其他英文标识")
		}
		return nil, err
	}
	s.InvalidateRoleCache(id)
	return &role, nil
}
