package service

import (
	"encoding/json"
	"errors"
	"sync"
	"testing"

	"gbnt/apps/server/internal/migrate"
	"gbnt/apps/server/internal/model"
	"gbnt/apps/server/internal/testutil"
)

func TestFeedbackMySQLConcurrentCompletionAndReporterDeletion(t *testing.T) {
	db, name := testutil.NewIsolatedMySQL(t)
	if err := db.AutoMigrate(&model.SysOrg{}, &model.SysUser{}, &model.Issue{}, &model.IssueRectifyRecord{}, &model.Attachment{}); err != nil {
		t.Fatal(err)
	}
	ctx := roundContext()
	if _, err := migrate.ApplyFacilityCodes(ctx, db, name); err != nil {
		t.Fatal(err)
	}
	for _, row := range []any{
		&model.SysOrg{Base: model.Base{ID: 2}, Name: "测试村", Type: "village"},
		&model.SysUser{Base: model.Base{ID: 7}, Username: "tester", OrgID: 2, Status: 1},
		&model.Attachment{FileID: "photo-1", Status: "success", FileName: "photo.jpg", ContentType: "image/jpeg"},
		&model.Issue{Base: model.Base{ID: 1}, Type: "road", OrgID: 2, Code: "01", CodeKey: "01", Status: "pending", ReportUserID: 7, AssigneeUser: 7, RectifyRound: 1, TypeExt: roundRoadExt},
		&model.IssueRectifyRecord{IssueID: 1, Round: 0, QuizType: "has_ash", Note: "上一轮反馈", PhotoFileIDs: `["photo-1"]`},
	} {
		if err := db.Create(row).Error; err != nil {
			t.Fatal(err)
		}
	}
	s := &IssueService{DB: db, Attach: &AttachService{DB: db}}
	start := make(chan struct{})
	results := make([]error, 8)
	var workers sync.WaitGroup
	for i := range results {
		workers.Add(1)
		go func() { defer workers.Done(); <-start; _, results[i] = s.SubmitFeedback(ctx, 1, feedbackInput()) }()
	}
	close(start)
	workers.Wait()
	succeeded := 0
	for _, err := range results {
		if err == nil {
			succeeded++
		}
	}
	if succeeded != 1 {
		t.Fatalf("并发请求成功 %d 次，应仅一次: %v", succeeded, results)
	}
	var records int64
	db.Model(&model.IssueRectifyRecord{}).Where("issue_id = ?", 1).Count(&records)
	if records != 3 {
		t.Fatalf("历史被删除或并发重复写入: %d", records)
	}
	item, err := s.Get(1)
	if err != nil || item.Status != "done" {
		t.Fatalf("整单未完成: %+v %v", item, err)
	}
	if err := s.deleteIssue(ctx, 1, 8); !errors.Is(err, ErrIssueReporterOnly) {
		t.Fatalf("他人删除未拦截: %v", err)
	}
	if err := s.DeleteReported(ctx, 1); err != nil {
		t.Fatal(err)
	}
	var deleted model.Issue
	if err := db.Unscoped().First(&deleted, 1).Error; err != nil || deleted.IsDelete != 1 {
		t.Fatalf("未软删除: %+v %v", deleted, err)
	}
	db.Model(&model.IssueRectifyRecord{}).Where("issue_id = ?", 1).Count(&records)
	if records != 3 {
		t.Fatal("软删除破坏了历史反馈")
	}
	_, err = s.Create(ctx, IssueInput{Type: "road", ProjectYear: 2023, OrgID: 2, Code: "01", Address: "测试现场", PlanDate: "2026-10-01", ReportUserID: 7, AssigneeUser: 7, ReporterSignatureFileID: "photo-1", TypeExt: json.RawMessage(`{"length":1,"width":4,"thickness":0.2,"tree_survive":0,"checklist":[{"type":"has_shoulder","value":false,"desc":"缺少路肩","files":["photo-1"]},{"type":"has_ash","value":true}]}`)})
	if err != nil {
		t.Fatalf("删除后有效设施编号未释放: %v", err)
	}
}
