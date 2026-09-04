package watermark

import (
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync"

	"golang.org/x/image/font"
	"golang.org/x/image/font/opentype"
)

// Renderer 加载中文字体并绘制左下角取证水印。
type Renderer struct {
	fontPath string
	once     sync.Once
	otf      *opentype.Font
	loadErr  error
}

// NewRenderer 指定字体路径；空则探测系统 CJK 字体。
func NewRenderer(fontPath string) *Renderer {
	return &Renderer{fontPath: strings.TrimSpace(fontPath)}
}

func (r *Renderer) load() error {
	r.once.Do(func() {
		path, err := resolveFont(r.fontPath)
		if err != nil {
			r.loadErr = err
			return
		}
		b, err := os.ReadFile(path)
		if err != nil {
			r.loadErr = fmt.Errorf("read font: %w", err)
			return
		}
		otf, err := parseFont(b)
		if err != nil {
			r.loadErr = fmt.Errorf("parse font %s: %w", path, err)
			return
		}
		r.otf = otf
	})
	return r.loadErr
}

func parseFont(b []byte) (*opentype.Font, error) {
	if otf, err := opentype.Parse(b); err == nil {
		return otf, nil
	}
	col, err := opentype.ParseCollection(b)
	if err != nil {
		return nil, err
	}
	if col.NumFonts() < 1 {
		return nil, fmt.Errorf("empty font collection")
	}
	return col.Font(0)
}

func (r *Renderer) face(sizePx float64) (font.Face, error) {
	if err := r.load(); err != nil {
		return nil, err
	}
	return opentype.NewFace(r.otf, &opentype.FaceOptions{
		Size: sizePx,
		DPI:  72,
	})
}

func resolveFont(configured string) (string, error) {
	candidates := make([]string, 0, 12)
	if configured != "" {
		candidates = append(candidates, configured)
	}
	switch runtime.GOOS {
	case "windows":
		win := os.Getenv("WINDIR")
		if win == "" {
			win = `C:\Windows`
		}
		fonts := filepath.Join(win, "Fonts")
		candidates = append(candidates,
			filepath.Join(fonts, "msyhbd.ttc"),
			filepath.Join(fonts, "msyh.ttc"),
			filepath.Join(fonts, "msyhbd.ttf"),
			filepath.Join(fonts, "msyh.ttf"),
			filepath.Join(fonts, "simhei.ttf"),
		)
	case "darwin":
		candidates = append(candidates,
			"/System/Library/Fonts/PingFang.ttc",
			"/System/Library/Fonts/STHeiti Medium.ttc",
			"/Library/Fonts/Arial Unicode.ttf",
		)
	default:
		candidates = append(candidates,
			"/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
			"/usr/share/fonts/opentype/noto/NotoSansCJKsc-Regular.otf",
			"/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
			"/usr/share/fonts/truetype/wqy/wqy-microhei.ttc",
			"/usr/share/fonts/wqy-microhei/wqy-microhei.ttc",
		)
	}
	for _, p := range candidates {
		if p == "" {
			continue
		}
		st, err := os.Stat(p)
		if err == nil && !st.IsDir() {
			return p, nil
		}
	}
	return "", fmt.Errorf("no cjk font found; set upload.font to a ttf/otf/ttc path")
}
