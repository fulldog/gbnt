<script setup lang="ts">
import { useRouter } from "vue-router";
import { navigation } from "@/layouts/navigation";
import { usePermissionStore } from "@/stores/permission";

const router = useRouter();
const permission = usePermissionStore();

function goToAllowedPage(): void {
  const target = navigation.flatMap((item) => item.children ?? [item])
    .find((item) => item.path && (!item.module || permission.can(item.module)));
  void router.push(target?.path ?? "/login");
}
</script>

<template>
  <section class="forbidden-view">
    <ElResult icon="warning" title="无权访问此页面" sub-title="当前角色未获得该模块的查看权限。">
      <template #extra><ElButton type="primary" @click="goToAllowedPage">返回可访问页面</ElButton></template>
    </ElResult>
  </section>
</template>

<style scoped>
.forbidden-view { display: grid; flex: 1; min-height: 360px; place-items: center; border-radius: 8px; background: #fff; }
</style>
