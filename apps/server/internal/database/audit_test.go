package database

import (
	"context"
	"errors"
	"reflect"
	"sync"
	"testing"

	"gorm.io/gorm"
	"gorm.io/gorm/schema"

	"gbnt/apps/server/internal/model"
)

func TestUserFromContext(t *testing.T) {
	t.Parallel()
	_, err := UserFromContext(context.Background())
	if !errors.Is(err, ErrUnauth) {
		t.Fatalf("want ErrUnauth, got %v", err)
	}
	info := &UserInfo{ID: 9, Name: "张三", Username: "zhang"}
	ctx := WithUser(context.Background(), info)
	got, err := UserFromContext(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if got.ID != 9 || got.Name != "张三" {
		t.Fatalf("got %+v", got)
	}
	if UserIDFromContext(ctx) != 9 {
		t.Fatalf("uid %d", UserIDFromContext(ctx))
	}
}

func TestFillCreatedAuditBatchSliceDoesNotPanic(t *testing.T) {
	t.Parallel()
	parsed, err := schema.Parse(&model.SysRoleAPI{}, &sync.Map{}, schema.NamingStrategy{})
	if err != nil {
		t.Fatal(err)
	}
	rows := []model.SysRoleAPI{{RoleID: 3, APIID: 1}, {RoleID: 3, APIID: 2}}
	db := &gorm.DB{Statement: &gorm.Statement{
		Context:      WithUser(context.Background(), &UserInfo{ID: 9}),
		Schema:       parsed,
		ReflectValue: reflect.ValueOf(&rows),
	}}
	fillCreatedAudit(db)
	for i, row := range rows {
		if row.CreatedID != 9 || row.UpdatedID != 9 {
			t.Fatalf("批量审计未写入 row=%d %+v", i, row)
		}
	}
}

func TestFillCreatedAuditSingleStruct(t *testing.T) {
	t.Parallel()
	parsed, err := schema.Parse(&model.SysRoleAPI{}, &sync.Map{}, schema.NamingStrategy{})
	if err != nil {
		t.Fatal(err)
	}
	row := model.SysRoleAPI{RoleID: 1, APIID: 2}
	db := &gorm.DB{Statement: &gorm.Statement{
		Context:      WithUser(context.Background(), &UserInfo{ID: 4}),
		Schema:       parsed,
		ReflectValue: reflect.ValueOf(&row),
	}}
	fillCreatedAudit(db)
	if row.CreatedID != 4 || row.UpdatedID != 4 {
		t.Fatalf("单条审计未写入 %+v", row)
	}
}
