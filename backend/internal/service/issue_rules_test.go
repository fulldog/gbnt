package service

import (
	"context"
	"encoding/json"
	"strings"
	"testing"

	"gbnt/backend/internal/model"
)

func TestQuizIndicatesIssue(t *testing.T) {
	t.Parallel()
	yes := &QuizBool{Value: true}
	no := &QuizBool{Value: false}
	if quizIndicatesIssue(nil, false) != true {
		t.Fatal("nil quiz should count as issue")
	}
	if quizIndicatesIssue(yes, false) {
		t.Fatal("positive quiz yes should be ok")
	}
	if !quizIndicatesIssue(no, false) {
		t.Fatal("positive quiz no should be issue")
	}
	if !quizIndicatesIssue(yes, true) {
		t.Fatal("negative quiz yes should be issue")
	}
	if quizIndicatesIssue(no, true) {
		t.Fatal("negative quiz no should be ok")
	}
}

func TestBindQuizBoolRequiresDescAndFiles(t *testing.T) {
	t.Parallel()
	s := &IssueService{}
	q := &QuizBool{Value: false} // positive → issue
	_, err := s.bindQuizBool(context.Background(), q, "机井是否出水", false)
	if err == nil || !strings.Contains(err.Error(), "说明") {
		t.Fatalf("want desc error, got %v", err)
	}
	q.Desc = "不出水"
	if _, err = s.bindQuizBool(context.Background(), q, "机井是否出水", false); err != nil {
		t.Fatalf("mustImg=false should skip files: %v", err)
	}
	q.MustImg = true
	_, err = s.bindQuizBool(context.Background(), q, "机井是否出水", false)
	if err == nil || !strings.Contains(err.Error(), "照片") {
		t.Fatalf("want files error, got %v", err)
	}
}

func TestBindQuizBoolMustImgWithoutIssue(t *testing.T) {
	t.Parallel()
	s := &IssueService{}
	q := &QuizBool{Value: true, MustImg: true}
	_, err := s.bindQuizBool(context.Background(), q, "机井是否出水", false)
	if err == nil || !strings.Contains(err.Error(), "照片") {
		t.Fatalf("mustImg should require files even when no issue, got %v", err)
	}
}

func TestBindQuizBoolOKWhenNoIssue(t *testing.T) {
	t.Parallel()
	s := &IssueService{}
	q := &QuizBool{Value: true} // positive → ok, no desc/files needed
	issue, err := s.bindQuizBool(context.Background(), q, "机井是否出水", false)
	if err != nil || issue {
		t.Fatalf("issue=%v err=%v", issue, err)
	}
}

func TestValidateRegionOrgsChain(t *testing.T) {
	t.Parallel()
	s := &IssueService{}
	cases := []struct {
		name                            string
		root, district, street, village uint64
		wantSub                         string
	}{
		{"empty", 0, 0, 0, 0, "至少选择一级"},
		{"village without street", 1, 2, 0, 4, "村级"},
		{"street without district", 1, 0, 3, 0, "街道"},
		{"district without root", 0, 2, 0, 0, "区级"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, _, err := s.validateRegionOrgs(tc.root, tc.district, tc.street, tc.village)
			if err == nil || !strings.Contains(err.Error(), tc.wantSub) {
				t.Fatalf("err=%v want substring %q", err, tc.wantSub)
			}
		})
	}
}

func TestDeriveCreateStatus(t *testing.T) {
	t.Parallel()
	if got := deriveCreateStatus(true); got != model.IssueStatusNew {
		t.Fatalf("needs=true → %s", got)
	}
	if got := deriveCreateStatus(false); got != model.IssueStatusDone {
		t.Fatalf("needs=false → %s", got)
	}
}

func TestRectifyGate(t *testing.T) {
	t.Parallel()
	if err := rectifyGate(string(model.IssueStatusDone), true); err == nil || !strings.Contains(err.Error(), "重新整改") {
		t.Fatalf("done should reject: %v", err)
	}
	if err := rectifyGate(string(model.IssueStatusNew), false); err == nil {
		t.Fatal("needs_rectify=false should reject")
	}
	if err := rectifyGate(string(model.IssueStatusNew), true); err != nil {
		t.Fatal(err)
	}
	if err := rectifyGate(string(model.IssueStatusPending), true); err != nil {
		t.Fatal(err)
	}
}

