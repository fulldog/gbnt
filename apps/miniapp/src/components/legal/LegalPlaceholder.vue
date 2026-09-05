<script setup lang="ts">
import type { LegalPlaceholderSection } from "./types";

defineProps<{
  title: string;
  summary: string;
  sections: LegalPlaceholderSection[];
}>();

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
  <view class="legal-page">
    <view class="legal-notice" role="alert">
      <text class="legal-notice__tag">开发占位</text>
      <text class="legal-notice__title">本页不是正式法务文本</text>
      <text class="legal-notice__text">
        当前内容只列出上线前需要补齐的范围，不能用于提交审核或面向真实用户发布。
      </text>
    </view>

    <view class="legal-document">
      <text class="legal-document__title">{{ title }}</text>
      <text class="legal-document__status">状态：待业务负责人和法务确认</text>
      <text class="legal-document__summary">{{ summary }}</text>

      <view
        v-for="(section, index) in sections"
        :key="section.title"
        class="legal-section"
      >
        <text class="legal-section__title">{{ index + 1 }}. {{ section.title }}</text>
        <text class="legal-section__text">{{ section.description }}</text>
      </view>
    </view>

    <button class="legal-page__back" @tap="goBack">返回上一页</button>
  </view>
</template>

<style scoped lang="scss">
.legal-page {
  min-height: 100vh;
  padding: 14px 14px calc(28px + env(safe-area-inset-bottom));
  background: var(--gbnt-bg, #eef3f8);
  color: var(--gbnt-text, #152033);
  box-sizing: border-box;
}

.legal-notice {
  display: flex;
  flex-direction: column;
  padding: 14px;
  border: 1px solid #f0c36d;
  border-radius: 8px;
  background: #fff8e8;
}

.legal-notice__tag {
  align-self: flex-start;
  padding: 3px 7px;
  border-radius: 4px;
  background: #f5d99d;
  color: #7a4700;
  font-size: 11px;
  font-weight: 600;
}

.legal-notice__title {
  margin-top: 9px;
  color: #744a0a;
  font-size: 15px;
  font-weight: 600;
}

.legal-notice__text {
  margin-top: 5px;
  color: #795b2c;
  font-size: 13px;
  line-height: 1.6;
}

.legal-document {
  margin-top: 12px;
  padding: 22px 17px;
  border: 1px solid var(--gbnt-border, #dce4ee);
  border-radius: 8px;
  background: #ffffff;
}

.legal-document__title {
  display: block;
  font-size: 22px;
  font-weight: 700;
  text-align: center;
}

.legal-document__status {
  display: block;
  margin-top: 9px;
  color: #a45b00;
  font-size: 12px;
  text-align: center;
}

.legal-document__summary {
  display: block;
  margin-top: 22px;
  color: var(--gbnt-text-secondary, #526277);
  font-size: 14px;
  line-height: 1.75;
}

.legal-section {
  display: flex;
  flex-direction: column;
  margin-top: 22px;
}

.legal-section__title {
  font-size: 15px;
  font-weight: 600;
}

.legal-section__text {
  margin-top: 8px;
  color: var(--gbnt-text-secondary, #526277);
  font-size: 14px;
  line-height: 1.75;
}

.legal-page__back {
  display: flex;
  width: 100%;
  height: 48px;
  align-items: center;
  justify-content: center;
  margin-top: 18px;
  border: 1px solid var(--gbnt-primary, #015cbb);
  border-radius: 8px;
  background: #ffffff;
  color: var(--gbnt-primary, #015cbb);
  font-size: 15px;
  line-height: 48px;
}

.legal-page__back::after {
  border: 0;
}
</style>
