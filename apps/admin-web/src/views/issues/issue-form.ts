import type {
  AdminCreateIssueInput,
  BridgeKind,
  BridgeTypeExt,
  FacilityBuildKind,
  ForestTypeExt,
  IssueType,
  ProjectYear,
  QuizBool,
  QuizType,
  RoadTypeExt,
  TransformerVoltage,
  TransformerTypeExt,
  WellTypeExt,
} from "@gbnt/api-client";
import { QUIZ_DEFINITIONS, quizIndicatesIssue } from "@/constants/issue";

export interface ChecklistDraft {
  type: QuizType;
  label: string;
  negative: boolean;
  mustImg: boolean;
  value: boolean | null;
  desc: string;
  files: string[];
}

export interface IssueFormDraft {
  type: IssueType;
  project_year: ProjectYear;
  org_id?: number;
  code: string;
  address: string;
  lat?: number;
  lng?: number;
  plan_date: string;
  report_user_id?: number;
  build_kind: FacilityBuildKind;
  outlet_total: number | undefined;
  outlet_damaged: number | undefined;
  casing_total: number | undefined;
  casing_damaged: number | undefined;
  length: number | undefined;
  width: number | undefined;
  thickness: number | undefined;
  tree_survive: number | undefined;
  bridge_kind: BridgeKind;
  handover_count: number | undefined;
  existing_count: number | undefined;
  survive_rate: number | undefined;
  capacity: number | undefined;
  model: string;
  voltage: TransformerVoltage;
  keeper_name: string;
  keeper_phone: string;
  checklist: ChecklistDraft[];
}

export function createChecklist(type: IssueType): ChecklistDraft[] {
  return QUIZ_DEFINITIONS[type].map((item) => ({
    ...item,
    value: null,
    desc: "",
    files: [],
  }));
}

export function createIssueDraft(reportUserId?: number): IssueFormDraft {
  return {
    type: "well",
    project_year: 2023,
    org_id: undefined,
    code: "",
    address: "",
    lat: undefined,
    lng: undefined,
    plan_date: "",
    report_user_id: reportUserId,
    build_kind: "new",
    outlet_total: 0,
    outlet_damaged: 0,
    casing_total: 0,
    casing_damaged: 0,
    length: 0,
    width: 0,
    thickness: 0,
    tree_survive: 0,
    bridge_kind: "bridge",
    handover_count: 0,
    existing_count: 0,
    survive_rate: 0,
    capacity: 0,
    model: "",
    voltage: "10kv",
    keeper_name: "",
    keeper_phone: "",
    checklist: createChecklist("well"),
  };
}

export function draftNeedsRectify(draft: IssueFormDraft): boolean {
  if (
    draft.type === "well" &&
    ((draft.outlet_damaged ?? 0) > 0 || (draft.casing_damaged ?? 0) > 0)
  ) {
    return true;
  }
  return draft.checklist.some(
    (item) => item.value !== null && quizIndicatesIssue(item.value, item.negative),
  );
}

export function validateChecklist(draft: IssueFormDraft): string | null {
  for (const item of draft.checklist) {
    if (item.value === null) return `请选择“${item.label}”`;
    if (quizIndicatesIssue(item.value, item.negative) && !item.desc.trim()) {
      return `请填写“${item.label}”的说明`;
    }
    if (item.mustImg && item.files.length === 0) {
      return `请上传“${item.label}”的现场照片`;
    }
  }
  if (draft.type === "well") {
    if ((draft.outlet_damaged ?? 0) > (draft.outlet_total ?? 0)) return "出水口损坏数量不能大于总数";
    if ((draft.casing_damaged ?? 0) > (draft.casing_total ?? 0)) return "护筒损坏数量不能大于总数";
  }
  if (draft.type === "forest" && (draft.survive_rate ?? 0) > 100) return "存活率不能大于 100";
  if (draftNeedsRectify(draft) && !draft.plan_date) return "请选择计划整改完成日期";
  return null;
}

function checklistOf(draft: IssueFormDraft): QuizBool[] {
  return draft.checklist.map((item) => ({
    type: item.type,
    value: item.value ?? false,
    desc: item.desc.trim(),
    mustImg: item.mustImg,
    files: [...item.files],
  }));
}

export function buildCreateInput(
  draft: IssueFormDraft,
  reporterSignatureFileId: string,
): AdminCreateIssueInput {
  if (!draft.org_id || !draft.report_user_id) throw new Error("组织和上报人必填");
  const common = {
    project_year: draft.project_year,
    org_id: draft.org_id,
    code: draft.code.trim(),
    address: draft.address.trim(),
    lat: draft.lat,
    lng: draft.lng,
    plan_date: draftNeedsRectify(draft) ? draft.plan_date : "",
    reporter_signature_file_id: reporterSignatureFileId,
    report_user_id: draft.report_user_id,
  };
  const checklist = checklistOf(draft);

  switch (draft.type) {
    case "well":
      return {
        ...common,
        type: "well",
        type_ext: {
          build_kind: draft.build_kind,
          checklist: checklist as WellTypeExt["checklist"],
          outlet_total: draft.outlet_total ?? 0,
          outlet_damaged: draft.outlet_damaged ?? 0,
          casing_total: draft.casing_total ?? 0,
          casing_damaged: draft.casing_damaged ?? 0,
          keeper_name: draft.keeper_name.trim(),
          keeper_phone: draft.keeper_phone.trim(),
        },
      } as AdminCreateIssueInput;
    case "road":
      return {
        ...common,
        type: "road",
        type_ext: {
          length: draft.length ?? 0,
          width: draft.width ?? 0,
          thickness: draft.thickness ?? 0,
          checklist: checklist as RoadTypeExt["checklist"],
          tree_survive: draft.tree_survive ?? 0,
          keeper_name: draft.keeper_name.trim(),
          keeper_phone: draft.keeper_phone.trim(),
        },
      } as AdminCreateIssueInput;
    case "bridge":
      return {
        ...common,
        type: "bridge",
        type_ext: {
          kind: draft.bridge_kind,
          length: draft.length ?? 0,
          width: draft.width ?? 0,
          checklist: checklist as BridgeTypeExt["checklist"],
          keeper_name: draft.keeper_name.trim(),
          keeper_phone: draft.keeper_phone.trim(),
        },
      } as AdminCreateIssueInput;
    case "forest":
      return {
        ...common,
        type: "forest",
        type_ext: {
          handover_count: draft.handover_count ?? 0,
          existing_count: draft.existing_count ?? 0,
          survive_rate: draft.survive_rate ?? 0,
          checklist: checklist as ForestTypeExt["checklist"],
          keeper_name: draft.keeper_name.trim(),
          keeper_phone: draft.keeper_phone.trim(),
        },
      } as AdminCreateIssueInput;
    case "transformer":
      return {
        ...common,
        type: "transformer",
        type_ext: {
          capacity: draft.capacity ?? 0,
          model: draft.model.trim(),
          voltage: draft.voltage,
          checklist: checklist as TransformerTypeExt["checklist"],
          keeper_name: draft.keeper_name.trim(),
          keeper_phone: draft.keeper_phone.trim(),
        },
      } as AdminCreateIssueInput;
  }
}
