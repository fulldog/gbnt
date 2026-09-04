package xlsxutil

import (
	"bytes"
	"testing"

	"github.com/xuri/excelize/v2"
)

func TestExportHeadersAndRows(t *testing.T) {
	t.Parallel()
	data, err := Export([]string{"姓名", "账号"}, [][]any{
		{"张三", "zhang"},
		{"李四", "li"},
	})
	if err != nil {
		t.Fatal(err)
	}
	f, err := excelize.OpenReader(bytes.NewReader(data))
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	rows, err := f.GetRows(f.GetSheetName(0))
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != 3 || rows[0][0] != "姓名" || rows[1][1] != "zhang" || rows[2][0] != "李四" {
		t.Fatalf("rows=%v", rows)
	}
}
