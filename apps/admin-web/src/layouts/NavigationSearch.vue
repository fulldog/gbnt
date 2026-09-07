<script setup lang="ts">
import { Search } from "@element-plus/icons-vue";
import type { InputInstance } from "element-plus";
import { computed, onBeforeUnmount, onMounted, shallowRef, useTemplateRef, watch } from "vue";
import { useRouter } from "vue-router";

const { items } = defineProps<{ items: readonly { title: string; path: string }[] }>();
const router = useRouter();
const visible = shallowRef(false);
const keyword = shallowRef("");
const current = shallowRef(0);
const input = useTemplateRef<InputInstance>("input");
const results = computed(() => items.filter((item) => item.title.includes(keyword.value.trim())));
watch(keyword, () => { current.value = 0; });
function open(): void { keyword.value = ""; visible.value = true; }
async function navigate(path?: string): Promise<void> {
  if (!path) return;
  await router.push(path);
  visible.value = false;
}
function shortcut(event: KeyboardEvent): void {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); open(); }
}
onMounted(() => window.addEventListener('keydown', shortcut));
onBeforeUnmount(() => window.removeEventListener('keydown', shortcut));
</script>

<template>
  <button class="nav-search-trigger" type="button" aria-label="搜索导航菜单" @click="open"><ElIcon><Search /></ElIcon><span>搜索导航菜单</span><kbd>⌘ K</kbd></button>
  <ElDialog v-model="visible" title="搜索导航菜单" width="min(520px, 92vw)" top="15vh" @opened="input?.focus()">
    <ElInput ref="input" v-model="keyword" placeholder="输入页面名称" clearable :prefix-icon="Search" @keydown.down.prevent="current = Math.min(current + 1, results.length - 1)" @keydown.up.prevent="current = Math.max(current - 1, 0)" @keydown.enter.prevent="navigate(results[current]?.path)"  v-bind="{ 'aria-label': '页面名称' }" />
    <div class="nav-results">
      <button v-for="(item, index) in results" :key="item.path" type="button" :class="{ active: index === current }" @click="navigate(item.path)">{{ item.title }}<span>↵</span></button>
      <ElEmpty v-if="!results.length" description="没有匹配的页面" :image-size="64" />
    </div>
  </ElDialog>
</template>

<style scoped>
.nav-search-trigger { display: flex; align-items: center; gap: 8px; border: 0; background: #f5f7fa; color: var(--gbnt-text-secondary); padding: 5px 10px; border-radius: 6px; cursor: pointer; }
kbd { font-size: 12px; border: 1px solid #e2e8f0; background: #fff; border-radius: 3px; padding: 0 4px; }
.nav-results { display: grid; gap: 4px; padding-top: 12px; }
.nav-results button { display: flex; justify-content: space-between; padding: 10px 12px; text-align: left; border: 0; border-radius: 6px; background: #fff; cursor: pointer; }
.nav-results button.active, .nav-results button:hover { color: var(--gbnt-primary); background: var(--gbnt-primary-soft); }
.nav-results span { color: #9ba5b5; }
@media (max-width: 767px) { .nav-search-trigger span, kbd { display: none; } }
</style>
