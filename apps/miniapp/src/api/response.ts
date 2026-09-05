import {
  ISSUE_STATUSES,
  ISSUE_TYPES,
  PROJECT_YEARS,
  type FileItem,
  type MineScope,
  type MineStats,
  type MiniappRegionsResult,
  type OrgTreeNode,
  type SliderStartResult,
  type SliderFinishResult,
} from "@gbnt/api-client";
import { QUIZ_DEFINITIONS } from "@/domain/issues/definitions";
import type {
  MiniappAuthUser,
  MiniappIssue,
  MiniappIssueListResult,
  MiniappLoginResult,
  MiniappMineIssueListResult,
} from "./types";

type JsonObject = Record<string, unknown>;

function invalid(field: string): never {
  throw new Error(`接口数据异常（${field}），请重试；若仍失败请联系管理员`);
}

function object(value: unknown, field: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid(field);
  return value as JsonObject;
}

function integer(value: unknown, field: string, minimum = 0): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum) return invalid(field);
  return value;
}

function text(value: unknown, field: string, optional = false): string {
  if (optional && value == null) return "";
  if (typeof value !== "string") return invalid(field);
  return value;
}

function displayText(value: unknown, field: string): string | null {
  return text(value, field, true).trim() || null;
}

function list(value: unknown, field: string, optional = false): unknown[] {
  if (optional && value == null) return [];
  if (!Array.isArray(value)) return invalid(field);
  return value;
}

function files(value: unknown, field: string): FileItem[] {
  return list(value, field, true).map((raw) => {
    const item = object(raw, field);
    const file_id = text(item.file_id, `${field}.file_id`);
    const url = text(item.url, `${field}.url`);
    if (!file_id.trim() || !url.trim()) return invalid(field);
    return { file_id, url };
  });
}

/** 只补空的展示字段；状态、题目答案及身份等关键业务数据损坏时必须显式失败。 */
export function parseIssue(value: unknown): MiniappIssue {
  const issue = object(value, "问题记录");
  integer(issue.id, "问题 ID", 1);
  if (!ISSUE_TYPES.includes(issue.type as never)) return invalid("问题类型");
  if (!ISSUE_STATUSES.includes(issue.status as never)) return invalid("问题状态");
  integer(issue.project_year, "项目年度", 1);
  if (!PROJECT_YEARS.includes(issue.project_year as never)) return invalid("项目年度");
  for (const field of ["org_id", "report_user_id", "assignee_user"] as const) {
    integer(issue[field], field);
  }
  const ext = object(issue.type_ext, "设施信息");
  const numericFields = [
    "outlet_total", "outlet_damaged", "casing_total", "casing_damaged",
    "length", "width", "thickness", "tree_survive", "handover_count",
    "existing_count", "survive_rate", "capacity",
  ];
  for (const field of numericFields) {
    const number = ext[field];
    if (number != null && (typeof number !== "number" || !Number.isFinite(number) || number < 0)) {
      return invalid(`设施信息.${field}`);
    }
  }
  const enumFields = {
    build_kind: ["new", "match"],
    kind: ["bridge", "culvert", "gate"],
    voltage: ["10kv", "0.4kv"],
  };
  for (const [field, allowed] of Object.entries(enumFields)) {
    if (ext[field] != null && ext[field] !== "" && !allowed.includes(String(ext[field]))) {
      return invalid(`设施信息.${field}`);
    }
  }
  const definitions = QUIZ_DEFINITIONS[issue.type as MiniappIssue["type"]];
  const seen = new Set<string>();
  const checklist = list(ext.checklist, "巡查题单").map((raw) => {
    const quiz = object(raw, "巡查题目");
    if (!definitions.some((definition) => definition.type === quiz.type) || seen.has(String(quiz.type))) {
      return invalid("巡查题目类型");
    }
    if (typeof quiz.value !== "boolean") return invalid("巡查答案");
    if (typeof quiz.mustImg !== "boolean") return invalid("照片必填规则");
    seen.add(String(quiz.type));
    return {
      ...quiz,
      desc: text(quiz.desc, "题目备注", true),
      files: list(quiz.files, "附件编号", true).map((id) => text(id, "附件编号")),
      photos: files(quiz.photos, "巡查照片"),
    };
  });
  if (seen.size !== definitions.length) return invalid("巡查题目缺失");
  if (issue.rectify_round !== undefined) integer(issue.rectify_round, "整改轮次");
  const records = list(issue.rectify_records, "整改记录", true).map((raw) => {
    const record = object(raw, "整改记录");
    integer(record.id, "整改记录 ID", 1);
    if (!definitions.some((definition) => definition.type === record.quiz_type)) return invalid("整改题目类型");
    if (record.round !== undefined) integer(record.round, "整改记录轮次");
    return {
      ...record,
      note: text(record.note, "整改说明", true),
      created_at: text(record.created_at, "整改时间", true),
      photos: files(record.photos, "整改照片"),
    };
  });
  const result: JsonObject = {
    ...issue,
    type_ext: {
      ...ext,
      checklist,
      keeper_name: text(ext.keeper_name, "负责人", true),
      keeper_phone: text(ext.keeper_phone, "联系电话", true),
    },
    rectify_records: records,
    reporter_signature: issue.reporter_signature == null ? undefined : files([issue.reporter_signature], "上报签名")[0],
    report_user_name: displayText(issue.report_user_name, "上报人名称"),
    assignee_user_name: displayText(issue.assignee_user_name, "整改人名称"),
    org_name: displayText(issue.org_name, "组织名称"),
    org_path: displayText(issue.org_path, "组织路径"),
  };
  const displayFields = [
    "code", "address", "issue_key", "plan_date", "created_at", "updated_at",
    "reporter_signature_file_id",
  ] as const;
  for (const field of displayFields) {
    result[field] = text(issue[field], field, true);
  }
  // 坐标缺失保持缺失，由地图和上传入口明确提示，不回填 (0, 0)。
  for (const field of ["lat", "lng"] as const) {
    if (issue[field] != null && (typeof issue[field] !== "number" || !Number.isFinite(issue[field]))) return invalid(field);
  }
  return result as unknown as MiniappIssue;
}

