package model

import (
	"database/sql/driver"
	"fmt"
	"strings"
	"time"
)

const dateLayout = "2006-01-02"

// Date 仅日期（MySQL DATE）；JSON / 入参均为 YYYY-MM-DD；零值写入 NULL。
type Date struct {
	time.Time
}

// ParseDate 解析 YYYY-MM-DD；空串返回零值。
func ParseDate(s string) (Date, error) {
	s = strings.TrimSpace(s)
	if s == "" {
		return Date{}, nil
	}
	t, err := time.ParseInLocation(dateLayout, s, time.Local)
	if err != nil {
		return Date{}, fmt.Errorf("日期格式应为 YYYY-MM-DD")
	}
	return Date{Time: t}, nil
}

func (d Date) IsZero() bool {
	return d.Time.IsZero()
}

func (d Date) String() string {
	if d.IsZero() {
		return ""
	}
	return d.Format(dateLayout)
}

func (d Date) MarshalJSON() ([]byte, error) {
	if d.IsZero() {
		return []byte("null"), nil
	}
	return []byte(`"` + d.Format(dateLayout) + `"`), nil
}

func (d *Date) UnmarshalJSON(b []byte) error {
	s := strings.TrimSpace(string(b))
	if s == "null" || s == `""` {
		d.Time = time.Time{}
		return nil
	}
	s = strings.Trim(s, `"`)
	parsed, err := ParseDate(s)
	if err != nil {
		return err
	}
	*d = parsed
	return nil
}

func (d Date) Value() (driver.Value, error) {
	if d.IsZero() {
		return nil, nil
	}
	return d.Format(dateLayout), nil
}

func (d *Date) Scan(value interface{}) error {
	if d == nil {
		return fmt.Errorf("Date: Scan on nil receiver")
	}
	if value == nil {
		d.Time = time.Time{}
		return nil
	}
	switch v := value.(type) {
	case time.Time:
		d.Time = time.Date(v.Year(), v.Month(), v.Day(), 0, 0, 0, 0, time.Local)
		return nil
	case []byte:
		return d.scanString(string(v))
	case string:
		return d.scanString(v)
	default:
		return fmt.Errorf("Date: cannot scan %T", value)
	}
}

func (d *Date) scanString(s string) error {
	s = strings.TrimSpace(s)
	if s == "" {
		d.Time = time.Time{}
		return nil
	}
	// 驱动偶发带时间后缀
	if len(s) >= 10 {
		s = s[:10]
	}
	parsed, err := ParseDate(s)
	if err != nil {
		return err
	}
	*d = parsed
	return nil
}
