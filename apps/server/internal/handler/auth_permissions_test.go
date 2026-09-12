package handler

import (
	"database/sql/driver"
	"reflect"
	"testing"

	"gbnt/apps/server/internal/model"
	"gbnt/apps/server/internal/perm"
	"gbnt/apps/server/internal/testutil"
	"github.com/gin-gonic/gin"
)

func TestAuthPayloadIncludesStructuredModuleActions(t *testing.T) {
	db := testutil.NewQueryDB(t, testutil.QueryStep{
		Contains: "FROM `sys_role_apis`",
		Columns:  []string{"api_id"},
		Rows:     [][]driver.Value{{int64(10)}, {int64(11)}},
	})
	permissions := perm.NewStaticService(nil, []model.SysAPI{
		{Base: model.Base{ID: 10}, Module: "web.rectify", Action: "view", Enabled: true},
		{Base: model.Base{ID: 11}, Module: "web.rectify", Action: "edit", Enabled: true},
	})
	permissions.DB = db
	out := gin.H{}
	(&Deps{Perm: permissions}).fillAPIs(out, 2, false)

	if !reflect.DeepEqual(out["apis"], []uint64{10, 11}) {
		t.Fatalf("数字 API 授权丢失: %#v", out)
	}
	want := map[string][]string{"web.rectify": {"edit", "view"}}
	if !reflect.DeepEqual(out["permissions"], want) {
		t.Fatalf("结构化授权异常: %#v", out)
	}
}

func TestSuperAdminAuthPayloadUsesWildcards(t *testing.T) {
	out := gin.H{}
	(&Deps{}).fillAPIs(out, 1, true)
	if !reflect.DeepEqual(out["apis"], []uint64{}) || !reflect.DeepEqual(out["permissions"], map[string][]string{}) {
		t.Fatalf("权限服务未初始化时应收敛为空: %#v", out)
	}

	out = gin.H{}
	(&Deps{Perm: perm.NewStaticService(nil, nil)}).fillAPIs(out, 1, true)
	if out["apis"] != "*" || out["permissions"] != "*" {
		t.Fatalf("超级管理员应返回通配授权: %#v", out)
	}
}
