<script setup lang="ts">
import { computed } from "vue";
import type { AdminIssue } from "@/api/types";
import AsyncError from "@/components/AsyncError.vue";
import IssueStatusTag from "@/components/IssueStatusTag.vue";
import { ISSUE_TYPE_LABELS, QUIZ_DEFINITIONS, quizIndicatesIssue, quizLabel } from "@/constants/issue";
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

const visible = defineModel<boolean>({ required: true });
const fields = computed(() => (issue ? issueExtensionFields(issue) : []));
const currentRound = computed(() => issue?.rectify_round ?? 0);

function quizIsIssue(type: string, value: boolean): boolean {
  if (!issue) return false;
  const definition = QUIZ_DEFINITIONS[issue.type].find((item) => item.type === type);
  return definition ? quizIndicatesIssue(value, definition.negative) : false;
}

</script>

<template>
  <ElDrawer v-model="visible" title="排查整改详情" size="min(980px, 96vw)" destroy-on-close>
    <ElSkeleton v-if="loading" :rows="8" animated />
    <AsyncError v-else-if="loadError" :message="loadError" @retry="$emit('retry')" />
    <div v-if="issue" class="space-y-6">
      <section>
        <div class="mb-4 flex flex-wrap items-center gap-3">
          <h2 class="m-0 text-lg font-semibold text-slate-900">{{ issue.issue_key }}</h2>
          <IssueStatusTag :status="issue.status" />
          <ElTag effect="plain">{{ ISSUE_TYPE_LABELS[issue.type] }}</ElTag>
        </div>
        <ElDescriptions :column="2" border class="max-sm:[--el-descriptions-table-border:1px]">
          <ElDescriptionsItem label="设施编号">{{ issue.code || "—" }}</ElDescriptionsItem>
          <ElDescriptionsItem label="项目年度">{{ issue.project_year }} 年</ElDescriptionsItem>
          <ElDescriptionsItem label="所属组织" :span="2">{{ displayOrg(issue.org_id, issue.org_path || issue.org_name) }}</ElDescriptionsItem>
          <ElDescriptionsItem label="定位地址" :span="2">{{ issue.address }}</ElDescriptionsItem>
          <ElDescriptionsItem label="经纬度">{{ issue.lat }}, {{ issue.lng }}</ElDescriptionsItem>
          <ElDescriptionsItem label="计划完成">{{ formatDate(issue.plan_date) }}</ElDescriptionsItem>
          <ElDescriptionsItem label="上报人">{{ displayUser(issue.report_user_id, issue.report_user_name) }}</ElDescriptionsItem>
          <ElDescriptionsItem label="整改人">{{ displayUser(issue.assignee_user, issue.assignee_user_name) }}</ElDescriptionsItem>
          <ElDescriptionsItem label="当前整改轮次" :span="2">第 {{ currentRound + 1 }} 轮</ElDescriptionsItem>
          <ElDescriptionsItem label="创建时间">{{ formatDateTime(issue.created_at) }}</ElDescriptionsItem>
          <ElDescriptionsItem label="更新时间">{{ formatDateTime(issue.updated_at) }}</ElDescriptionsItem>
        </ElDescriptions>
      </section>

      <section>
        <h3 class="mb-3 text-base font-semibold text-slate-900">设施属性</h3>
        <ElDescriptions :column="3" border>
          <ElDescriptionsItem v-for="field in fields" :key="field.label" :label="field.label">
            {{ field.value }}
          </ElDescriptionsItem>
        </ElDescriptions>
      </section>

      <section>
        <h3 class="mb-3 text-base font-semibold text-slate-900">排查清单</h3>
        <div class="space-y-3">
          <article v-for="item in issue.type_ext.checklist" :key="item.type" class="rounded-lg border border-slate-200 p-4">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <strong>{{ quizLabel(item.type) }}</strong>
              <div class="flex items-center gap-2">
                <ElTag effect="plain">{{ item.value ? "是" : "否" }}</ElTag>
                <ElTag :type="quizIsIssue(item.type, item.value) ? 'danger' : 'success'">
                  {{ quizIsIssue(item.type, item.value) ? "存在问题" : "未判定问题" }}
                </ElTag>
              </div>
            </div>
            <p class="mt-3 mb-0 whitespace-pre-wrap text-sm text-slate-600">{{ item.desc || "无补充说明" }}</p>
            <div v-if="item.photos?.length" class="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">
              <ElImage
                v-for="photo in item.photos"
                :key="photo.file_id"
                :src="resolveAssetUrl(photo.url)"
                :preview-src-list="(item.photos ?? []).map((entry) => resolveAssetUrl(entry.url))"
                fit="cover"
                class="aspect-square w-full rounded-md border border-slate-200"
                loading="lazy"
              />
            </div>
          </article>
        </div>
      </section>

      <section v-if="issue.reporter_signature">
        <h3 class="mb-3 text-base font-semibold text-slate-900">上报人电子签名</h3>
        <ElImage
          :src="resolveAssetUrl(issue.reporter_signature.url)"
          :preview-src-list="[resolveAssetUrl(issue.reporter_signature.url)]"
          fit="contain"
          class="h-40 w-full max-w-xl rounded-lg border border-slate-200 bg-white"
        />
      </section>

      <section>
        <h3 class="mb-3 text-base font-semibold text-slate-900">整改记录</h3>
        <ElTimeline v-if="issue.rectify_records.length">
          <ElTimelineItem
            v-for="record in issue.rectify_records"
            :key="record.id"
            :timestamp="formatDateTime(record.created_at)"
            placement="top"
          >
            <article class="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div class="flex flex-wrap items-center justify-between gap-2">
                <strong>{{ quizLabel(record.quiz_type) }}</strong>
                <ElTag :type="(record.round ?? 0) === currentRound ? 'success' : 'info'" effect="plain">
                  第 {{ (record.round ?? 0) + 1 }} 轮 · {{ (record.round ?? 0) === currentRound ? '本轮' : '历史' }}
                </ElTag>
              </div>
              <p class="mt-2 whitespace-pre-wrap text-sm text-slate-600">{{ record.note }}</p>
              <div v-if="record.photos.length" class="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">
                <ElImage
                  v-for="photo in record.photos"
                  :key="photo.file_id"
                  :src="resolveAssetUrl(photo.url)"
                  :preview-src-list="record.photos.map((entry) => resolveAssetUrl(entry.url))"
                  fit="cover"
                  class="aspect-square w-full rounded-md border border-slate-200"
                  loading="lazy"
                />
              </div>
            </article>
          </ElTimelineItem>
        </ElTimeline>
        <ElEmpty v-else description="暂无整改记录" :image-size="72" />
      </section>
    </div>
  </ElDrawer>
</template>
