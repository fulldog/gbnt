package service

import "testing"

func TestValidateSetPassword(t *testing.T) {
	t.Parallel()
	cases := []struct {
		pwd string
		ok  bool
	}{
		{"Ab12c3", true},           // 6
		{"Abc123456", true},        // 9
		{"a1B2c3D4e5f6", true},     // 12
		{"a1B2c3D4e5f6g", true},    // 13
		{"a1B2c3D4e5f6g7", true},   // 14
		{"Abc12345", true},         // 8
		{"Ab12c", false},           // 5
		{"a1B2c3D4e5f6g7h", false}, // 15
		{"Ab12", false},            // too short
		{"abcdefghijklmn", false},  // 14 letters, no digit
		{"123456789", false},       // no letter
		{"Abc12345!", false},       // special
		{"Abc 123", false},         // space
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

func TestResolveStaffPlainPassword(t *testing.T) {
	t.Parallel()
	plain, err := ResolveStaffPlainPassword("worker", "")
	if err != nil || plain != "worker" {
		t.Fatalf("空密码应等于账号: %q %v", plain, err)
	}
	plain, err = ResolveStaffPlainPassword("worker", "  Passw0rd9  ")
	if err != nil || plain != "Passw0rd9" {
		t.Fatalf("自定义密码应保留校验后的明文: %q %v", plain, err)
	}
	if _, err := ResolveStaffPlainPassword("worker", "abc"); err == nil {
		t.Fatal("自定义弱密码应拒绝")
	}
	if _, err := ResolveStaffPlainPassword("", ""); err == nil {
		t.Fatal("无账号时不能生成默认密码")
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
