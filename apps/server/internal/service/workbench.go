package service

import (
	"context"
	"database/sql"
	"fmt"
	"sort"
	"time"

	"gbnt/apps/server/internal/model"
)

var workbenchLocation = time.FixedZone("Asia/Shanghai", 8*60*60)

// WorkbenchTrendPoint 为一个完整自然日、月或年的真实记录计数；无事件时为零。
type WorkbenchTrendPoint struct {
	Period    string `json:"period"`    // 时间桶 YYYY-MM-DD / YYYY-MM / YYYY，不能为空
	Reported  int64  `json:"reported"`  // 该时间桶创建的排查记录数，非负整数
	Completed int64  `json:"completed"` // 当前 done 问题在当前轮次最后一次有效整改记录所在时间桶的数量
}

// WorkbenchTrendResult 返回工作台趋势，时间桶固定使用北京时间。
type WorkbenchTrendResult struct {
	Range            string                `json:"range"`             // week7/month1/halfyear/all，默认 week7
	Granularity      string                `json:"granularity"`       // day/month/year
	Timezone         string                `json:"timezone"`          // 固定 Asia/Shanghai
	Points           []WorkbenchTrendPoint `json:"points"`            // 按时间升序排列，零数据仍包含所选范围的时间桶
	UndatedCompleted int64                 `json:"undated_completed"` // 当前 done 但没有本轮整改记录的数量；不伪造其完成时间
}

func workbenchTrendWindow(value string, now time.Time) (*WorkbenchTrendResult, time.Time, error) {
	if value == "" {
		value = "week7"
	}
	now = now.In(workbenchLocation)
	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, workbenchLocation)
	out := &WorkbenchTrendResult{Range: value, Timezone: "Asia/Shanghai", Points: []WorkbenchTrendPoint{}}
	var start time.Time
	switch value {
	case "week7", "month1":
		out.Granularity = "day"
		days := 7
		if value == "month1" {
			days = 30
		}
		start = today.AddDate(0, 0, 1-days)
		for date := start; !date.After(today); date = date.AddDate(0, 0, 1) {
			out.Points = append(out.Points, WorkbenchTrendPoint{Period: date.Format("2006-01-02")})
		}
	case "halfyear":
		out.Granularity = "month"
		start = time.Date(today.Year(), today.Month(), 1, 0, 0, 0, 0, workbenchLocation).AddDate(0, -5, 0)
		for i := 0; i < 6; i++ {
			out.Points = append(out.Points, WorkbenchTrendPoint{Period: start.AddDate(0, i, 0).Format("2006-01")})
		}
	case "all":
		out.Granularity = "year"
		out.Points = append(out.Points, WorkbenchTrendPoint{Period: today.Format("2006")})
	default:
		return nil, time.Time{}, fmt.Errorf("时间范围须为 week7、month1、halfyear 或 all")
	}
	return out, start, nil
}

