import type { Issue } from "@gbnt/api-client";

export interface DetailField {
  label: string;
  value: string | number;
}

const bridgeKindLabels = { bridge: "桥", culvert: "涵", gate: "闸" } as const;
const buildKindLabels = { new: "新建", match: "配套" } as const;

export function issueExtensionFields(issue: Issue): DetailField[] {
  switch (issue.type) {
    case "well":
      return [
        { label: "设施类型", value: buildKindLabels[issue.type_ext.build_kind] },
        { label: "出水口总数", value: issue.type_ext.outlet_total },
        { label: "出水口损坏", value: issue.type_ext.outlet_damaged },
        { label: "护筒总数", value: issue.type_ext.casing_total },
        { label: "护筒损坏", value: issue.type_ext.casing_damaged },
        { label: "负责人", value: issue.type_ext.keeper_name || "—" },
        { label: "联系电话", value: issue.type_ext.keeper_phone || "—" },
      ];
    case "road":
      return [
        { label: "长度（千米）", value: issue.type_ext.length },
        { label: "宽度（米）", value: issue.type_ext.width },
        { label: "厚度（米）", value: issue.type_ext.thickness },
        { label: "林网树木存活数量", value: issue.type_ext.tree_survive },
        { label: "负责人", value: issue.type_ext.keeper_name || "—" },
        { label: "联系电话", value: issue.type_ext.keeper_phone || "—" },
      ];
    case "bridge":
      return [
        { label: "设施类型", value: bridgeKindLabels[issue.type_ext.kind] },
        { label: "长度（米）", value: issue.type_ext.length },
        { label: "宽度（米）", value: issue.type_ext.width },
        { label: "负责人", value: issue.type_ext.keeper_name || "—" },
        { label: "联系电话", value: issue.type_ext.keeper_phone || "—" },
      ];
    case "forest":
      return [
        { label: "移交株数", value: issue.type_ext.handover_count },
        { label: "现有株数", value: issue.type_ext.existing_count },
        { label: "存活率", value: `${issue.type_ext.survive_rate}%` },
        { label: "负责人", value: issue.type_ext.keeper_name || "—" },
        { label: "联系电话", value: issue.type_ext.keeper_phone || "—" },
      ];
    case "transformer":
      return [
        { label: "容量（kVA）", value: issue.type_ext.capacity },
        { label: "型号", value: issue.type_ext.model || "—" },
        { label: "电压等级", value: issue.type_ext.voltage === "10kv" ? "10kV" : "0.4kV" },
        { label: "负责人", value: issue.type_ext.keeper_name || "—" },
        { label: "联系电话", value: issue.type_ext.keeper_phone || "—" },
      ];
  }
}
