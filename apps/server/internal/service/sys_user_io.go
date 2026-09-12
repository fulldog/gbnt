package service

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"strconv"
	"strings"
	"time"

	"github.com/xuri/excelize/v2"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"

	"gbnt/apps/server/internal/model"
	"gbnt/apps/server/internal/rolecode"
	"gbnt/apps/server/pkg/xlsxutil"
)

const (
	userImportBatchSize   = 500
	userIOCreatedAtLayout = "2006-01-02 15:04:05"
	colName               = "姓名"
	colPhone              = "手机号"
	colUsername           = "登录账号"
	colOrg                = "所属单位"
	colRole               = "角色名称"
	colRoleID             = "角色ID"
	colSort               = "排序"
	colStatus             = "状态"
	colCreatedAt          = "创建时间"
	userListOrder         = "sort ASC, id DESC"
)

// orgPathFromRoot 由 org_id 拼根→叶路径，以 / 分隔；orgID=0 返回空串。
func orgPathFromRoot(orgs []model.SysOrg, orgID uint64) string {
	if orgID == 0 {
		return ""
	}
	byID := make(map[uint64]model.SysOrg, len(orgs))
	for _, o := range orgs {
		byID[o.ID] = o
	}
	var names []string
	seen := map[uint64]struct{}{}
	for id := orgID; id != 0; {
		if _, ok := seen[id]; ok {
			break
		}
		seen[id] = struct{}{}
		o, ok := byID[id]
		if !ok {
			break
		}
		names = append(names, o.Name)
		id = o.ParentID
	}
	for i, j := 0, len(names)-1; i < j; i, j = i+1, j-1 {
		names[i], names[j] = names[j], names[i]
	}
	return strings.Join(names, "/")
}

// resolveOrgIDByPath 按 / 分段；叶名匹配，重名则沿上级名称递推至唯一。
func resolveOrgIDByPath(orgs []model.SysOrg, path string) (uint64, error) {
	path = strings.TrimSpace(path)
	if path == "" {
		return 0, errors.New("所属单位不能为空")
	}
	parts := splitOrgPath(path)
	if len(parts) == 0 {
		return 0, errors.New("所属单位不能为空")
	}
	byID := make(map[uint64]model.SysOrg, len(orgs))
	byName := map[string][]model.SysOrg{}
	for _, o := range orgs {
		byID[o.ID] = o
		byName[o.Name] = append(byName[o.Name], o)
	}
	leaf := parts[len(parts)-1]
	cands := append([]model.SysOrg(nil), byName[leaf]...)
	if len(cands) == 0 {
		return 0, fmt.Errorf("组织不存在: %s", leaf)
	}
	if len(cands) == 1 {
		return cands[0].ID, nil
	}
	for i := len(parts) - 2; i >= 0; i-- {
		parentName := parts[i]
		next := make([]model.SysOrg, 0, len(cands))
		for _, c := range cands {
			p, ok := byID[c.ParentID]
			if ok && p.Name == parentName {
				next = append(next, c)
			}
		}
		if len(next) == 0 {
			return 0, fmt.Errorf("组织路径无法匹配: %s", path)
		}
		if len(next) == 1 {
			return next[0].ID, nil
		}
		cands = next
	}
	if len(cands) != 1 {
		return 0, fmt.Errorf("组织不唯一: %s", path)
	}
	return cands[0].ID, nil
}

func splitOrgPath(path string) []string {
	raw := strings.Split(path, "/")
	out := make([]string, 0, len(raw))
	for _, p := range raw {
		p = strings.TrimSpace(p)
		if p != "" {
			out = append(out, p)
		}
	}
	return out
}

// resolveRoleIDByName 角色名称精确匹配；0 条或多条报错。
func resolveRoleIDByName(roles []model.SysRole, name string) (uint64, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return 0, errors.New("角色名称不能为空")
	}
	var found []model.SysRole
	for _, r := range roles {
		if r.Name == name {
			found = append(found, r)
		}
	}
	if len(found) == 0 {
		return 0, fmt.Errorf("角色不存在: %s", name)
	}
	if len(found) > 1 {
		return 0, fmt.Errorf("角色名称不唯一: %s，请填写角色ID", name)
	}
	return found[0].ID, nil
}

