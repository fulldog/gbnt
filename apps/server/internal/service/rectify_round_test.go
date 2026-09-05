package service

import (
	"context"
	"database/sql/driver"
	"errors"
	"fmt"
	"strings"
	"testing"

	"gbnt/apps/server/internal/database"
	"gbnt/apps/server/internal/model"
	"gbnt/apps/server/internal/testutil"
)

const roundRoadExt = `{"checklist":[{"type":"has_shoulder","value":false},{"type":"has_ash","value":false}]}`

func roundIssueQuery(status string, round, assignee int64, locked bool) testutil.QueryStep {
	return testutil.QueryStep{
		Contains: "FROM `issues`", Columns: []string{"id", "type", "type_ext", "status", "rectify_round", "assignee_user"},
		Rows: [][]driver.Value{{int64(1), "road", roundRoadExt, status, round, assignee}},
		Check: func(query string, _ []driver.NamedValue) {
			if strings.Contains(query, "FOR UPDATE") != locked {
				panic("问题行锁状态错误: " + query)
			}
		},
	}
}

func roundContext() context.Context {
	return database.WithUser(context.Background(), &database.UserInfo{ID: 7})
}

func TestRectifyUsesOnlyCurrentRoundAndPreservesHistory(t *testing.T) {
	for _, current := range []int64{0, 1} {
		for _, alreadyCovered := range []bool{false, true} {
			t.Run(fmt.Sprintf("轮次_%d_本轮另一题已完成_%t", current, alreadyCovered), func(t *testing.T) {
				expectedStatus := "pending"
				historyRound := current - 1
				if alreadyCovered {
					historyRound, expectedStatus = current, "done"
				}
				history := [][]driver.Value{}
				// 故意混入上一轮记录，同时断言 SQL 过滤和服务端轮次保护。
				if historyRound >= 0 {
					history = append(history, []driver.Value{int64(20), "has_ash", historyRound})
				}
				db := testutil.NewTransactionDB(t,
					testutil.QueryStep{Contains: "FROM `attachments`", Columns: []string{"file_id", "status"}, Rows: [][]driver.Value{{"photo-1", "success"}}},
					testutil.QueryStep{Kind: "begin"}, roundIssueQuery("pending", current, 7, true),
					testutil.QueryStep{Contains: "issue_id = ? AND round = ?", Columns: []string{"id", "quiz_type", "round"}, Rows: history, Check: func(_ string, args []driver.NamedValue) {
						if args[0].Value != int64(1) || args[1].Value != current {
							t.Fatalf("轮次过滤错误: %v", args)
						}
					}},
					testutil.QueryStep{Kind: "exec", Contains: "INSERT INTO `issue_rectify_records`", InsertID: 30, Check: func(query string, args []driver.NamedValue) {
						if !strings.Contains(query, "`round`") || args[1].Value != current {
							t.Fatalf("记录未携带当前轮次: %s %v", query, args)
						}
					}},
					testutil.QueryStep{Kind: "exec", Contains: "UPDATE `issues`", Check: func(query string, args []driver.NamedValue) {
						if !strings.Contains(query, "`assignee_user`=?") || args[0].Value != int64(7) || args[1].Value != expectedStatus {
							t.Fatalf("本轮覆盖状态错误: %s %v", query, args)
						}
					}},
					testutil.QueryStep{Kind: "commit"}, roundIssueQuery(expectedStatus, current, 7, false),
					testutil.QueryStep{Contains: "FROM `issue_rectify_records`", Columns: []string{"id", "quiz_type", "round"}, Rows: [][]driver.Value{{int64(30), "has_shoulder", current}, {int64(20), "has_ash", int64(0)}}, Check: func(query string, _ []driver.NamedValue) {
						if strings.Contains(query, "round =") {
							t.Fatalf("展示不能过滤历史轮次: %s", query)
						}
					}},
				)
				s := &IssueService{DB: db, Attach: &AttachService{DB: db}}
				input := RectifyInput{RectifyList: []RectifyItem{{Type: model.QuizHasShoulder, Note: "已修", FileUUIDs: []string{"photo-1"}}}}
				// 同时覆盖新客户端显式匹配轮次、旧客户端省略轮次两条成功路径。
				if alreadyCovered {
					expected := uint64(current)
					input.ExpectedRound = &expected
				}
				out, err := s.Rectify(roundContext(), 1, input, true)
				if err != nil {
					t.Fatal(err)
				}
				if out.Status != expectedStatus || out.RectifyRound != uint64(current) || len(out.RectifyRecords) != 2 {
					t.Fatalf("响应不符: %+v", out)
				}
			})
		}
	}
}