func TestReRectifyGate(t *testing.T) {
	t.Parallel()
	if err := reRectifyGate(string(model.IssueStatusNew), true); err == nil {
		t.Fatal("new should reject")
	}
	if err := reRectifyGate(string(model.IssueStatusDone), false); err == nil || !strings.Contains(err.Error(), "无问题") {
		t.Fatalf("no-problem done: %v", err)
	}
	if err := reRectifyGate(string(model.IssueStatusDone), true); err != nil {
		t.Fatal(err)
	}
}

func TestParseFileIDJSON(t *testing.T) {
	t.Parallel()
	if parseFileIDJSON("") != nil {
		t.Fatal("empty")
	}
	got := parseFileIDJSON(`["a","b"]`)
	if len(got) != 2 || got[0] != "a" || got[1] != "b" {
		t.Fatalf("got %v", got)
	}
}

func TestIssueVOMarshalTypeExtObject(t *testing.T) {
	t.Parallel()
	vo := IssueVO{
		Issue:     model.Issue{TypeExt: `{"keep":1}`, Type: "road"},
		TypeExtVO: json.RawMessage(`{"checklist":[{"type":"has_ash","value":true,"files":[],"photos":[]}]}`),
	}
	b, err := json.Marshal(vo)
	if err != nil {
		t.Fatal(err)
	}
	var m map[string]any
	if err := json.Unmarshal(b, &m); err != nil {
		t.Fatal(err)
	}
	ext, ok := m["type_ext"].(map[string]any)
	if !ok {
		t.Fatalf("type_ext should be object, got %T %s", m["type_ext"], b)
	}
	if _, ok := ext["checklist"]; !ok {
		t.Fatalf("hydrated ext missing checklist: %v", ext)
	}
}

func TestIssueEnumsValid(t *testing.T) {
	t.Parallel()
	if !model.IssueTypeWell.Valid() || model.IssueType("other").Valid() {
		t.Fatal("IssueType")
	}
	if !model.ProjectYear(2023).Valid() || model.ProjectYear(2019).Valid() {
		t.Fatal("ProjectYear")
	}
	if !model.IssueStatusNew.Valid() || model.IssueStatus("inspected").Valid() {
		t.Fatal("IssueStatus")
	}
	if !model.QuizWaterOut.Valid() || model.QuizType("other").Valid() {
		t.Fatal("QuizType")
	}
}

func TestBindChecklistRejectsWrongAndDuplicate(t *testing.T) {
	t.Parallel()
	s := &IssueService{}
	_, _, err := s.bindChecklist(context.Background(), []QuizBool{{Type: model.QuizHasAsh, Value: true}}, wellChecklistSpecs)
	if err == nil || !strings.Contains(err.Error(), "不适用于") {
		t.Fatalf("want type mismatch, got %v", err)
	}
	dup := []QuizBool{
		{Type: model.QuizHasShoulder, Value: true},
		{Type: model.QuizHasShoulder, Value: false},
	}
	_, _, err = s.bindChecklist(context.Background(), dup, roadChecklistSpecs)
	if err == nil || !strings.Contains(err.Error(), "重复") {
		t.Fatalf("want duplicate, got %v", err)
	}
}

func TestBindChecklistOK(t *testing.T) {
	t.Parallel()
	s := &IssueService{}
	list := []QuizBool{
		{Type: model.QuizHasAsh, Value: true},
		{Type: model.QuizHasShoulder, Value: true},
	}
	out, needs, err := s.bindChecklist(context.Background(), list, roadChecklistSpecs)
	if err != nil || needs {
		t.Fatalf("needs=%v err=%v", needs, err)
	}
	if len(out) != 2 || out[0].Type != model.QuizHasShoulder || out[1].Type != model.QuizHasAsh {
		t.Fatalf("canonical order: %+v", out)
	}
}
