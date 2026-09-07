package service

import (
	"time"

	"gorm.io/gorm/clause"
)

const adminIssueDueSoonDays = 3

// adminIssueOrder 按北京自然日分组，在数据库分页前完成全量排序。
func adminIssueOrder(now time.Time) clause.OrderBy {
	today := now.In(workbenchLocation)
	// 已完成包含已整改和无异常的已排查记录，不受遗留计划日期影响。
	// 先校验年月日范围，缺失或非法日期留在普通待整改组，避免错误日期转换。
	return clause.OrderBy{Expression: clause.Expr{
		SQL: `CASE
			WHEN status = 'done' THEN 3
			WHEN status IN ('new', 'pending') THEN
				CASE WHEN CHAR_LENGTH(plan_date) = 10 AND plan_date REGEXP '^[1-9][0-9]{3}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$' THEN
					CASE
						WHEN CAST(SUBSTRING(plan_date, 9, 2) AS UNSIGNED) > DAY(LAST_DAY(CONCAT(SUBSTRING(plan_date, 1, 7), '-01'))) THEN 2
						WHEN plan_date < ? THEN 0
						WHEN plan_date <= ? THEN 1
						ELSE 2
					END
				ELSE 2 END
			ELSE 4
		END ASC, created_at DESC, id DESC`,
		Vars: []any{today.Format("2006-01-02"), today.AddDate(0, 0, adminIssueDueSoonDays).Format("2006-01-02")},
	}}
}
