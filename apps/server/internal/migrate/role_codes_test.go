package migrate

import (
	"database/sql/driver"
	"strings"
	"testing"

	"github.com/go-sql-driver/mysql"

	"gbnt/apps/server/internal/model"
	"gbnt/apps/server/internal/testutil"
)

func TestRoleCodeBackfillChangesOnlyMissingCodesAndRetriesCollision(t *testing.T) {
	check := func(code string, id int64) func(string, []driver.NamedValue) {
		return func(query string, args []driver.NamedValue) {
			if !strings.Contains(query, "SET `code`=? WHERE id = ?") || strings.Contains(query, "is_delete") || len(args) != 2 || args[0].Value != code || args[1].Value != id {
				t.Errorf("回填不得修改名称、主键或忽略软删角色: %s %v", query, args)
			}
		}
	}
	db := testutil.NewTransactionDB(t,
		testutil.QueryStep{Kind: "begin"},
		testutil.QueryStep{Contains: "FOR UPDATE", Columns: []string{"id", "code", "is_delete"}, Rows: [][]driver.Value{{int64(1), nil, int64(0)}, {int64(2), nil, int64(1)}}, Check: func(query string, _ []driver.NamedValue) {
			if !strings.Contains(query, "code IS NULL OR code = ''") {
				t.Error("仅允许回填缺失标识", query)
			}
		}},
		testutil.QueryStep{Kind: "exec", Contains: "UPDATE `sys_roles`", Check: check("admin", 1)},
		testutil.QueryStep{Kind: "exec", Contains: "UPDATE `sys_roles`", Check: check("role-2", 2), Err: &mysql.MySQLError{Number: 1062}},
		testutil.QueryStep{Kind: "exec", Contains: "UPDATE `sys_roles`", Check: check("role-2-1", 2)},
		testutil.QueryStep{Kind: "commit"},
	)
	if err := ensureRoleCodes(db); err != nil {
		t.Fatal(err)
	}
	// 已完成迁移时不产生写操作。
	db = testutil.NewTransactionDB(t, testutil.QueryStep{Kind: "begin"}, testutil.QueryStep{Contains: "code IS NULL", Columns: []string{"id", "code"}}, testutil.QueryStep{Kind: "commit"})
	if err := ensureRoleCodes(db); err != nil {
		t.Fatal(err)
	}
}

func TestRoleCodeMySQLAdditiveMigration(t *testing.T) {
	db, _ := testutil.NewIsolatedMySQL(t)
	// 从没有code列、已有多个历史角色的真实旧表升级，不重建表。
	if err := db.Exec("CREATE TABLE sys_roles (id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT, name VARCHAR(64), `desc` VARCHAR(255), status BIGINT DEFAULT 1, is_delete BIGINT UNSIGNED DEFAULT 0)").Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Exec("INSERT INTO sys_roles (id,name,`desc`,status,is_delete) VALUES (1,'管理员','保留',1,0),(2,'系统配置员','保留',1,0),(3,'系统配置员','已删除',0,1)").Error; err != nil {
		t.Fatal(err)
	}
	if err := db.AutoMigrate(&model.SysRole{}, &model.SysUser{}, &model.SysRoleAPI{}); err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&model.SysUser{Username: "migration-test", RoleID: 2, Status: 1}).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&model.SysRoleAPI{RoleID: 2, APIID: 7}).Error; err != nil {
		t.Fatal(err)
	}
	for range 2 {
		if err := ensureRoleCodes(db); err != nil {
			t.Fatal(err)
		}
	}
	var roles []model.SysRole
	if err := db.Unscoped().Order("id").Find(&roles).Error; err != nil {
		t.Fatal(err)
	}
	for i, code := range []string{"admin", "role-2", "role-3"} {
		if roles[i].ID != uint64(i+1) || roles[i].Code == nil || *roles[i].Code != code {
			t.Fatalf("迁移标识异常: %+v", roles)
		}
	}
	if roles[1].Name != "系统配置员" || roles[1].Desc != "保留" || roles[2].IsDelete != 1 {
		t.Fatal("历史字段被改动")
	}
	var user model.SysUser
	var grant model.SysRoleAPI
	db.First(&user)
	db.First(&grant)
	if user.RoleID != 2 || grant.RoleID != 2 || grant.APIID != 7 {
		t.Fatal("人员或权限关联被改动")
	}
	code := "role-2"
	if err := db.Create(&model.SysRole{Name: "重复ID", Code: &code}).Error; err == nil {
		t.Fatal("数据库唯一约束失效")
	}
}
