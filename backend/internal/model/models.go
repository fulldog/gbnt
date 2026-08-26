// Package model 数据表模型（GORM AutoMigrate）。
// 所有业务表经 Base 携带 is_delete，删除均为软删（0 正常 / 1 已删）。
// 约定：业务字段在前，通用字段 Base 嵌在结构体末尾（建表列序落在表尾）。
package model

import (
	"time"

	"gorm.io/plugin/soft_delete"
)

// Base 公共字段（含软删标记 is_delete）；嵌入各表结构体末尾。
type Base struct {
	ID        uint64                `gorm:"primaryKey;autoIncrement;comment:主键ID" json:"id"`
	CreatedAt time.Time             `gorm:"comment:创建时间" json:"created_at"`
	UpdatedAt time.Time             `gorm:"comment:更新时间" json:"updated_at"`
	CreatedID int                   `gorm:"column:created_id;index;default:0;comment:创建人用户ID" json:"created_id"`
	UpdatedID int                   `gorm:"column:updated_id;index;default:0;comment:最后更新人用户ID" json:"updated_id"`
	IsDelete  soft_delete.DeletedAt `gorm:"column:is_delete;softDelete:flag;index;default:0;comment:软删标记 0正常 1已删" json:"is_delete"`
}

// SysOrg 组织架构：类型层级 root > district > street > village。
type SysOrg struct {
	ParentID uint64  `gorm:"index;default:0;comment:上级组织主键ID 0为根" json:"parent_id"`
	Name     string  `gorm:"size:128;not null;uniqueIndex;comment:组织名称" json:"name"`
	Type     OrgType `gorm:"size:16;index;not null;comment:组织类型 root/district/street/village" json:"type"`
	Sort     int     `gorm:"default:0;comment:排序号 越小越靠前" json:"sort"`
	Base
}

func (SysOrg) TableName() string { return "sys_orgs" }

// OrgType 组织类型英文枚举（层级：根 > 区 > 街道 > 村）。
type OrgType string

const (
	OrgTypeRoot     OrgType = "root"     // 根
	OrgTypeDistrict OrgType = "district" // 区
	OrgTypeStreet   OrgType = "street"   // 街道
	OrgTypeVillage  OrgType = "village"  // 村（末级，不可再向下新增）
)

// ChildOrgType 返回上级类型下允许创建的子类型；末级或非法上级返回空与 false。
func ChildOrgType(parent OrgType) (OrgType, bool) {
	switch parent {
	case OrgTypeRoot:
		return OrgTypeDistrict, true
	case OrgTypeDistrict:
		return OrgTypeStreet, true
	case OrgTypeStreet:
		return OrgTypeVillage, true
	default:
		return "", false
	}
}

// Valid 是否合法组织类型。
func (t OrgType) Valid() bool {
	switch t {
	case OrgTypeRoot, OrgTypeDistrict, OrgTypeStreet, OrgTypeVillage:
		return true
	default:
		return false
	}
}

// SysUser 工作人员。
type SysUser struct {
	Username     string `gorm:"size:64;uniqueIndex;not null;comment:登录账号" json:"username"`
	Password     string `gorm:"size:128;not null;comment:密码 bcrypt 哈希" json:"-"`
	Name         string `gorm:"size:64;comment:姓名" json:"name"`
	Phone        string `gorm:"size:32;comment:手机号" json:"phone"`
	OrgID        uint64 `gorm:"column:org_id;index;default:0;comment:所属组织主键ID" json:"org_id"`
	RoleID       uint64 `gorm:"column:role_id;index;default:0;comment:角色主键ID" json:"role_id"`
	Status       int    `gorm:"default:1;comment:状态 1启用 0停用" json:"status"`
	IsSuperAdmin bool   `gorm:"column:is_super_admin;index;default:0;comment:是否超级管理员 全库仅允许一名" json:"is_super_admin"`
	TokenVer     int    `gorm:"column:token_ver;default:0;comment:令牌版本 改密或强制下线时递增" json:"-"`
	Base
}

func (SysUser) TableName() string { return "sys_users" }

// SysRole 角色。
type SysRole struct {
	Name   string `gorm:"size:64;comment:角色名称" json:"name"`
	Desc   string `gorm:"size:255;comment:角色说明" json:"desc"`
	Status int    `gorm:"default:1;comment:状态 1启用 0禁用" json:"status"`
	Base
}

func (SysRole) TableName() string { return "sys_roles" }

// SysAPI 需登录鉴权的 API 目录。
type SysAPI struct {
	Method  string `gorm:"size:8;uniqueIndex:uk_method_path;comment:HTTP方法" json:"method"`
	Path    string `gorm:"size:256;uniqueIndex:uk_method_path;comment:路由模式 如/api/issues/:id" json:"path"`
	Name    string `gorm:"size:128;comment:接口名称" json:"name"`
	Module  string `gorm:"size:64;index;comment:权限模块" json:"module"`
	Action  string `gorm:"size:32;comment:动作 view/create/edit/delete/import/export" json:"action"`
	Sort    int    `gorm:"default:0;comment:排序" json:"sort"`
	Enabled bool   `gorm:"default:1;comment:是否启用" json:"enabled"`
	Base
}

func (SysAPI) TableName() string { return "sys_apis" }

