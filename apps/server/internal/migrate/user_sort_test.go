package migrate

import (
	"testing"

	"gbnt/apps/server/internal/model"
	"gbnt/apps/server/internal/testutil"
)

func TestUserSortMySQLAdditiveMigration(t *testing.T) {
	db, _ := testutil.NewIsolatedMySQL(t)
	// 模拟已有人员的旧库；包含停用、软删除及超级管理员，不重建表、不重置账号。
	if err := db.Exec("CREATE TABLE sys_users (id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT, username VARCHAR(64) NOT NULL UNIQUE, password VARCHAR(128) NOT NULL, name VARCHAR(64), phone VARCHAR(32), org_id BIGINT UNSIGNED DEFAULT 0, role_id BIGINT UNSIGNED DEFAULT 0, status BIGINT DEFAULT 1, is_super_admin BOOLEAN DEFAULT 0, token_ver BIGINT DEFAULT 0, is_delete BIGINT UNSIGNED DEFAULT 0)").Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Exec("INSERT INTO sys_users (id,username,password,name,org_id,role_id,status,is_super_admin,token_ver,is_delete) VALUES (1,'admin','keep-admin-hash','管理员',0,1,1,1,7,0),(2,'disabled','keep-worker-hash','停用人员',3,2,0,0,8,0),(3,'deleted','keep-deleted-hash','已删除人员',4,3,1,0,9,1)").Error; err != nil {
		t.Fatal(err)
	}
	for range 2 {
		if err := db.AutoMigrate(&model.SysUser{}); err != nil {
			t.Fatal(err)
		}
	}
	var users []model.SysUser
	if err := db.Unscoped().Order("id").Find(&users).Error; err != nil {
		t.Fatal(err)
	}
	if len(users) != 3 {
		t.Fatalf("迁移改变了人员数量: %d", len(users))
	}
	for _, user := range users {
		if user.Sort == nil || *user.Sort != model.DefaultUserSort {
			t.Fatalf("历史人员未默认100: %+v", user)
		}
	}
	if users[0].ID != 1 || users[0].Username != "admin" || !users[0].IsSuperAdmin || users[0].Password != "keep-admin-hash" || users[0].TokenVer != 7 || users[0].RoleID != 1 || users[1].ID != 2 || users[1].Status != 0 || users[1].OrgID != 3 || users[1].RoleID != 2 || users[1].Password != "keep-worker-hash" || users[2].ID != 3 || users[2].IsDelete != 1 {
		t.Fatal("迁移不应改动历史账号、状态、权限、密码或关联")
	}
	if err := db.Model(&model.SysUser{}).Where("id = ?", 2).UpdateColumn("sort", 0).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.AutoMigrate(&model.SysUser{}); err != nil {
		t.Fatal(err)
	}
	var worker model.SysUser
	if err := db.First(&worker, 2).Error; err != nil || worker.Sort == nil || *worker.Sort != 0 {
		t.Fatalf("重复迁移覆盖已配置排序: sort=%v err=%v", worker.Sort, err)
	}
}
