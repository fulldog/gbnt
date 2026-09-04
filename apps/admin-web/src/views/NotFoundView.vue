<script setup lang="ts">
import { useRouter } from "vue-router";

const router = useRouter();
</script>

<template>
  <main class="grid min-h-dvh place-items-center bg-slate-50 p-6">
    <ElResult icon="warning" title="页面不存在" sub-title="当前地址没有对应的管理后台页面。">
      <template #extra>
        <ElButton type="primary" @click="router.replace('/workbench')">返回工作台</ElButton>
      </template>
    </ElResult>
  </main>
</template>
