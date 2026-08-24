package service

import (
	"bytes"
	"encoding/base64"
	"errors"
	"image"
	"image/color"
	"image/draw"
	"image/png"
	"math/rand"
	"strings"
	"time"

	"github.com/google/uuid"
	"golang.org/x/image/font"
	"golang.org/x/image/font/basicfont"
	"golang.org/x/image/math/fixed"

	"gbnt/backend/internal/cachex"
	"gbnt/backend/internal/config"
)

const (
	keyCaptcha = "captcha:"
	keySlider  = "slider:"
	keyPass    = "pass:"
)

// CaptchaService Web 图形验证码 + App 滑动验证。
type CaptchaService struct {
	Store *cachex.Store
	Cfg   config.CaptchaConfig
}

// ImageCaptcha 图形验证码响应。
type ImageCaptcha struct {
	CaptchaID     string `json:"captcha_id"`
	ImageBase64   string `json:"image_base64"`
	ExpireSeconds int    `json:"expire_seconds"`
}

// CreateImage 生成数字图形验证码。
func (s *CaptchaService) CreateImage() (*ImageCaptcha, error) {
	if s == nil || s.Store == nil {
		return nil, errors.New("验证码服务未初始化")
	}
	n := s.Cfg.Length
	if n <= 0 {
		n = 4
	}
	code := randomDigits(n)
	id := uuid.NewString()
	img, err := renderDigitPNG(code, s.Cfg.Width, s.Cfg.Height)
	if err != nil {
		return nil, err
	}
	ttl := time.Duration(s.Cfg.TTLSeconds) * time.Second
	s.Store.Set(keyCaptcha+id, code, ttl)
	b64 := "data:image/png;base64," + base64.StdEncoding.EncodeToString(img)
	return &ImageCaptcha{
		CaptchaID:     id,
		ImageBase64:   b64,
		ExpireSeconds: s.Cfg.TTLSeconds,
	}, nil
}

// VerifyImage 校验图形验证码（一次性；失败/成功均删除）。
func (s *CaptchaService) VerifyImage(captchaID, input string) error {
	if s == nil || !s.Cfg.Enabled {
		return nil
	}
	captchaID = strings.TrimSpace(captchaID)
	input = strings.TrimSpace(input)
	if captchaID == "" || input == "" {
		return errors.New("验证码错误或已过期")
	}
	v, ok := s.Store.GetDelete(keyCaptcha + captchaID)
	if !ok {
		return errors.New("验证码错误或已过期")
	}
	expect, _ := v.(string)
	if !strings.EqualFold(expect, input) {
		return errors.New("验证码错误或已过期")
	}
	return nil
}

// SliderStart 开始滑动验证。
func (s *CaptchaService) SliderStart() (sliderID string, expireSeconds int, err error) {
	if s == nil || s.Store == nil {
		return "", 0, errors.New("验证码服务未初始化")
	}
	id := uuid.NewString()
	ttl := time.Duration(s.Cfg.SliderTTLSeconds) * time.Second
	s.Store.Set(keySlider+id, time.Now().UnixMilli(), ttl)
	return id, s.Cfg.SliderTTLSeconds, nil
}

// SliderFinish 完成滑动；校验耗时后签发一次性 pass_token。
func (s *CaptchaService) SliderFinish(sliderID string, durationMs int64) (passToken string, expireSeconds int, err error) {
	if s == nil || s.Store == nil {
		return "", 0, errors.New("验证码服务未初始化")
	}
	sliderID = strings.TrimSpace(sliderID)
	if sliderID == "" {
		return "", 0, errors.New("滑动验证无效或已过期")
	}
	if _, ok := s.Store.GetDelete(keySlider + sliderID); !ok {
		return "", 0, errors.New("滑动验证无效或已过期")
	}
	minMs := int64(s.Cfg.SliderMinMs)
	maxMs := int64(s.Cfg.SliderMaxMs)
	if durationMs < minMs || durationMs > maxMs {
		return "", 0, errors.New("滑动验证未通过，请重试")
	}
	token := uuid.NewString()
	ttl := time.Duration(s.Cfg.PassTTLSeconds) * time.Second
	s.Store.Set(keyPass+token, "1", ttl)
	return token, s.Cfg.PassTTLSeconds, nil
}

// VerifyPassToken 校验并消费滑动 pass_token。
func (s *CaptchaService) VerifyPassToken(passToken string) error {
	if s == nil || !s.Cfg.Enabled {
		return nil
	}
	passToken = strings.TrimSpace(passToken)
	if passToken == "" {
		return errors.New("滑动验证无效或已过期")
	}
	if _, ok := s.Store.GetDelete(keyPass + passToken); !ok {
		return errors.New("滑动验证无效或已过期")
	}
	return nil
}

func randomDigits(n int) string {
	var b strings.Builder
	b.Grow(n)
	for i := 0; i < n; i++ {
		b.WriteByte(byte('0' + rand.Intn(10)))
	}
	return b.String()
}

func renderDigitPNG(code string, w, h int) ([]byte, error) {
	if w <= 0 {
		w = 120
	}
	if h <= 0 {
		h = 40
	}
	img := image.NewRGBA(image.Rect(0, 0, w, h))
	draw.Draw(img, img.Bounds(), &image.Uniform{C: color.White}, image.Point{}, draw.Src)

	for i := 0; i < 6; i++ {
		col := color.RGBA{R: uint8(1 + rand.Intn(90)), G: uint8(74 + rand.Intn(100)), B: uint8(75 + rand.Intn(100)), A: 90}
		drawLine(img, rand.Intn(w), rand.Intn(h), rand.Intn(w), rand.Intn(h), col)
	}
	for i := 0; i < 40; i++ {
		img.Set(rand.Intn(w), rand.Intn(h), color.RGBA{
			R: uint8(80 + rand.Intn(100)),
			G: uint8(100 + rand.Intn(100)),
			B: uint8(120 + rand.Intn(100)),
			A: 120,
		})
	}

	face := basicfont.Face7x13
	slot := w / (len(code) + 1)
	for i, ch := range code {
		x := slot*(i+1) - 3
		y := h/2 + 4 + rand.Intn(5) - 2
		col := color.RGBA{R: uint8(1 + rand.Intn(60)), G: uint8(60 + rand.Intn(60)), B: uint8(100 + rand.Intn(70)), A: 255}
		drawString(img, face, x, y, string(ch), col)
	}

	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func drawString(img *image.RGBA, face font.Face, x, y int, s string, col color.Color) {
	d := &font.Drawer{
		Dst:  img,
		Src:  image.NewUniform(col),
		Face: face,
		Dot:  fixed.P(x, y),
	}
	d.DrawString(s)
}

func drawLine(img *image.RGBA, x0, y0, x1, y1 int, col color.Color) {
	dx := absInt(x1 - x0)
	dy := -absInt(y1 - y0)
	sx, sy := 1, 1
	if x0 > x1 {
		sx = -1
	}
	if y0 > y1 {
		sy = -1
	}
	err := dx + dy
	for {
		img.Set(x0, y0, col)
		if x0 == x1 && y0 == y1 {
			break
		}
		e2 := 2 * err
		if e2 >= dy {
			err += dy
			x0 += sx
		}
		if e2 <= dx {
			err += dx
			y0 += sy
		}
	}
}

func absInt(v int) int {
	if v < 0 {
		return -v
	}
	return v
}