// resolveImportedRole 按英文角色ID定位；兼容旧数字主键及未提供ID时的唯一名称。
func resolveImportedRole(roles []model.SysRole, rawID, name string) (uint64, error) {
	rawID, name = strings.TrimSpace(rawID), strings.TrimSpace(name)
	if rawID == "" {
		return resolveRoleIDByName(roles, name)
	}
	legacyNumeric := strings.IndexFunc(rawID, func(c rune) bool { return c < '0' || c > '9' }) == -1
	var id uint64
	var code string
	var err error
	if legacyNumeric {
		id, err = strconv.ParseUint(rawID, 10, 64)
		if err != nil || id == 0 {
			return 0, errors.New("旧版数字角色ID须为正整数")
		}
	} else {
		code, err = rolecode.Normalize(rawID)
		if err != nil {
			return 0, err
		}
	}
	for _, role := range roles {
		if (legacyNumeric && role.ID != id) || (!legacyNumeric && (role.Code == nil || *role.Code != code)) {
			continue
		}
		if name != "" && name != role.Name {
			return 0, fmt.Errorf("角色ID %s 与角色名称 %s 不一致", rawID, name)
		}
		return role.ID, nil
	}
	return 0, fmt.Errorf("角色ID %s 不存在", rawID)
}

// parseImportStatus 空则启用；接受 启用/停用/1/0。
func parseImportStatus(raw string) (int, error) {
	s := strings.TrimSpace(raw)
	if s == "" {
		return 1, nil
	}
	switch s {
	case "启用", "1":
		return 1, nil
	case "停用", "0":
		return 0, nil
	default:
		return 0, fmt.Errorf("状态无效: %s", raw)
	}
}

func formatUserStatus(status int) string {
	if status == 0 {
		return "停用"
	}
	return "启用"
}

// parseImportUserSort 兼容没有排序列的旧文件；空值默认 100，其他值须为有符号 32 位整数。
func parseImportUserSort(raw string) (int32, error) {
	value := strings.TrimSpace(raw)
	if value == "" {
		return model.DefaultUserSort, nil
	}
	sort, err := strconv.ParseInt(value, 10, 32)
	if err != nil {
		return 0, errors.New("排序须为 -2147483648～2147483647 之间的整数")
	}
	return int32(sort), nil
}

func parseImportCreatedAt(raw string) (time.Time, error) {
	s := strings.TrimSpace(raw)
	if s == "" {
		return time.Time{}, nil
	}
	t, err := time.ParseInLocation(userIOCreatedAtLayout, s, time.Local)
	if err != nil {
		return time.Time{}, fmt.Errorf("创建时间格式须为 %s", userIOCreatedAtLayout)
	}
	return t, nil
}

func (s *SysService) userListQuery(orgID uint64, keyword string) *gorm.DB {
	q := s.DB.Model(&model.SysUser{})
	if orgID > 0 {
		q = q.Where("org_id = ?", orgID)
	}
	if keyword != "" {
		like := "%" + keyword + "%"
		q = q.Where("username LIKE ? OR name LIKE ? OR phone LIKE ?", like, like, like)
	}
	return q
}

