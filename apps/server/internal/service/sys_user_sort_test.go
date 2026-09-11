package service

import (
	"context"
	"database/sql/driver"
	"fmt"
	"strings"
	"testing"

	"gbnt/apps/server/internal/model"
	"gbnt/apps/server/internal/testutil"
)

func checkInsertedUserSort(t *testing.T, want int32) func(string, []driver.NamedValue) {
	t.Helper()
	return func(query string, args []driver.NamedValue) {
		start, end := strings.Index(query, "("), strings.Index(query, ")")
		columns := strings.Split(query[start+1:end], ",")
		for i, column := range columns {
			if column == "`sort`" {
				if args[i].Value != int64(want) {
					t.Errorf("排序写入值=%v，预期%d", args[i].Value, want)
				}
				return
			}
		}
		t.Error("人员写入缺少排序列")
	}
}

func TestCreateUserSortDefaultsAndPreservesExplicitZero(t *testing.T) {
	zero, negative, positive := int32(0), int32(-10), int32(20)
	for _, input := range []*int32{nil, &zero, &negative, &positive} {
		want := model.DefaultUserSort
		if input != nil {
			want = *input
		}
		t.Run(fmt.Sprint(want), func(t *testing.T) {
			db := testutil.NewTransactionDB(t,
				testutil.QueryStep{Kind: "begin"},
				testutil.QueryStep{Kind: "exec", Contains: "INSERT INTO `sys_users`", InsertID: 2, Check: checkInsertedUserSort(t, want)},
				testutil.QueryStep{Kind: "commit"},
			)
			user, err := (&SysService{DB: db}).CreateUser(context.Background(), UserInput{Username: "sort-worker", OrgID: 3, RoleID: 2, Sort: input})
			if err != nil || user.Sort == nil || *user.Sort != want || user.Status != 1 {
				t.Fatalf("默认启用及排序写入失败: user=%+v err=%v", user, err)
			}
		})
	}
}

func TestUpdateUserSortIsOptionalAndDoesNotChangeStatus(t *testing.T) {
	zero, negative, positive := int32(0), int32(-10), int32(30)
	for _, input := range []*int32{nil, &zero, &negative, &positive} {
		want := int32(25)
		if input != nil {
			want = *input
		}
		t.Run(fmt.Sprint(want), func(t *testing.T) {
			read := func(sort int32) testutil.QueryStep {
				return testutil.QueryStep{Contains: "FROM `sys_users`", Columns: []string{"id", "sort", "status", "is_super_admin"}, Rows: [][]driver.Value{{int64(2), int64(sort), int64(0), false}}}
			}
			db := testutil.NewTransactionDB(t,
				read(25), testutil.QueryStep{Kind: "begin"},
				testutil.QueryStep{Kind: "exec", Contains: "UPDATE `sys_users`", Check: func(query string, args []driver.NamedValue) {
					if strings.Contains(query, "`status`") || strings.Contains(query, "`password`") {
						t.Errorf("编辑排序不应修改状态或密码: %s", query)
					}
					if strings.Contains(query, "`sort`=?") != (input != nil) {
						t.Errorf("未传排序应保留旧值: %s", query)
					}
					if input != nil {
						sortArg := strings.Count(query[:strings.Index(query, "`sort`=?")], "?")
						if args[sortArg].Value != int64(want) {
							t.Errorf("排序更新错误: %v", args[sortArg].Value)
						}
					}
				}}, testutil.QueryStep{Kind: "commit"}, read(want),
			)
			user, err := (&SysService{DB: db}).UpdateUser(context.Background(), 2, UserInput{Name: "新姓名", OrgID: 3, RoleID: 2, Sort: input})
			if err != nil || user.Sort == nil || *user.Sort != want || user.Status != 0 {
				t.Fatalf("更新丢失排序或状态: user=%+v err=%v", user, err)
			}
		})
	}
}

func TestListUsersSortBeforePaginationWithStableTieBreaker(t *testing.T) {
	db := testutil.NewQueryDB(t,
		testutil.QueryStep{Contains: "count(*)", Columns: []string{"total"}, Rows: [][]driver.Value{{int64(3)}}},
		testutil.QueryStep{Contains: "ORDER BY sort ASC, id DESC LIMIT ? OFFSET ?", Columns: []string{"id", "sort"}, Rows: [][]driver.Value{{int64(2), int64(100)}}, Check: func(query string, args []driver.NamedValue) {
			if !strings.Contains(query, "org_id = ?") || !strings.Contains(query, "username LIKE ? OR name LIKE ? OR phone LIKE ?") || !strings.Contains(query, "is_delete") {
				t.Errorf("排序不得丢失筛选或软删条件: %s", query)
			}
			if args[len(args)-2].Value != int64(2) || args[len(args)-1].Value != int64(2) {
				t.Errorf("分页参数异常: %v", args)
			}
		}},
	)
	users, total, err := (&SysService{DB: db}).ListUsers(3, "worker", 2, 2)
	if err != nil || total != 3 || len(users) != 1 || *users[0].Sort != 100 {
		t.Fatalf("列表排序或分页失败: total=%d users=%v err=%v", total, users, err)
	}
}

func TestListUsersByOrgUsesSameSort(t *testing.T) {
	db := testutil.NewQueryDB(t, testutil.QueryStep{Contains: "ORDER BY sort ASC, id DESC", Columns: []string{"id", "sort"}, Rows: [][]driver.Value{{int64(2), int64(0)}}})
	users, err := (&SysService{DB: db}).ListUsersByOrgID(3)
	if err != nil || len(users) != 1 || *users[0].Sort != 0 {
		t.Fatalf("按单位查询未保留0排序: %v %v", users, err)
	}
}

func TestUserSortMySQLPagination(t *testing.T) {
	db, _ := testutil.NewIsolatedMySQL(t)
	if err := db.AutoMigrate(&model.SysUser{}); err != nil {
		t.Fatal(err)
	}
	for index, sort := range []int32{100, 0, 100, -5, 100} {
		if err := db.Create(&model.SysUser{Username: fmt.Sprintf("worker-%d", index), OrgID: 3, Sort: &sort}).Error; err != nil {
			t.Fatal(err)
		}
	}
	svc := SysService{DB: db}
	for page, want := range [][]uint64{{4, 2}, {5, 3}, {1}} {
		users, total, err := svc.ListUsers(3, "worker", page+1, 2)
		if err != nil || total != 5 || len(users) != len(want) {
			t.Fatalf("真实分页异常: total=%d users=%v err=%v", total, users, err)
		}
		for i, id := range want {
			if users[i].ID != id {
				t.Fatalf("第%d页排序错误: %v", page+1, users)
			}
		}
	}
}
