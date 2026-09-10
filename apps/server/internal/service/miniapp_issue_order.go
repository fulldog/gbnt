package service

import (
	"time"

	"gorm.io/gorm/clause"
)

// miniappIssueOrder 计划日期按北京时间当天结束截止；[PRD] 剩余不足一天即归入逾期。
// 日期没有时分，同日记录的剩余时间相同，使用 ID 降序稳定分页；非法日期单独放在正常组之后。
func miniappIssueOrder(now time.Time) clause.OrderBy {
	today := now.In(workbenchLocation)
	validDate := `CASE WHEN CHAR_LENGTH(plan_date) = 10 AND SUBSTRING(plan_date, 1, 4) >= '1900' AND plan_date REGEXP '^[1-9][0-9]{3}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'
		THEN CASE WHEN CAST(SUBSTRING(plan_date, 9, 2) AS UNSIGNED) <= DAY(LAST_DAY(CONCAT(SUBSTRING(plan_date, 1, 7), '-01'))) THEN plan_date END END`
	return clause.OrderBy{Expression: clause.Expr{
		SQL: `CASE WHEN status = 'done' THEN 4
			WHEN status IN ('new', 'pending') THEN
				CASE WHEN (` + validDate + `) < ? THEN 0
				WHEN (` + validDate + `) < ? THEN 1
				WHEN (` + validDate + `) IS NOT NULL THEN 2 ELSE 3 END
			ELSE 5 END ASC,
			CASE WHEN status IN ('new', 'pending') THEN (` + validDate + `) END DESC, id DESC`,
		// 恰好午夜时，今天剩余整一天、三天后的日期剩余整四天；与前端毫秒计算保持一致。
		Vars: []any{today.Add(-time.Nanosecond).AddDate(0, 0, 1).Format("2006-01-02"), today.Add(-time.Nanosecond).AddDate(0, 0, 4).Format("2006-01-02")},
	}}
}
