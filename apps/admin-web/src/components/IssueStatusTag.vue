<script setup lang="ts">
import type { IssueStatus } from "@gbnt/api-client";
import { computed } from "vue";
import { ISSUE_STATUS_META } from "@/constants/issue";

const { status } = defineProps<{ status: IssueStatus }>();
const meta = computed(() => ISSUE_STATUS_META[status]);
</script>

<template>
  <ElTag :type="meta.tag" effect="light" round>{{ meta.label }}</ElTag>
</template>
