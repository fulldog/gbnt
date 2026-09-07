package service

import (
	"context"
	"database/sql/driver"
	"encoding/json"
	"regexp"
	"strings"
	"testing"
	"time"

	"gbnt/apps/server/internal/model"
	"gbnt/apps/server/internal/testutil"
)

func formTestExt(t *testing.T, typ string) json.RawMessage {
	t.Helper()
	attributes := map[string]string{
		"well":        `{"build_kind":"match","outlet_total":7,"outlet_damaged":0,"casing_total":6,"casing_damaged":0,"panorama_files":["panorama"]}`,
		"road":        `{"length":1.25,"width":4,"thickness":0.2}`,
		"bridge":      `{"kind":"culvert","length":18,"width":5}`,
		"forest":      `{"handover_count":180,"existing_count":175}`,
		"transformer": `{"capacity":80,"model":"S11","voltage":"10kv"}`,
	}
	questions := map[string][]string{
		"well":   {"water_out", "pipe_ok", "wiring_ok", "box_ok", "cover_ok"},
		"road":   {"has_shoulder", "has_ash", "has_road_damage"},
		"bridge": {"needs_rectify"}, "forest": {"broken_belt", "dead_trees", "pest"},
		"transformer": {"powered", "device_ok", "cabinet_ok", "illegal_wire"},
	}
	negative := map[string]bool{"has_road_damage": true, "needs_rectify": true, "broken_belt": true, "dead_trees": true, "pest": true, "illegal_wire": true}
	var data map[string]any
	if err := json.Unmarshal([]byte(attributes[typ]), &data); err != nil {
		t.Fatal(err)
	}
	list := []map[string]any{}
	for _, q := range questions[typ] {
		list = append(list, map[string]any{"type": q, "value": !negative[q], "desc": "原说明", "files": []string{q + "-1", q + "-2"}})
	}
	data["schema_version"], data["checklist"] = 2, list
	raw, _ := json.Marshal(data)
	return raw
}

func TestFiveFormSchemasAndLegacyRules(t *testing.T) {
	s := &IssueService{}
	for _, typ := range []string{"well", "road", "bridge", "forest", "transformer"} {
		t.Run(typ, func(t *testing.T) {
			canon, needs, err := s.normalizeTypeExt(context.Background(), typ, formTestExt(t, typ))
			if err != nil || needs || issueExtVersion(json.RawMessage(canon)) != 2 {
				t.Fatalf("needs=%v error=%v ext=%s", needs, err, canon)
			}
			if problem, known := reportProblemState(model.Issue{Type: typ, TypeExt: canon}); problem || !known {
				t.Fatalf("新版表单应能被台账识别：problem=%v known=%v", problem, known)
			}
		})
	}
	legacy := `{"length":1,"width":2,"thickness":0.2,"tree_survive":42,"checklist":[{"type":"has_shoulder","value":false,"desc":"旧问题"},{"type":"has_ash","value":true}]}`
	_, needs, err := s.normalizeTypeExt(context.Background(), "road", json.RawMessage(legacy))
	if err != nil || !needs {
		t.Fatalf("旧小程序规则发生变化：%v, %v", needs, err)
	}
	if got := neededQuizTypes("road", legacy); len(got) != 1 || got[0] != model.QuizHasShoulder {
		t.Fatal(got)
	}
	modern := strings.ReplaceAll(string(formTestExt(t, "road")), `"value":true`, `"value":false`)
	_, needs, err = s.normalizeTypeExt(context.Background(), "road", json.RawMessage(modern))
	if err != nil || needs || len(neededQuizTypes("road", modern)) != 0 {
		t.Fatalf("新版路肩/灰土层仅记录现状：%v %v", needs, err)
	}
	if problem, known := reportProblemState(model.Issue{Type: "road", TypeExt: modern}); problem || !known {
		t.Fatalf("台账应使用新版道路判定：problem=%v known=%v", problem, known)
	}
	damaged := strings.Replace(modern, `"type":"has_road_damage","value":false`, `"type":"has_road_damage","value":true`, 1)
	if problem, known := reportProblemState(model.Issue{Type: "road", TypeExt: damaged}); !problem || !known {
		t.Fatalf("台账应识别新增道路损坏项：problem=%v known=%v", problem, known)
	}
}

