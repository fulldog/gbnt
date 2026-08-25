package service

import "testing"

func TestValidateNewPassword(t *testing.T) {
	t.Parallel()
	cases := []struct {
		pwd string
		ok  bool
	}{
		{"Abc123", true},
		{"a1B2c3D4e5F6g7", true},   // 14
		{"Ab12", false},            // too short
		{"Abcdefghijklm12", false}, // 15
		{"abcdef", false},          // no digit
		{"123456", false},          // no letter
		{"Abc12!", false},          // special
		{"", false},
	}
	for _, tc := range cases {
		err := validateNewPassword(tc.pwd)
		if tc.ok && err != nil {
			t.Fatalf("%q want ok, got %v", tc.pwd, err)
		}
		if !tc.ok && err == nil {
			t.Fatalf("%q want error", tc.pwd)
		}
	}
}
