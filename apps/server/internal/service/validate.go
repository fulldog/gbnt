package service

import (
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

// ValidateSetPassword 设置/修改密码：长度大于 8，仅 ASCII 字母与数字，须同时含字母和数字。
func ValidateSetPassword(pwd string) error {
	if pwd == "" {
		return errors.New("请填写密码")
	}
	if len(pwd) > 72 {
		return errors.New("密码过长")
	}
	if len(pwd) <= 8 {
		return errors.New("密码长度须大于 8 位")
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