func TestReRectifyIncrementsRoundAtomicallyWithoutDeletingHistory(t *testing.T) {
	db := testutil.NewTransactionDB(t,
		testutil.QueryStep{Kind: "begin"}, roundIssueQuery("done", 0, 7, true),
		testutil.QueryStep{Kind: "exec", Contains: "UPDATE `issues`", Check: func(query string, _ []driver.NamedValue) {
			if !strings.Contains(query, "`rectify_round`=rectify_round + 1") || strings.Contains(query, "assignee_user") {
				t.Fatalf("重开应只推进轮次及状态: %s", query)
			}
		}},
		testutil.QueryStep{Kind: "commit"}, roundIssueQuery("pending", 1, 7, false),
		testutil.QueryStep{Contains: "FROM `issue_rectify_records`", Columns: []string{"id", "quiz_type", "round"}, Rows: [][]driver.Value{{int64(20), "has_ash", int64(0)}}},
	)
	item, err := (&IssueService{DB: db}).ReRectify(roundContext(), 1, true)
	if err != nil {
		t.Fatal(err)
	}
	if item.RectifyRound != 1 || len(item.RectifyRecords) != 1 || item.RectifyRecords[0].Round != 0 {
		t.Fatalf("历史被清除或轮次不正确: %+v", item)
	}
}

func TestRoundMutationsRollbackOnStaleStatusOrAssignee(t *testing.T) {
	for _, reopen := range []bool{false, true} {
		for _, otherAssignee := range []bool{false, true} {
			t.Run(fmt.Sprintf("重开_%t_他人_%t", reopen, otherAssignee), func(t *testing.T) {
				status, assignee := "done", int64(7)
				if reopen {
					status = "pending"
				}
				if otherAssignee {
					assignee = 8
					if reopen {
						status = "done"
					} else {
						status = "pending"
					}
				}
				steps := []testutil.QueryStep{}
				if !reopen {
					steps = append(steps, testutil.QueryStep{Contains: "FROM `attachments`", Columns: []string{"file_id", "status"}, Rows: [][]driver.Value{{"photo-1", "success"}}})
				}
				steps = append(steps, testutil.QueryStep{Kind: "begin"}, roundIssueQuery(status, 1, assignee, true), testutil.QueryStep{Kind: "rollback"})
				db := testutil.NewTransactionDB(t, steps...)
				s := &IssueService{DB: db, Attach: &AttachService{DB: db}}
				var err error
				if reopen {
					_, err = s.ReRectify(roundContext(), 1, true)
				} else {
					_, err = s.Rectify(roundContext(), 1, RectifyInput{RectifyList: []RectifyItem{{Type: model.QuizHasShoulder, Note: "已修", FileUUIDs: []string{"photo-1"}}}}, true)
				}
				if err == nil {
					t.Fatal("过期状态或他人责任问题不应允许写入")
				}
			})
		}
	}
}

func TestRectifyRecordFailureRollsBackStatus(t *testing.T) {
	failure := errors.New("insert failed")
	db := testutil.NewTransactionDB(t,
		testutil.QueryStep{Contains: "FROM `attachments`", Columns: []string{"file_id", "status"}, Rows: [][]driver.Value{{"photo-1", "success"}}},
		testutil.QueryStep{Kind: "begin"}, roundIssueQuery("pending", 1, 7, true),
		testutil.QueryStep{Contains: "issue_id = ? AND round = ?", Columns: []string{"id"}},
		testutil.QueryStep{Kind: "exec", Contains: "INSERT INTO `issue_rectify_records`", Err: failure},
		testutil.QueryStep{Kind: "rollback"},
	)
	_, err := (&IssueService{DB: db, Attach: &AttachService{DB: db}}).Rectify(roundContext(), 1, RectifyInput{RectifyList: []RectifyItem{{Type: model.QuizHasShoulder, Note: "已修", FileUUIDs: []string{"photo-1"}}}}, true)
	if !errors.Is(err, failure) {
		t.Fatalf("写入错误被吞: %v", err)
	}
}

func TestRectifyRejectsStaleExpectedRoundInsideLock(t *testing.T) {
	for _, expected := range []uint64{0, 1, 3} {
		t.Run(fmt.Sprintf("客户端轮次_%d", expected), func(t *testing.T) {
			db := testutil.NewTransactionDB(t,
				testutil.QueryStep{Contains: "FROM `attachments`", Columns: []string{"file_id", "status"}, Rows: [][]driver.Value{{"photo-1", "success"}}},
				testutil.QueryStep{Kind: "begin"}, roundIssueQuery("pending", 2, 7, true),
				testutil.QueryStep{Kind: "rollback"},
			)
			_, err := (&IssueService{DB: db, Attach: &AttachService{DB: db}}).Rectify(roundContext(), 1, RectifyInput{
				ExpectedRound: &expected,
				RectifyList:   []RectifyItem{{Type: model.QuizHasShoulder, Note: "旧页面提交", FileUUIDs: []string{"photo-1"}}},
			}, true)
			if err == nil || err.Error() != "整改轮次已更新，请刷新问题后重新提交" {
				t.Fatalf("轮次过期必须拒绝任何记录/状态写入并提醒刷新: %v", err)
			}
		})
	}
}
