package migrate

import (
	"context"
	"errors"
	"testing"

	"gbnt/apps/server/internal/model"
	"gbnt/apps/server/internal/testutil"
)

func TestFacilityCodeAuditKeepsOriginalsAndExcludesDeleted(t *testing.T) {
	rows := []FacilityCodeRow{{ID: 1, OrgID: 10, Type: "road", Code: "1"}, {ID: 2, OrgID: 10, Type: "road", Code: "01"}, {ID: 3, OrgID: 10, Type: "road", Code: "001", IsDelete: 1}, {ID: 4, OrgID: 11, Type: "road", Code: "01"}, {ID: 5, OrgID: 10, Type: "well", Code: "01"}, {ID: 6, OrgID: 10, Type: "road", Code: ""}}
	got := auditFacilityCodeRows(rows)
	if got.Total != 6 || got.Deleted != 1 || got.Empty != 1 || len(got.Conflicts) != 1 || len(got.Conflicts[0].Rows) != 2 || got.Conflicts[0].Rows[0].Code != "1" {
		t.Fatalf("审计口径错误：%+v", got)
	}
}

func TestFacilityCodeMySQLMigration(t *testing.T) {
	db, name := testutil.NewIsolatedMySQL(t)
	ctx := context.Background()
	// 模拟升级前表：没有 code_key、生成列或请求去重表。
	if err := db.Exec("CREATE TABLE issues (id BIGINT UNSIGNED PRIMARY KEY, org_id BIGINT UNSIGNED NOT NULL, type VARCHAR(32) NOT NULL, code VARCHAR(64), is_delete INT NOT NULL DEFAULT 0)").Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Exec("INSERT INTO issues VALUES (1,101,'road','1',0),(2,101,'road','01',0),(3,101,'road','001',1),(4,101,'road','',0)").Error; err != nil {
		t.Fatal(err)
	}
	report, err := ApplyFacilityCodes(ctx, db, name)
	if !errors.Is(err, ErrFacilityCodeHistory) || report.Ready || len(report.Conflicts) != 1 {
		t.Fatalf("历史重复应拒绝：%+v %v", report, err)
	}
	if db.Migrator().HasColumn(&model.Issue{}, "code_key") {
		t.Fatal("审计失败不应写入结构")
	}
	// 仅测试库中模拟审核后的业务纠正；迁移工具本身不会这样改号。
	if err := db.Exec("UPDATE issues SET code='02' WHERE id=2").Error; err != nil {
		t.Fatal(err)
	}
	report, err = ApplyFacilityCodes(ctx, db, name)
	if err != nil || !report.Ready {
		var columns []map[string]interface{}
		db.Raw("SELECT column_name, generation_expression, collation_name FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='issues'").Scan(&columns)
		var indexes []map[string]interface{}
		db.Raw("SELECT index_name, column_name, non_unique FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='issues'").Scan(&indexes)
		t.Logf("columns=%+v indexes=%+v requests=%v", columns, indexes, db.Migrator().HasTable(&model.IssueCreateRequest{}))
		t.Fatalf("迁移失败：%+v %v", report, err)
	}
	var original string
	db.Raw("SELECT code FROM issues WHERE id=1").Scan(&original)
	if original != "1" {
		t.Fatal("迁移不应修改历史原编号")
	}
	if _, err := ApplyFacilityCodes(ctx, db, name); err != nil {
		t.Fatal("重跑迁移应幂等", err)
	}
	if err := db.Exec("INSERT INTO issues(id,org_id,type,code,code_key) VALUES(5,101,'road','01','01')").Error; err == nil {
		t.Fatal("数据库唯一约束未生效")
	}
	if err := db.Exec("INSERT INTO issues(id,org_id,type,code,code_key,is_delete) VALUES(6,101,'road','01','01',1),(7,101,'road','01','01',1)").Error; err != nil {
		t.Fatal("删除历史可以同号", err)
	}
	// 发现旧服务写入未回填比较键时，启动验收不应通过。
	if err := db.Exec("INSERT INTO issues(id,org_id,type,code) VALUES(8,101,'road','08')").Error; err != nil {
		t.Fatal(err)
	}
	if report, err := AuditFacilityCodes(ctx, db); err != nil || report.Ready {
		t.Fatalf("漏填比较键不应 ready：%+v %v", report, err)
	}
}
