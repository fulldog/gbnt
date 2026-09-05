<script setup lang="ts">
import { computed, toRefs } from "vue";
import PhotoPicker from "@/components/media/PhotoPicker.vue";
import type { QuizDefinition } from "@/domain/issues/definitions";
import type { QuizFormItem, UploadedPhoto } from "@/domain/issues/form";
import {
  quizItemIndicatesIssue,
  quizMinimumPhotos,
} from "@/domain/issues/validation";
import type { IssueType } from "@gbnt/api-client";
import { inputEventValue, type InputEventLike } from "@/utils/events";

interface LocationInput {
  lat: number | null;
  lng: number | null;
  address: string;
}

const { item, definition, issueType, location } = toRefs(
  defineProps<{
    item: QuizFormItem;
    definition: QuizDefinition;
    issueType: IssueType;
    location: LocationInput;
  }>(),
);

const emit = defineEmits<{
  answer: [value: boolean];
  description: [value: string];
  photos: [value: UploadedPhoto[]];
}>();

const indicatesIssue = computed(() =>
  quizItemIndicatesIssue(issueType.value, item.value),
);
const minimumPhotos = computed(() =>
  item.value.value === null
    ? 0
    : quizMinimumPhotos(item.value.type, item.value.value),
);
const showPhotos = computed(
  () => item.value.value !== null && minimumPhotos.value > 0,
);

function updateDescription(event: Event | InputEventLike): void {
  emit("description", inputEventValue(event));
}
</script>

<template>
  <view class="quiz-card" :class="{ 'quiz-card--issue': indicatesIssue }">
    <view class="quiz-card__head">
      <view class="quiz-card__number">{{ definition.type === "water_out" ? "重点" : "检查" }}</view>
      <view class="quiz-card__copy">
        <text class="quiz-card__title">{{ definition.label }}</text>
        <text class="quiz-card__help">{{ definition.help }}</text>
      </view>
    </view>

    <view class="answer-row" role="radiogroup" :aria-label="definition.label">
      <button
        class="answer-button"
        :class="{ 'answer-button--selected': item.value === true }"
        :aria-checked="item.value === true"
        @tap="emit('answer', true)"
      >
        是
      </button>
      <button
        class="answer-button"
        :class="{ 'answer-button--selected': item.value === false }"
        :aria-checked="item.value === false"
        @tap="emit('answer', false)"
      >
        否
      </button>
    </view>

    <view v-if="indicatesIssue" class="quiz-field">
      <text class="quiz-field__label"><text class="required">*</text>问题说明</text>
      <textarea
        class="quiz-field__textarea"
        :value="item.desc"
        maxlength="500"
        auto-height
        placeholder="请描述现场问题，便于整改人员处理"
        @input="updateDescription"
      />
    </view>

    <view v-if="showPhotos" class="quiz-field">
      <text class="quiz-field__label">
        <text class="required">*</text>现场照片
        <text class="quiz-field__aside">至少 {{ minimumPhotos }} 张</text>
      </text>
      <PhotoPicker
        :model-value="item.photos"
        :camera-only="item.type === 'water_out' && item.value === true"
        :cooldown-seconds="item.type === 'water_out' && item.value === true ? 60 : 0"
        :location="location"
        @update:model-value="emit('photos', $event)"
      />
    </view>
  </view>
</template>

<style scoped lang="scss">
.quiz-card {
  padding: 28rpx;
  background: var(--color-surface);
  border: 2rpx solid var(--color-border);
  border-radius: var(--radius-lg);
  transition: border-color 180ms ease, background-color 180ms ease;
}

.quiz-card--issue {
  background: var(--color-warning-soft);
  border-color: var(--color-warning-border);
}

.quiz-card__head {
  display: flex;
  gap: 20rpx;
}

.quiz-card__number {
  display: grid;
  min-width: 72rpx;
  height: 48rpx;
  padding: 0 12rpx;
  color: var(--color-primary);
  font-size: 22rpx;
  font-weight: 700;
  background: var(--color-primary-soft);
  border-radius: 24rpx;
  place-items: center;
}

.quiz-card__copy {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 8rpx;
}

.quiz-card__title {
  color: var(--color-text);
  font-size: 30rpx;
  font-weight: 650;
  line-height: 1.45;
}

.quiz-card__help {
  color: var(--color-text-secondary);
  font-size: 24rpx;
  line-height: 1.55;
}

.answer-row {
  display: grid;
  margin-top: 24rpx;
  grid-template-columns: repeat(2, 1fr);
  gap: 20rpx;
}

.answer-button {
  min-height: 88rpx;
  margin: 0;
  color: var(--color-text-secondary);
  font-size: 29rpx;
  font-weight: 600;
  line-height: 88rpx;
  background: var(--color-surface-muted);
  border: 2rpx solid transparent;
  border-radius: var(--radius-md);
}

.answer-button::after {
  border: 0;
}

.answer-button--selected {
  color: var(--color-primary);
  background: var(--color-primary-soft);
  border-color: var(--color-primary);
}

.quiz-field {
  margin-top: 28rpx;
}

.quiz-field__label {
  display: block;
  margin-bottom: 12rpx;
  color: var(--color-text);
  font-size: 27rpx;
  font-weight: 600;
}

.quiz-field__aside {
  margin-left: 12rpx;
  color: var(--color-text-tertiary);
  font-size: 23rpx;
  font-weight: 400;
}

.required {
  margin-right: 6rpx;
  color: var(--color-danger);
}

.quiz-field__textarea {
  box-sizing: border-box;
  width: 100%;
  min-height: 176rpx;
  padding: 20rpx 24rpx;
  color: var(--color-text);
  font-size: 28rpx;
  line-height: 1.6;
  background: var(--color-surface);
  border: 2rpx solid var(--color-border-strong);
  border-radius: var(--radius-md);
}
</style>
