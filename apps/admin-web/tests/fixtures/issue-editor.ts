import type { IssueType } from "@gbnt/api-client";
import type { AdminIssue } from "@/api/types";

const questions = {
  well: ["water_out", "pipe_ok", "wiring_ok", "box_ok", "cover_ok"],
  road: ["has_shoulder", "has_ash", "has_road_damage"],
  bridge: ["needs_rectify"], forest: ["broken_belt", "dead_trees", "pest"],
  transformer: ["powered", "device_ok", "cabinet_ok", "illegal_wire"],
} as const;
const negative = new Set(["has_road_damage", "needs_rectify", "broken_belt", "dead_trees", "pest", "illegal_wire"]);
export function editorIssue(type: IssueType, id = 9): AdminIssue {
  const attributes = {
    well: { build_kind: "match", outlet_total: 7, outlet_damaged: 0, casing_total: 6, casing_damaged: 0, panorama_files: ["panorama-original"], panorama_photos: [{ file_id: "panorama-original", url: "/panorama.png" }] },
    road: { length: 1.25, width: 4, thickness: 0.2 }, bridge: { kind: "culvert", length: 18, width: 5 },
    forest: { handover_count: 180, existing_count: 175 }, transformer: { capacity: 80, model: "S11-80", voltage: "10kv" },
  };
  return {
    id, type, issue_key: `issue-${id}`, org_id: 12, org_name: "测试村", org_path: "测试街道 / 测试村", project_year: 2022, code: "01号", address: "村东",
    lat: 36.4, lng: 115.9, report_user_id: 7, report_user_name: "张三", reporter_name: "张三", reporter_phone: "13800000001", assignee_user: 15,
    status: "done", plan_date: "", rectify_round: 2, rectify_records: [], reporter_signature_file_id: "original-signature",
    reporter_signature: { file_id: "original-signature", url: "/signature.png" }, created_at: "2026-09-01T08:00:00Z", updated_at: "2026-09-07T08:00:00Z", created_id: 7, updated_id: 7, is_delete: 0,
    type_ext: { ...attributes[type], schema_version: 2, keeper_name: "旧负责人", keeper_phone: "13900000001", checklist: questions[type].map((type) => ({
      type, value: !negative.has(type), desc: `原备注-${type}`, mustImg: !["has_shoulder", "has_ash", "wiring_ok"].includes(type),
      files: [`${type}-1`, `${type}-2`], photos: [{ file_id: `${type}-1`, url: `/${type}.png` }, { file_id: `${type}-2`, url: `/${type}-2.png` }],
    })) },
  } as AdminIssue;
}
