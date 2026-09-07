<script setup lang="ts">
import { computed } from "vue";
import type { AdminIssue } from "@/api/types";
import AsyncError from "@/components/AsyncError.vue";
import PhotoGallery from "@/components/PhotoGallery.vue";
import { useBusinessToday } from "@/composables/useBusinessToday";
import { issuePlanDisplay } from "@/utils/issue-date";
import IssueStatusTag from "@/components/IssueStatusTag.vue";
import { ISSUE_TYPE_LABELS, issueQuizDefinitions, issueQuizIsAbnormal, quizLabel } from "@/constants/issue";
import { resolveAssetUrl } from "@/utils/asset";
import { formatDate, formatDateTime } from "@/utils/format";
import { displayOrg, displayUser } from "@/utils/display";
import { issueExtensionFields } from "./issue-display";

const { issue, loading = false, loadError = "" } = defineProps<{
  issue: AdminIssue | null;
  loading?: boolean;
  loadError?: string;
}>();
defineEmits<{ retry: [] }>();

const today = useBusinessToday();
const visible = defineModel<boolean>({ required: true });
const fields = computed(() => (issue ? issueExtensionFields(issue) : []));
const currentRound = computed(() => issue?.rectify_round ?? 0);

function quizIsIssue(type: string, value: boolean): boolean {
  if (!issue) return false;
  const definition = issueQuizDefinitions(issue.type, issue.type_ext.schema_version).find((item) => item.type === type);
  return definition ? issueQuizIsAbnormal(definition, value) : false;
}

</script>

<template>
  <ElDialog v-model="visible" title="排查整改详情" width="min(1120px, 96vw)" top="6vh" class="issue-detail" destroy-on-close>
    <ElSkeleton v-if="loading" :rows="8" animated />
    <AsyncError v-else-if="loadError" :message="loadError" @retry="$emit('retry')" />
    <div v-if="issue" class="issue-compare">
      <section class="compare-panel">
        <header class="compare-heading"><h2>整改前</h2><span>{{ ISSUE_TYPE_LABELS[issue.type] }} · {{ issue.issue_key }}</span></header>
        <div class="compare-body">
          <dl class="detail-fields">
            <div><dt>设施编号</dt><dd>{{ issue.code || '—' }}</dd></div>
            <div><dt>项目年度</dt><dd>{{ issue.project_year }} 年</dd></div>
            <div><dt>所属组织</dt><dd>{{ displayOrg(issue.org_id, issue.org_path || issue.org_name) }}</dd></div>
            <div><dt>定位地址</dt><dd>{{ issue.address }}</dd></div>
            <div><dt>经纬度</dt><dd>{{ issue.lat }}, {{ issue.lng }}</dd></div>
            <div v-for="field in fields" :key="field.label"><dt>{{ field.label }}</dt><dd>{{ field.value }}</dd></div>
          </dl>
          <template v-if="issue.type === 'well' && issue.type_ext.panorama_photos?.length"><h3 class="detail-section-title">全景照片</h3><PhotoGallery :photos="issue.type_ext.panorama_photos" /></template>
          <h3 class="detail-section-title">排查清单</h3>
          <article v-for="(item, index) in issue.type_ext.checklist" :key="item.type" class="check-result">
            <div class="check-result-heading"><strong>{{ index + 1 }}. {{ quizLabel(item.type) }}</strong><ElTag :type="quizIsIssue(item.type, item.value) ? 'danger' : 'success'" effect="light">{{ item.value ? '是' : '否' }}</ElTag></div>
            <p v-if="item.desc" class="detail-note">{{ item.desc }}</p>
            <PhotoGallery v-if="item.photos?.length" :photos="item.photos" />
          </article>
          <h3 class="detail-section-title">上报信息</h3>
          <dl class="detail-fields">
            <div><dt>上报人</dt><dd>{{ issue.reporter_name || displayUser(issue.report_user_id, issue.report_user_name) }}</dd></div>
            <div><dt>上报联系电话</dt><dd>{{ issue.reporter_phone || '—' }}</dd></div>
            <div><dt>创建时间</dt><dd>{{ formatDateTime(issue.created_at) }}</dd></div>
          </dl>
          <div v-if="issue.reporter_signature" class="detail-signature">
            <span>上报人电子签名</span>
            <ElImage :src="resolveAssetUrl(issue.reporter_signature.url)" :preview-src-list="[resolveAssetUrl(issue.reporter_signature.url)]" preview-teleported fit="contain"  v-bind="{ 'alt': '上报人电子签名' }" />
          </div>
        </div>
      </section>
      <section class="compare-panel compare-panel-after">
        <header class="compare-heading"><h2>整改后</h2><IssueStatusTag :status="issue.status" /></header>
        <div class="compare-body">
          <dl class="detail-fields">
            <div><dt>整改人</dt><dd>{{ displayUser(issue.assignee_user, issue.assignee_user_name) }}</dd></div>
            <div><dt>计划完成</dt><dd>{{ formatDate(issue.plan_date) }}</dd></div>
            <div><dt>整改期限</dt><dd :class="{ 'is-overdue': issuePlanDisplay(issue, today).overdue }">{{ issuePlanDisplay(issue, today).text }}</dd></div>
            <div><dt>当前整改轮次</dt><dd>第 {{ currentRound + 1 }} 轮</dd></div>
            <div><dt>更新时间</dt><dd>{{ formatDateTime(issue.updated_at) }}</dd></div>
          </dl>
          <h3 class="detail-section-title">整改记录</h3>
          <ElTimeline v-if="issue.rectify_records.length" class="rectify-timeline">
            <ElTimelineItem v-for="record in issue.rectify_records" :key="record.id" :timestamp="formatDateTime(record.created_at)" placement="top">
              <article class="rectify-record">
                <div class="check-result-heading">
                  <strong>{{ quizLabel(record.quiz_type) }}</strong>
                  <ElTag :type="(record.round ?? 0) === currentRound ? 'success' : 'info'" effect="plain">第 {{ (record.round ?? 0) + 1 }} 轮 · {{ (record.round ?? 0) === currentRound ? '本轮' : '历史' }}</ElTag>
                </div>
                <p class="detail-note">{{ record.note }}</p>
                <PhotoGallery v-if="record.photos.length" :photos="record.photos" />
              </article>
            </ElTimelineItem>
          </ElTimeline>
          <ElEmpty v-else description="暂无整改记录" :image-size="72" />
        </div>
      </section>
    </div>
    <template #footer><ElButton @click="visible = false">关闭</ElButton></template>
  </ElDialog>