func TestFormRejectsIncompleteOrMismatchedAnswersAndPhotoProof(t *testing.T) {
	s := &IssueService{}
	well := string(formTestExt(t, "well"))
	for name, raw := range map[string]string{
		"缺少全景":   strings.Replace(well, `"panorama_files":["panorama"]`, `"panorama_files":[]`, 1),
		"出水少于两张": strings.Replace(well, `"water_out-1","water_out-2"`, `"water_out-1","water_out-1"`, 1),
		"答案缺失":   strings.Replace(well, `"value":true`, `"value":null`, 1),
		"跨类型题目":  strings.Replace(well, `"water_out"`, `"has_road_damage"`, 1),
	} {
		t.Run(name, func(t *testing.T) {
			if _, _, err := s.normalizeTypeExt(context.Background(), "well", json.RawMessage(raw)); err == nil {
				t.Fatal("不应通过校验")
			}
		})
	}
}

func TestUpgradePreservesHistoricalQuestionAndAttributes(t *testing.T) {
	old := `{"build_kind":"new","keeper_name":"井长","checklist":[{"type":"transformer_ok","value":false,"desc":"旧问题","files":["old-file"]}]}`
	raw, err := mergeIssueFormHistory(old, formTestExt(t, "well"), "well")
	if err != nil {
		t.Fatal(err)
	}
	canon, _, err := (&IssueService{}).normalizeTypeExt(context.Background(), "well", raw)
	if err != nil {
		t.Fatal(err)
	}
	var ext WellExt
	_ = json.Unmarshal([]byte(canon), &ext)
	if ext.KeeperName != "井长" || len(ext.LegacyChecklist) != 1 || ext.LegacyChecklist[0].Files[0] != "old-file" || len(ext.Checklist) != 5 {
		t.Fatalf("历史丢失：%s", canon)
	}
}

func TestFormRejectsFractionalTreeCounts(t *testing.T) {
	raw := strings.Replace(string(formTestExt(t, "forest")), `"existing_count":175`, `"existing_count":175.5`, 1)
	if _, _, err := (&IssueService{}).normalizeTypeExt(context.Background(), "forest", json.RawMessage(raw)); err == nil {
		t.Fatal("林网株数不能为小数")
	}
}

func TestEditorValidatesPartialUpdatesAgainstStoredForm(t *testing.T) {
	empty := ""
	road := string(formTestExt(t, "road"))
	well := strings.Replace(string(formTestExt(t, "well")), `"outlet_damaged":0`, `"outlet_damaged":1`, 1)
	legacyRoad := `{"schema_version":1,"length":1,"width":4,"thickness":0.2,"tree_survive":42,"checklist":[{"type":"has_shoulder","value":false,"desc":"旧问题"},{"type":"has_ash","value":true}]}`
	for _, tc := range []struct {
		name, typ, ext, message string
		input                   IssueUpdateInput
	}{
		{"清除损坏机井日期", "well", well, "整改计划日期", IssueUpdateInput{PlanDate: &empty}},
		{"清除旧道路日期", "road", legacyRoad, "整改计划日期", IssueUpdateInput{PlanDate: &empty}},
		{"清空新版编号", "road", road, "设施编号", IssueUpdateInput{Code: &empty}},
		{"新版降级", "road", road, "不能降级", IssueUpdateInput{TypeExt: json.RawMessage(legacyRoad)}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			db := testutil.NewTransactionDB(t,
				testutil.QueryStep{Kind: "begin"},
				testutil.QueryStep{Contains: "FOR UPDATE", Columns: []string{"id", "type", "type_ext", "plan_date", "code"}, Rows: [][]driver.Value{{int64(9), tc.typ, tc.ext, "2026-09-15", "01号"}}},
				testutil.QueryStep{Kind: "rollback"},
			)
			if _, err := (&IssueService{DB: db}).Update(context.Background(), 9, tc.input); err == nil || !strings.Contains(err.Error(), tc.message) {
				t.Fatalf("应拒绝不完整的局部更新：%v", err)
			}
		})
	}
}

