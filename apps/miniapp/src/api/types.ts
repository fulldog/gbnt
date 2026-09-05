import type {
  AuthUser,
  Issue,
  IssueListResult,
  LoginResult,
  MineScope,
} from "@gbnt/api-client";

/** 小程序读取契约：仅补充当前记录关联的业务名称，不提供人员目录。 */
export type MiniappIssue = Issue & {
  report_user_name: string | null;
  assignee_user_name: string | null;
  org_name: string | null;
  org_path: string | null;
  /** 写入已成功但关联名称读取失败时提示刷新，不应重复提交。 */
  display_warning?: string;
};

/** 小程序本人资料。名称缺失为 null，超管身份仍按 is_super_admin 判断。 */
export interface MiniappAuthUser extends AuthUser {
  org_name: string | null;
  org_path: string | null;
  role_name: string | null;
}

export interface MiniappLoginResult extends Omit<LoginResult, "user"> {
  user: MiniappAuthUser;
}

export interface MiniappIssueListResult extends Omit<IssueListResult, "list"> {
  list: MiniappIssue[];
}

export interface MiniappMineIssueListResult extends MiniappIssueListResult {
  scope: MineScope;
}
