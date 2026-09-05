<script setup lang="ts">
import type { OrgOption } from "@/api/types";
import { computed } from "vue";
import { orgTreeSelectData } from "@/utils/org";

const { orgs, placeholder = "请选择组织", clearable = true, disabled = false } = defineProps<{
  orgs: readonly OrgOption[];
  placeholder?: string;
  clearable?: boolean;
  disabled?: boolean;
}>();

const model = defineModel<number | undefined>({ required: true });
const tree = computed(() => orgTreeSelectData(orgs));
</script>

<template>
  <ElTreeSelect
    v-model="model"
    :data="tree"
    :placeholder="placeholder"
    :clearable="clearable"
    :disabled="disabled"
    check-strictly
    filterable
    default-expand-all
    class="w-full"
  />
</template>
