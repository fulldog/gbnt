package service

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"sort"
	"strings"
	"time"

	"gbnt/apps/server/internal/database"
	"gbnt/apps/server/internal/model"
	driver "github.com/go-sql-driver/mysql"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// ErrFacilityCodeConflict 表示同组织、同类型已有相同设施编号。
var ErrFacilityCodeConflict = errors.New("当前组织该类型设施编号已存在，请修改或使用自动编号")

// ErrIssueRequestConflict 表示同一请求 ID 已用于不同提交内容。
var ErrIssueRequestConflict = errors.New("本次提交内容已变化，请重新提交")

// ErrIssueOrgNotFound 表示组织不存在或已删除。
var ErrIssueOrgNotFound = errors.New("组织不存在")

var (
	errIssueAssigneeNotFound = errors.New("整改人不存在")
	errIssueAssigneeDisabled = errors.New("整改人已停用")
	errIssueAssigneeOrg      = errors.New("责任人不属于所选组织")
	requestIDPattern         = regexp.MustCompile(`^[A-Za-z0-9_-]{16,64}$`)
)

func issueCodeInput(mode, code string) (string, string, error) {
	code, err := model.NormalizeFacilityCode(code)
	if err != nil {
		return "", "", err
	}
	if mode == "" {
		if code == "" {
			mode = "auto"
		} else {
			mode = "manual"
		}
	}
	if mode != "auto" && mode != "manual" {
		return "", "", errors.New("编号模式必须为 auto 或 manual")
	}
	if mode == "auto" && code != "" {
		return "", "", errors.New("自动编号模式不能指定设施编号")
	}
	if mode == "manual" && code == "" {
		return "", "", errors.New("请填写设施编号")
	}
	return mode, code, nil
}

func lockIssueOrgs(tx *gorm.DB, ids ...uint64) error {
	sort.Slice(ids, func(i, j int) bool { return ids[i] < ids[j] })
	var previous uint64
	for _, id := range ids {
		if id == 0 {
			return errors.New("请选择组织")
		}
		if id == previous {
			continue
		}
		previous = id
		var org model.SysOrg
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&org, id).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrIssueOrgNotFound
			}
			return err
		}
	}
	return nil
}

func requireAvailableCode(tx *gorm.DB, orgID uint64, typ, code string, exceptID uint64) error {
	if code == "" {
		return nil
	}
	var count int64
	err := tx.Model(&model.Issue{}).Where("org_id = ? AND type = ? AND code_key = ? AND id <> ?", orgID, typ, code, exceptID).Count(&count).Error
	if err != nil {
		return err
	}
	if count > 0 {
		return ErrFacilityCodeConflict
	}
	return nil
}

func allocateIssueCode(tx *gorm.DB, orgID uint64, typ string) (string, error) {
	var count int64
	if err := tx.Model(&model.Issue{}).Where("org_id = ? AND type = ?", orgID, typ).Count(&count).Error; err != nil {
		return "", err
	}
	// [PRD] 条数加一为起点，仅在提交事务中分配；手动跳号已占用的编号继续递增。
	for next := count + 1; next > 0; next++ {
		code := fmt.Sprintf("%02d", next)
		err := requireAvailableCode(tx, orgID, typ, code, 0)
		if err == nil {
			return code, nil
		}
		if !errors.Is(err, ErrFacilityCodeConflict) {
			return "", err
		}
	}
	return "", errors.New("设施编号超出可分配范围")
}

func isCodeUniqueError(err error) bool {
	var mysqlErr *driver.MySQLError
	return errors.As(err, &mysqlErr) && mysqlErr.Number == 1062 && strings.Contains(mysqlErr.Message, "uq_issues_active_code")
}

func issueWriteTransaction(ctx context.Context, db *gorm.DB, automatic bool, action func(*gorm.DB) error) error {
	for attempt := 0; ; attempt++ {
		err := db.WithContext(ctx).Transaction(action, &sql.TxOptions{Isolation: sql.LevelReadCommitted})
		var mysqlErr *driver.MySQLError
		retry := errors.As(err, &mysqlErr) && (mysqlErr.Number == 1213 || mysqlErr.Number == 1205)
		retry = retry || (automatic && isCodeUniqueError(err))
		if !retry || attempt >= 2 {
			if isCodeUniqueError(err) {
				return ErrFacilityCodeConflict
			}
			return err
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(time.Duration(attempt+1) * 10 * time.Millisecond):
		}
	}
}

func prepareIssueRequest(ctx context.Context, in IssueInput) (*model.IssueCreateRequest, error) {
	if in.RequestID == "" {
		return nil, nil
	}
	if !requestIDPattern.MatchString(in.RequestID) {
		return nil, errors.New("request_id 格式无效")
	}
	user, err := database.UserFromContext(ctx)
	if err != nil {
		return nil, err
	}
	payload, err := json.Marshal(in)
	if err != nil {
		return nil, err
	}
	hash := sha256.Sum256(payload)
	return &model.IssueCreateRequest{ActorID: user.ID, RequestID: in.RequestID, PayloadHash: hex.EncodeToString(hash[:]), ResponseJSON: "null"}, nil
}

func claimIssueRequest(tx *gorm.DB, request *model.IssueCreateRequest) (*IssueVO, error) {
	if request == nil {
		return nil, nil
	}
	// 先登记请求再锁组织；同一次提交跨组织重试也只能由一个事务处理。
	if err := tx.Clauses(clause.OnConflict{DoUpdates: clause.AssignmentColumns([]string{"request_id"})}).Create(request).Error; err != nil {
		return nil, err
	}
	var stored model.IssueCreateRequest
	if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("actor_id = ? AND request_id = ?", request.ActorID, request.RequestID).First(&stored).Error; err != nil {
		return nil, err
	}
	if stored.PayloadHash != request.PayloadHash {
		return nil, ErrIssueRequestConflict
	}
	if stored.ResponseJSON == "null" {
		return nil, nil
	}
	var result IssueVO
	if err := json.Unmarshal([]byte(stored.ResponseJSON), &result); err != nil {
		return nil, err
	}
	result.TypeExt = string(result.TypeExtVO)
	return &result, nil
}

func finishIssueRequest(tx *gorm.DB, request *model.IssueCreateRequest, result *IssueVO) error {
	if request == nil {
		return nil
	}
	payload, err := json.Marshal(result)
	if err != nil {
		return err
	}
	return tx.Model(&model.IssueCreateRequest{}).Where("actor_id = ? AND request_id = ?", request.ActorID, request.RequestID).Update("response_json", string(payload)).Error
}
