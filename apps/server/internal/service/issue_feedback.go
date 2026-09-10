package service

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"unicode/utf8"

	"gbnt/apps/server/internal/database"
	"gbnt/apps/server/internal/model"
)

// ErrIssueReporterOnly 禁止删除他人的上报；由接口映射为 403。
var ErrIssueReporterOnly = errors.New("仅上报人本人可以删除该工单")

// IssueFeedbackInput 小程序整单整改反馈；后端在行锁内确定本轮尚未完成的整改项。
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

// SubmitFeedback 一份说明和照片原子完成本轮剩余整改项；仅整改人本人可提交。
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
	return s.rectifyPrepared(ctx, id, in.ExpectedRound, true, []preparedRectification{{note: note, photo: string(photos)}}, true)
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
