<script setup lang="ts">
import { Download, FullScreen, Refresh, Search } from "@element-plus/icons-vue";
import { ElMessage, vLoading } from "element-plus";
import { onBeforeUnmount, onMounted, shallowRef, useTemplateRef } from "vue";

defineProps<{ title: string; loading: boolean; exportDisabled: boolean; exporting?: boolean }>();
const emit = defineEmits<{ refresh: []; export: [table: HTMLTableElement] }>();
const root = useTemplateRef<HTMLElement>("root");
const filtersVisible = shallowRef(true);
const fullscreen = shallowRef(false);

function syncFullscreen(): void { fullscreen.value = document.fullscreenElement === root.value; }
async function toggleFullscreen(): Promise<void> {
  try {
    if (fullscreen.value) await document.exitFullscreen();
    else if (root.value?.requestFullscreen) await root.value.requestFullscreen();
    else ElMessage.warning("当前浏览器不支持全屏，请使用浏览器全屏功能");
  } catch { ElMessage.warning("无法进入全屏，请检查浏览器权限后重试"); }
}
function exportTable(): void {
  const table = root.value?.querySelector("table");
  if (table) emit("export", table);
}
onMounted(() => document.addEventListener("fullscreenchange", syncFullscreen));
onBeforeUnmount(() => {
  document.removeEventListener("fullscreenchange", syncFullscreen);
  if (fullscreen.value) void document.exitFullscreen().catch(() => undefined);
});
</script>

<template>
  <section ref="root" class="ledger-report-frame" :aria-label="title">
    <div v-show="filtersVisible"><slot name="filters" /></div>
    <slot name="errors" />
    <div class="ledger-report-card">
      <header class="ledger-toolbar">
        <h1>{{ title }}</h1>
        <div class="ledger-toolbar-actions" role="group" aria-label="报表工具栏">
          <ElButton :icon="Download" :disabled="exportDisabled" :loading="exporting" v-bind="{ title: 'Excel XML 格式（保留合并单元格）' }" @click="exportTable">导出 Excel</ElButton>
          <ElButton :icon="Search" circle v-bind="{ 'aria-label': filtersVisible ? '隐藏筛选' : '显示筛选', title: filtersVisible ? '隐藏筛选' : '显示筛选', 'aria-pressed': filtersVisible }" @click="filtersVisible = !filtersVisible" />
          <ElButton :icon="Refresh" circle v-bind="{ 'aria-label': '刷新报表', title: '刷新报表' }" :loading="loading" @click="$emit('refresh')" />
          <ElButton :icon="FullScreen" circle v-bind="{ 'aria-label': fullscreen ? '退出全屏' : '全屏查看', title: fullscreen ? '退出全屏' : '全屏查看', 'aria-pressed': fullscreen }" @click="toggleFullscreen" />
        </div>
      </header>
      <slot name="notice" />
      <div v-loading="loading" class="ledger-scroll-shell" :aria-busy="loading">
        <div class="ledger-scroll" tabindex="0" role="region" :aria-label="`${title}表格，可横向滚动查看全部列`"><slot /></div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.ledger-report-frame { display: flex; flex-direction: column; gap: 12px; min-width: 0; min-height: 560px; height: calc(100dvh - 156px); }
.ledger-report-frame:fullscreen { height: 100dvh; padding: 20px; background: var(--gbnt-bg, #f5f7fa); overflow: auto; }
.ledger-report-card { display: flex; flex: 1; flex-direction: column; min-width: 0; min-height: 340px; overflow: hidden; border-radius: 8px; background: #fff; }
.ledger-toolbar { display: flex; flex-shrink: 0; align-items: center; justify-content: space-between; gap: 16px; padding: 14px 16px; }
.ledger-toolbar h1 { margin: 0; font-size: 16px; font-weight: 600; color: #333; }
.ledger-toolbar-actions { display: flex; align-items: center; gap: 8px; }
.ledger-toolbar-actions :deep(.el-button + .el-button) { margin-left: 0; }
.ledger-scroll-shell { display: flex; flex: 1; min-width: 0; min-height: 260px; overflow: hidden; margin: 0 8px 8px; border-radius: 8px 8px 0 0; border: 1px solid #e8e8e8; }
.ledger-scroll { flex: 1; min-width: 0; min-height: 0; overflow: auto; overscroll-behavior: contain; }
@media (max-width: 640px) { .ledger-report-frame { height: auto; min-height: 0; } .ledger-scroll-shell { height: 60dvh; min-height: 320px; flex: auto; } .ledger-toolbar { align-items: flex-start; flex-wrap: wrap; } }
</style>
