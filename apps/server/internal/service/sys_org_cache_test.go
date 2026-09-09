package service

import (
	"context"
	"database/sql/driver"
	"testing"

	"gbnt/apps/server/internal/cachex"
	"gbnt/apps/server/internal/testutil"
)

func TestListOrgsServesFromCacheAndCopiesSlice(t *testing.T) {
	t.Parallel()
	db := testutil.NewQueryDB(t, testutil.QueryStep{
		Contains: "FROM `sys_orgs`",
		Columns:  []string{"id", "name", "parent_id", "type", "sort"},
		Rows:     [][]driver.Value{{int64(2), "街道", int64(1), "street", int64(1)}},
	})
	s := &SysService{DB: db, Cache: cachex.New(0, 0)}
	first, err := s.ListOrgs()
	if err != nil || len(first) != 1 || first[0].Name != "街道" {
		t.Fatalf("首次应查库: %+v %v", first, err)
	}
	first[0].Name = "被篡改"
	second, err := s.ListOrgs()
	if err != nil || len(second) != 1 || second[0].Name != "街道" {
		t.Fatalf("二次应走缓存且不能改写缓存: %+v %v", second, err)
	}
}

func TestUpdateOrgClearsOrgListCache(t *testing.T) {
	db := testutil.NewTransactionDB(t,
		testutil.QueryStep{Contains: "FROM `sys_orgs`", Columns: []string{"id", "name", "parent_id", "type", "sort"}, Rows: [][]driver.Value{{int64(2), "旧名", int64(1), "street", int64(1)}}},
		testutil.QueryStep{Contains: "FROM `sys_orgs`", Columns: []string{"id", "name", "parent_id", "type", "sort"}, Rows: [][]driver.Value{{int64(2), "旧名", int64(1), "street", int64(1)}}},
		testutil.QueryStep{Kind: "begin"},
		testutil.QueryStep{Kind: "exec", Contains: "UPDATE `sys_orgs`"},
		testutil.QueryStep{Kind: "commit"},
		testutil.QueryStep{Contains: "FROM `sys_orgs`", Columns: []string{"id", "name", "parent_id", "type", "sort"}, Rows: [][]driver.Value{{int64(2), "新名", int64(1), "street", int64(1)}}},
	)
	s := &SysService{DB: db, Cache: cachex.New(0, 0)}
	if _, err := s.ListOrgs(); err != nil {
		t.Fatal(err)
	}
	if _, err := s.UpdateOrg(context.Background(), 2, OrgUpdateInput{Name: "新名"}); err != nil {
		t.Fatal(err)
	}
	list, err := s.ListOrgs()
	if err != nil || len(list) != 1 || list[0].Name != "新名" {
		t.Fatalf("改名后应重新查库: %+v %v", list, err)
	}
}

func TestCreateOrgClearsOrgListCache(t *testing.T) {
	db := testutil.NewTransactionDB(t,
		testutil.QueryStep{Contains: "FROM `sys_orgs`", Columns: []string{"id", "name", "parent_id", "type", "sort"}, Rows: [][]driver.Value{{int64(1), "根", int64(0), "root", int64(1)}}},
		testutil.QueryStep{Contains: "MAX(sort)", Columns: []string{"MAX(sort)"}, Rows: [][]driver.Value{{int64(1)}}},
		testutil.QueryStep{Kind: "begin"},
		testutil.QueryStep{Kind: "exec", Contains: "INSERT INTO `sys_orgs`", InsertID: 2},
		testutil.QueryStep{Kind: "commit"},
		testutil.QueryStep{Contains: "FROM `sys_orgs`", Columns: []string{"id", "name", "parent_id", "type", "sort"}, Rows: [][]driver.Value{{int64(1), "根", int64(0), "root", int64(1)}, {int64(2), "新区", int64(0), "root", int64(2)}}},
	)
	s := &SysService{DB: db, Cache: cachex.New(0, 0)}
	if _, err := s.ListOrgs(); err != nil {
		t.Fatal(err)
	}
	if _, err := s.CreateOrg(context.Background(), OrgCreateInput{Name: "新区"}); err != nil {
		t.Fatal(err)
	}
	list, err := s.ListOrgs()
	if err != nil || len(list) != 2 {
		t.Fatalf("新增后应重新查库: %+v %v", list, err)
	}
}

func TestDeleteOrgClearsOrgListCache(t *testing.T) {
	db := testutil.NewTransactionDB(t,
		testutil.QueryStep{Contains: "FROM `sys_orgs`", Columns: []string{"id", "name", "parent_id", "type", "sort"}, Rows: [][]driver.Value{{int64(2), "街道", int64(1), "street", int64(1)}}},
		testutil.QueryStep{Contains: "FROM `sys_orgs`", Columns: []string{"id", "parent_id", "type"}, Rows: [][]driver.Value{{int64(2), int64(1), "street"}}},
		testutil.QueryStep{Contains: "count(*)", Columns: []string{"count"}, Rows: [][]driver.Value{{int64(0)}}},
		testutil.QueryStep{Kind: "begin"},
		testutil.QueryStep{Kind: "exec", Contains: "UPDATE `sys_orgs`"},
		testutil.QueryStep{Kind: "commit"},
		testutil.QueryStep{Contains: "FROM `sys_orgs`", Columns: []string{"id"}},
	)
	s := &SysService{DB: db, Cache: cachex.New(0, 0)}
	if _, err := s.ListOrgs(); err != nil {
		t.Fatal(err)
	}
	if err := s.DeleteOrg(context.Background(), 2); err != nil {
		t.Fatal(err)
	}
	list, err := s.ListOrgs()
	if err != nil || len(list) != 0 {
		t.Fatalf("删除后应重新查库: %+v %v", list, err)
	}
}

func TestFailedDeleteOrgKeepsOrgListCache(t *testing.T) {
	t.Parallel()
	db := testutil.NewQueryDB(t,
		testutil.QueryStep{Contains: "FROM `sys_orgs`", Columns: []string{"id", "name", "parent_id", "type", "sort"}, Rows: [][]driver.Value{{int64(1), "根", int64(0), "root", int64(1)}}},
		testutil.QueryStep{Contains: "FROM `sys_orgs`", Columns: []string{"id", "parent_id", "type"}, Rows: [][]driver.Value{{int64(1), int64(0), "root"}}},
	)
	s := &SysService{DB: db, Cache: cachex.New(0, 0)}
	if _, err := s.ListOrgs(); err != nil {
		t.Fatal(err)
	}
	if err := s.DeleteOrg(context.Background(), 1); err == nil {
		t.Fatal("根节点应拒绝删除")
	}
	list, err := s.ListOrgs()
	if err != nil || len(list) != 1 || list[0].Name != "根" {
		t.Fatalf("删除失败不得清缓存: %+v %v", list, err)
	}
}
