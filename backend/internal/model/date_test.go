package model

import (
	"encoding/json"
	"testing"
	"time"
)

func TestParseDate(t *testing.T) {
	d, err := ParseDate("2026-09-01")
	if err != nil {
		t.Fatal(err)
	}
	if d.Year() != 2026 || d.Month() != time.September || d.Day() != 1 {
		t.Fatalf("got %v", d)
	}
	z, err := ParseDate("")
	if err != nil || !z.IsZero() {
		t.Fatalf("empty: %v %v", z, err)
	}
	if _, err := ParseDate("09-01-2026"); err == nil {
		t.Fatal("expected format error")
	}
}

func TestDateJSON(t *testing.T) {
	d, _ := ParseDate("2026-09-01")
	b, err := json.Marshal(d)
	if err != nil {
		t.Fatal(err)
	}
	if string(b) != `"2026-09-01"` {
		t.Fatalf("marshal: %s", b)
	}
	var out Date
	if err := json.Unmarshal([]byte(`"2026-09-01"`), &out); err != nil {
		t.Fatal(err)
	}
	if out.String() != "2026-09-01" {
		t.Fatalf("unmarshal: %v", out)
	}
	b, _ = json.Marshal(Date{})
	if string(b) != "null" {
		t.Fatalf("zero marshal: %s", b)
	}
}
