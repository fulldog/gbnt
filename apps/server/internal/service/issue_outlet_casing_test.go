package service

import (
	"context"
	"encoding/json"
	"strings"
	"testing"

	"gbnt/apps/server/internal/model"
)

func TestEnsureWellOutletCasingQuiz(t *testing.T) {
	t.Parallel()
	raw := `{"keeper_name":"井长","outlet_total":3,"outlet_damaged":1,"casing_total":2,"casing_damaged":0,"checklist":[{"type":"water_out","value":true,"desc":"正常","mustImg":true,"files":["a"]}]}`
	next, changed, err := ensureWellOutletCasingExt(raw)
	if err != nil || !changed {
		t.Fatalf("changed=%v err=%v", changed, err)
	}
	if !strings.Contains(next, `"keeper_name":"井长"`) {
		t.Fatalf("其它字段被改写：%s", next)
	}
	var ext WellExt
	if err := json.Unmarshal([]byte(next), &ext); err != nil {
		t.Fatal(err)
	}
	last := ext.Checklist[len(ext.Checklist)-1]
	if last.Type != model.QuizOutletCasingDamaged || !last.Value || last.MustImg || last.Desc != "出水口损坏 1 个" {
		t.Fatalf("补项不正确：%+v", last)
	}
	again, changed, err := ensureWellOutletCasingExt(next)
	if err != nil || changed || again != next {
		t.Fatal("已有排查项 A 不应重写")
	}

	kept := strings.Replace(raw, `"checklist":[`, `"checklist":[{"type":"outlet_casing_damaged","value":false,"desc":"前端答案","mustImg":false,"files":[]},`, 1)
	kept = strings.Replace(kept, `"outlet_damaged":1`, `"outlet_damaged":2`, 1)
	same, changed, err := ensureWellOutletCasingExt(kept)
	if err != nil || changed || !strings.Contains(same, `"desc":"前端答案"`) {
		t.Fatalf("前端已传答案被覆盖：changed=%v err=%v %s", changed, err, same)
	}

	none := `{"outlet_damaged":0,"casing_damaged":0,"checklist":[]}`
	added, _, err := ensureWellOutletCasingExt(none)
	if err != nil || !strings.Contains(added, `"outlet_casing_damaged"`) || strings.Contains(added, `"value":true`) {
		t.Fatalf("无损坏不应判为需要整改：%v %s", err, added)
	}
}

func TestWellFormBackfillsOutletCasingAndKeepsClientAnswer(t *testing.T) {
	t.Parallel()
	s := &IssueService{}
	raw := formTestExt(t, "well")
	canon, needs, err := s.normalizeTypeExt(context.Background(), "well", raw)
	if err != nil || needs {
		t.Fatalf("needs=%v err=%v", needs, err)
	}
	var ext WellExt
	if err := json.Unmarshal([]byte(canon), &ext); err != nil {
		t.Fatal(err)
	}
	if len(ext.Checklist) != 6 || ext.Checklist[5].Type != model.QuizOutletCasingDamaged || ext.Checklist[5].Value {
		t.Fatalf("新版五题应补上不需整改的 A：%+v", ext.Checklist)
	}
	if got := neededQuizTypes("well", canon); len(got) != 0 {
		t.Fatal(got)
	}
	damaged := strings.Replace(string(raw), `"outlet_damaged":0`, `"outlet_damaged":2`, 1)
	damaged = strings.Replace(damaged, `"casing_damaged":0`, `"casing_damaged":1`, 1)
	canon, needs, err = s.normalizeTypeExt(context.Background(), "well", json.RawMessage(damaged))
	if err != nil || !needs {
		t.Fatalf("损坏数量应需要整改：%v %v", needs, err)
	}
	if got := neededQuizTypes("well", canon); len(got) != 1 || got[0] != model.QuizOutletCasingDamaged {
		t.Fatalf("A 未进入需整改类型：%v", got)
	}
	if !strings.Contains(canon, "出水口损坏 2 个，护筒损坏 1 个") {
		t.Fatalf("说明未写入数量：%s", canon)
	}

	answered := strings.Replace(string(raw), `"checklist":[`, `"checklist":[{"type":"outlet_casing_damaged","value":false,"desc":"现场完好","mustImg":false,"files":[]},`, 1)
	answered = strings.Replace(answered, `"outlet_damaged":0`, `"outlet_damaged":1`, 1)
	canon, _, err = s.normalizeTypeExt(context.Background(), "well", json.RawMessage(answered))
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(canon, "出水口损坏") || !strings.Contains(canon, "现场完好") {
		t.Fatalf("不应覆盖前端已传的 A：%s", canon)
	}
	if got := neededQuizTypes("well", canon); len(got) != 0 {
		t.Fatalf("前端判定为否时不要求整改该项：%v", got)
	}
}

func TestReportProblemStateIgnoresMissingOutletCasingQuiz(t *testing.T) {
	t.Parallel()
	historical := `{"schema_version":2,"outlet_total":2,"outlet_damaged":0,"casing_total":2,"casing_damaged":0,"checklist":[{"type":"water_out","value":true},{"type":"pipe_ok","value":true},{"type":"wiring_ok","value":true},{"type":"box_ok","value":true},{"type":"cover_ok","value":true}]}`
	if problem, known := reportProblemState(model.Issue{Type: "well", TypeExt: historical}); problem || !known {
		t.Fatalf("缺 A 的历史机井应仍可识别：problem=%v known=%v", problem, known)
	}
	withA := strings.Replace(historical, `"checklist":[`, `"checklist":[{"type":"outlet_casing_damaged","value":true},`, 1)
	if problem, known := reportProblemState(model.Issue{Type: "well", TypeExt: withA}); !problem || !known {
		t.Fatalf("已补上且判定损坏的 A 应计为问题：problem=%v known=%v", problem, known)
	}
}
