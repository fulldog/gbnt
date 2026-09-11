// Package rolecode 维护对外英文角色标识的格式与唯一性错误识别。
package rolecode

import (
	"errors"
	"regexp"
	"strings"

	"github.com/go-sql-driver/mysql"
	"gorm.io/gorm"
)

var pattern = regexp.MustCompile(`^[a-zA-Z][a-zA-Z0-9_-]{0,63}$`)

// Normalize 去除首尾空格并转小写；角色ID以英文字母开头，最多64位。
func Normalize(value string) (string, error) {
	value = strings.TrimSpace(value)
	if !pattern.MatchString(value) {
		return "", errors.New("角色ID须以英文字母开头，仅支持英文、数字、下划线和短横线，最多64位")
	}
	return strings.ToLower(value), nil
}

// IsDuplicate 同时识别原生MySQL和GORM转换后的唯一约束错误，覆盖并发重号。
func IsDuplicate(err error) bool {
	var duplicate *mysql.MySQLError
	return errors.Is(err, gorm.ErrDuplicatedKey) || (errors.As(err, &duplicate) && duplicate.Number == 1062)
}
