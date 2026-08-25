package handler

import "testing"

func TestParseFormBool(t *testing.T) {
	t.Parallel()
	cases := []struct {
		in      string
		def     bool
		want    bool
		wantErr bool
	}{
		{in: "", def: true, want: true},
		{in: "", def: false, want: false},
		{in: "1", def: false, want: true},
		{in: "true", def: false, want: true},
		{in: "YES", def: false, want: true},
		{in: "0", def: true, want: false},
		{in: "false", def: true, want: false},
		{in: "off", def: true, want: false},
		{in: "maybe", def: true, wantErr: true},
	}
	for _, tc := range cases {
		got, err := parseFormBool(tc.in, tc.def)
		if tc.wantErr {
			if err == nil {
				t.Fatalf("in=%q expected error", tc.in)
			}
			continue
		}
		if err != nil {
			t.Fatalf("in=%q unexpected err: %v", tc.in, err)
		}
		if got != tc.want {
			t.Fatalf("in=%q got %v want %v", tc.in, got, tc.want)
		}
	}
}
