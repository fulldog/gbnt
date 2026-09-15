package service

import (
	"crypto/rand"
	"errors"
	"regexp"
	"strings"
)

var cnMobileRE = regexp.MustCompile(`^1[3-9]\d{9}$`)

// ValidateCNPhone 校验中国大陆 11 位手机号。
func ValidateCNPhone(phone string) error {
	phone = strings.TrimSpace(phone)
	if phone == "" {
		return errors.New("请填写手机号")
	}
	if !cnMobileRE.MatchString(phone) {
		return errors.New("手机号须为 11 位中国大陆号码")
	}
	return nil
}

// ValidateOptionalCNPhone 空则通过，有值则须合法。
func ValidateOptionalCNPhone(phone string) error {
	if strings.TrimSpace(phone) == "" {
		return nil
	}
	return ValidateCNPhone(phone)
}

// ValidateSetPassword 设置/修改密码：长度 6～14 位，仅 ASCII 字母与数字，须同时含字母和数字。
func ValidateSetPassword(pwd string) error {
	if pwd == "" {
		return errors.New("请填写密码")
	}
	n := len(pwd)
	if n < 6 || n > 14 {
		return errors.New("密码长度须为 6～14 位")
	}
	hasLetter, hasDigit := false, false
	for _, r := range pwd {
		switch {
		case r >= 'A' && r <= 'Z', r >= 'a' && r <= 'z':
			hasLetter = true
		case r >= '0' && r <= '9':
			hasDigit = true
		default:
			return errors.New("密码只能包含字母和数字，不能包含特殊字符")
		}
	}
	if !hasLetter || !hasDigit {
		return errors.New("密码须同时包含字母和数字")
	}
	return nil
}

// RandomLoginPassword 生成符合 ValidateSetPassword 的随机初始密码（10 位字母+数字）。
func RandomLoginPassword() (string, error) {
	const letters = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ"
	const digits = "23456789"
	buf := make([]byte, 10)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	buf[0] = letters[int(buf[0])%len(letters)]
	buf[1] = digits[int(buf[1])%len(digits)]
	alphabet := letters + digits
	for i := 2; i < len(buf); i++ {
		buf[i] = alphabet[int(buf[i])%len(alphabet)]
	}
	// 打乱除保证位外的顺序，避免固定前缀形态。
	for i := len(buf) - 1; i > 0; i-- {
		j := int(buf[i]) % (i + 1)
		buf[i], buf[j] = buf[j], buf[i]
	}
	out := string(buf)
	if err := ValidateSetPassword(out); err != nil {
		return RandomLoginPassword()
	}
	return out, nil
}
