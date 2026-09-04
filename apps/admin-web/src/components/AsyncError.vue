<script setup lang="ts">
defineProps<{ message: string }>();

const emit = defineEmits<{
  retry: [];
}>();
</script>

<template>
  <ElAlert :title="message" type="error" show-icon :closable="false">
    <template #default>
      <ElButton class="mt-3" type="danger" plain size="small" @click="emit('retry')">
        重新加载
      </ElButton>
    </template>
  </ElAlert>
</template>
