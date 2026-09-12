package service

import (
	"context"
	"errors"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"gbnt/apps/server/internal/model"
)

// UserStatusInput 管理端状态开关入参；独立于完整人员编辑，避免覆盖并发更新的人员资料。
type UserStatusInput struct {
	Status *int `json:"status" binding:"required,oneof=0 1"` // 账号状态，必填：0停用、1启用；指针区分未传与0
}

// UpdateUserStatus 仅更新账号状态；在事务内锁定目标，保留超级管理员不可编辑的约束。
func (s *SysService) UpdateUserStatus(ctx context.Context, id uint64, in UserStatusInput) error {
	if in.Status == nil || (*in.Status != 0 && *in.Status != 1) {
		return errors.New("状态必须为0（停用）或1（启用）")
	}
	return s.db(ctx).Transaction(func(tx *gorm.DB) error {
		var user model.SysUser
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&user, id).Error; err != nil {
			return err
		}
		if user.IsSuperAdmin {
			return errors.New("超级管理员不可修改状态")
		}
		if err := requireOrgScopeIfAuthenticated(ctx, tx, user.OrgID); err != nil {
			return err
		}
		if err := s.requireAssignableRoleIfAuthenticated(ctx, user.RoleID); err != nil {
			return err
		}
		return tx.Model(&user).Update("status", *in.Status).Error
	})
}
