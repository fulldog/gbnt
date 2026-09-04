import {
  DataAnalysis,
  Document,
  List,
  OfficeBuilding,
  PieChart,
  Setting,
  User,
  UserFilled,
} from "@element-plus/icons-vue";
import type { Component } from "vue";

export interface NavigationItem {
  title: string;
  path?: string;
  module?: string;
  icon: Component;
  children?: NavigationItem[];
}

export const navigation: readonly NavigationItem[] = [
  { title: "工作台", path: "/workbench", module: "web.workbench", icon: PieChart },
  { title: "专项整改", path: "/issues", module: "web.rectify", icon: List },
  {
    title: "汇总管理",
    icon: DataAnalysis,
    children: [
      { title: "街道台账", path: "/ledger/street", module: "web.ledger-street", icon: Document },
      { title: "街道排查汇总", path: "/ledger/survey", module: "web.ledger-survey", icon: DataAnalysis },
    ],
  },
  {
    title: "系统配置",
    icon: Setting,
    children: [
      { title: "组织架构", path: "/system/orgs", module: "web.sys-org", icon: OfficeBuilding },
      { title: "工作人员", path: "/system/users", module: "web.sys-staff", icon: User },
      { title: "角色权限", path: "/system/roles", module: "web.sys-roles", icon: UserFilled },
      { title: "操作日志", path: "/system/op-logs", module: "web.sys-logs", icon: Document },
    ],
  },
];
