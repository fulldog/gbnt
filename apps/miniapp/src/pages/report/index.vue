<script setup lang="ts">
import { computed, ref, shallowRef } from "vue";
import { onHide, onLoad, onShow, onUnload, onShareAppMessage, onShareTimeline } from "@dcloudio/uni-app";
import type { IssueType } from "@gbnt/api-client";
import PageTopInset from "@/components/common/PageTopInset.vue";
import FacilityTypeTabs from "@/components/report/FacilityTypeTabs.vue";
import ReportTypeForm from "@/components/report/ReportTypeForm.vue";
import { useAuthStore } from "@/stores/auth";
import { useRegions } from "@/composables/report/useRegions";
import { useInspectionAccess } from "@/composables/report/useInspectionAccess";
import {
  clearStoredReportDrafts,
  createReportWorkspace,
  createTypeDraft,
  selectWorkspaceType,
  type ReportTypeDraft,
} from "@/composables/report/useReportWorkspace";
import { ISSUE_TYPE_OPTIONS } from "@/domain/issues/definitions";

const authStore = useAuthStore();
const ownerId = shallowRef<number | null>(null);
const draftReady = shallowRef(false);
const shown = shallowRef(true);
const workspace = ref(createReportWorkspace());
const revisions = ref<Partial<Record<IssueType, number>>>({});
const sessionRevision = shallowRef(0);
const busyTypes = ref<Partial<Record<IssueType, boolean>>>({});
const nativeOverlayDepth = shallowRef(0);
const nativeOverlayCovered = shallowRef(false);
const busy = computed(() => Object.values(busyTypes.value).some(Boolean));
const drafts = computed(() => ISSUE_TYPE_OPTIONS.filter(({ value }) => workspace.value.drafts[value]).map(({ value }) =>
  ({ type: value, draft: workspace.value.drafts[value]!, key: `${sessionRevision.value}:${value}:${revisions.value[value] || 0}` })));
const { tree, loading: regionsLoading, error: regionsError, load: loadRegions } = useRegions(() => authStore.user);
const access = useInspectionAccess({
  onNativeOverlayVisibilityChange: setNativeOverlayVisibility,
});
let active = true;

function setNativeOverlayVisibility(visible: boolean): void {
  nativeOverlayDepth.value = visible
    ? nativeOverlayDepth.value + 1
    : Math.max(0, nativeOverlayDepth.value - 1);
}

function saveType(type: IssueType, draft: ReportTypeDraft): void {
  if (!active || !shown.value || draft.form.type !== type) return;
  workspace.value.drafts[type] = draft;
}
function selectType(type: IssueType): void {
  if (busy.value || !access.ready.value) return;
  selectWorkspaceType(workspace.value, type);
  uni.pageScrollTo({ scrollTop: 0, duration: 0 });
}
function submitted(type: IssueType, code: string): void {
  workspace.value.drafts[type] = createTypeDraft(type);
  revisions.value[type] = (revisions.value[type] || 0) + 1;
  busyTypes.value[type] = false;
  uni.showToast({ title: `提交成功，设施编号 ${code}`, icon: "none", duration: 3500 });
  uni.pageScrollTo({ scrollTop: 0, duration: 0 });
}

function clearFormSession(): void {
  nativeOverlayDepth.value = 0;
  nativeOverlayCovered.value = false;
  workspace.value = createReportWorkspace();
  revisions.value = {};
  busyTypes.value = {};
  sessionRevision.value += 1;
  clearStoredReportDrafts(ownerId.value);
}

onLoad(async () => {
  await authStore.restore();
  if (!active) return;
  if (!authStore.isAuthenticated) { uni.reLaunch({ url: "/pages/login/index" }); return; }
  ownerId.value = authStore.user?.id ?? null;
  clearFormSession();
  draftReady.value = true;
  void loadRegions();
  void access.request();
});
onShow(() => {
  shown.value = true;
  // 原生窗口没有统一的关闭回调，回到当前页后统一结束保护。
  nativeOverlayDepth.value = 0;
  nativeOverlayCovered.value = false;
  if (draftReady.value) void access.request();
});
onHide(() => {
  // 微信地图、相机/相册、图片预览、设置等原生窗口会触发 onHide，但仍属于当前填写会话。
  if (nativeOverlayDepth.value > 0 || nativeOverlayCovered.value) {
    nativeOverlayCovered.value = true;
    return;
  }
  shown.value = false;
  clearFormSession();
});
onUnload(() => {
  shown.value = false;
  active = false;
  clearFormSession();
});
onShareAppMessage(() => ({ title: "农田专项整治 · 巡查上报", path: "/pages/report/index" }));
onShareTimeline(() => ({ title: "农田专项整治 · 巡查上报", query: "" }));
</script>

<template>
  <view class="report-page page-shell">
    <PageTopInset fixed-cover />
    <view v-if="!draftReady" class="access-loading" role="status">正在准备巡查表单…</view>
    <template v-else>
      <view v-if="access.phase.value === 'denied'" class="access-panel">
        <text class="access-title">开启巡查权限</text>
        <text>{{ access.message.value || '请开启定位和相机权限后继续巡查。' }}</text>
        <button class="primary-button" @tap="access.request">重新授权</button>
        <button class="secondary-button" @tap="access.openSettings">打开设置</button>
      </view>
      <view v-else-if="!access.ready.value" class="access-loading" role="status">正在检查权限并获取定位…</view>
      <view v-show="access.ready.value">
        <FacilityTypeTabs :value="workspace.activeType" :disabled="busy" @select="selectType" />
        <view v-for="entry in drafts" :key="entry.key" v-show="workspace.activeType === entry.type">
          <ReportTypeForm :draft="entry.draft" :visible="shown && access.ready.value && workspace.activeType === entry.type"
            :initial-position="access.position.value" :region-tree="tree" :regions-loading="regionsLoading" :regions-error="regionsError"
            :user-org-id="authStore.user?.org_id ?? 0"
            @save="saveType(entry.type, $event)" @submitted="submitted(entry.type, $event)"
            @busy="busyTypes[entry.type] = $event" @native-overlay="setNativeOverlayVisibility"
            @retry-regions="loadRegions" @permission-denied="access.denyMedia" />
        </view>
      </view>
    </template>
  </view>
</template>

<style scoped lang="scss">
.report-page { min-height: 100vh; padding-bottom: 92px; background: #fff; }
.access-loading { margin: 28px 20px; color: var(--color-text-secondary); line-height: 1.7; text-align: center; }
.access-panel { display: flex; flex-direction: column; gap: 18px; margin: 28px 20px; color: var(--color-text-secondary); line-height: 1.7; }
.access-title { color: var(--color-text); font-size: 20px; font-weight: 600; }
.access-panel button { width: 100%; margin: 0; }
.primary-button, .secondary-button {
  min-width: 0;
  height: 46px;
  padding: 0 12px;
  border: 1px solid var(--color-primary);
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  line-height: 44px;
}
.primary-button { color: #fff; background: var(--color-primary); }
.secondary-button { color: var(--color-primary); background: #fff; }
.primary-button[disabled], .secondary-button[disabled] { opacity: .45; }
</style>
