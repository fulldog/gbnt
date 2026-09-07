<script setup lang="ts">
import { computed } from "vue";
const { values, label, color = '#015cbb' } = defineProps<{ values: readonly number[]; label: string; color?: string }>();
const points = computed(() => {
  const max = Math.max(1, ...values);
  return values.map((value, index) => ({ x: values.length === 1 ? 120 : 2 + index * 236 / (values.length - 1), y: 41 - value / max * 35 }));
});
const line = computed(() => points.value.map((point) => `${point.x},${point.y}`).join(' '));
</script>

<template>
  <svg viewBox="0 0 240 44" preserveAspectRatio="none" role="img" :aria-label="label">
    <title>{{ label }}</title>
    <template v-if="points.length > 1"><polygon :points="`2,44 ${line} 238,44`" :fill="color" fill-opacity=".08" /><polyline :points="line" fill="none" :stroke="color" stroke-width="2" vector-effect="non-scaling-stroke" /></template>
    <circle v-else-if="points[0]" :cx="points[0].x" :cy="points[0].y" r="3" :fill="color" />
  </svg>
</template>

<style scoped>
svg { display: block; height: 44px; width: 100%; }
</style>
