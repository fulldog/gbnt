package migrate

import (
	"context"
	"crypto/sha256"
	"errors"
	"fmt"
	"strings"

	"gbnt/apps/server/internal/model"
	"gorm.io/gorm"
)

const activeCodeExpression = "CASE WHEN is_delete = 0 THEN NULLIF(code_key, '') ELSE NULL END"

// ErrFacilityCodeHistory 表示历史编号冲突或格式无效；只输出清单，不自动改号。
var ErrFacilityCodeHistory = errors.New("历史编号存在冲突或无效值，请先核对审计清单")

// ErrFacilityCodeSchema 表示唯一约束缺失或结构不符合预期，必须执行专用迁移。
var ErrFacilityCodeSchema = errors.New("设施编号约束未就绪，请暂停写入并执行 migrate-facility-codes 审计及迁移")

// FacilityCodeRow 是历史编号审计行，保留原值供核对，不包含人员或附件信息。
type FacilityCodeRow struct {
	ID         uint64 `json:"id"`                  // 工单 ID
	OrgID      uint64 `json:"org_id"`              // 精确组织 ID
	Type       string `json:"type"`                // 设施大类
	Code       string `json:"code"`                // 原始编号，迁移不修改
	IsDelete   int    `json:"is_delete"`           // 0 为有效，1 为已删除
	Normalized string `gorm:"-" json:"normalized"` // 规范化比较值
}

// FacilityCodeConflict 包含同一组织、类型和规范化编号的全部有效工单。
type FacilityCodeConflict struct {
	OrgID   uint64            `json:"org_id"`   // 冲突组织
	Type    string            `json:"type"`     // 冲突类型
	CodeKey string            `json:"code_key"` // 冲突编号
	Rows    []FacilityCodeRow `json:"rows"`     // 冲突工单清单，按 ID 排序
}

// FacilityCodeReport 是只读审计或迁移完成后的结果，不等同于已部署。
type FacilityCodeReport struct {
	Total      int                    `json:"total"`      // 全部工单条数，含软删除
	Deleted    int                    `json:"deleted"`    // 已删除条数
	Empty      int                    `json:"empty"`      // 有效空编号条数
	Conflicts  []FacilityCodeConflict `json:"conflicts"`  // 有效编号冲突，空数组为无冲突
	Invalid    []FacilityCodeRow      `json:"invalid"`    // 无法规范化的编号
	Normalized []FacilityCodeRow      `json:"normalized"` // 比较键与原编号不同的行，不自动更改原编号
	Ready      bool                   `json:"ready"`      // 历史数据与唯一约束均已通过检查
}

func auditFacilityCodeRows(rows []FacilityCodeRow) FacilityCodeReport {
	report := FacilityCodeReport{Total: len(rows), Conflicts: []FacilityCodeConflict{}, Invalid: []FacilityCodeRow{}, Normalized: []FacilityCodeRow{}}
	type key struct {
		org       uint64
		typ, code string
	}
	groups := map[key][]FacilityCodeRow{}
	order := []key{}
	for _, row := range rows {
		code, err := model.NormalizeFacilityCode(row.Code)
		row.Normalized = code
		if row.IsDelete != 0 {
			report.Deleted++
		}
		if err != nil {
			report.Invalid = append(report.Invalid, row)
			continue
		}
		if code != row.Code {
			report.Normalized = append(report.Normalized, row)
		}
		if row.IsDelete != 0 {
			continue
		}
		if code == "" {
			report.Empty++
			continue
		}
		k := key{row.OrgID, row.Type, code}
		if _, exists := groups[k]; !exists {
			order = append(order, k)
		}
		groups[k] = append(groups[k], row)
	}
	for _, k := range order {
		if len(groups[k]) > 1 {
			report.Conflicts = append(report.Conflicts, FacilityCodeConflict{OrgID: k.org, Type: k.typ, CodeKey: k.code, Rows: groups[k]})
		}
	}
	return report
}

func facilityCodeRows(db *gorm.DB) ([]FacilityCodeRow, error) {
	var rows []FacilityCodeRow
	err := db.Raw("SELECT id, org_id, type, COALESCE(code, '') AS code, is_delete FROM issues ORDER BY id").Scan(&rows).Error
	return rows, err
}

// FacilityCodeSchemaReady 检查生成列、比较排序规则、唯一索引列序及请求去重表，不写数据库。
func FacilityCodeSchemaReady(db *gorm.DB) bool {
	var columns []struct{ ColumnName, GenerationExpression, CollationName string }
	if err := db.Raw("SELECT column_name AS column_name, COALESCE(generation_expression, '') AS generation_expression, COALESCE(collation_name, '') AS collation_name FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='issues' AND column_name IN ('code_key','active_code_key')").Scan(&columns).Error; err != nil {
		return false
	}
	clean := func(s string) string {
		s = strings.ReplaceAll(s, "\\'", "'")
		return strings.NewReplacer("_utf8mb4", "", " ", "", "`", "", "(", "", ")", "", "\n", "", "\t", "").Replace(strings.ToLower(s))
	}
	valid := 0
	for _, col := range columns {
		if col.CollationName != "utf8mb4_bin" {
			continue
		}
		if col.ColumnName == "code_key" && col.GenerationExpression == "" {
			valid++
		}
		if col.ColumnName == "active_code_key" && clean(col.GenerationExpression) == clean(activeCodeExpression) {
			valid++
		}
	}
	if valid != 2 {
		return false
	}
	var indexes []struct {
		ColumnName string
		NonUnique  int
	}
	if err := db.Raw("SELECT column_name AS column_name, non_unique AS non_unique FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='issues' AND index_name='uq_issues_active_code' ORDER BY seq_in_index").Scan(&indexes).Error; err != nil {
		return false
	}
	if len(indexes) != 3 {
		return false
	}
	for i, want := range []string{"org_id", "type", "active_code_key"} {
		if indexes[i].ColumnName != want || indexes[i].NonUnique != 0 {
			return false
		}
	}
	return db.Migrator().HasTable(&model.IssueCreateRequest{})
}

