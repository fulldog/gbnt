package service

import (
	"context"
	"database/sql/driver"
	"encoding/json"
	"errors"
	"reflect"
	"strings"
	"testing"

	"gbnt/apps/server/internal/testutil"
	"gorm.io/gorm"
)

func TestUserOptionsPaginationSelectedAndMinimalFields(t *testing.T) {
	checkEligible := func(query string, args []driver.NamedValue) {
		if !strings.Contains(query, "org_id = ? AND status = ?") || !strings.Contains(query, "is_delete") {
			t.Errorf("候选不能越过组织/启用/软删：%s", query)
		}
		if args[0].Value != int64(4) || args[1].Value != int64(1) {
			t.Errorf("条件参数错误：%v", args)
		}
		if strings.Contains(query, "password") || strings.Contains(query, "phone") {
			t.Errorf("不得泄露完整用户：%s", query)
		}
	}
	db := testutil.NewQueryDB(t,
		testutil.QueryStep{Contains: "FROM `sys_orgs`", Columns: []string{"id"}, Rows: [][]driver.Value{{int64(4)}}},
		testutil.QueryStep{Contains: "count(*)", Columns: []string{"count"}, Rows: [][]driver.Value{{int64(201)}}, Check: checkEligible},
		testutil.QueryStep{Contains: "LIMIT ? OFFSET ?", Columns: []string{"id", "name", "username"}, Rows: [][]driver.Value{{int64(2000), "", "newer-user"}}, Check: func(query string, args []driver.NamedValue) {
			checkEligible(query, args)
			if !strings.Contains(query, "(name LIKE ? OR username LIKE ?)") {
				t.Errorf("搜索未正确分组：%s", query)
			}
			if args[len(args)-2].Value != int64(100) || args[len(args)-1].Value != int64(100) {
				t.Errorf("分页未归一：%v", args)
			}
		}},
		testutil.QueryStep{Contains: "id = ?", Columns: []string{"id", "name", "username"}, Rows: [][]driver.Value{{int64(2), "较早用户", "older"}}, Check: func(query string, args []driver.NamedValue) {
			checkEligible(query, args)
			if strings.Contains(query, "LIKE") || strings.Contains(query, "OFFSET") {
				t.Errorf("已选回显不应受关键字/页码影响：%s", query)
			}
		}},
	)
	result, err := (&SysService{DB: db}).ListReporterOptions(context.Background(), 4, BusinessUserOptionQuery{Keyword: " newer ", Page: 2, Size: 1000, SelectedID: 2})
	if err != nil {
		t.Fatal(err)
	}
	if result.Page != 2 || result.Size != 100 || result.Total != 201 || len(result.List) != 1 || result.List[0].Name != "newer-user" || result.Selected == nil || result.Selected.ID != 2 {
		t.Fatalf("候选错误：%+v", result)
	}
	encoded, _ := json.Marshal(result.Selected)
	var fields map[string]any
	_ = json.Unmarshal(encoded, &fields)
	if len(fields) != 3 {
		t.Fatalf("最小人员字段应仅 3 个：%s", encoded)
	}
}

func TestSelectedMissingOrIneligibleReturnsNullAndEmptyList(t *testing.T) {
	db := testutil.NewQueryDB(t,
		testutil.QueryStep{Contains: "count(*)", Columns: []string{"count"}, Rows: [][]driver.Value{{int64(0)}}},
		testutil.QueryStep{Contains: "FROM `sys_users`", Columns: []string{"id", "name", "username"}},
		testutil.QueryStep{Contains: "id = ?", Columns: []string{"id", "name", "username"}, Check: func(query string, _ []driver.NamedValue) {
			for _, fragment := range []string{"org_id = ?", "status = ?", "is_delete"} {
				if !strings.Contains(query, fragment) {
					t.Errorf("缺少候选资格条件 %s：%s", fragment, query)
				}
			}
		}},
	)
	result, err := listBusinessUserOptions(db, 4, BusinessUserOptionQuery{SelectedID: 5})
	if err != nil {
		t.Fatal(err)
	}
	encoded, _ := json.Marshal(result)
	if !strings.Contains(string(encoded), `"list":[]`) || !strings.Contains(string(encoded), `"selected":null`) || result.Total != 0 {
		t.Fatalf("空响应错误：%s", encoded)
	}
}

