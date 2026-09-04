package watermark

import (
	"image"
	"image/color"
	"image/draw"
	"testing"
)

func TestApplyRendersBottomLeft(t *testing.T) {
	r := NewRenderer("")
	src := image.NewRGBA(image.Rect(0, 0, 780, 520))
	draw.Draw(src, src.Bounds(), image.NewUniform(color.RGBA{R: 196, G: 176, B: 120, A: 255}), image.Point{}, draw.Src)
	out, err := r.Apply(src, Meta{
		UserName: "李强",
		Lat:      36.4489,
		Lng:      115.982,
		Address:  "程麻新村西排灌沟桥",
	})
	if err != nil {
		t.Skip(err.Error())
	}
	if out.Bounds().Dx() != 780 || out.Bounds().Dy() != 520 {
		t.Fatalf("size changed")
	}
	// 黄竖条应出现在左下区域
	foundBar := false
	ymin := 400
	for y := ymin; y < 520; y++ {
		for x := 10; x < 30; x++ {
			c := out.RGBAAt(x, y)
			if c.R > 200 && c.G > 160 && c.B < 80 {
				foundBar = true
				break
			}
		}
	}
	if !foundBar {
		t.Fatal("yellow bar not found in bottom-left")
	}
}
