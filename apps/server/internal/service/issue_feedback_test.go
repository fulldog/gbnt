package service

import (
	"context"
	"database/sql/driver"
	"encoding/json"
	"errors"
	"strings"
	"testing"

	"gbnt/apps/server/internal/testutil"
)

func feedbackInput() IssueFeedbackInput {
	round := uint64(1)
	return IssueFeedbackInput{Note: " 整单修复 ", FileUUIDs: []string{"photo-1"}, ExpectedRound: &round}
}

func feedbackAttachment() testutil.QueryStep {
	return testutil.QueryStep{Contains: "FROM `attachments`", Columns: []string{"file_id", "status"}, Rows: [][]driver.Value{{"photo-1", "success"}}}
}

func TestFeedbackMarksDoneWithSingleFeedbackRecord(t *testing.T) {
	written := [][]driver.Value{{int64(9), "feedback", int64(1)}}
	db := testutil.NewTransactionDB(t,
		feedbackAttachment(), testutil.QueryStep{Kind: "begin"}, roundIssueQuery("pending", 1, 7, true),
		testutil.QueryStep{Kind: "exec", Contains: "INSERT INTO `issue_rectify_records`", InsertID: 9, Check: func(_ string, args []driver.NamedValue) {
			if args[1].Value != int64(1) || args[2].Value != "feedback" || args[3].Value != "整单修复" || args[4].Value != `["photo-1"]` {
				t.Fatalf("一键整改记录错误: %v", args)
			}
		}},
		testutil.QueryStep{Kind: "exec", Contains: "UPDATE `issues`", Check: func(_ string, args []driver.NamedValue) {
			if args[0].Value != int64(7) || args[1].Value != "done" {
				t.Fatalf("未直接改为已整改: %v", args)
			}
		}}, testutil.QueryStep{Kind: "commit"}, roundIssueQuery("done", 1, 7, false),
		testutil.QueryStep{Contains: "FROM `issue_rectify_records`", Columns: []string{"id", "quiz_type", "round"}, Rows: written},
	)
	item, err := (&IssueService{DB: db, Attach: &AttachService{DB: db}}).SubmitFeedback(roundContext(), 1, feedbackInput())
	if err != nil || item.Status != "done" || len(item.RectifyRecords) != 1 || item.RectifyRecords[0].QuizType != "feedback" {
		t.Fatalf("一键整改结果错误: %+v %v", item, err)
	}
}

func TestFeedbackClaimsUnassignedIssue(t *testing.T) {
	history := [][]driver.Value{{int64(4), "has_ash", int64(0)}}
	db := testutil.NewTransactionDB(t,
		feedbackAttachment(), testutil.QueryStep{Kind: "begin"}, roundIssueQuery("pending", 1, 0, true),
		testutil.QueryStep{Kind: "exec", Contains: "INSERT INTO `issue_rectify_records`", InsertID: 9},
		testutil.QueryStep{Kind: "exec", Contains: "UPDATE `issues`", Check: func(_ string, args []driver.NamedValue) {
			if args[0].Value != int64(7) || args[1].Value != "done" {
				t.Fatalf("未指派反馈应认领当前用户并完成: %v", args)
			}
		}},
		testutil.QueryStep{Kind: "commit"}, roundIssueQuery("done", 1, 7, false),
		testutil.QueryStep{Contains: "FROM `issue_rectify_records`", Columns: []string{"id", "quiz_type", "round"}, Rows: history},
	)
	item, err := (&IssueService{DB: db, Attach: &AttachService{DB: db}}).SubmitFeedback(roundContext(), 1, feedbackInput())
	if err != nil || item.Status != "done" {
		t.Fatalf("未指派工单反馈失败: %+v %v", item, err)
	}
}

func TestFeedbackRejectsChangedOwnershipRoundAndStatus(t *testing.T) {
	for _, tc := range []struct {
		name, status    string
		round, assignee int64
	}{
		{"他人", "pending", 1, 8}, {"过期轮次", "pending", 2, 7}, {"已完成", "done", 1, 7},
	} {
		t.Run(tc.name, func(t *testing.T) {
			db := testutil.NewTransactionDB(t, feedbackAttachment(), testutil.QueryStep{Kind: "begin"}, roundIssueQuery(tc.status, tc.round, tc.assignee, true), testutil.QueryStep{Kind: "rollback"})
			if _, err := (&IssueService{DB: db, Attach: &AttachService{DB: db}}).SubmitFeedback(roundContext(), 1, feedbackInput()); err == nil {
				t.Fatal("不应写入整改反馈")
			}
		})
	}
}

