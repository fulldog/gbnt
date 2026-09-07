<script setup lang="ts">
import { Close } from "@element-plus/icons-vue";
import { computed, shallowRef, watch } from "vue";
import { useRoute, useRouter } from "vue-router";

const { items } = defineProps<{ items: readonly { title: string; path: string }[] }>();
const route = useRoute();
const router = useRouter();
const visited = shallowRef<string[]>([]);
const tabs = computed(() => visited.value.flatMap((path) => {
  const item = items.find((entry) => entry.path === path);
  return item ? [item] : [];
}));
watch(() => [route.path, items] as const, () => {
  const paths = visited.value.filter((path) => items.some((item) => item.path === path));
  if (items.some((item) => item.path === '/workbench') && !paths.includes('/workbench')) paths.unshift('/workbench');
  if (items.some((item) => item.path === route.path) && !paths.includes(route.path)) paths.push(route.path);
  visited.value = paths;
}, { immediate: true });
async function close(path: string): Promise<void> {
  const index = tabs.value.findIndex((item) => item.path === path);
  const next = tabs.value[index - 1] ?? tabs.value[index + 1] ?? items[0];
  if (route.path === path && next && next.path !== path) await router.push(next.path);
  visited.value = visited.value.filter((value) => value !== path);
}
</script>

<template>
  <nav class="route-tabs" aria-label="已打开页面">
    <div v-for="tab in tabs" :key="tab.path" class="route-tab" :class="{ 'is-active': route.path === tab.path }">
      <RouterLink :to="tab.path" :aria-current="route.path === tab.path ? 'page' : undefined">{{ tab.title }}</RouterLink>
      <button v-if="tab.path !== '/workbench' && tabs.length > 1" type="button" :aria-label="`关闭${tab.title}页签`" @click="close(tab.path)"><ElIcon><Close /></ElIcon></button>
    </div>
  </nav>
</template>

<style scoped>
.route-tabs { height: var(--gbnt-tabs-height); display: flex; flex-shrink: 0; align-items: center; gap: 4px; overflow-x: auto; padding: 3px 12px; border-bottom: 1px solid var(--gbnt-border); background: #fff; scrollbar-width: thin; }
.route-tab { display: flex; align-items: center; flex-shrink: 0; gap: 3px; height: 28px; border-radius: 6px; color: var(--gbnt-text-secondary); }
.route-tab.is-active { color: var(--gbnt-primary); background: #e8f3ff; font-weight: 600; }
a { padding: 4px 10px; color: inherit; text-decoration: none; white-space: nowrap; }
button { display: flex; align-items: center; justify-content: center; width: 22px; height: 22px; padding: 0; margin-right: 3px; border: 0; border-radius: 4px; background: transparent; color: #9ba5b5; cursor: pointer; }
button:hover { color: #333; background: #dcecff; }
</style>
