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
const busy = computed(() => Object.values(busyTypes.value).some(Boolean));
const drafts = computed(() => ISSUE_TYPE_OPTIONS.filter(({ value }) => workspace.value.drafts[value]).map(({ value }) =>
  ({ type: value, draft: workspace.value.drafts[value]!, key: `${sessionRevision.value}:${value}:${revisions.value[value] || 0}` })));
const { tree, loading: regionsLoading, error: regionsError, load: loadRegions } = useRegions();
const access = useInspectionAccess();
let active = true;

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
  if (draftReady.value) void access.request();
});
onHide(() => {
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
    <PageTopInset />
    <view v-if="!draftReady" class="access-panel">正在准备巡查表单…</view>
    <template v-else>
      <view v-if="!access.ready.value" class="access-panel">
        <text class="access-title">开启巡查权限</text>
        <template v-if="access.phase.value === 'privacy'">
          <text>巡查需要使用定位、相机及所选照片，用于记录现场情况并生成照片水印。</text>
          <button class="privacy-link" @tap="access.openPrivacy">查看隐私保护指引</button>
          <button id="inspection-privacy-agree" class="primary-button" open-type="agreePrivacyAuthorization"
            @agreeprivacyauthorization="access.acceptPrivacy">同意并继续</button>
          <button class="secondary-button" @tap="access.rejectPrivacy">暂不授权</button>
        </template>
        <template v-else-if="access.phase.value === 'checking'">
          <text>正在检查权限并获取定位…</text>
        </template>
        <template v-else>
          <text>{{ access.message.value || '请开启定位和相机权限后继续巡查。' }}</text>
          <button class="primary-button" @tap="access.request">重新授权</button>
          <button class="secondary-button" @tap="access.openSettings">打开设置</button>
        </template>
      </view>
      <view v-show="access.ready.value">
        <FacilityTypeTabs :value="workspace.activeType" :disabled="busy" @select="selectType" />
        <view v-for="entry in drafts" :key="entry.key" v-show="workspace.activeType === entry.type">
          <ReportTypeForm :draft="entry.draft" :visible="shown && access.ready.value && workspace.activeType === entry.type"
            :initial-position="access.position.value" :region-tree="tree" :regions-loading="regionsLoading" :regions-error="regionsError"
            @save="saveType(entry.type, $event)" @submitted="submitted(entry.type, $event)"
            @busy="busyTypes[entry.type] = $event" @retry-regions="loadRegions" @permission-denied="access.denyMedia" />
        </view>
      </view>
    </template>
  </view>
</template>

<style scoped lang="scss">
.report-page { min-height: 100vh; padding-bottom: 92px; background: #fff; }
.access-panel { display: flex; flex-direction: column; gap: 18px; margin: 28px 20px; color: var(--color-text-secondary); line-height: 1.7; }
.access-title { color: var(--color-text); font-size: 20px; font-weight: 600; }
.access-panel button { width: 100%; margin: 0; }
.privacy-link { background: transparent; color: var(--color-primary); font-size: 14px; }
</style>
