// Package xlsxutil 提供 xlsx 导出公共方法，业务侧只组表头与数据行。
package xlsxutil

import (
	"github.com/gin-gonic/gin"
	"github.com/xuri/excelize/v2"
)

// MIMEExcel xlsx Content-Type。
const MIMEExcel = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

const defaultSheet = "Sheet1"

// Export 将表头与数据行写成 xlsx 字节。headers 为第一行；rows 从第二行起。
func Export(headers []string, rows [][]any) ([]byte, error) {
	f := excelize.NewFile()
	defer func() { _ = f.Close() }()

	hs := make([]any, len(headers))
	for i, h := range headers {
		hs[i] = h
	}
	if err := f.SetSheetRow(defaultSheet, "A1", &hs); err != nil {
		return nil, err
	}
	for i, row := range rows {
		r := row
		if r == nil {
			r = []any{}
		}
		cell, err := excelize.CoordinatesToCellName(1, i+2)
		if err != nil {
			return nil, err
		}
		if err := f.SetSheetRow(defaultSheet, cell, &r); err != nil {
			return nil, err
		}
	}
	buf, err := f.WriteToBuffer()
	if err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

// WriteDownload 以附件形式写出 xlsx（filename 为下载文件名）。
func WriteDownload(c *gin.Context, filename string, data []byte) {
	c.Header("Content-Disposition", `attachment; filename="`+filename+`"`)
	c.Data(200, MIMEExcel, data)
}
