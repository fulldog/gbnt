// Package testutil 提供无外部数据库依赖的 SQL 查询桩，仅用于测试服务查询与 HTTP 契约。
// 桩不会解析或执行 SQL，因此不能代替真实 MySQL 集成验收。
package testutil

import (
	"context"
	"database/sql"
	"database/sql/driver"
	"errors"
	"io"
	"strings"
	"sync"
	"testing"

	"gorm.io/driver/mysql"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// QueryStep 描述一次预期只读查询及结果；Check 可断言参数绑定与过滤条件。
type QueryStep struct {
	Contains string                            // SQL 必须包含的片段
	Columns  []string                          // 返回列名
	Rows     [][]driver.Value                  // 返回行；空切片表示无记录
	Err      error                             // 注入查询故障；nil 为成功
	Check    func(string, []driver.NamedValue) // 可选精细断言
}

type queryScript struct {
	t     testing.TB
	mu    sync.Mutex
	steps []QueryStep
	used  int
}

type connector struct{ script *queryScript }
type stubDriver struct{}
type connection struct{ script *queryScript }
type rows struct {
	columns []string
	values  [][]driver.Value
	index   int
}

// NewQueryDB 以 MySQL 方言连接内存查询桩；测试结束时校验所有预期查询均已发生。
func NewQueryDB(t testing.TB, steps ...QueryStep) *gorm.DB {
	t.Helper()
	script := &queryScript{t: t, steps: steps}
	sqlDB := sql.OpenDB(connector{script: script})
	db, err := gorm.Open(mysql.New(mysql.Config{Conn: sqlDB, SkipInitializeWithVersion: true}), &gorm.Config{
		DisableAutomaticPing: true, Logger: logger.Default.LogMode(logger.Silent),
	})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_ = sqlDB.Close()
		if script.used != len(script.steps) {
			t.Errorf("查询次数 = %d，预期 %d", script.used, len(script.steps))
		}
	})
	return db
}

func (c connector) Connect(context.Context) (driver.Conn, error) {
	return connection{script: c.script}, nil
}
func (connector) Driver() driver.Driver { return stubDriver{} }
func (stubDriver) Open(string) (driver.Conn, error) {
	return nil, errors.New("测试请使用 Connector")
}
func (connection) Prepare(string) (driver.Stmt, error) {
	return nil, errors.New("查询桩不允许预编译")
}
func (connection) Close() error { return nil }
func (connection) Begin() (driver.Tx, error) {
	return nil, errors.New("查询桩不允许事务写入")
}
func (c connection) QueryContext(_ context.Context, query string, args []driver.NamedValue) (driver.Rows, error) {
	c.script.mu.Lock()
	defer c.script.mu.Unlock()
	if c.script.used >= len(c.script.steps) {
		c.script.t.Errorf("发生额外查询：%s", query)
		return nil, errors.New("发生额外查询")
	}
	step := c.script.steps[c.script.used]
	c.script.used++
	if !strings.Contains(query, step.Contains) {
		c.script.t.Errorf("查询 %q 不包含 %q", query, step.Contains)
	}
	if step.Check != nil {
		step.Check(query, args)
	}
	if step.Err != nil {
		return nil, step.Err
	}
	return &rows{columns: step.Columns, values: step.Rows}, nil
}
func (r *rows) Columns() []string { return r.columns }
func (*rows) Close() error        { return nil }
func (r *rows) Next(dest []driver.Value) error {
	if r.index >= len(r.values) {
		return io.EOF
	}
	copy(dest, r.values[r.index])
	r.index++
	return nil
}
