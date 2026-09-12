package jwtutil

import (
	"testing"
	"time"

	"gbnt/apps/server/internal/cachex"
)

func TestSignHasJTIAndTokenVer(t *testing.T) {
	m := New("test-secret", 1, 1)
	tok, _, err := m.Sign(7, 3, ClientWeb)
	if err != nil {
		t.Fatal(err)
	}
	c, err := m.Parse(tok)
	if err != nil {
		t.Fatal(err)
	}
	if c.UserID != 7 || c.TokenVer != 3 || c.ID == "" || c.ClientKind() != ClientWeb {
		t.Fatalf("claims=%+v", c)
	}
	appTok, _, err := m.Sign(7, 8, ClientApp)
	if err != nil {
		t.Fatal(err)
	}
	app, err := m.Parse(appTok)
	if err != nil {
		t.Fatal(err)
	}
	if app.ClientKind() != ClientApp || app.TokenVer != 8 {
		t.Fatalf("app claims=%+v", app)
	}
	renewed, _, err := m.Resign(app)
	if err != nil {
		t.Fatal(err)
	}
	keep, err := m.Parse(renewed)
	if err != nil {
		t.Fatal(err)
	}
	if keep.ClientKind() != ClientApp || keep.TokenVer != 8 || keep.UserID != 7 {
		t.Fatalf("续期应保留端标识: %+v", keep)
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
