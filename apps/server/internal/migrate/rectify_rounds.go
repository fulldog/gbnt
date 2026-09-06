package migrate

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"database/sql/driver"
	"fmt"
	"regexp"
	"strings"
	"time"
)

// RectifyRoundColumn 为轮次字段的实际结构；不存在时不填类型、默认值等属性。
type RectifyRoundColumn struct {
	Table    string  `json:"table"`    // 固定为问题表或整改记录表
	Column   string  `json:"column"`   // 固定为 rectify_round 或 round
	Exists   bool    `json:"exists"`   // 当前数据库是否已存在此列
	Type     string  `json:"type"`     // MySQL 返回的完整字段类型
	Nullable bool    `json:"nullable"` // 是否允许 NULL；目标值为 false
	Default  *string `json:"default"`  // 数据库默认值；目标值为字符串 0，nil 表示无默认值
	Extra    string  `json:"extra"`    // 额外属性；轮次列不得为生成列或自动递增列
}

// RectifyRoundReport 记录检查和增量修复结果，不包含连接账号、密码或业务明细。
type RectifyRoundReport struct {
	Database   string               `json:"database"`    // 实际连接的数据库名
	Columns    []RectifyRoundColumn `json:"columns"`     // 两个目标字段的实际状态
	PendingSQL []string             `json:"pending_sql"` // 待执行的固定补列 SQL；检查模式不执行
	AppliedSQL []string             `json:"applied_sql"` // 本次已成功执行的 SQL；MySQL DDL 不承诺事务回滚
	Verified   bool                 `json:"verified"`    // 两列结构合规且趋势 SQL 结构校验通过
}

// RectifyRoundSafetyError 为可以直接展示的安全检查失败原因；不包含驱动原始错误或连接凭据。
type RectifyRoundSafetyError struct {
	Reason string // 固定的中文运维提示
}

// Error 返回不含敏感信息的迁移安全提示。
func (e *RectifyRoundSafetyError) Error() string { return e.Reason }

type roundTarget struct {
	table  string
	column string
	ddl    string
}

var roundTargets = [...]roundTarget{
	{"issues", "rectify_round", "ALTER TABLE `issues` ADD COLUMN `rectify_round` BIGINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '当前整改轮次 初次及历史数据为0 重新整改递增'"},
	{"issue_rectify_records", "round", "ALTER TABLE `issue_rectify_records` ADD COLUMN `round` BIGINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '整改所属轮次 初次及历史数据为0'"},
}

var unsignedBigintType = regexp.MustCompile(`^bigint(?:\([0-9]+\))? unsigned$`)

const roundColumnsQuery = `SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, EXTRA
FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()
AND ((TABLE_NAME = 'issues' AND COLUMN_NAME = 'rectify_round')
OR (TABLE_NAME = 'issue_rectify_records' AND COLUMN_NAME = 'round'))`

const roundTrendCheckQuery = `SELECT issues.id,
(SELECT MAX(r.created_at) FROM issue_rectify_records r
 WHERE r.issue_id = issues.id AND r.round = issues.rectify_round AND r.is_delete = 0) AS completed_at
FROM issues WHERE 1 = 0`

// CheckRectifyRounds 只读取数据库身份和结构，不清表、不写种子或同步权限目录。
// 缺列时返回计划且 Verified=false；定义异常或无法安全判断历史轮次时返回错误。
func CheckRectifyRounds(ctx context.Context, db *sql.DB) (RectifyRoundReport, error) {
	conn, err := db.Conn(ctx)
	if err != nil {
		return RectifyRoundReport{}, fmt.Errorf("获取检查连接: %w", err)
	}
	defer conn.Close()
	name, err := roundDatabaseName(ctx, conn)
	if err != nil {
		return RectifyRoundReport{}, err
	}
	return inspectRectifyRounds(ctx, conn, name)
}

