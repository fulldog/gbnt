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

const props = defineProps<{
  item: QuizFormItem;
  definition: QuizDefinition;
  issueType: IssueType;
  location: LocationInput;
  disabled?: boolean;
}>();
const { item, definition, issueType, location, disabled } = toRefs(props);

const emit = defineEmits<{
  answer: [change: { type: QuizFormItem['type']; value: boolean }];
  description: [change: { type: QuizFormItem['type']; value: string }];
  photos: [change: { type: QuizFormItem['type']; value: UploadedPhoto[] }];
  pending: [change: { type: QuizFormItem['type']; value: boolean }];
  permissionDenied: [];
  nativeOverlay: [visible: boolean];
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
  () => item.value.value !== null,
);

function updateDescription(event: Event | InputEventLike): void {
  emit("description", { type: item.value.type, value: inputEventValue(event) });
}
</script>

<template>
  <view class="quiz-card" :class="{ 'quiz-card--issue': indicatesIssue }">
    <view class="quiz-card__head">
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
        :disabled="disabled"
        @tap="emit('answer', { type: item.type, value: true })"
      >
        <view class="answer-mark" aria-hidden="true">
          <image v-if="item.value === true" class="answer-mark__icon" src="/static/icons/check-white.svg" mode="aspectFit" />
        </view>
        <text>是</text>
      </button>
      <button
        class="answer-button"
        :class="{ 'answer-button--selected': item.value === false }"
        :aria-checked="item.value === false"
        :disabled="disabled"
        @tap="emit('answer', { type: item.type, value: false })"
      >
        <view class="answer-mark" aria-hidden="true">
          <image v-if="item.value === false" class="answer-mark__icon" src="/static/icons/check-white.svg" mode="aspectFit" />
        </view>
        <text>否</text>
      </button>
    </view>

    <view v-if="item.value !== null" class="quiz-field">
      <text class="quiz-field__label"><text v-if="indicatesIssue" class="required">*</text>{{ indicatesIssue ? '问题说明' : '现场备注（选填）' }}</text>
      <textarea
        class="quiz-field__textarea"
        :value="item.desc"
        maxlength="500"
        auto-height
        :disabled="disabled"
        :placeholder="indicatesIssue ? '请描述现场问题，便于整改人员处理' : '可补充现场情况'"
        @input="updateDescription"
      />
    </view>

    <view v-if="showPhotos" class="quiz-field">
      <text class="quiz-field__label">
        <text v-if="minimumPhotos" class="required">*</text>现场照片
        <text class="quiz-field__aside">{{ minimumPhotos ? `至少 ${minimumPhotos} 张` : '选填，可补充照片' }}</text>
      </text>
      <PhotoPicker
        :model-value="item.photos"
        :camera-only="item.type === 'water_out' && item.value === true"
        :cooldown-seconds="item.type === 'water_out' && item.value === true ? 60 : 0"
        :location="location"
        @update:model-value="emit('photos', { type: item.type, value: $event })"
        @pending="emit('pending', { type: item.type, value: $event })"
        @permission-denied="emit('permissionDenied')"
        @native-overlay="emit('nativeOverlay', $event)"
      />
    </view>
  </view>
</template>

<style scoped lang="scss">
.quiz-card {
  background: #fff;
}
.quiz-card__copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 8px;
}
.quiz-card__title {
  color: var(--color-text);
  font-size: 24px;
  font-weight: 600;
  line-height: 1.35;
}
.quiz-card__help {
  color: var(--color-text-secondary);
  font-size: 12px;
  line-height: 1.55;
}
.answer-row {
  display: flex;
  gap: 12px;
  margin: 20px 0 16px;
}
.answer-button {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: center;
  gap: 10px;
  min-width: 0;
  height: 56px;
  margin: 0;
  padding: 0 12px;
  border: 0;
  border-radius: 8px;
  background: #f0f4f8;
  color: var(--color-text);
  font-size: 24px;
  font-weight: 600;
  line-height: 1;
}
.answer-mark {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: 1px solid #d9d9d9;
  border-radius: 50%;
  background: #fff;
}
.answer-mark__icon {
  flex: none;
  width: 18px;
  height: 18px;
}
.answer-button--selected {
  color: var(--color-primary);
  background: var(--color-primary-soft);
}
.answer-button--selected .answer-mark {
  border-color: var(--color-primary);
  background: var(--color-primary);
}
.quiz-field {
  margin-top: 16px;
}
.quiz-field__label {
  display: block;
  margin-bottom: 10px;
  color: var(--color-text);
  font-size: 14px;
  font-weight: 400;
}
.quiz-field__aside {
  margin-left: 6px;
  color: var(--color-text-tertiary);
  font-size: 12px;
}
.required {
  margin-right: 3px;
  color: var(--color-danger);
}
.quiz-field__textarea {
  width: 100%;
  min-height: 88px;
  padding: 10px 12px;
  border: 0;
  border-radius: 8px;
  background: #f0f4f8;
  color: var(--color-text);
  font-size: 14px;
  line-height: 1.6;
}
</style>