// ExportUsers 导出人员xlsx（不分页），排序与列表一致；包含排序值及英文角色ID。
func (s *SysService) ExportUsers(orgID uint64, keyword string) ([]byte, error) {
	var users []model.SysUser
	if err := s.userListQuery(orgID, keyword).Order(userListOrder).Find(&users).Error; err != nil {
		return nil, err
	}
	orgs, err := s.ListOrgs()
	if err != nil {
		return nil, err
	}
	roles, err := s.ListRoles()
	if err != nil {
		return nil, err
	}
	roleName := map[uint64]string{}
	roleCodes := map[uint64]string{}
	for _, r := range roles {
		roleName[r.ID] = r.Name
		if r.Code != nil {
			roleCodes[r.ID] = *r.Code
		}
	}

	headers := []string{colName, colPhone, colUsername, colOrg, colRoleID, colRole, colSort, colStatus, colCreatedAt}
	rows := make([][]any, 0, len(users))
	for _, u := range users {
		// 未绑定或关联缺失的历史人员仍可导出空角色列，不能因此阻塞整个导出。
		if _, exists := roleName[u.RoleID]; exists && roleCodes[u.RoleID] == "" {
			return nil, errors.New("存在尚未配置英文角色ID的人员角色，请先完成角色标识迁移")
		}
		sort := model.DefaultUserSort
		if u.Sort != nil {
			sort = *u.Sort
		}
		rows = append(rows, []any{
			u.Name,
			u.Phone,
			u.Username,
			orgPathFromRoot(orgs, u.OrgID),
			roleCodes[u.RoleID],
			roleName[u.RoleID],
			sort,
			formatUserStatus(u.Status),
			u.CreatedAt.In(time.Local).Format(userIOCreatedAtLayout),
		})
	}
	return xlsxutil.Export(headers, rows)
}

