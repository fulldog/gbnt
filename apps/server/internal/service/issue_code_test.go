package service

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"testing"

	"gbnt/apps/server/internal/database"
	"gbnt/apps/server/internal/migrate"
	"gbnt/apps/server/internal/model"
	"gbnt/apps/server/internal/testutil"
	driver "github.com/go-sql-driver/mysql"
	"gorm.io/gorm"
)

func TestIssueCodeModeAndNormalization(t *testing.T) {
	for _, test := range []struct{ mode, value, wantMode, want string }{
		{"", "", "auto", ""}, {"", " 001 ", "manual", "01"}, {"manual", "000", "manual", "00"},
		{"manual", "100", "manual", "100"}, {"manual", "井-02", "manual", "井-02"}, {"auto", "", "auto", ""},
	} {
		mode, value, err := issueCodeInput(test.mode, test.value)
		if err != nil || mode != test.wantMode || value != test.want {
			t.Fatalf("%+v: %s %s %v", test, mode, value, err)
		}
	}
	for _, test := range [][2]string{{"manual", ""}, {"manual", "  "}, {"auto", "01"}, {"unknown", ""}} {
		if _, _, err := issueCodeInput(test[0], test[1]); err == nil {
			t.Fatalf("应拒绝：%v", test)
		}
	}
	if !isCodeUniqueError(&driver.MySQLError{Number: 1062, Message: "Duplicate entry for key 'issues.uq_issues_active_code'"}) {
		t.Fatal("未识别设施编号冲突")
	}
	if isCodeUniqueError(&driver.MySQLError{Number: 1062, Message: "Duplicate entry for key 'issues.idx_issues_issue_key'"}) {
		t.Fatal("其它唯一键不能误报编号重复")
	}
}

func facilityServiceDB(t *testing.T) (*IssueService, context.Context) {
	t.Helper()
	db, name := testutil.NewIsolatedMySQL(t)
	if err := db.AutoMigrate(&model.SysOrg{}, &model.SysUser{}, &model.Issue{}, &model.IssueRectifyRecord{}); err != nil {
		t.Fatal(err)
	}
	if report, err := migrate.ApplyFacilityCodes(context.Background(), db, name); err != nil || !report.Ready {
		t.Fatalf("迁移失败：%+v %v", report, err)
	}
	for _, org := range []model.SysOrg{{Base: model.Base{ID: 10}, Name: "街道", Type: "street"}, {Base: model.Base{ID: 101}, ParentID: 10, Name: "A村", Type: "village"}, {Base: model.Base{ID: 102}, ParentID: 10, Name: "B村", Type: "village"}} {
		if err := db.Create(&org).Error; err != nil {
			t.Fatal(err)
		}
	}
	ctx := database.WithUser(context.Background(), &database.UserInfo{ID: 5, OrgID: 10})
	return &IssueService{DB: db}, ctx
}

func codeTestInput(t *testing.T, code string) IssueInput {
	return IssueInput{Type: "road", ProjectYear: 2022, OrgID: 101, Code: code, Address: "现场", ReporterSignatureFileID: "signed", TypeExt: formTestExt(t, "road")}
}