func TestUserOptionsValidateOrgAndIssue(t *testing.T) {
	t.Run("必填组织", func(t *testing.T) {
		_, err := (&SysService{}).ListReporterOptions(context.Background(), 0, BusinessUserOptionQuery{})
		if !errors.Is(err, ErrOptionArgument) {
			t.Fatalf("错误：%v", err)
		}
	})
	t.Run("组织不存在", func(t *testing.T) {
		db := testutil.NewQueryDB(t, testutil.QueryStep{Contains: "FROM `sys_orgs`", Columns: []string{"id"}})
		_, err := (&SysService{DB: db}).ListReporterOptions(context.Background(), 404, BusinessUserOptionQuery{})
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			t.Fatalf("错误：%v", err)
		}
	})
	t.Run("问题不存在", func(t *testing.T) {
		db := testutil.NewQueryDB(t, testutil.QueryStep{Contains: "FROM `issues`", Columns: []string{"id", "org_id"}})
		_, err := (&IssueService{DB: db}).ListAssigneeOptions(context.Background(), 404, BusinessUserOptionQuery{})
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			t.Fatalf("错误：%v", err)
		}
	})
	t.Run("问题组织为唯一来源", func(t *testing.T) {
		db := testutil.NewQueryDB(t,
			testutil.QueryStep{Contains: "FROM `issues`", Columns: []string{"id", "org_id"}, Rows: [][]driver.Value{{int64(8), int64(4)}}},
			testutil.QueryStep{Contains: "FROM `sys_orgs`", Columns: []string{"id"}, Rows: [][]driver.Value{{int64(4)}}},
			testutil.QueryStep{Contains: "count(*)", Columns: []string{"count"}, Rows: [][]driver.Value{{int64(0)}}, Check: func(_ string, args []driver.NamedValue) {
				if args[0].Value != int64(4) {
					t.Errorf("未按问题所属组织过滤：%v", args)
				}
			}},
			testutil.QueryStep{Contains: "FROM `sys_users`", Columns: []string{"id", "name", "username"}},
		)
		if _, err := (&IssueService{DB: db}).ListAssigneeOptions(context.Background(), 8, BusinessUserOptionQuery{}); err != nil {
			t.Fatal(err)
		}
	})
}

func TestUserOptionFailuresAreNotEmptySuccess(t *testing.T) {
	want := errors.New("database failure")
	for _, failing := range []int{0, 1, 2} {
		t.Run(string(rune('0'+failing)), func(t *testing.T) {
			steps := []testutil.QueryStep{
				{Contains: "count(*)", Columns: []string{"count"}, Rows: [][]driver.Value{{int64(0)}}},
				{Contains: "FROM `sys_users`", Columns: []string{"id", "name", "username"}},
				{Contains: "id = ?", Columns: []string{"id", "name", "username"}},
			}
			steps[failing].Err = want
			db := testutil.NewQueryDB(t, steps[:failing+1]...)
			result, err := listBusinessUserOptions(db, 4, BusinessUserOptionQuery{SelectedID: 2})
			if !errors.Is(err, want) || result != nil {
				t.Fatalf("查询故障被吞：%v %+v", err, result)
			}
		})
	}
}

func TestBusinessOrgOptionsMinimalAndStreetFilter(t *testing.T) {
	db := testutil.NewQueryDB(t, testutil.QueryStep{Contains: "FROM `sys_orgs`", Columns: []string{"id", "name", "type", "parent_id", "sort"}, Rows: [][]driver.Value{{int64(3), "街道", "street", int64(2), int64(8)}}, Check: func(query string, _ []driver.NamedValue) {
		if !strings.Contains(query, "type = ?") || !strings.Contains(query, "is_delete") {
			t.Errorf("街道过滤错误：%s", query)
		}
	}})
	list, err := (&SysService{DB: db}).ListBusinessOrgOptions(context.Background(), true)
	if err != nil {
		t.Fatal(err)
	}
	encoded, _ := json.Marshal(list[0])
	var fields map[string]any
	_ = json.Unmarshal(encoded, &fields)
	if len(fields) != 5 || !reflect.DeepEqual(fields["sort"], float64(8)) {
		t.Fatalf("组织字段错误：%s", encoded)
	}
}
