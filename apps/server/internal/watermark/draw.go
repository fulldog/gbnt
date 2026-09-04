package watermark

import (
	"fmt"
	"image"
	"image/color"
	"image/draw"
	_ "image/gif"
	"image/jpeg"
	"image/png"
	"io"
	"math"
	"os"
	"path/filepath"
	"strings"
	"time"
	"unicode/utf8"

	xdraw "golang.org/x/image/draw"
	"golang.org/x/image/font"
	"golang.org/x/image/math/fixed"
	_ "golang.org/x/image/webp"
)

const maxPixels = 40_000_000

var (
	colorWhite  = color.NRGBA{R: 255, G: 255, B: 255, A: 255}
	colorShadow = color.NRGBA{R: 0, G: 0, B: 0, A: 140}
	colorBar    = color.NRGBA{R: 245, G: 197, B: 24, A: 255}
)

// Meta 烧录到图片上的取证信息。
type Meta struct {
	UserName string
	Lat      float64
	Lng      float64
	Address  string
}

// IsImage 根据 content-type 或扩展名判断是否为图片。
func IsImage(contentType, fileName string) bool {
	ct := strings.ToLower(strings.TrimSpace(contentType))
	if strings.HasPrefix(ct, "image/") {
		return true
	}
	switch strings.ToLower(filepath.Ext(fileName)) {
	case ".jpg", ".jpeg", ".png", ".gif", ".webp":
		return true
	}
	return false
}

// ApplyFile 将水印烧录到磁盘上的图片（原地覆盖）。非图片返回 nil。
func (r *Renderer) ApplyFile(path, contentType, fileName string, meta Meta) error {
	if !IsImage(contentType, fileName) {
		return nil
	}
	f, err := os.Open(path)
	if err != nil {
		return fmt.Errorf("open image: %w", err)
	}
	cfg, format, err := image.DecodeConfig(f)
	if err != nil {
		_ = f.Close()
		return fmt.Errorf("decode image header: %w", err)
	}
	if cfg.Width <= 0 || cfg.Height <= 0 {
		_ = f.Close()
		return fmt.Errorf("invalid image size")
	}
	if int64(cfg.Width)*int64(cfg.Height) > maxPixels {
		_ = f.Close()
		return fmt.Errorf("image too large")
	}
	if _, err := f.Seek(0, io.SeekStart); err != nil {
		_ = f.Close()
		return err
	}
	src, _, err := image.Decode(f)
	_ = f.Close()
	if err != nil {
		return fmt.Errorf("decode image: %w", err)
	}

	outImg, err := r.Apply(src, meta)
	if err != nil {
		return err
	}

	tmp := path + ".wm"
	out, err := os.Create(tmp)
	if err != nil {
		return err
	}
	encErr := encodeImage(out, outImg, format)
	closeErr := out.Close()
	if encErr != nil {
		_ = os.Remove(tmp)
		return encErr
	}
	if closeErr != nil {
		_ = os.Remove(tmp)
		return closeErr
	}
	if err := os.Rename(tmp, path); err != nil {
		_ = os.Remove(tmp)
		return err
	}
	return nil
}

func encodeImage(w io.Writer, img image.Image, format string) error {
	switch strings.ToLower(format) {
	case "png", "gif":
		return png.Encode(w, img)
	default:
		return jpeg.Encode(w, img, &jpeg.Options{Quality: 90})
	}
}