// AuditFacilityCodes 只读检查全部历史编号，已删除行不参与冲突判断。
func AuditFacilityCodes(ctx context.Context, db *gorm.DB) (FacilityCodeReport, error) {
	db = db.WithContext(ctx)
	rows, err := facilityCodeRows(db)
	if err != nil {
		return FacilityCodeReport{}, err
	}
	report := auditFacilityCodeRows(rows)
	if len(report.Conflicts) > 0 || len(report.Invalid) > 0 {
		return report, ErrFacilityCodeHistory
	}
	if !FacilityCodeSchemaReady(db) {
		return report, nil
	}
	// 索引存在也要检查比较键回填，防止旧服务写入空键而绕过查重。
	var keys []struct {
		ID      uint64
		CodeKey string
	}
	if err := db.Raw("SELECT id, code_key FROM issues ORDER BY id").Scan(&keys).Error; err != nil {
		return report, err
	}
	if len(keys) != len(rows) {
		return report, nil
	}
	for i, row := range rows {
		code, _ := model.NormalizeFacilityCode(row.Code)
		if keys[i].ID != row.ID || keys[i].CodeKey != code {
			return report, nil
		}
	}
	report.Ready = true
	return report, nil
}

// ApplyFacilityCodes 在外部已暂停写入时增量回填比较键并安装唯一约束；拒绝历史冲突，不修改原 code。
// 命名锁仅防止迁移工具同时执行，不能替代发布窗口的写入暂停。
func ApplyFacilityCodes(ctx context.Context, db *gorm.DB, databaseName string) (FacilityCodeReport, error) {
	var report FacilityCodeReport
	err := db.WithContext(ctx).Connection(func(conn *gorm.DB) error {
		// 连接保持不变，每次查询使用独立 Statement，避免审计 SQL 污染后续建表操作。
		conn = conn.Session(&gorm.Session{NewDB: true})
		var actual string
		if err := conn.Raw("SELECT DATABASE()").Scan(&actual).Error; err != nil {
			return err
		}
		if actual == "" || actual != databaseName {
			return errors.New("目标数据库不一致，未执行修改")
		}
		hash := sha256.Sum256([]byte(actual))
		lock := fmt.Sprintf("gbnt:facility-code:%x", hash[:12])
		var acquired int
		if err := conn.Raw("SELECT GET_LOCK(?, 0)", lock).Scan(&acquired).Error; err != nil {
			return err
		}
		if acquired != 1 {
			return errors.New("其它设施编号迁移正在运行")
		}
		defer conn.WithContext(context.Background()).Exec("SELECT RELEASE_LOCK(?)", lock)
		var err error
		report, err = AuditFacilityCodes(ctx, conn)
		if err != nil {
			return err
		}
		if report.Ready {
			return nil
		}
		if !conn.Migrator().HasColumn(&model.Issue{}, "code_key") {
			if err := conn.Exec("ALTER TABLE issues ADD COLUMN code_key VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL DEFAULT '' COMMENT '设施编号规范化键'").Error; err != nil {
				return err
			}
		}
		rows, err := facilityCodeRows(conn)
		if err != nil {
			return err
		}
		if err := conn.Transaction(func(tx *gorm.DB) error {
			for _, row := range rows {
				code, _ := model.NormalizeFacilityCode(row.Code)
				if err := tx.Exec("UPDATE issues SET code_key=? WHERE id=?", code, row.ID).Error; err != nil {
					return err
				}
			}
			return nil
		}); err != nil {
			return err
		}
		if !conn.Migrator().HasColumn(&model.Issue{}, "active_code_key") {
			if err := conn.Exec("ALTER TABLE issues ADD COLUMN active_code_key VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin GENERATED ALWAYS AS (" + activeCodeExpression + ") STORED").Error; err != nil {
				return err
			}
		}
		if !conn.Migrator().HasIndex(&model.Issue{}, "uq_issues_active_code") {
			if err := conn.Exec("CREATE UNIQUE INDEX uq_issues_active_code ON issues (org_id, type, active_code_key)").Error; err != nil {
				return err
			}
		}
		if err := conn.AutoMigrate(&model.IssueCreateRequest{}); err != nil {
			return err
		}
		report, err = AuditFacilityCodes(ctx, conn)
		if err != nil {
			return err
		}
		if !report.Ready {
			return ErrFacilityCodeSchema
		}
		return nil
	})
	if err != nil {
		report.Ready = false
	}
	return report, err
}

// ensureFacilityCodes 只为空库初始化约束；有历史数据时必须先显式审计迁移，不在启动时改号或补索引。
func ensureFacilityCodes(db *gorm.DB) error {
	if FacilityCodeSchemaReady(db) {
		return nil
	}
	var total int64
	if err := db.Unscoped().Model(&model.Issue{}).Count(&total).Error; err != nil {
		return err
	}
	if total > 0 {
		return ErrFacilityCodeSchema
	}
	var name string
	if err := db.Raw("SELECT DATABASE()").Scan(&name).Error; err != nil {
		return err
	}
	_, err := ApplyFacilityCodes(context.Background(), db, name)
	return err
}
