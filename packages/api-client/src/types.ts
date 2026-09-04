export interface BaseRecord {
  id: number;
  created_at: string;
  updated_at: string;
  created_id: number;
  updated_id: number;
  is_delete: number;
}

export interface FileItem {
  file_id: string;
  url: string;
}

export interface HealthResult {
  status: "ok";
}

export interface CaptchaResult {
  captcha_id: string;
  image_base64: string;
  expire_seconds: number;
}

export type ApiPermission = "*" | number[];

export interface AuthUser {
  id: number;
  username: string;
  name: string;
  phone: string;
  org_id: number;
  role_id: number;
  is_super_admin: boolean;
  apis: ApiPermission;
}

export interface LoginResult {
  token: string;
  expires_at: string;
  user: AuthUser;
}

export interface PasswordInput {
  old_password: string;
  new_password: string;
  confirm_password: string;
}

export const ISSUE_TYPES = [
  "well",
  "road",
  "bridge",
  "forest",
  "transformer",
] as const;
export type IssueType = (typeof ISSUE_TYPES)[number];

export const PROJECT_YEARS = [2020, 2021, 2022, 2023] as const;
export type ProjectYear = (typeof PROJECT_YEARS)[number];

export const ISSUE_STATUSES = ["new", "pending", "done"] as const;
export type IssueStatus = (typeof ISSUE_STATUSES)[number];

export type FacilityBuildKind = "new" | "match";
export type BridgeKind = "bridge" | "culvert" | "gate";
export type TransformerVoltage = "10kv" | "0.4kv";

export type QuizType =
  | "water_out"
  | "pipe_ok"
  | "wiring_ok"
  | "box_ok"
  | "cover_ok"
  | "transformer_ok"
  | "has_shoulder"
  | "has_ash"
  | "needs_rectify"
  | "broken_belt"
  | "dead_trees"
  | "pest"
  | "powered"
  | "device_ok"
  | "cabinet_ok"
  | "illegal_wire";

export type WellQuizType =
  | "water_out"
  | "pipe_ok"
  | "wiring_ok"
  | "box_ok"
  | "cover_ok"
  | "transformer_ok";
export type RoadQuizType = "has_shoulder" | "has_ash";
export type BridgeQuizType = "needs_rectify";
export type ForestQuizType = "broken_belt" | "dead_trees" | "pest";
export type TransformerQuizType =
  | "powered"
  | "device_ok"
  | "cabinet_ok"
  | "illegal_wire";

export interface QuizBool<TType extends QuizType = QuizType> {
  type: TType;
  value: boolean;
  desc: string;
  mustImg: boolean;
  files: string[];
  photos?: FileItem[];
}

export interface WellTypeExt {
  build_kind: FacilityBuildKind;
  checklist: QuizBool<WellQuizType>[];
  outlet_total: number;
  outlet_damaged: number;
  casing_total: number;
  casing_damaged: number;
  keeper_name: string;
  keeper_phone: string;
}

export interface RoadTypeExt {
  length: number;
  width: number;
  thickness: number;
  checklist: QuizBool<RoadQuizType>[];
  tree_survive: number;
  keeper_name: string;
  keeper_phone: string;
}

export interface BridgeTypeExt {
  kind: BridgeKind;
  length: number;
  width: number;
  checklist: QuizBool<BridgeQuizType>[];
  keeper_name: string;
  keeper_phone: string;
}

export interface ForestTypeExt {
  handover_count: number;
  existing_count: number;
  survive_rate: number;
  checklist: QuizBool<ForestQuizType>[];
  keeper_name: string;
  keeper_phone: string;
}

export interface TransformerTypeExt {
  capacity: number;
  model: string;
  voltage: TransformerVoltage;
  checklist: QuizBool<TransformerQuizType>[];
  keeper_name: string;
  keeper_phone: string;
}

export type IssueTypeExt =
  | WellTypeExt
  | RoadTypeExt
  | BridgeTypeExt
  | ForestTypeExt
  | TransformerTypeExt;

export interface RectifyRecord extends BaseRecord {
  issue_id: number;
  quiz_type: QuizType;
  note: string;
  photos: FileItem[];
}

interface IssueBase extends BaseRecord {
  issue_key: string;
  project_year: ProjectYear;
  org_id: number;
  code: string;
  address: string;
  lat: number;
  lng: number;
  plan_date: string;
  status: IssueStatus;
  reporter_signature_file_id: string;
  report_user_id: number;
  assignee_user: number;
  reporter_signature?: FileItem;
  rectify_records: RectifyRecord[];
}

type IssueByType =
  | { type: "well"; type_ext: WellTypeExt }
  | { type: "road"; type_ext: RoadTypeExt }
  | { type: "bridge"; type_ext: BridgeTypeExt }
  | { type: "forest"; type_ext: ForestTypeExt }
  | { type: "transformer"; type_ext: TransformerTypeExt };

export type Issue = IssueBase & IssueByType;

interface IssueCreateCommon {
  project_year: ProjectYear;
  org_id: number;
  code?: string;
  address: string;
  lat?: number;
  lng?: number;
  plan_date?: string;
  reporter_signature_file_id: string;
}

