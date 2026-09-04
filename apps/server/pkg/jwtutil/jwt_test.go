package jwtutil

import (
	"testing"
	"time"

	"gbnt/apps/server/internal/cachex"
)

func TestSignHasJTIAndTokenVer(t *testing.T) {
	m := New("test-secret", 1, 1)
	tok, _, err := m.Sign(7, 3)
	if err != nil {
		t.Fatal(err)
	}
	c, err := m.Parse(tok)
	if err != nil {
		t.Fatal(err)
	}
	if c.UserID != 7 || c.TokenVer != 3 || c.ID == "" {
		t.Fatalf("claims=%+v", c)
	}
}

func TestDenyList(t *testing.T) {
	store := cachex.New(time.Minute, time.Minute)
	d := &DenyList{Store: store}
	if d.Denied("abc") {
		t.Fatal("empty deny")
	}
	d.Ban("abc", time.Minute)
	if !d.Denied("abc") {
		t.Fatal("should be denied")
	}
}