</template>

<style scoped>
.issue-compare { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 18px; height: 100%; min-height: 0; }
.compare-panel { display: flex; flex-direction: column; min-width: 0; min-height: 0; border: 1px solid #dce8f5; border-radius: 8px; overflow: hidden; }
.compare-heading { display: flex; flex-shrink: 0; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; padding: 12px 16px; background: #eef6ff; }
.compare-heading h2 { margin: 0; color: #245e99; font-size: 16px; font-weight: 600; }
.compare-heading > span { color: #6b7a90; font-size: 13px; }
.compare-panel-after { border-color: #eee5d2; }
.compare-panel-after .compare-heading { background: #fff8e9; }
.compare-panel-after h2 { color: #986822; }
.compare-body { flex: 1; min-height: 0; padding: 16px; overflow-y: auto; }
.detail-fields { display: grid; gap: 12px; margin: 0; font-size: 14px; line-height: 1.6; }
.detail-fields > div { display: grid; grid-template-columns: 108px minmax(0, 1fr); gap: 10px; }
.detail-fields dt { color: #6b7a90; }
.detail-fields dd { margin: 0; color: #333; overflow-wrap: anywhere; text-align: left; }
.detail-fields dd.is-overdue { color: #c0392b; }
.detail-section-title { margin: 22px 0 12px; padding-bottom: 9px; border-bottom: 1px solid #edf0f5; font-size: 14px; font-weight: 600; }
.check-result { padding: 12px 0; border-bottom: 1px dashed #e2e8f0; }
.check-result-heading { display: flex; justify-content: space-between; align-items: center; gap: 10px; font-size: 14px; }
.detail-note { margin: 10px 0; font-size: 14px; line-height: 1.7; white-space: pre-wrap; overflow-wrap: anywhere; }
.detail-signature { margin-top: 16px; color: #6b7a90; font-size: 14px; }
.detail-signature :deep(.el-image) { display: block; width: 100%; height: 120px; margin-top: 10px; border: 1px dashed #dcdfe6; border-radius: 6px; }
.rectify-timeline { padding-left: 4px; }
.rectify-record { padding: 12px; background: #fafbfc; border: 1px solid #edf0f5; border-radius: 6px; }
@media (max-width: 767px) { .issue-compare { height: auto; grid-template-columns: minmax(0, 1fr); } .compare-body { overflow: visible; } }
</style>
