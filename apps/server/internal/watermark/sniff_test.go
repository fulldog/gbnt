package watermark

import "testing"

func TestSniffRasterImageAcceptsJpegPngWebp(t *testing.T) {
	t.Parallel()
	jpegHead := []byte{0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10}
	pngHead := []byte{0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a}
	webpHead := []byte("RIFF....WEBP")
	if !SniffRasterImage(jpegHead) || !SniffRasterImage(pngHead) || !SniffRasterImage(webpHead) {
		t.Fatal("jpeg/png/webp 文件头应通过")
	}
	if SniffRasterImage([]byte("<svg xmlns")) || SniffRasterImage(nil) {
		t.Fatal("SVG 与空内容应拒绝")
	}
}
