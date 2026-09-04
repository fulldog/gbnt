import { createRouter, createWebHistory } from "vue-router";
import { pinia } from "@/stores";
import { useAuthStore } from "@/stores/auth";

export const router = createRouter({
  history: createWebHistory(),
  scrollBehavior: () => ({ top: 0 }),
  routes: [
    {
      path: "/login",
      name: "login",
      component: () => import("@/views/auth/LoginView.vue"),
      meta: { title: "登录", public: true },
    },
    {
      path: "/",
      component: () => import("@/layouts/AdminLayout.vue"),
      meta: { title: "管理后台" },
      children: [
        { path: "", redirect: "/workbench" },
        {
          path: "workbench",
          name: "workbench",
          component: () => import("@/views/workbench/WorkbenchView.vue"),
          meta: { title: "工作台", module: "web.workbench" },
        },
        {
          path: "issues",
          name: "issues",
          component: () => import("@/views/issues/IssuesView.vue"),
          meta: { title: "专项整改", module: "web.rectify" },
        },
        {
          path: "ledger/street",
          name: "ledger-street",
          component: () => import("@/views/ledger/StreetLedgerView.vue"),
          meta: { title: "街道台账", module: "web.ledger-street" },
        },
        {
          path: "ledger/survey",
          name: "ledger-survey",
          component: () => import("@/views/ledger/SurveyLedgerView.vue"),
          meta: { title: "街道排查汇总", module: "web.ledger-survey" },
        },
        {
          path: "system/orgs",
          name: "system-orgs",
          component: () => import("@/views/system/OrgView.vue"),
          meta: { title: "组织架构", module: "web.sys-org" },
        },
        {
          path: "system/users",
          name: "system-users",
          component: () => import("@/views/system/UserView.vue"),
          meta: { title: "工作人员", module: "web.sys-staff" },
        },
        {
          path: "system/roles",
          name: "system-roles",
          component: () => import("@/views/system/RoleView.vue"),
          meta: { title: "角色权限", module: "web.sys-roles" },
        },
        {
          path: "system/op-logs",
          name: "system-op-logs",
          component: () => import("@/views/system/OpLogView.vue"),
          meta: { title: "操作日志", module: "web.sys-logs" },
        },
      ],
    },
    {
      path: "/:pathMatch(.*)*",
      component: () => import("@/views/NotFoundView.vue"),
      meta: { title: "页面不存在", public: true },
    },
  ],
});

router.beforeEach(async (to) => {
  const auth = useAuthStore(pinia);
  await auth.restore();

  document.title = `${to.meta.title} - 高标准农田专项整治平台`;

  if (to.meta.public) {
    if (to.name === "login" && auth.isAuthenticated) {
      return typeof to.query.redirect === "string" ? to.query.redirect : "/workbench";
    }
    return true;
  }

  if (!auth.isAuthenticated) {
    return { name: "login", query: { redirect: to.fullPath } };
  }
  return true;
});