// Apply 在左下角绘制地址 / 黄竖条 / 度分秒 / 时间 / 上报人。
func (r *Renderer) Apply(src image.Image, meta Meta) (*image.RGBA, error) {
	b := src.Bounds()
	dst := image.NewRGBA(image.Rect(0, 0, b.Dx(), b.Dy()))
	xdraw.Draw(dst, dst.Bounds(), src, b.Min, draw.Src)

	w, h := dst.Bounds().Dx(), dst.Bounds().Dy()
	scale := float64(w) / 390
	if scale < 1 {
		scale = 1
	}
	titleSize := math.Max(16, math.Round(16*scale))
	bodySize := math.Max(11, math.Round(12*scale))
	gap := math.Round(6 * scale)
	padX := int(math.Round(14 * scale))
	padY := int(math.Round(16 * scale))
	barW := int(math.Max(2, math.Round(3*scale)))
	barGap := int(math.Round(8 * scale))

	titleFace, err := r.face(titleSize)
	if err != nil {
		return nil, err
	}
	defer closeFace(titleFace)
	bodyFace, err := r.face(bodySize)
	if err != nil {
		return nil, err
	}
	defer closeFace(bodyFace)

	address := strings.TrimSpace(meta.Address)
	if address == "" {
		address = "位置未知"
	}
	coord := FormatCoordLine(meta.Lat, meta.Lng)
	timeStr := FormatTimeZh(timeNow())
	userLine := formatUserLine(meta.UserName)

	bodyLines := 2
	if userLine != "" {
		bodyLines = 3
	}
	titleBottom := h - padY - int(bodySize)*bodyLines - int(gap)*bodyLines
	lineBottoms := make([]int, bodyLines)
	for i := 0; i < bodyLines; i++ {
		remain := bodyLines - 1 - i
		lineBottoms[i] = h - padY - int(bodySize)*remain - int(gap)*remain
	}

	maxTitleW := w - padX*2
	address = ellipsis(titleFace, address, maxTitleW)
	bodyX := padX + barW + barGap
	maxBodyW := w - bodyX - padX
	coord = ellipsis(bodyFace, coord, maxBodyW)
	timeStr = ellipsis(bodyFace, timeStr, maxBodyW)
	if userLine != "" {
		userLine = ellipsis(bodyFace, userLine, maxBodyW)
	}

	drawStringBottom(dst, titleFace, address, padX, titleBottom, true)

	barTop := titleBottom + int(math.Round(gap*0.6))
	barBottom := lineBottoms[len(lineBottoms)-1]
	if barBottom < barTop {
		barBottom = barTop + barW
	}
	draw.Draw(dst, image.Rect(padX, barTop, padX+barW, barBottom), image.NewUniform(colorBar), image.Point{}, draw.Src)

	drawStringBottom(dst, bodyFace, coord, bodyX, lineBottoms[0], false)
	drawStringBottom(dst, bodyFace, timeStr, bodyX, lineBottoms[1], false)
	if userLine != "" {
		drawStringBottom(dst, bodyFace, userLine, bodyX, lineBottoms[2], false)
	}
	return dst, nil
}

func formatUserLine(name string) string {
	return strings.TrimSpace(name)
}

func ellipsis(face font.Face, s string, maxW int) string {
	if maxW <= 0 || font.MeasureString(face, s).Ceil() <= maxW {
		return s
	}
	runes := []rune(s)
	for n := len(runes); n > 0; n-- {
		t := string(runes[:n]) + "…"
		if font.MeasureString(face, t).Ceil() <= maxW {
			return t
		}
	}
	if utf8.RuneCountInString("…") > 0 {
		return "…"
	}
	return ""
}

func drawStringBottom(dst *image.RGBA, face font.Face, s string, x, bottomY int, boldish bool) {
	m := face.Metrics()
	dotY := fixed.I(bottomY) - m.Descent
	ox := int(math.Max(1, float64(m.Height.Ceil())/18))
	if ox < 1 {
		ox = 1
	}
	// 黑描边/阴影，保证浅色背景可读
	for _, d := range []image.Point{{X: ox, Y: ox}, {X: 0, Y: ox}, {X: ox, Y: 0}, {X: -ox, Y: ox}} {
		drawAt(dst, face, s, x+d.X, dotY+fixed.I(d.Y), colorShadow)
	}
	drawAt(dst, face, s, x, dotY, colorWhite)
	if boldish {
		drawAt(dst, face, s, x+1, dotY, colorWhite)
	}
}

func drawAt(dst *image.RGBA, face font.Face, s string, x int, dotY fixed.Int26_6, c color.Color) {
	d := &font.Drawer{
		Dst:  dst,
		Src:  image.NewUniform(c),
		Face: face,
		Dot:  fixed.Point26_6{X: fixed.I(x), Y: dotY},
	}
	d.DrawString(s)
}

func closeFace(f font.Face) {
	if c, ok := f.(io.Closer); ok {
		_ = c.Close()
	}
}

var timeNow = time.Now
