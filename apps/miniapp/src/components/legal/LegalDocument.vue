<script setup lang="ts">
import type { LegalDocument } from "./types";

const props = defineProps<{ document: LegalDocument }>();

function goBack(): void {
  const pages = typeof getCurrentPages === "function" ? getCurrentPages() : [];
  if (pages.length > 1) {
    uni.navigateBack();
    return;
  }
  uni.reLaunch({ url: "/pages/login/index" });
}
</script>

<template>
  <view class="legal-page" :aria-label="props.document.title">
    <view class="legal-document">
      <text class="legal-document__meta" :selectable="true">更新日期：{{ props.document.updatedAt }}</text>
      <text class="legal-document__paragraph" :selectable="true">{{ props.document.introduction }}</text>

      <view v-for="section in props.document.sections" :key="section.title" class="legal-section">
        <text class="legal-section__title" :selectable="true">{{ section.title }}</text>
        <text
          v-for="(paragraph, index) in section.paragraphs"
          :key="index"
          class="legal-document__paragraph"
          :selectable="true"
        >{{ paragraph }}</text>
      </view>
    </view>

    <button class="legal-page__back" @tap="goBack">返回上一页</button>
  </view>
</template>

<style scoped lang="scss">
.legal-page {
  min-height: 100vh;
  padding: 16px 18px calc(28px + env(safe-area-inset-bottom));
  background: var(--gb-color-surface);
  color: var(--gb-color-text-primary);
}

.legal-document {
  font-size: 14px;
  line-height: 1.7;
  overflow-wrap: break-word;
}

.legal-document__meta {
  display: block;
  margin-bottom: 12px;
  color: var(--gb-color-text-secondary);
  font-size: 12px;
}

.legal-document__paragraph {
  display: block;
  margin-bottom: 10px;
}

.legal-section__title {
  display: block;
  margin: 18px 0 8px;
  font-size: 16px;
  font-weight: 600;
}

.legal-page__back {
  display: flex;
  width: 100%;
  min-height: 48px;
  align-items: center;
  justify-content: center;
  margin-top: 24px;
  border: 1px solid var(--gb-color-primary);
  border-radius: 8px;
  background: var(--gb-color-surface);
  color: var(--gb-color-primary);
  font-size: 15px;
  line-height: 48px;
}
</style>
