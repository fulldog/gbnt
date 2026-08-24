package watermark

import (
	"fmt"
	"math"
	"time"
)

// FormatDMS 将十进制度转成度分秒，对齐前端 formatDmsCompact。
func FormatDMS(deg float64, isLat bool) string {
	if math.IsNaN(deg) || math.IsInf(deg, 0) {
		return "—"
	}
	hemi := "E"
	if isLat {
		if deg >= 0 {
			hemi = "N"
		} else {
			hemi = "S"
		}
	} else if deg < 0 {
		hemi = "W"
	}
	abs := math.Abs(deg)
	d := int(math.Floor(abs))
	mFloat := (abs - float64(d)) * 60
	m := int(math.Floor(mFloat))
	s := int(math.Round((mFloat - float64(m)) * 60))
	if s == 60 {
		m++
		s = 0
	}
	if m == 60 {
		d++
		m = 0
	}
	return fmt.Sprintf("%d°%d'%d\"%s", d, m, s, hemi)
}

// FormatCoordLine 如 36°26'56"N, 115°58'55"E。
func FormatCoordLine(lat, lng float64) string {
	return FormatDMS(lat, true) + ", " + FormatDMS(lng, false)
}

// FormatTimeZh 如 2026年8月24日 13:42（本地时区）。
func FormatTimeZh(t time.Time) string {
	if t.IsZero() {
		t = time.Now()
	}
	return t.In(time.Local).Format("2006年1月2日 15:04")
}
