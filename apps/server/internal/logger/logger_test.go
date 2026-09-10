package logger

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"gbnt/apps/server/internal/config"
)

func TestInitReleaseDoesNotRequireConsole(t *testing.T) {
	dir := t.TempDir()
	logs, err := Init(config.LogConfig{
		Dir:        dir,
		MaxSizeMB:  1,
		MaxBackups: 1,
		MaxAgeDays: 1,
		Level:      "info",
	}, "release")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(Sync)

	logs.Info.Info("release_file_only")
	Sync()

	matches, err := filepath.Glob(filepath.Join(dir, "info", "info-*.log"))
	if err != nil || len(matches) == 0 {
		t.Fatalf("info log missing: %v %v", matches, err)
	}
	raw, err := os.ReadFile(matches[0])
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(raw), "release_file_only") {
		t.Fatalf("file log = %s", raw)
	}
}

func TestIsReleaseMode(t *testing.T) {
	if !isReleaseMode("release") || !isReleaseMode("Release") {
		t.Fatal("release should match")
	}
	if isReleaseMode("debug") || isReleaseMode("dev") || isReleaseMode("") {
		t.Fatal("non-release should keep console")
	}
}