// SysRoleAPI 角色 ↔ API 授权。
type SysRoleAPI struct {
	RoleID uint64 `gorm:"index;uniqueIndex:uk_role_api;comment:角色ID" json:"role_id"`
	APIID  uint64 `gorm:"index;uniqueIndex:uk_role_api;comment:API ID" json:"api_id"`
	Base
}

func (SysRoleAPI) TableName() string { return "sys_role_apis" }

// Issue 排查/整改主表。
type Issue struct {
	IssueKey                string  `gorm:"size:64;uniqueIndex;comment:业务可读问题编号" json:"issue_key"`
	Type                    string  `gorm:"size:32;index;comment:问题类型 well/road/bridge/forest/transformer" json:"type"`
	ProjectYear             int     `gorm:"index;default:0;comment:项目年度 2020-2023" json:"project_year"`
	RootOrgID               uint64  `gorm:"index;default:0;comment:区划根组织ID" json:"root_org_id"`
	DistrictOrgID           uint64  `gorm:"index;default:0;comment:区划区级组织ID" json:"district_org_id"`
	StreetOrgID             uint64  `gorm:"index;default:0;comment:区划街道组织ID" json:"street_org_id"`
	VillageOrgID            uint64  `gorm:"index;default:0;comment:区划村级组织ID" json:"village_org_id"`
	Code                    string  `gorm:"size:64;comment:设施编号或点位编号" json:"code"`
	Address                 string  `gorm:"size:255;comment:详细地址" json:"address"`
	Lat                     float64 `gorm:"comment:纬度" json:"lat"`
	Lng                     float64 `gorm:"comment:经度" json:"lng"`
	PlanDate                string  `gorm:"size:16;index;comment:计划完成日 YYYY-MM-DD" json:"plan_date"`
	Status                  string  `gorm:"size:16;index;comment:状态 new待整改 pending整改中 done已整改" json:"status"`
	ReporterSignatureFileID string  `gorm:"size:36;comment:排查电子签名附件file_id" json:"reporter_signature_file_id"`
	AssigneeUser            uint64  `gorm:"column:assignee_user;default:0;comment:整改责任人用户ID" json:"assignee_user"`
	TypeExt                 string  `gorm:"type:json;comment:类型扩展字段JSON" json:"type_ext"`
	Base
}

func (Issue) TableName() string { return "issues" }

// IssueRectifyRecord 整改记录（每次提交的每一项一条；同一 quiz_type 可重复）。
type IssueRectifyRecord struct {
	IssueID      uint64 `gorm:"index;not null;comment:问题主键ID" json:"issue_id"`
	QuizType     string `gorm:"size:32;index;comment:整改项类型 QuizType" json:"quiz_type"`
	Note         string `gorm:"type:text;comment:整改说明" json:"note"`
	PhotoFileIDs string `gorm:"type:json;comment:整改照片file_id数组JSON" json:"-"`
	Base
}

func (IssueRectifyRecord) TableName() string { return "issue_rectify_records" }

// OpLog 操作日志。
type OpLog struct {
	UserID   uint64 `gorm:"index;comment:操作用户ID" json:"user_id"`
	Username string `gorm:"size:64;comment:操作用户名" json:"username"`
	Action   string `gorm:"size:64;index;comment:操作动作" json:"action"`
	Detail   string `gorm:"size:512;comment:操作摘要" json:"detail"`
	Path     string `gorm:"size:128;comment:请求路径" json:"path"`
	TraceID  string `gorm:"size:64;index;comment:请求链路ID" json:"trace_id"`
	IP       string `gorm:"size:64;comment:客户端IP" json:"ip"`
	Request  string `gorm:"type:text;comment:请求参数" json:"request"`
	Response string `gorm:"type:text;comment:响应内容" json:"response"`
	Base
}

func (OpLog) TableName() string { return "op_logs" }

// Attachment 附件主记录。
type Attachment struct {
	FileID      string `gorm:"column:file_id;size:36;uniqueIndex;not null;comment:文件业务UUID" json:"file_id"`
	OrigName    string `gorm:"size:255;comment:上传原始文件名" json:"orig_name"`
	FileName    string `gorm:"size:255;comment:落盘文件名" json:"file_name"`
	ContentType string `gorm:"size:128;comment:MIME类型" json:"content_type"`
	Size        int64  `gorm:"comment:文件大小字节" json:"size"`
	MD5         string `gorm:"size:64;comment:文件MD5" json:"md5"`
	Status      string `gorm:"size:16;index;comment:状态 success/failed 等" json:"status"`
	StoragePath string `gorm:"size:512;comment:本地存储相对路径" json:"storage_path"`
	Base
}

func (Attachment) TableName() string { return "attachments" }

// TableComments 表名 → 表注释（迁移时 ALTER TABLE COMMENT）。
func TableComments() map[string]string {
	return map[string]string{
		"sys_orgs":              "组织架构",
		"sys_users":             "工作人员/系统用户",
		"sys_roles":             "角色",
		"sys_apis":              "API目录",
		"sys_role_apis":         "角色API授权",
		"issues":                "排查整改问题主表",
		"issue_rectify_records": "问题整改记录",
		"op_logs":               "操作日志",
		"attachments":           "附件文件主表",
	}
}
