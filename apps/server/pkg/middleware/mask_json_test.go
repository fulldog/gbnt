package middleware

import (
	"strings"
	"testing"
)

func TestMaskJSONNestsSecretFields(t *testing.T) {
	raw := `{"user":{"password":"x","profile":{"token":"abc"}},"list":[{"pass_token":"t"}]}`
	got := maskJSON(raw)
	for _, part := range []string{`"password":"***"`, `"token":"***"`, `"pass_token":"***"`} {
		if !strings.Contains(got, part) {
			t.Fatalf("missing %s in %s", part, got)
		}
	}
}
