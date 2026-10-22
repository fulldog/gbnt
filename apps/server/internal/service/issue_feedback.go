package service

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"unicode/utf8"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"gbnt/apps/server/internal/database"
	"gbnt/apps/server/internal/model"
)

// ErrIssueReporterOnly 禁止删除他人的上报；由接口映射为 403。
var ErrIssueReporterOnly = errors.New("仅上报人本人可以删除该工单")

// IssueFeedbackInput 小程序一键整改；说明和照片写入一条 Feedback 整改记录。
type IssueFeedbackInput struct {
	Note          string   `json:"note"`           // 必填，去除首尾空白后 1–500 字的统一整改说明
	FileUUIDs     []string `json:"file_uuids"`     // 必填，1–6 张已上传整改照片的 file_id
	ExpectedRound *uint64  `json:"expected_round"` // 必填，打开详情时的整改轮次；过期拒绝提交
}

type preparedRectification struct {
	typ   model.QuizType
	note  string
	photo string
}

// DeleteReported 仅允许当前登录用户软删除本人上报；历史反馈与附件保持可追溯。
func (s *IssueService) DeleteReported(ctx context.Context, id uint64) error {
	user, err := database.UserFromContext(ctx)
	if err != nil {
		return err
	}
	if user.ID == 0 {
		return database.ErrUnauth
	}
	return s.deleteIssue(ctx, id, user.ID)
}

// SubmitFeedback 一键整改：直接把当前工单改为已整改，并插入一条 quiz_type=feedback 的整改记录。
// 仅未指派或当前用户为整改人时可提交，成功后认领为当前用户。不走分项整改的 rectifyPrepared。
func (s *IssueService) SubmitFeedback(ctx context.Context, id uint64, in IssueFeedbackInput) (*IssueVO, error) {
	if _, err := database.UserFromContext(ctx); err != nil {
		return nil, err
	}
	if in.ExpectedRound == nil {
		return nil, errors.New("缺少整改轮次，请刷新详情")
	}
	note := strings.TrimSpace(in.Note)
	if note == "" || utf8.RuneCountInString(note) > 500 {
		return nil, errors.New("请填写 1–500 字的整改说明")
	}
	if len(in.FileUUIDs) == 0 || len(in.FileUUIDs) > 6 {
		return nil, errors.New("请上传 1–6 张整改照片")
	}
	if s.Attach == nil {
		return nil, errors.New("附件服务未初始化")
	}
	ids, err := s.Attach.EnsureFiles(ctx, in.FileUUIDs)
	if err != nil {
		return nil, err
	}
	photos, err := json.Marshal(ids)
	if err != nil {
		return nil, err
	}
	return s.rectifyByFeedback(ctx, id, in.ExpectedRound, note, string(photos))
}

// rectifyByFeedback 一键整改落库。保留行锁、认领、组织范围和轮次校验，不改动分项整改的 rectifyPrepared。
func (s *IssueService) rectifyByFeedback(ctx context.Context, id uint64, expectedRound *uint64, note, photo string) (*IssueVO, error) {
	user, err := database.UserFromContext(ctx)
	if err != nil {
		return nil, err
	}
	err = s.db(ctx).Transaction(func(tx *gorm.DB) error {
		var item model.Issue
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&item, id).Error; err != nil {
			return err
		}
		if err := assertAppAssignee(&item, user.ID); err != nil {
			return err
		}
		if err := requireOrgScopeIfAuthenticated(ctx, tx, item.OrgID); err != nil {
			return err
		}
		// 旧页面不能把上一轮的一键整改写入已经重开的下一轮。
		if expectedRound != nil && *expectedRound != item.RectifyRound {
			return errors.New("整改轮次已更新，请刷新问题后重新提交")
		}
		if err := rectifyGate(item.Status, true); err != nil {
			return err
		}
		rec := model.IssueRectifyRecord{
			IssueID: id, Round: item.RectifyRound, QuizType: string(model.QuizFeedback), Note: note, PhotoFileIDs: photo,
		}
		if err := tx.Create(&rec).Error; err != nil {
			return err
		}
		return tx.Model(&model.Issue{}).Where("id = ?", id).Updates(map[string]interface{}{
			"status":        model.IssueStatusDone,
			"assignee_user": user.ID,
		}).Error
	})
	if err != nil {
		return nil, err
	}
	return s.Get(ctx, id)
}

func remainingRectifications(needed []model.QuizType, covered map[model.QuizType]struct{}, feedback preparedRectification) []preparedRectification {
	result := make([]preparedRectification, 0, len(needed))
	for _, typ := range needed {
		if _, done := covered[typ]; done {
			continue
		}
		row := feedback
		row.typ = typ
		result = append(result, row)
	}
	return result
}