func TestFacilityCodeMySQLCountSkipAndScope(t *testing.T) {
	s, ctx := facilityServiceDB(t)
	for _, code := range []string{"01", "08"} {
		if _, err := s.Create(ctx, codeTestInput(t, code)); err != nil {
			t.Fatal(err)
		}
	}
	third, err := s.Create(ctx, codeTestInput(t, ""))
	if err != nil || third.Code != "03" {
		t.Fatalf("按条数起步：%+v %v", third, err)
	}
	if _, err := s.Create(ctx, codeTestInput(t, "001")); !errors.Is(err, ErrFacilityCodeConflict) {
		t.Fatalf("前导零应冲突：%v", err)
	}
	if err := s.Delete(ctx, third.ID); err != nil {
		t.Fatal(err)
	}
	for range 2 {
		again, err := s.Create(ctx, codeTestInput(t, "03"))
		if err != nil {
			t.Fatal(err)
		}
		if err := s.Delete(ctx, again.ID); err != nil {
			t.Fatal(err)
		}
	}
	input := codeTestInput(t, "01")
	input.OrgID = 102
	if _, err := s.Create(ctx, input); err != nil {
		t.Fatal("跨村同号应允许", err)
	}
	input = codeTestInput(t, "01")
	input.Type = "bridge"
	input.TypeExt = formTestExt(t, "bridge")
	if _, err := s.Create(ctx, input); err != nil {
		t.Fatal("跨类型同号应允许", err)
	}
	input = codeTestInput(t, "01")
	input.ProjectYear = 2020
	if _, err := s.Create(ctx, input); !errors.Is(err, ErrFacilityCodeConflict) {
		t.Fatal("跨年度仍须唯一", err)
	}
	// 自动分配跳过手动占用的条数加一号码。
	if _, err := s.Create(ctx, codeTestInput(t, "04")); err != nil {
		t.Fatal(err)
	}
	got, err := s.Create(ctx, codeTestInput(t, ""))
	if err != nil || got.Code != "05" {
		t.Fatalf("应跳过 04：%+v %v", got, err)
	}
}

func TestFacilityCodeMySQLConcurrentAndRetry(t *testing.T) {
	s, ctx := facilityServiceDB(t)
	input := codeTestInput(t, "")
	input.RequestID = "same_request_00000001"
	run := func(inputs []IssueInput) ([]*IssueVO, []error) {
		results, failures := make([]*IssueVO, len(inputs)), make([]error, len(inputs))
		var group sync.WaitGroup
		start := make(chan struct{})
		for i, item := range inputs {
			group.Add(1)
			go func(i int, item IssueInput) {
				defer group.Done()
				<-start
				results[i], failures[i] = s.Create(ctx, item)
			}(i, item)
		}
		close(start)
		group.Wait()
		return results, failures
	}
	inputs := make([]IssueInput, 8)
	for i := range inputs {
		inputs[i] = input
	}
	results, failures := run(inputs)
	for i, err := range failures {
		if err != nil {
			t.Fatal(err)
		}
		if results[i].ID != results[0].ID || results[i].Code != "01" {
			t.Fatal("重试没有返回同一工单")
		}
	}
	input.Address = "不同内容"
	if _, err := s.Create(ctx, input); !errors.Is(err, ErrIssueRequestConflict) {
		t.Fatal("同请求不同内容未拒绝", err)
	}
	for i := range inputs {
		inputs[i] = codeTestInput(t, "")
		inputs[i].RequestID = fmt.Sprintf("different_request_%016d", i)
	}
	results, failures = run(inputs)
	seen := map[string]bool{}
	for i, err := range failures {
		if err != nil {
			t.Fatal(err)
		}
		if seen[results[i].Code] {
			t.Fatal("自动编号并发重复")
		}
		seen[results[i].Code] = true
	}
	for i := range inputs {
		inputs[i] = codeTestInput(t, "66")
	}
	_, failures = run(inputs)
	success := 0
	for _, err := range failures {
		if err == nil {
			success++
		} else if !errors.Is(err, ErrFacilityCodeConflict) {
			t.Fatal(err)
		}
	}
	if success != 1 {
		t.Fatalf("手动同号仅应一次成功：%d", success)
	}
	var count int64
	s.DB.Model(&model.Issue{}).Count(&count)
	if count != 10 {
		t.Fatalf("实际工单数 %d，应 10", count)
	}
}

