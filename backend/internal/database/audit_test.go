package database

import (
	"context"
	"errors"
	"testing"
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
