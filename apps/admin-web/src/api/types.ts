import type {
  Issue, IssueListResult, OrgType, StreetLedgerResult, StreetLedgerRow,
  SysUser, UserListResult,
} from "@gbnt/api-client";

/** 管理端读取扩展；可选键仅用于兼容尚未升级的服务，正式服务以 null 表示无关联。 */
export interface OrgDisplayFields {
  org_name?: string | null;
  org_path?: string | null;
}

export interface OrgScopeFields {
  /** 只有明确为 true 才允许界面写操作；缺省兼容旧服务并按无权处理。 */
  within_org_scope?: boolean;
}

export type AdminIssue = Issue & OrgDisplayFields & OrgScopeFields & {
  report_user_name?: string | null;
  assignee_user_name?: string | null;
  /** 整改责任人账号登记的联系电话；未指派、人员缺失或电话未填写时为 null，旧服务可缺省。 */
  assignee_user_phone?: string | null;
};
export type AdminIssueListResult = Omit<IssueListResult, "list"> & { list: AdminIssue[] };
export type AdminStreetLedgerRow = StreetLedgerRow & OrgDisplayFields;
export type AdminStreetLedgerResult = Omit<StreetLedgerResult, "rows"> & { rows: AdminStreetLedgerRow[] };
export type AdminUser = SysUser & OrgDisplayFields & OrgScopeFields & {
  role_name?: string | null;
  /** 当前账号是否覆盖目标人员角色权限。 */
  within_role_scope?: boolean;
};
export type AdminUserListResult = Omit<UserListResult, "list"> & {
  list: AdminUser[];
  page: number;
  size: number;
  /** 新服务明确返回 true；旧服务缺省时不发送排序，避免静默忽略。 */
  sort_supported?: boolean;
};

/** 业务组织候选不包含系统管理模型的审计字段。 */
export interface OrgOption {
  id: number;
  name: string;
  type: OrgType;
  parent_id: number;
  sort: number;
  within_org_scope?: boolean;
}

/** 业务人员候选只提供选择和回显所需字段。 */
export interface UserOption {
  id: number;
  name: string;
  username: string;
}
export interface UserOptionQuery {
  keyword?: string;
  page?: number;
  size?: number;
  /** 独立回显同组织、启用的已选人员，不改变分页列表及总数。 */
  selected_id?: number;
}
export interface UserOptionResult {
  list: UserOption[];
  total: number;
  page: number;
  size: number;
  selected: UserOption | null;
}
