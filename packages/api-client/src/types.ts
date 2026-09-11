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

export type FacilityCodeMode = "auto" | "manual";
export const FACILITY_CODE_CONFLICT = 40901;
export const ISSUE_REQUEST_CONFLICT = 40902;

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
  | "has_road_damage"
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
export type RoadQuizType = "has_shoulder" | "has_ash" | "has_road_damage";
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

/** 未提供版本表示旧版表单；2 为原型对齐后的五类表单。 */
export interface IssueExtMetadata {
  schema_version?: 1 | 2;
  /** 已退出当前表单的历史题项，保留答案和附件，不参与新版判定。 */
  legacy_checklist?: QuizBool[];
}

export interface WellTypeExt extends IssueExtMetadata {
  /** 机井全景照片，与各排查题附件独立。新版新建必填。 */
  panorama_files?: string[];
  panorama_photos?: FileItem[];
  build_kind: FacilityBuildKind;
  checklist: QuizBool<WellQuizType>[];
  outlet_total: number;
  outlet_damaged: number;
  casing_total: number;
  casing_damaged: number;
  keeper_name: string;
  keeper_phone: string;
}

export interface RoadTypeExt extends IssueExtMetadata {
  length: number;
  width: number;
  thickness: number;
  checklist: QuizBool<RoadQuizType>[];
  /** 历史字段；新版表单不要求填写。 */
  tree_survive?: number | null;
  keeper_name: string;
  keeper_phone: string;
}

export interface BridgeTypeExt extends IssueExtMetadata {
  kind: BridgeKind;
  length: number;
  width: number;
  checklist: QuizBool<BridgeQuizType>[];
  keeper_name: string;
  keeper_phone: string;
}

export interface ForestTypeExt extends IssueExtMetadata {
  handover_count: number;
  existing_count: number;
  /** 历史字段；新版表单不要求填写。 */
  survive_rate?: number | null;
  checklist: QuizBool<ForestQuizType>[];
  keeper_name: string;
  keeper_phone: string;
}

export interface TransformerTypeExt extends IssueExtMetadata {
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
  /** 所属整改轮次。旧服务未返回时按 0 读取。 */
  round?: number;
  quiz_type: QuizType;
  note: string;
  photos: FileItem[];
}

interface IssueBase extends BaseRecord {
  /** 上报信息快照，与负责人和实际操作账号分别保存。 */
  reporter_name?: string;
  reporter_phone?: string;
  issue_key: string;
  project_year: ProjectYear;
  org_id: number;
  code: string;
  address: string;
  lat: number;
  lng: number;
  plan_date: string;
  status: IssueStatus;
  /** 当前整改轮次；重新整改时递增。旧服务未返回时按 0 读取。 */
  rectify_round?: number;
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
  /** 新端明确指定；旧端省略时，非空 code 按手动、空值按自动处理。 */
  code_mode?: FacilityCodeMode;
  /** 同次提交网络重试复用，内容修改后使用新 ID；旧端可省略。 */
  request_id?: string;
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
export type AdminCreateIssueInput = IssueCreateCommon & IssueCreateByType & {
  /** 旧版必填；新版手工填报可不关联账号。 */
  report_user_id?: number;
  reporter_name?: string;
  reporter_phone?: string;
  /** 需整改时必填；须启用且所属组织与 org_id 互为上下级或同一节点。 */
  assignee_user?: number;
};

/** 省略字段保留原值；空字符串/0 为显式赋值；type_ext 提供时按当前类型完整校验。 */
export interface UpdateIssueInput {
  /** 乐观锁：编辑打开时详情的 updated_at，过期拒绝保存。 */
  expected_updated_at?: string;
  reporter_name?: string;
  reporter_phone?: string;
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
  /** 待整改/整改中不允许为 0；省略保留原责任人，非 0 须启用且属于相关组织。 */
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
  /** 新客户端传当前 rectify_round，过期时服务端拒绝；省略仅兼容旧客户端。 */
  expected_round?: number;
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
  /** 人员排序整数，越小越靠前；新版服务固定返回数值，兼容旧服务缺省。 */
  sort?: number | null;
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
  /** 有符号 32 位整数，默认 100；支持 0。 */
  sort?: number;
  status?: number;
}

export interface UpdateUserInput {
  password?: string;
  name: string;
  phone: string;
  org_id: number;
  role_id: number;
  /** 有符号 32 位整数；不传时保留原排序，支持 0。 */
  sort?: number;
  status?: number;
}

/** 管理端仅更新账号状态，不修改人员资料、角色或密码。 */
export interface UpdateUserStatusInput {
  /** 0 停用，1 启用。 */
  status: 0 | 1;
}

export interface SysRole extends BaseRecord {
  /** 对外英文角色ID；id 仍为内部关联主键。旧后端可能缺失。 */
  code?: string | null;
  name: string;
  desc: string;
  status: number;
}

/** 旧客户端角色入参，保留兼容；新页面使用 CreateRoleInput / UpdateRoleInput。 */
export interface RoleInput {
  name: string;
  desc: string;
  status: number;
}

/** 一次创建角色和授权；名称由后端生成，角色默认启用。 */
export interface CreateRoleInput {
  /** 英文开头，支持英文、数字、_、-，最多64位；服务端统一小写并保证唯一。 */
  code: string;
  desc: string;
  api_ids: number[];
}

/** 只更新传入字段；api_ids 未传保持原权限，空数组表示清空。 */
export interface UpdateRoleInput {
  code?: string;
  name?: string;
  desc?: string;
  status?: 0 | 1;
  api_ids?: number[];
}

export interface RoleDuty {
  key: string;
  label: string;
  role_name: string;
  sort: number;
}

export interface RolePermissionResult {
  api_ids: ApiPermission;
}

export interface UpdateRolePermissionInput {
  api_ids: number[];
}

export interface SysApi extends BaseRecord {
  /** 授权目录接口附加的英文角色ID服务能力标记。 */
  role_code_supported?: boolean;
  /** 后端职责元数据；旧服务或尚未配置职责的模块可能缺失。 */
  duty?: RoleDuty;
  method: string;
  path: string;
  name: string;
  module: string;
  action: string;
  sort: number;
  enabled: boolean;
  is_jwt: boolean | number;
  is_rbac: boolean | number;
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
  /** 用户已主动勾选同意协议；小程序登录必填。 */
  agreed: true;
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
