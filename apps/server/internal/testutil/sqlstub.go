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
	Kind     string                            // 空值为 query；事务桩支持 begin/exec/commit/rollback
	Contains string                            // SQL 必须包含的片段
	Columns  []string                          // 返回列名
	Rows     [][]driver.Value                  // 返回行；空切片表示无记录
	Err      error                             // 注入查询故障；nil 为成功
	Check    func(string, []driver.NamedValue) // 可选精细断言
	InsertID int64                             // exec 返回的插入主键
}

type queryScript struct {
	t             testing.TB
	mu            sync.Mutex
	steps         []QueryStep
	used          int
	transactional bool
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
	return newScriptDB(t, false, steps...)
}

// NewTransactionDB 校验读写及事务边界的内存 SQL 桩；不执行真实 SQL，不替代 MySQL 并发验收。
func NewTransactionDB(t testing.TB, steps ...QueryStep) *gorm.DB {
	return newScriptDB(t, true, steps...)
}

func newScriptDB(t testing.TB, transactional bool, steps ...QueryStep) *gorm.DB {
	t.Helper()
	script := &queryScript{t: t, steps: steps, transactional: transactional}
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
func (c connection) Begin() (driver.Tx, error) {
	if !c.script.transactional {
		return nil, errors.New("查询桩不允许事务写入")
	}
	if _, err := c.script.next("begin", "BEGIN", nil); err != nil {
		return nil, err
	}
	return transaction{script: c.script}, nil
}
func (c connection) QueryContext(_ context.Context, query string, args []driver.NamedValue) (driver.Rows, error) {
	step, err := c.script.next("query", query, args)
	if err != nil {
		return nil, err
	}
	return &rows{columns: step.Columns, values: step.Rows}, nil
}

func (s *queryScript) next(kind, query string, args []driver.NamedValue) (QueryStep, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.used >= len(s.steps) {
		s.t.Errorf("发生额外查询：%s", query)
		return QueryStep{}, errors.New("发生额外查询")
	}
	step := s.steps[s.used]
	s.used++
	wantKind := step.Kind
	if wantKind == "" {
		wantKind = "query"
	}
	if kind != wantKind {
		s.t.Errorf("操作类型 = %s，预期 %s：%s", kind, wantKind, query)
	}
	if !strings.Contains(query, step.Contains) {
		s.t.Errorf("查询 %q 不包含 %q", query, step.Contains)
	}
	if step.Check != nil {
		step.Check(query, args)
	}
	if step.Err != nil {
		return step, step.Err
	}
	return step, nil
}

type transaction struct{ script *queryScript }

func (tx transaction) Commit() error {
	_, err := tx.script.next("commit", "COMMIT", nil)
	return err
}
func (tx transaction) Rollback() error {
	_, err := tx.script.next("rollback", "ROLLBACK", nil)
	return err
}

type execResult struct{ id int64 }

func (r execResult) LastInsertId() (int64, error) { return r.id, nil }
func (execResult) RowsAffected() (int64, error)   { return 1, nil }
func (c connection) ExecContext(_ context.Context, query string, args []driver.NamedValue) (driver.Result, error) {
	if !c.script.transactional {
		return nil, errors.New("查询桩不允许写入")
	}
	step, err := c.script.next("exec", query, args)
	if err != nil {
		return nil, err
	}
	return execResult{id: step.InsertID}, nil
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
