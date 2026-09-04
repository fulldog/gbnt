package service

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestSanitizeUploadFileName(t *testing.T) {
	t.Parallel()
	cases := []struct {
		in   string
		want string
	}{
		{in: "现场 照片.jpg", want: "现场_照片.jpg"},
		{in: "c#d?.png", want: "c_d_.png"},
		{in: "", want: "image.jpg"},
		{in: "正常名称.jpeg", want: "正常名称.jpeg"},
	}
	for _, tc := range cases {
		t.Run(tc.in, func(t *testing.T) {
			t.Parallel()
			if got := sanitizeUploadFileName(tc.in); got != tc.want {
				t.Fatalf("got %q want %q", got, tc.want)
			}
		})
	}
}

func TestUploadURLPath(t *testing.T) {
	t.Parallel()
	got := uploadURLPath("2026/08/24/现场_照片.jpg")
	want := "/uploads/2026/08/24/现场_照片.jpg"
	if got != want {
		t.Fatalf("got %q want %q", got, want)
	}
}

func TestUniqueStoredFileName(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	name := uniqueStoredFileName(dir, "a.jpg", 7, 100)
	if name != "a_7_100.jpg" {
		t.Fatalf("got %q", name)
	}
	if err := os.WriteFile(filepath.Join(dir, name), []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}
	got := uniqueStoredFileName(dir, "a.jpg", 7, 100)
	if got != "a_7_101.jpg" {
		t.Fatalf("got %q", got)
	}
}

func TestStoredFileName(t *testing.T) {
	t.Parallel()
	cases := []struct {
		name   string
		orig   string
		userID int
		ms     int64
		want   string
	}{
		{name: "jpg", orig: "现场_照片.jpg", userID: 12, ms: 1756032000123, want: "现场_照片_12_1756032000123.jpg"},
		{name: "no_ext", orig: "photo", userID: 1, ms: 100, want: "photo_1_100"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			if got := storedFileName(tc.orig, tc.userID, tc.ms); got != tc.want {
				t.Fatalf("got %q want %q", got, tc.want)
			}
		})
	}
}

func TestDateRelDir(t *testing.T) {
	t.Parallel()
	loc := time.Local
	tm := time.Date(2026, 8, 24, 19, 0, 0, 0, loc)
	got := dateRelDir(tm)
	if got != "2026/08/24" {
		t.Fatalf("got %q", got)
	}
}
