package main

import (
	"bytes"
	"testing"
)

func TestMigrationCommandRejectsIncompleteApplyBeforeConnecting(t *testing.T) {
	for _, args := range [][]string{{"--apply"}, {"--apply", "--database", "prod", "--backup-confirmed"}, {"--writes-paused"}, {"--timeout", "0s"}, {"--unknown"}} {
		var out, err bytes.Buffer
		if code := run(args, &out, &err); code != 2 {
			t.Fatalf("%v exit=%d", args, code)
		}
	}
}