type IssueCreateByType =
  | { type: "well"; type_ext: WellTypeExt }
  | { type: "road"; type_ext: RoadTypeExt }
  | { type: "bridge"; type_ext: BridgeTypeExt }
  | { type: "forest"; type_ext: ForestTypeExt }
  | { type: "transformer"; type_ext: TransformerTypeExt };

export type MiniappCreateIssueInput = IssueCreateCommon & IssueCreateByType;
export type AdminCreateIssueInput = MiniappCreateIssueInput & {
  report_user_id: number;
};

export interface UpdateIssueInput {
  type?: IssueType;
  project_year?: ProjectYear;
  org_id?: number;
  code?: string;
  address?: string;
  lat?: number;
  lng?: number;
  plan_date?: string;
  status?: IssueStatus;
  reporter_signature_file_id?: string;
  report_user_id?: number;
  assignee_user?: number;
  type_ext?: IssueTypeExt;
}

export interface PageQuery {
  page?: number;
  size?: number;
}

export interface IssueListQuery extends PageQuery {
  type?: IssueType | "all";
  status?: IssueStatus | "all";
  org_id?: number;
  project_year?: ProjectYear;
  keyword?: string;
}

export interface IssueListResult {
  list: Issue[];
  total: number;
  page: number;
  size: number;
}

export interface RectifyItemInput {
  type: QuizType;
  note: string;
  file_uuids: string[];
}

export interface RectifyInput {
  rectify_list: RectifyItemInput[];
}

export interface ReassignIssueInput {
  assignee_user: number;
}

export interface ImportIssuesInput {
  rows: AdminCreateIssueInput[];
}

export interface ImportResult {
  imported: number;
}

export interface WorkbenchStats {
  total: number;
  new: number;
  pending: number;
  done: number;
  complete_rate: number;
  by_type: Record<IssueType, number>;
}

export interface LedgerQuery {
  street_org_id?: number;
  date_from?: string;
  date_to?: string;
}

export interface StreetLedgerRow {
  org_id: number;
  type: IssueType;
  total: number;
  pending: number;
  done: number;
}

export interface SurveyLedgerRow {
  type: IssueType;
  total: number;
  pending: number;
  done: number;
}

export interface StreetLedgerResult {
  rows: StreetLedgerRow[];
  street_org_id: number;
}

export interface SurveyLedgerResult {
  rows: SurveyLedgerRow[];
  street_org_id: number;
}

export type OrgType = "root" | "district" | "street" | "village";

export interface SysOrg extends BaseRecord {
  parent_id: number;
  name: string;
  type: OrgType;
  sort: number;
}

export interface OrgTreeNode {
  id: number;
  name: string;
  type: OrgType;
  parent_id: number;
  sort: number;
  children: OrgTreeNode[];
}

export interface CreateOrgInput {
  parent_id: number;
  name: string;
  sort?: number;
}

export interface UpdateOrgInput {
  name: string;
}

export interface SysUser extends BaseRecord {
  username: string;
  name: string;
  phone: string;
  org_id: number;
  role_id: number;
  status: number;
  is_super_admin: boolean;
}

export interface UserListQuery extends PageQuery {
  org_id?: number;
  keyword?: string;
}

export interface UserListResult {
  list: SysUser[];
  total: number;
}

export interface CreateUserInput {
  username: string;
  password?: string;
  name?: string;
  phone?: string;
  org_id?: number;
  role_id?: number;
  status?: number;
}

export interface UpdateUserInput {
  password?: string;
  name: string;
  phone: string;
  org_id: number;
  role_id: number;
  status?: number;
}

export interface SysRole extends BaseRecord {
  name: string;
  desc: string;
  status: number;
}

export interface RoleInput {
  name: string;
  desc: string;
  status: number;
}

export interface RolePermissionResult {
  api_ids: ApiPermission;
}

export interface UpdateRolePermissionInput {
  api_ids: number[];
}

export interface SysApi extends BaseRecord {
  method: string;
  path: string;
  name: string;
  module: string;
  action: string;
  sort: number;
  enabled: boolean;
}

export interface OpLog extends BaseRecord {
  user_id: number;
  username: string;
  action: string;
  detail: string;
  path: string;
  trace_id: string;
  ip: string;
  request: string;
  response: string;
}

export interface OpLogQuery extends PageQuery {
  keyword?: string;
}

export interface OpLogListResult {
  list: OpLog[];
  total: number;
}

export interface SliderStartResult {
  slider_id: string;
  expire_seconds: number;
}

export interface SliderFinishInput {
  slider_id: string;
  duration_ms: number;
}

export interface SliderFinishResult {
  pass_token: string;
  expire_seconds: number;
}

export interface MiniappLoginInput {
  username: string;
  password: string;
  pass_token?: string;
}

export interface AdminLoginInput {
  username: string;
  password: string;
  captcha_id?: string;
  captcha?: string;
}

export interface MiniappTodoQuery extends IssueListQuery {}

export interface MiniappRegionsResult {
  list: OrgTreeNode[];
}

export interface MineStats {
  reported: number;
  pending: number;
  done: number;
}

export type MineScope = "reported" | "pending" | "done";

export interface MineIssueQuery extends PageQuery {
  scope?: MineScope;
}

export interface MineIssueListResult extends IssueListResult {
  scope: MineScope;
}