// RepairRectifyRounds 只补两个缺失轮次列；必须显式确认库名，并事先备份及暂停业务写入。
// 使用同连接命名锁防止本工具并发执行；不调用 Auto，行为不受 debug/dev 或种子开关影响。
// MySQL DDL 会独立提交；中途失败保留 AppliedSQL，修正故障后重新检查并执行，不删除已补字段。
func RepairRectifyRounds(ctx context.Context, db *sql.DB, expectedDatabase string) (RectifyRoundReport, error) {
	if strings.TrimSpace(expectedDatabase) == "" {
		return RectifyRoundReport{}, roundSafety("执行修复必须明确指定目标数据库名")
	}
	conn, err := db.Conn(ctx)
	if err != nil {
		return RectifyRoundReport{}, fmt.Errorf("获取修复连接: %w", err)
	}
	defer conn.Close()
	name, err := roundDatabaseName(ctx, conn)
	if err != nil {
		return RectifyRoundReport{}, err
	}
	if name != expectedDatabase {
		return RectifyRoundReport{Database: name}, roundSafety("实际连接库与确认的目标库不一致，未执行迁移")
	}
	// 锁名不直接拼接任意长度的数据库名，避免超过 MySQL 命名锁长度限制。
	digest := sha256.Sum256([]byte(name))
	lockName := fmt.Sprintf("gbnt:rectify-rounds:%x", digest[:16])
	var acquired sql.NullInt64
	if err := conn.QueryRowContext(ctx, "SELECT GET_LOCK(?, 0)", lockName).Scan(&acquired); err != nil {
		// 响应失败时无法确定服务端是否已获得锁，丢弃会话，避免遗留锁进入连接池。
		_ = conn.Raw(func(any) error { return driver.ErrBadConn })
		return RectifyRoundReport{Database: name}, fmt.Errorf("获取轮次迁移锁: %w", err)
	}
	if !acquired.Valid || acquired.Int64 != 1 {
		return RectifyRoundReport{Database: name}, roundSafety("轮次迁移锁不可用，请确认没有其他修复任务正在执行")
	}
	defer releaseRoundLock(conn, lockName)
	report, err := inspectRectifyRounds(ctx, conn, name)
	if err != nil || report.Verified {
		return report, err
	}
	before, err := roundRowCounts(ctx, conn)
	if err != nil {
		return report, err
	}
	for len(report.PendingSQL) > 0 {
		statement := report.PendingSQL[0]
		if _, err := conn.ExecContext(ctx, statement); err != nil {
			return report, fmt.Errorf("补充轮次字段失败，已执行语句不会自动回滚，请重新检查: %w", err)
		}
		report.AppliedSQL = append(report.AppliedSQL, statement)
		report.PendingSQL = report.PendingSQL[1:]
	}
	checked, err := inspectRectifyRounds(ctx, conn, name)
	checked.AppliedSQL = report.AppliedSQL
	if err != nil {
		return checked, err
	}
	if !checked.Verified {
		return checked, roundSafety("补列后结构验证未通过，请检查实际数据库，勿重复修改历史数据")
	}
	after, err := roundRowCounts(ctx, conn)
	if err != nil {
		checked.Verified = false
		return checked, err
	}
	if before != after {
		checked.Verified = false
		return checked, roundSafety("修复前后记录数发生变化，请确认业务写入已暂停；已补字段不会自动回滚")
	}
	return checked, nil
}

func roundSafety(reason string) error { return &RectifyRoundSafetyError{Reason: reason} }

func roundDatabaseName(ctx context.Context, conn *sql.Conn) (string, error) {
	var name sql.NullString
	if err := conn.QueryRowContext(ctx, "SELECT DATABASE()").Scan(&name); err != nil {
		return "", fmt.Errorf("读取实际数据库名: %w", err)
	}
	if !name.Valid || name.String == "" {
		return "", roundSafety("连接未选择数据库，请在配置中明确指定库名")
	}
	return name.String, nil
}