func TestFeedbackFailureRollsBackEveryItem(t *testing.T) {
	failure := errors.New("整改记录保存失败")
	db := testutil.NewTransactionDB(t, feedbackAttachment(), testutil.QueryStep{Kind: "begin"}, roundIssueQuery("pending", 1, 7, true),
		testutil.QueryStep{Kind: "exec", Contains: "INSERT INTO `issue_rectify_records`", Err: failure}, testutil.QueryStep{Kind: "rollback"})
	if _, err := (&IssueService{DB: db, Attach: &AttachService{DB: db}}).SubmitFeedback(roundContext(), 1, feedbackInput()); !errors.Is(err, failure) {
		t.Fatalf("未保留事务失败: %v", err)
	}
}

func TestFeedbackValidatesRequiredInputsBeforeWrites(t *testing.T) {
	for _, mutate := range []func(*IssueFeedbackInput){
		func(in *IssueFeedbackInput) { in.Note = " " }, func(in *IssueFeedbackInput) { in.Note = strings.Repeat("字", 501) },
		func(in *IssueFeedbackInput) { in.FileUUIDs = nil }, func(in *IssueFeedbackInput) { in.FileUUIDs = make([]string, 7) },
		func(in *IssueFeedbackInput) { in.ExpectedRound = nil },
	} {
		input := feedbackInput()
		mutate(&input)
		if _, err := (&IssueService{}).SubmitFeedback(roundContext(), 1, input); err == nil {
			t.Fatal("缺失反馈未被拦截")
		}
	}
	if _, err := (&IssueService{}).SubmitFeedback(context.Background(), 1, feedbackInput()); err == nil {
		t.Fatal("匿名提交未拦截")
	}
}

func TestDeleteReportedChecksLockedReporterAndSoftDeletes(t *testing.T) {
	for _, reporter := range []int64{7, 8, 0} {
		steps := []testutil.QueryStep{{Kind: "begin"}, {Contains: "FOR UPDATE", Columns: []string{"id", "org_id", "report_user_id"}, Rows: [][]driver.Value{{int64(1), int64(2), reporter}}}}
		if reporter == 7 {
			steps = append(steps, testutil.QueryStep{Contains: "FOR UPDATE", Columns: []string{"id"}, Rows: [][]driver.Value{{int64(2)}}},
				testutil.QueryStep{Kind: "exec", Contains: "UPDATE `issues`"},
				testutil.QueryStep{Kind: "exec", Contains: "UPDATE `issues`", Check: func(query string, _ []driver.NamedValue) {
					if !strings.Contains(query, "is_delete") {
						t.Fatal("必须软删除")
					}
				}}, testutil.QueryStep{Kind: "commit"})
		} else {
			steps = append(steps, testutil.QueryStep{Kind: "rollback"})
		}
		db := testutil.NewTransactionDB(t, steps...)
		err := (&IssueService{DB: db}).DeleteReported(roundContext(), 1)
		if reporter == 7 && err != nil || reporter != 7 && !errors.Is(err, ErrIssueReporterOnly) {
			t.Fatalf("归属校验错误: %d %v", reporter, err)
		}
	}
}

func TestCreateAndUpdateCannotLeavePendingIssueUnassigned(t *testing.T) {
	db := testutil.NewQueryDB(t, testutil.QueryStep{Contains: "FROM `sys_orgs`", Columns: []string{"id"}, Rows: [][]driver.Value{{int64(2)}}})
	_, err := (&IssueService{DB: db}).Create(context.Background(), IssueInput{Type: "road", ProjectYear: 2023, OrgID: 2, Address: "现场", ReporterSignatureFileID: "signature", ReportUserID: 7, PlanDate: "2026-10-01", TypeExt: json.RawMessage(`{"length":1,"width":4,"thickness":0.2,"tree_survive":0,"checklist":[{"type":"has_shoulder","value":false,"desc":"缺少路肩"},{"type":"has_ash","value":true}]}`)})
	if err == nil || !strings.Contains(err.Error(), "整改人") {
		t.Fatalf("未指派创建应失败: %v", err)
	}
	db = testutil.NewTransactionDB(t, testutil.QueryStep{Kind: "begin"}, roundIssueQuery("pending", 1, 7, true), testutil.QueryStep{Kind: "rollback"})
	zero := uint64(0)
	_, err = (&IssueService{DB: db}).Update(roundContext(), 1, IssueUpdateInput{AssigneeUser: &zero})
	if err == nil || !strings.Contains(err.Error(), "整改人") {
		t.Fatalf("待处理工单不能清空整改人: %v", err)
	}
}
