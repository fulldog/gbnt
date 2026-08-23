// Package model 数据表模型（GORM AutoMigrate）。
package model

import (
	"time"

	"gorm.io/gorm"
)

// Base 公共字段。
type Base struct {
	ID        uint64         `gorm:"primaryKey;autoIncrement" json:"id"`
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`
}

// SchemaMigration 迁移版本记录。
type SchemaMigration struct {
	Version   string    `gorm:"primaryKey;size:64" json:"version"`
	AppliedAt time.Time `json:"applied_at"`
}

// SysOrg 组织架构（对齐前端 orgs / sysDepartments）。
type SysOrg struct {
	Base
	OrgKey   string `gorm:"size:64;uniqueIndex" json:"org_key"` // 如 org-gov
	ParentID uint64 `gorm:"index;default:0" json:"parent_id"`
	Name     string `gorm:"size:128;not null" json:"name"`
	Type     string `gorm:"size:32" json:"type"` // gov/bureau/street/village/community
	Remark   string `gorm:"size:64" json:"remark"`
	Sort     int    `gorm:"default:0" json:"sort"`
}

// SysUser 工作人员。
type SysUser struct {
	Base
	Username string `gorm:"size:64;uniqueIndex;not null" json:"username"`
	Password string `gorm:"size:128;not null" json:"-"` // bcrypt
	Name     string `gorm:"size:64" json:"name"`
	Phone    string `gorm:"size:32" json:"phone"`
	OrgKey   string `gorm:"size:64;index" json:"org_id"`
	Role     string `gorm:"size:64" json:"role"`     // admin/street/village 等
	Status   int    `gorm:"default:1" json:"status"` // 1 启用
}

// SysRole 角色。
type SysRole struct {
	Base
	Code string `gorm:"size:64;uniqueIndex" json:"code"`
	Name string `gorm:"size:64" json:"name"`
	Desc string `gorm:"size:255" json:"desc"`
}

// SysRolePerm 角色权限（菜单 path + 动作）。
type SysRolePerm struct {
	Base
	RoleCode string `gorm:"size:64;index;uniqueIndex:uk_role_path_act" json:"role_code"`
	Path     string `gorm:"size:128;uniqueIndex:uk_role_path_act" json:"path"`
	Action   string `gorm:"size:32;uniqueIndex:uk_role_path_act" json:"action"` // query/create/...
}

// SysDictType 字典排查类型。
type SysDictType struct {
	Base
	Code string `gorm:"size:64;uniqueIndex" json:"code"` // well/road/...
	Name string `gorm:"size:64" json:"name"`
	Sort int    `json:"sort"`
}

// SysDictField 字典字段。
type SysDictField struct {
	Base
	TypeCode string `gorm:"size:64;index;uniqueIndex:uk_type_field" json:"type_code"`
	Code     string `gorm:"size:64;uniqueIndex:uk_type_field" json:"code"`
	Name     string `gorm:"size:64" json:"name"`
	Sort     int    `json:"sort"`
}

// SysDictItem 字典选项值。
type SysDictItem struct {
	Base
	FieldID uint64 `gorm:"index" json:"field_id"`
	Label   string `gorm:"size:128" json:"label"`
	Value   string `gorm:"size:128" json:"value"`
	Sort    int    `json:"sort"`
}

// Issue 排查/整改主表（对齐前端 issues）。
type Issue struct {
	Base
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
	// PhotoUUIDs / RectifyPhotoUUIDs 逗号分隔附件 uuid
	PhotoUUIDs        string `gorm:"type:text" json:"photo_uuids"`
	RectifyPhotoUUIDs string `gorm:"type:text" json:"rectify_photo_uuids"`
}

// OpLog 操作日志。
type OpLog struct {
	Base
	UserID   uint64 `gorm:"index" json:"user_id"`
	Username string `gorm:"size:64" json:"username"`
	Action   string `gorm:"size:64;index" json:"action"`
	Detail   string `gorm:"size:512" json:"detail"`
	Path     string `gorm:"size:128" json:"path"`
	TraceID  string `gorm:"size:64;index" json:"trace_id"`
	IP       string `gorm:"size:64" json:"ip"`
}

// Attachment 附件主记录（业务只存 UUID）。
type Attachment struct {
	Base
	UUID         string `gorm:"size:36;uniqueIndex;not null" json:"uuid"`
	FileName     string `gorm:"size:255" json:"file_name"`
	ContentType  string `gorm:"size:128" json:"content_type"`
	Size         int64  `json:"size"`
	ChunkSize    int64  `json:"chunk_size"`
	TotalChunks  int    `json:"total_chunks"`
	UploadedBits string `gorm:"type:text" json:"-"` // 已上传分片位图，如 0,1,2
	MD5          string `gorm:"size:64" json:"md5"`
	Status       string `gorm:"size:16;index" json:"status"` // initing/uploading/ready/failed
	StoragePath  string `gorm:"size:512" json:"-"`
	UploaderID   uint64 `gorm:"index" json:"uploader_id"`
}

// AttachmentChunk 分片记录（断点续传）。
type AttachmentChunk struct {
	Base
	UUID       string `gorm:"size:36;uniqueIndex:uk_uuid_idx;not null" json:"uuid"`
	ChunkIndex int    `gorm:"uniqueIndex:uk_uuid_idx;not null" json:"chunk_index"`
	Size       int64  `json:"size"`
	Path       string `gorm:"size:512" json:"-"`
}