func inspectRectifyRounds(ctx context.Context, conn *sql.Conn, name string) (RectifyRoundReport, error) {
	report := RectifyRoundReport{Database: name, Columns: []RectifyRoundColumn{}, PendingSQL: []string{}, AppliedSQL: []string{}}
	for _, target := range roundTargets {
		var exists int
		if err := conn.QueryRowContext(ctx, `SELECT COUNT(*) FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND TABLE_TYPE = 'BASE TABLE'`, target.table).Scan(&exists); err != nil {
			return report, fmt.Errorf("检查轮次所属表: %w", err)
		}
		if exists != 1 {
			return report, roundSafety("问题表或整改记录表不存在；本命令仅修复已有库的缺列，不初始化数据库")
		}
		report.Columns = append(report.Columns, RectifyRoundColumn{Table: target.table, Column: target.column})
	}
	rows, err := conn.QueryContext(ctx, roundColumnsQuery)
	if err != nil {
		return report, fmt.Errorf("查询轮次字段结构: %w", err)
	}
	for rows.Next() {
		var table, column, columnType, nullable, extra string
		var defaultValue sql.NullString
		if err := rows.Scan(&table, &column, &columnType, &nullable, &defaultValue, &extra); err != nil {
			rows.Close()
			return report, fmt.Errorf("读取轮次字段结构: %w", err)
		}
		for i := range report.Columns {
			status := &report.Columns[i]
			if status.Table != table || status.Column != column {
				continue
			}
			status.Exists, status.Type, status.Nullable, status.Extra = true, columnType, nullable != "NO", extra
			if defaultValue.Valid {
				value := defaultValue.String
				status.Default = &value
			}
		}
	}
	rowsErr := rows.Err()
	rows.Close()
	if rowsErr != nil {
		return report, fmt.Errorf("读取轮次字段结果集: %w", rowsErr)
	}
	for i, status := range report.Columns {
		if !status.Exists {
			report.PendingSQL = append(report.PendingSQL, roundTargets[i].ddl)
			continue
		}
		if !unsignedBigintType.MatchString(strings.ToLower(status.Type)) || status.Nullable || status.Default == nil || *status.Default != "0" || status.Extra != "" {
			return report, roundSafety("已有轮次字段定义异常，应为 BIGINT UNSIGNED NOT NULL DEFAULT 0；请人工核对，未自动改列或重置数据")
		}
	}
	if len(report.PendingSQL) > 0 {
		// 只缺一列且另一列已有真实轮次时，填 0 会产生错误归属，必须人工核对历史。
		for _, status := range report.Columns {
			if !status.Exists {
				continue
			}
			var nonzero bool
			query := fmt.Sprintf("SELECT EXISTS(SELECT 1 FROM `%s` WHERE `%s` <> 0)", status.Table, status.Column)
			if err := conn.QueryRowContext(ctx, query).Scan(&nonzero); err != nil {
				return report, fmt.Errorf("检查历史轮次: %w", err)
			}
			if nonzero {
				return report, roundSafety("部分轮次列缺失且现存列已有非零轮次，请先人工核对历史归属，未执行迁移")
			}
		}
		return report, nil
	}
	// 零行查询只校验实际趋势表达式引用的字段，不读取业务明细，不改变统计口径。
	trendRows, err := conn.QueryContext(ctx, roundTrendCheckQuery)
	if err != nil {
		return report, fmt.Errorf("验证整改趋势 SQL 结构: %w", err)
	}
	defer trendRows.Close()
	for trendRows.Next() {
		return report, roundSafety("趋势结构校验意外返回数据，请检查数据库状态")
	}
	if err := trendRows.Err(); err != nil {
		return report, fmt.Errorf("读取整改趋势结构校验结果: %w", err)
	}
	report.Verified = true
	return report, nil
}

func roundRowCounts(ctx context.Context, conn *sql.Conn) ([2]uint64, error) {
	// 净行数比对仅用于提示异常，不能检测 UPDATE 或等量增删，不能代替维护窗口暂停写入。
	var counts [2]uint64
	for i, target := range roundTargets {
		if err := conn.QueryRowContext(ctx, "SELECT COUNT(*) FROM `"+target.table+"`").Scan(&counts[i]); err != nil {
			return counts, fmt.Errorf("核对原有记录数量: %w", err)
		}
	}
	return counts, nil
}

func releaseRoundLock(conn *sql.Conn, name string) {
	// 原任务即使超时也独立清理锁；释放失败则丢弃底层连接，禁止带锁返回连接池。
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	var released sql.NullInt64
	if err := conn.QueryRowContext(ctx, "SELECT RELEASE_LOCK(?)", name).Scan(&released); err != nil || !released.Valid || released.Int64 != 1 {
		_ = conn.Raw(func(any) error { return driver.ErrBadConn })
	}
}