func TestFacilityCodeMySQLThreeDigitsAndMixedWriters(t *testing.T) {
	s, ctx := facilityServiceDB(t)
	var seed []model.Issue
	for i := 1; i <= 99; i++ {
		code := fmt.Sprintf("%02d", i)
		seed = append(seed, model.Issue{IssueKey: fmt.Sprintf("seed_%d", i), OrgID: 101, Type: "road", Code: code, CodeKey: code, Status: []string{"new", "pending", "done"}[i%3], ProjectYear: 2020 + i%3, TypeExt: "{}"})
	}
	if err := s.DB.Create(&seed).Error; err != nil {
		t.Fatal(err)
	}
	input := codeTestInput(t, "")
	var automatic, manual *IssueVO
	var autoErr, manualErr error
	var group sync.WaitGroup
	group.Add(2)
	start := make(chan struct{})
	go func() { defer group.Done(); <-start; automatic, autoErr = s.Create(ctx, input) }()
	go func() { defer group.Done(); <-start; manual, manualErr = s.Create(ctx, codeTestInput(t, "100")) }()
	close(start)
	group.Wait()
	if autoErr != nil {
		t.Fatal(autoErr)
	}
	if manualErr == nil {
		if manual.Code != "100" || automatic.Code != "101" {
			t.Fatalf("手动先保存时自动应跳过 100：%s/%s", manual.Code, automatic.Code)
		}
	} else if !errors.Is(manualErr, ErrFacilityCodeConflict) || automatic.Code != "100" {
		t.Fatalf("自动先保存时手动应冲突：%s/%v", automatic.Code, manualErr)
	}
	// 状态、年度、上报账号都不能把同一村同类型拆成多个编号范围。
	for i := 1; i <= 3; i++ {
		other := database.WithUser(ctx, &database.UserInfo{ID: uint64(10 + i), OrgID: 10})
		if _, err := s.Create(other, codeTestInput(t, fmt.Sprintf("%02d", i))); !errors.Is(err, ErrFacilityCodeConflict) {
			t.Fatalf("已有记录状态不应释放号码：%d %v", i, err)
		}
	}
	for _, code := range []string{"ROAD-A", "road-a"} {
		if _, err := s.Create(ctx, codeTestInput(t, code)); err != nil {
			t.Fatal("文本编号应区分大小写", err)
		}
	}
}

func TestFacilityCodeMySQLEditAndRollback(t *testing.T) {
	s, ctx := facilityServiceDB(t)
	a, err := s.Create(ctx, codeTestInput(t, "01"))
	if err != nil {
		t.Fatal(err)
	}
	b, err := s.Create(ctx, codeTestInput(t, "02"))
	if err != nil {
		t.Fatal(err)
	}
	value := "001"
	if _, err := s.Update(ctx, a.ID, IssueUpdateInput{Code: &value}); err != nil {
		t.Fatal("排除自身", err)
	}
	if _, err := s.Update(ctx, b.ID, IssueUpdateInput{Code: &value}); !errors.Is(err, ErrFacilityCodeConflict) {
		t.Fatal("手改应冲突", err)
	}
	input := codeTestInput(t, "02")
	input.OrgID = 102
	other, err := s.Create(ctx, input)
	if err != nil {
		t.Fatal(err)
	}
	org := uint64(101)
	if _, err := s.Update(ctx, other.ID, IssueUpdateInput{OrgID: &org}); !errors.Is(err, ErrFacilityCodeConflict) {
		t.Fatal("只改组织也应冲突", err)
	}
	// INSERT 后出错必须连工单及提交凭据一起回滚。
	s.DB.Callback().Create().After("gorm:create").Register("test:fail_issue", func(tx *gorm.DB) {
		if tx.Statement.Table == "issues" {
			tx.AddError(errors.New("写入故障"))
		}
	})
	input = codeTestInput(t, "")
	input.RequestID = "rollback_request_0001"
	if _, err := s.Create(ctx, input); err == nil {
		t.Fatal("故障应返回失败")
	}
	s.DB.Callback().Create().Remove("test:fail_issue")
	var count int64
	s.DB.Model(&model.IssueCreateRequest{}).Where("request_id=?", input.RequestID).Count(&count)
	if count != 0 {
		t.Fatal("失败占用了请求 ID")
	}
	saved, err := s.Create(ctx, input)
	if err != nil || saved.Code != "03" {
		t.Fatalf("失败不应占号：%+v %v", saved, err)
	}
}
