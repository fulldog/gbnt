package model

import (
	"errors"
	"strings"
	"unicode/utf8"
)

// NormalizeFacilityCode 去首尾空白，纯数字去多余前导零并至少两位；文本大小写区分。空值仅供历史记录审计。
func NormalizeFacilityCode(value string) (string, error) {
	value = strings.TrimSpace(value)
	if !utf8.ValidString(value) || utf8.RuneCountInString(value) > 64 {
		return "", errors.New("设施编号不能超过 64 字")
	}
	if value == "" {
		return "", nil
	}
	for _, char := range value {
		if char < '0' || char > '9' {
			return value, nil
		}
	}
	value = strings.TrimLeft(value, "0")
	for len(value) < 2 {
		value = "0" + value
	}
	return value, nil
}

// IssueCreateRequest 按账号和请求 ID 保存成功响应，防止网络重试重复建单；不随工单软删除释放。
type IssueCreateRequest struct {
	ActorID      uint64 `gorm:"primaryKey;autoIncrement:false;comment:实际操作账号ID"` // 操作账号，不是填报人快照
	RequestID    string `gorm:"primaryKey;size:64;comment:客户端同一次提交请求ID"`         // 请求 ID，客户端重试复用
	PayloadHash  string `gorm:"size:64;not null;comment:规范化请求摘要"`                // 防止同一请求 ID 用于不同内容
	ResponseJSON string `gorm:"type:json;comment:成功响应快照"`                        // 未完成前为 JSON null，失败时一起回滚
}

// TableName 返回提交去重表名。
func (IssueCreateRequest) TableName() string { return "issue_create_requests" }