// WorkbenchTrend 按创建时间统计上报，按当前轮次最后整改记录统计当前已完成问题。
// 不以 updated_at 代替完成时间，也不计已软删的主记录、整改记录或以前轮次；任何查询/扫描错误均不返回部分统计。
func (s *IssueService) WorkbenchTrend(ctx context.Context, value string, now time.Time) (*WorkbenchTrendResult, error) {
	out, start, err := workbenchTrendWindow(value, now)
	if err != nil {
		return nil, err
	}
	query := s.db(ctx).Model(&model.Issue{}).Select(`issues.created_at, issues.status,
		(SELECT MAX(r.created_at) FROM issue_rectify_records r
		 WHERE r.issue_id = issues.id AND r.round = issues.rectify_round AND r.is_delete = 0) AS completed_at`)
	if !start.IsZero() {
		query = query.Where("(issues.created_at >= ? OR issues.status = ?)", start, model.IssueStatusDone)
	}
	rows, err := query.Rows()
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	// 流式聚合仅保留时间桶，避免全部范围在内存加载问题明细、附件及整改记录。
	buckets := make(map[string]*WorkbenchTrendPoint, len(out.Points))
	for _, point := range out.Points {
		copy := point
		buckets[point.Period] = &copy
	}
	layout := map[string]string{"day": "2006-01-02", "month": "2006-01", "year": "2006"}[out.Granularity]
	add := func(at time.Time, completed bool) {
		if at.IsZero() || at.After(now) || (!start.IsZero() && at.Before(start)) {
			return
		}
		period := at.In(workbenchLocation).Format(layout)
		point := buckets[period]
		if point == nil {
			point = &WorkbenchTrendPoint{Period: period}
			buckets[period] = point
		}
		if completed {
			point.Completed++
		} else {
			point.Reported++
		}
	}
	for rows.Next() {
		var created time.Time
		var status string
		var completed sql.NullTime
		if err := rows.Scan(&created, &status, &completed); err != nil {
			return nil, err
		}
		add(created, false)
		if status == string(model.IssueStatusDone) {
			if completed.Valid && !completed.Time.IsZero() {
				add(completed.Time, true)
			} else {
				out.UndatedCompleted++
			}
		}
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	out.Points = make([]WorkbenchTrendPoint, 0, len(buckets))
	for _, point := range buckets {
		out.Points = append(out.Points, *point)
	}
	sort.Slice(out.Points, func(i, j int) bool { return out.Points[i].Period < out.Points[j].Period })
	return out, nil
}

// WorkbenchTodo 为工作台专用的轻量待办读取视图，不需要专项整改列表或系统管理接口权限。
type WorkbenchTodo struct {
	ID               uint64  `json:"id"`                          // 问题主键，必有
	IssueKey         string  `json:"issue_key"`                   // 业务问题编号，空值表示历史未设置
	Code             string  `json:"code"`                        // 设施编号，空值表示未填写
	Type             string  `json:"type"`                        // well/road/bridge/forest/transformer
	Status           string  `json:"status"`                      // 仅 new（待整改）/pending（整改中）
	OrgID            uint64  `json:"org_id"`                      // 落点组织 ID，关联可能缺失
	OrgName          *string `json:"org_name" gorm:"-"`           // 组织名称，关联缺失时 null
	OrgPath          *string `json:"org_path" gorm:"-"`           // 当前组织完整可解析路径，缺失时 null
	AssigneeUser     uint64  `json:"assignee_user"`               // 整改人用户 ID，0 表示未指派
	AssigneeUserName *string `json:"assignee_user_name" gorm:"-"` // 姓名或账号，未指派/关联缺失时 null
	PlanDate         string  `json:"plan_date"`                   // 计划完成日 YYYY-MM-DD，空表示未设期限
	DaysLeft         *int    `json:"days_left" gorm:"-"`          // 北京时间剩余自然日，负数为逾期，0 为今天；无有效日期为 null
}

// WorkbenchTodoResult 返回待办分页和服务端业务日期。
type WorkbenchTodoResult struct {
	List  []WorkbenchTodo `json:"list"`  // 当前页待办，空结果固定 []
	Total int64           `json:"total"` // 全部 new+pending 数量
	Page  int             `json:"page"`  // 实际页码，从 1 开始
	Size  int             `json:"size"`  // 实际每页数量，默认 20、最大 100
	Today string          `json:"today"` // 北京日期 YYYY-MM-DD，倒计时的统一计算基准
}

// WorkbenchTodos 查询全部尚未完成问题，按已设计划日期升序、同日 ID 降序、未设日期置后。
// 工作台延续原全局统计的可见范围，不调用小程序组织范围逻辑或扩大其它模块授权。
func (s *IssueService) WorkbenchTodos(ctx context.Context, page, size int, now time.Time) (*WorkbenchTodoResult, error) {
	page, size = NormalizePagination(page, size, 100)
	todayText := now.In(workbenchLocation).Format("2006-01-02")
	today, _ := time.ParseInLocation("2006-01-02", todayText, workbenchLocation)
	out := &WorkbenchTodoResult{List: []WorkbenchTodo{}, Page: page, Size: size, Today: todayText}
	query := s.db(ctx).Model(&model.Issue{}).Where("status IN ?", []model.IssueStatus{model.IssueStatusNew, model.IssueStatusPending})
	if err := query.Count(&out.Total).Error; err != nil {
		return nil, err
	}
	if err := query.Select("id, issue_key, code, type, status, org_id, assignee_user, plan_date").
		Order("CASE WHEN plan_date = '' OR plan_date IS NULL THEN 1 ELSE 0 END ASC, plan_date ASC, id DESC").
		Offset((page - 1) * size).Limit(size).Find(&out.List).Error; err != nil {
		return nil, err
	}
	userIDs, orgIDs := []uint64{}, []uint64{}
	for _, item := range out.List {
		userIDs = append(userIDs, item.AssigneeUser)
		orgIDs = append(orgIDs, item.OrgID)
	}
	names, err := loadAdminDisplayNames(s.db(ctx), userIDs, orgIDs, nil)
	if err != nil {
		return nil, err
	}
	for i := range out.List {
		item := &out.List[i]
		item.OrgName, item.OrgPath = names.orgDisplay(item.OrgID)
		item.AssigneeUserName = nullableName(names.users, item.AssigneeUser)
		if plan, parseErr := time.ParseInLocation("2006-01-02", item.PlanDate, workbenchLocation); parseErr == nil {
			left := int(plan.Sub(today).Hours() / 24)
			item.DaysLeft = &left
		}
	}
	return out, nil
}
