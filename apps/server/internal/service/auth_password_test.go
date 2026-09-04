package service

import "testing"

func TestValidateSetPassword(t *testing.T) {
	t.Parallel()
	cases := []struct {
		pwd string
		ok  bool
	}{
		{"Abc123456", true},
		{"a1B2c3D4e", true},
		{"Abc12345", false},      // 8
		{"Ab12", false},          // too short
		{"abcdefghijklm", false}, // no digit
		{"123456789", false},     // no letter
		{"Abc12345!", false},     // special
		{"Abc 12345", false},     // space
		{"", false},
	}
	for _, tc := range cases {
		err := ValidateSetPassword(tc.pwd)
		if tc.ok && err != nil {
			t.Fatalf("%q want ok, got %v", tc.pwd, err)
		}
		if !tc.ok && err == nil {
			t.Fatalf("%q want error", tc.pwd)
		}
	}
}

func TestValidateOptionalCNPhone(t *testing.T) {
	t.Parallel()
	if err := ValidateOptionalCNPhone(""); err != nil {
		t.Fatal(err)
	}
	if err := ValidateOptionalCNPhone("  "); err != nil {
		t.Fatal(err)
	}
	if err := ValidateOptionalCNPhone("13800138000"); err != nil {
		t.Fatal(err)
	}
	if err := ValidateCNPhone("13800138000"); err != nil {
		t.Fatal(err)
	}
	bads := []string{"12800138000", "1380013800", "138001380000", "abcdefghijk", "010-12345678"}
	for _, p := range bads {
		if err := ValidateOptionalCNPhone(p); err == nil {
			t.Fatalf("%q want error", p)
		}
	}
}
