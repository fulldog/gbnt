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
	ID        uint64                `gorm:"primaryKey;autoIncrement" json:"id"`
	CreatedAt time.Time             `json:"created_at"`
	UpdatedAt time.Time             `json:"updated_at"`
	CreatedID int                   `gorm:"column:created_id;index;default:0" json:"created_id"`
	UpdateID  int                   `gorm:"column:update_id;index;default:0" json:"update_id"`
	IsDelete  soft_delete.DeletedAt `gorm:"column:is_delete;softDelete:flag;index;default:0" json:"is_delete"`
}

// SchemaMigration 迁移版本记录。
type SchemaMigration struct {
	Version   string                `gorm:"primaryKey;size:64" json:"version"`
	AppliedAt time.Time             `json:"applied_at"`
	IsDelete  soft_delete.DeletedAt `gorm:"column:is_delete;softDelete:flag;index;default:0" json:"is_delete"`
}

// SysOrg 组织架构（对齐前端 orgs / sysDepartments）。
type SysOrg struct {
	OrgKey   string `gorm:"size:64;uniqueIndex" json:"org_key"` // 如 org-gov
	ParentID uint64 `gorm:"index;default:0" json:"parent_id"`
	Name     string `gorm:"size:128;not null" json:"name"`
	Type     string `gorm:"size:32" json:"type"` // gov/bureau/street/village/community
	Remark   string `gorm:"size:64" json:"remark"`
	Sort     int    `gorm:"default:0" json:"sort"`
	Base
}

// SysUser 工作人员。
type SysUser struct {
	Username string `gorm:"size:64;uniqueIndex;not null" json:"username"`
	Password string `gorm:"size:128;not null" json:"-"` // bcrypt
	Name     string `gorm:"size:64" json:"name"`
	Phone    string `gorm:"size:32" json:"phone"`
	OrgKey   string `gorm:"size:64;index" json:"org_id"`
	Role     string `gorm:"size:64" json:"role"`     // admin/street/village 等
	Status   int    `gorm:"default:1" json:"status"` // 1 启用
	Base
}

// SysRole 角色。
type SysRole struct {
	Code string `gorm:"size:64;uniqueIndex" json:"code"`
	Name string `gorm:"size:64" json:"name"`
	Desc string `gorm:"size:255" json:"desc"`
	Base
}

// SysRolePerm 角色权限（菜单 path + 动作）。
type SysRolePerm struct {
	RoleCode string `gorm:"size:64;index;uniqueIndex:uk_role_path_act" json:"role_code"`
	Path     string `gorm:"size:128;uniqueIndex:uk_role_path_act" json:"path"`
	Action   string `gorm:"size:32;uniqueIndex:uk_role_path_act" json:"action"` // query/create/...
	Base
}

// SysDictType 字典排查类型。
type SysDictType struct {
	Code string `gorm:"size:64;uniqueIndex" json:"code"` // well/road/...
	Name string `gorm:"size:64" json:"name"`
	Sort int    `json:"sort"`
	Base
}

// SysDictField 字典字段。
type SysDictField struct {
	TypeCode string `gorm:"size:64;index;uniqueIndex:uk_type_field" json:"type_code"`
	Code     string `gorm:"size:64;uniqueIndex:uk_type_field" json:"code"`
	Name     string `gorm:"size:64" json:"name"`
	Sort     int    `json:"sort"`
	Base
}

// SysDictItem 字典选项值。
type SysDictItem struct {
	FieldID uint64 `gorm:"index" json:"field_id"`
	Label   string `gorm:"size:128" json:"label"`
	Value   string `gorm:"size:128" json:"value"`
	Sort    int    `json:"sort"`
	Base
}

// Issue 排查/整改主表（对齐前端 issues）。
type Issue struct {
	IssueKey      string     `gorm:"size:64;uniqueIndex" json:"issue_key"` // 业务侧可读 id
	Type          string     `gorm:"size:32;index" json:"type"`            // well/road/bridge/forest/transformer
	Street        string     `gorm:"size:64;index" json:"street"`
	Village       string     `gorm:"size:64;index" json:"village"`
	ProjectName   string     `gorm:"size:128" json:"project_name"`
	Code          string     `gorm:"size:64" json:"code"`
	LocationText  string     `gorm:"size:255" json:"location_text"`
	Address       string     `gorm:"size:255" json:"address"`
	Lat           float64    `json:"lat"`
	Lng           float64    `json:"lng"`
	Description   string     `gorm:"type:text" json:"description"`
	Measures      string     `gorm:"type:text" json:"measures"`
	PlanDate      string     `gorm:"size:16;index" json:"plan_date"` // YYYY-MM-DD
	Status        string     `gorm:"size:16;index" json:"status"`    // pending/done
	ReporterID    uint64     `gorm:"index" json:"reporter_id"`
	ReporterName  string     `gorm:"size:64" json:"reporter_name"`
	ReporterPhone string     `gorm:"size:32" json:"reporter_phone"`
	AssigneeName  string     `gorm:"size:64" json:"assignee_name"`
	AssigneePhone string     `gorm:"size:32" json:"assignee_phone"`
	RectifyNote   string     `gorm:"type:text" json:"rectify_note"`
	RectifyAt     *time.Time `json:"rectify_at"`
	// TypeExt 类型扩展字段 JSON（well/road/...）
	TypeExt string `gorm:"type:json" json:"type_ext"`
	// PhotoRefUUID 现场照片关联组 uuid（一对多，业务只落此字段）
	PhotoRefUUID string `gorm:"size:36;index" json:"photo_ref_uuid"`
	// RectifyPhotoRefUUID 整改照片关联组 uuid
	RectifyPhotoRefUUID string `gorm:"size:36;index" json:"rectify_photo_ref_uuid"`
	Base
}

// OpLog 操作日志。
type OpLog struct {
	UserID   uint64 `gorm:"index" json:"user_id"`
	Username string `gorm:"size:64" json:"username"`
	Action   string `gorm:"size:64;index" json:"action"`
	Detail   string `gorm:"size:512" json:"detail"`
	Path     string `gorm:"size:128" json:"path"`
	TraceID  string `gorm:"size:64;index" json:"trace_id"`
	IP       string `gorm:"size:64" json:"ip"`
	Request  string `gorm:"type:text" json:"request"`
	Response string `gorm:"type:text" json:"response"`
	Base
}

// Attachment 附件主记录。
type Attachment struct {
	FileID      string `gorm:"column:file_id;size:36;uniqueIndex;not null" json:"file_id"`
	OrigName    string `gorm:"size:255" json:"orig_name"` // 上传时的原始文件名
	FileName    string `gorm:"size:255" json:"file_name"` // 落盘文件名（原名_userID_毫秒）
	ContentType string `gorm:"size:128" json:"content_type"`
	Size        int64  `json:"size"`
	MD5         string `gorm:"size:64" json:"md5"`
	Status      string `gorm:"size:16;index" json:"status"` // success / failed 等
	StoragePath string `gorm:"size:512" json:"storage_path"`
	Base
}

// AttachmentRefItem 附件关联明细：一组 att_id 对应多个 file_id。
type AttachmentRefItem struct {
	AttID  string `gorm:"column:att_id;size:36;index;uniqueIndex:uk_att_file;not null" json:"att_id"`
	FileID string `gorm:"column:file_id;size:36;uniqueIndex:uk_att_file;index;not null" json:"file_id"`
	Base
}