func TestEditorSavesAllFiveTypesAndPreservesHistory(t *testing.T) {
	for _, typ := range []string{"well", "road", "bridge", "forest", "transformer"} {
		t.Run(typ, func(t *testing.T) {
			stored := formTestExt(t, typ)
			updated := time.Date(2026, 9, 7, 8, 0, 0, 0, time.UTC)
			columns := []string{"id", "type", "code", "org_id", "project_year", "status", "rectify_round", "type_ext", "reporter_signature_file_id", "updated_at", "reporter_name", "reporter_phone"}
			readRows := [][]driver.Value{{int64(9), typ, "01号", int64(12), int64(2022), "done", int64(2), string(stored), "old-signature", updated, "原上报人", "13800000001"}}
			newName, newPhone, newSignature := "新上报人", "13900000001", "new-signature"
			input := IssueUpdateInput{TypeExt: stored, ReporterName: &newName, ReporterPhone: &newPhone, ReporterSignatureFileID: &newSignature, ExpectedUpdatedAt: &updated}
			db := testutil.NewTransactionDB(t,
				testutil.QueryStep{Kind: "begin"}, testutil.QueryStep{Contains: "FOR UPDATE", Columns: columns, Rows: readRows},
				testutil.QueryStep{Kind: "exec", Contains: "UPDATE `issues`", Check: func(query string, args []driver.NamedValue) {
					if strings.Contains(query, "`status`=") || strings.Contains(query, "`rectify_round`=") || strings.Contains(query, "`assignee_user`=") {
						t.Fatalf("意外改写状态或责任人：%s", query)
					}
					matches := regexp.MustCompile("`([a-z_]+)`=\\?").FindAllStringSubmatch(query, -1)
					values := map[string]any{}
					for i, m := range matches {
						values[m[1]] = args[i].Value
					}
					if values["reporter_name"] != newName || values["reporter_phone"] != newPhone || values["reporter_signature_file_id"] != newSignature {
						t.Fatalf("上报信息没有保存：%v", values)
					}
					readRows[0][7] = values["type_ext"]
					readRows[0][8] = newSignature
					readRows[0][10] = newName
					readRows[0][11] = newPhone
				}}, testutil.QueryStep{Kind: "commit"}, testutil.QueryStep{Contains: "FROM `issues`", Columns: columns, Rows: readRows},
				testutil.QueryStep{Contains: "FROM `issue_rectify_records`", Columns: []string{"id", "quiz_type", "round"}, Rows: [][]driver.Value{{int64(10), "pipe_ok", int64(1)}}},
			)
			got, err := (&IssueService{DB: db}).Update(context.Background(), 9, input)
			if err != nil {
				t.Fatal(err)
			}
			if got.ReporterName != newName || got.ReporterSignatureFileID != newSignature || len(got.RectifyRecords) != 1 || got.RectifyRound != 2 {
				t.Fatalf("保存回读不完整：%+v", got)
			}
		})
	}
}

func TestEditorRejectsStaleSnapshotAndTypeChangeWithHistory(t *testing.T) {
	for _, stale := range []bool{true, false} {
		t.Run(map[bool]string{true: "过期快照", false: "跨类型历史"}[stale], func(t *testing.T) {
			now := time.Date(2026, 9, 7, 8, 0, 0, 0, time.UTC)
			old := now.Add(-time.Hour)
			typ := "road"
			steps := []testutil.QueryStep{{Kind: "begin"}, {Contains: "FOR UPDATE", Columns: []string{"id", "type", "updated_at"}, Rows: [][]driver.Value{{int64(9), "well", now}}}}
			input := IssueUpdateInput{Type: &typ, TypeExt: formTestExt(t, "road")}
			if stale {
				input.ExpectedUpdatedAt = &old
			} else {
				steps = append(steps, testutil.QueryStep{Contains: "FROM `issue_rectify_records`", Columns: []string{"count"}, Rows: [][]driver.Value{{int64(1)}}})
			}
			steps = append(steps, testutil.QueryStep{Kind: "rollback"})
			_, err := (&IssueService{DB: testutil.NewTransactionDB(t, steps...)}).Update(context.Background(), 9, input)
			if err == nil {
				t.Fatal("不应覆盖")
			}
		})
	}
}