// ImportUsers 从xlsx新增人员；角色ID优先、排序空则 100，任一校验失败则整批不落库。
func (s *SysService) ImportUsers(ctx context.Context, r io.Reader) (int, error) {
	raw, err := io.ReadAll(r)
	if err != nil {
		return 0, err
	}
	if len(raw) == 0 {
		return 0, errors.New("文件为空")
	}
	f, err := excelize.OpenReader(bytes.NewReader(raw))
	if err != nil {
		return 0, errors.New("无法解析 Excel")
	}
	defer func() { _ = f.Close() }()

	sheet := f.GetSheetName(0)
	if sheet == "" {
		return 0, errors.New("Excel 无工作表")
	}
	rows, err := f.GetRows(sheet)
	if err != nil {
		return 0, err
	}
	if len(rows) < 2 {
		return 0, errors.New("没有可导入的数据行")
	}

	colIdx, err := mapUserImportHeaders(rows[0])
	if err != nil {
		return 0, err
	}

	orgs, err := s.ListOrgs()
	if err != nil {
		return 0, err
	}
	roles, err := s.ListRoles()
	if err != nil {
		return 0, err
	}

	type prepared struct {
		line int
		user model.SysUser
	}
	var prep []prepared
	seen := map[string]int{}

	for i := 1; i < len(rows); i++ {
		line := i + 1
		row := rows[i]
		if userImportRowEmpty(row, colIdx) {
			continue
		}
		name := cellAt(row, colIdx[colName])
		phone := cellAt(row, colIdx[colPhone])
		username := cellAt(row, colIdx[colUsername])
		orgPath := cellAt(row, colIdx[colOrg])
		roleName, roleIDRaw := "", ""
		if idx, ok := colIdx[colRole]; ok {
			roleName = cellAt(row, idx)
		}
		if idx, ok := colIdx[colRoleID]; ok {
			roleIDRaw = cellAt(row, idx)
		}
		statusRaw := ""
		if idx, ok := colIdx[colStatus]; ok {
			statusRaw = cellAt(row, idx)
		}
		sortRaw := ""
		if idx, ok := colIdx[colSort]; ok {
			sortRaw = cellAt(row, idx)
		}
		createdRaw := ""
		if idx, ok := colIdx[colCreatedAt]; ok {
			createdRaw = cellAt(row, idx)
		}
		if name == "" {
			return 0, fmt.Errorf("第 %d 行: 姓名不能为空", line)
		}
		if username == "" {
			return 0, fmt.Errorf("第 %d 行: 登录账号不能为空", line)
		}
		if err := ValidateOptionalCNPhone(phone); err != nil {
			return 0, fmt.Errorf("第 %d 行: %w", line, err)
		}
		if prev, ok := seen[username]; ok {
			return 0, fmt.Errorf("第 %d 行: 登录账号与第 %d 行重复", line, prev)
		}
		seen[username] = line

		orgID, oerr := resolveOrgIDByPath(orgs, orgPath)
		if oerr != nil {
			return 0, fmt.Errorf("第 %d 行: %w", line, oerr)
		}
		roleID, rerr := resolveImportedRole(roles, roleIDRaw, roleName)
		if rerr != nil {
			return 0, fmt.Errorf("第 %d 行: %w", line, rerr)
		}
		if err := requireOrgScopeIfAuthenticated(ctx, s.db(ctx), orgID); err != nil {
			return 0, fmt.Errorf("第 %d 行: %w", line, err)
		}
		if err := s.requireAssignableRoleIfAuthenticated(ctx, roleID); err != nil {
			return 0, fmt.Errorf("第 %d 行: %w", line, err)
		}
		st, serr := parseImportStatus(statusRaw)
		if serr != nil {
			return 0, fmt.Errorf("第 %d 行: %w", line, serr)
		}
		sort, sortErr := parseImportUserSort(sortRaw)
		if sortErr != nil {
			return 0, fmt.Errorf("第 %d 行: %w", line, sortErr)
		}
		created, cerr := parseImportCreatedAt(createdRaw)
		if cerr != nil {
			return 0, fmt.Errorf("第 %d 行: %w", line, cerr)
		}

		hash, herr := bcrypt.GenerateFromPassword([]byte(username), bcrypt.DefaultCost)
		if herr != nil {
			return 0, herr
		}
		u := model.SysUser{
			Username:     username,
			Password:     string(hash),
			Name:         name,
			Phone:        phone,
			OrgID:        orgID,
			RoleID:       roleID,
			Sort:         &sort,
			Status:       st,
			IsSuperAdmin: false,
		}
		if !created.IsZero() {
			u.CreatedAt = created
		}
		prep = append(prep, prepared{line: line, user: u})
	}
	if len(prep) == 0 {
		return 0, errors.New("没有可导入的数据行")
	}

	names := make([]string, 0, len(prep))
	for _, p := range prep {
		names = append(names, p.user.Username)
	}
	var exist []model.SysUser
	if err := s.db(ctx).Select("username").Where("username IN ?", names).Find(&exist).Error; err != nil {
		return 0, err
	}
	if len(exist) > 0 {
		return 0, fmt.Errorf("登录账号已存在: %s", exist[0].Username)
	}

	users := make([]model.SysUser, 0, len(prep))
	for _, p := range prep {
		users = append(users, p.user)
	}
	err = s.db(ctx).Transaction(func(tx *gorm.DB) error {
		return tx.CreateInBatches(users, userImportBatchSize).Error
	})
	if err != nil {
		return 0, err
	}
	return len(users), nil
}

func mapUserImportHeaders(header []string) (map[string]int, error) {
	idx := map[string]int{}
	for i, h := range header {
		h = strings.TrimSpace(h)
		if h == "" {
			continue
		}
		idx[h] = i
	}
	for _, must := range []string{colName, colPhone, colUsername, colOrg} {
		if _, ok := idx[must]; !ok {
			return nil, fmt.Errorf("缺少表头: %s", must)
		}
	}
	_, hasRoleID := idx[colRoleID]
	_, hasRoleName := idx[colRole]
	if !hasRoleID && !hasRoleName {
		return nil, errors.New("缺少表头: 角色ID或角色名称")
	}
	return idx, nil
}

func cellAt(row []string, i int) string {
	if i < 0 || i >= len(row) {
		return ""
	}
	return strings.TrimSpace(row[i])
}

func userImportRowEmpty(row []string, colIdx map[string]int) bool {
	for _, key := range []string{colName, colPhone, colUsername, colOrg, colRoleID, colRole} {
		if idx, ok := colIdx[key]; ok && cellAt(row, idx) != "" {
			return false
		}
	}
	return true
}