export function parseIssuePage(value: unknown): MiniappIssueListResult {
  const result = object(value, "问题分页");
  const total = integer(result.total, "总条数");
  const page = integer(result.page, "页码", 1);
  const size = integer(result.size, "每页条数", 1);
  if (result.list === undefined) return invalid("问题列表缺失");
  const rows = list(result.list, "问题列表", total === 0).map(parseIssue);
  if (rows.length > size || rows.length > total || (rows.length === 0 && total > (page - 1) * size)) {
    return invalid("分页条数不一致");
  }
  if (new Set(rows.map((row) => row.id)).size !== rows.length) return invalid("重复问题记录");
  return { list: rows, total, page, size };
}

export function parseMineIssuePage(value: unknown, scope: MineScope): MiniappMineIssueListResult {
  const result = object(value, "我的清单");
  if (result.scope !== scope) return invalid("清单分类不一致");
  return { ...parseIssuePage(value), scope };
}

export function parseMineStats(value: unknown): MineStats {
  const result = object(value, "我的统计");
  return {
    reported: integer(result.reported, "上报数量"),
    pending: integer(result.pending, "待整改数量"),
    done: integer(result.done, "已整改数量"),
  };
}

export function parseAuthUser(value: unknown): MiniappAuthUser {
  const user = object(value, "登录用户");
  integer(user.id, "用户 ID", 1);
  integer(user.org_id, "用户组织 ID");
  integer(user.role_id, "用户角色 ID");
  if (typeof user.is_super_admin !== "boolean") return invalid("管理员标识");
  // 旧服务的空授权 slice 可能是 null，只收敛为空权限，不扩大权限。
  const apis = user.apis === "*" ? "*" : list(user.apis, "用户接口权限", user.apis === null)
    .map((id) => integer(id, "接口权限 ID", 1));
  const username = text(user.username, "账号");
  if (!username.trim()) return invalid("账号");
  return {
    ...user,
    apis,
    username,
    name: text(user.name, "姓名", true),
    phone: text(user.phone, "电话", true),
    org_name: displayText(user.org_name, "组织名称"),
    org_path: displayText(user.org_path, "组织路径"),
    role_name: displayText(user.role_name, "角色名称"),
  } as MiniappAuthUser;
}

export function parseLogin(value: unknown): MiniappLoginResult {
  const result = object(value, "登录结果");
  const token = text(result.token, "登录凭证");
  const expires_at = text(result.expires_at, "凭证有效期");
  if (!token.trim() || !Number.isFinite(Date.parse(expires_at))) return invalid("登录凭证");
  return { token, expires_at, user: parseAuthUser(result.user) };
}

export function parseSliderStart(value: unknown): SliderStartResult {
  const result = object(value, "滑动验证");
  const slider_id = text(result.slider_id, "滑动会话");
  if (!slider_id.trim()) return invalid("滑动会话");
  return { slider_id, expire_seconds: integer(result.expire_seconds, "验证有效期", 1) };
}

export function parseSliderFinish(value: unknown): SliderFinishResult {
  const result = object(value, "验证结果");
  const pass_token = text(result.pass_token, "验证凭证");
  if (!pass_token.trim()) return invalid("验证凭证");
  return { pass_token, expire_seconds: integer(result.expire_seconds, "验证有效期", 1) };
}

export function parseRegions(value: unknown): MiniappRegionsResult {
  const result = object(value, "行政区划");
  if (result.list === undefined) return invalid("行政区划列表缺失");
  const seen = new Set<number>();
  function parseNode(value: unknown, depth: number): OrgTreeNode {
    if (depth > 20) return invalid("组织层级");
    const node = object(value, "组织节点");
    const id = integer(node.id, "组织 ID", 1);
    if (seen.has(id)) return invalid("重复组织");
    seen.add(id);
    const name = text(node.name, "组织名称");
    if (!name.trim()) return invalid("组织名称");
    if (!["root", "district", "street", "village"].includes(String(node.type))) return invalid("组织类型");
    return {
      ...node,
      id,
      name,
      children: list(node.children, "子组织", true).map((child) => parseNode(child, depth + 1)),
    } as OrgTreeNode;
  }
  return { list: list(result.list, "行政区划列表", true).map((node) => parseNode(node, 0)) };
}
