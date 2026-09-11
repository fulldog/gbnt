package rolecode

import (
	"errors"
	"strings"
	"testing"

	"github.com/go-sql-driver/mysql"
	"gorm.io/gorm"
)

func TestNormalizeRoleCode(t *testing.T) {
	for _, value := range []string{"admin", " Test ", "System_Config-2", "a", strings.Repeat("a", 64)} {
		got, err := Normalize(value)
		if err != nil || got != strings.ToLower(strings.TrimSpace(value)) {
			t.Fatalf("%q: %q %v", value, got, err)
		}
	}
	for _, value := range []string{"", " ", "123", "中文", "Ktest", "İtest", "test.name", "test name", "_test", strings.Repeat("a", 65)} {
		if _, err := Normalize(value); err == nil {
			t.Fatalf("应拒绝 %q", value)
		}
	}
}

func TestDuplicateRoleCodeErrors(t *testing.T) {
	if !IsDuplicate(&mysql.MySQLError{Number: 1062}) || !IsDuplicate(gorm.ErrDuplicatedKey) {
		t.Fatal("唯一约束错误识别失败")
	}
	if IsDuplicate(nil) || IsDuplicate(errors.New("查询失败")) {
		t.Fatal("普通故障不能误报重号")
	}
}
