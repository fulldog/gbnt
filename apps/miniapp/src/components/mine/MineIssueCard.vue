<script setup lang="ts">
import type { MiniappIssue } from "@/api/types";
import IssueCard from "@/components/issue/IssueCard.vue";

defineProps<{ issue: MiniappIssue; today?: string }>();
const emit = defineEmits<{
  open: [id: number];
  preview: [urls: string[], current: string];
}>();

function preview(urls: string[], index: number): void {
  if (urls[index]) emit("preview", urls, urls[index]);
}

function openMap(id: number): void {
  uni.navigateTo({ url: `/pages-sub/issue/map?id=${id}` });
}
</script>

<template>
  <IssueCard :issue="issue" :today="today" @open="emit('open', $event)" @map="openMap" @preview="preview" />
</template>
