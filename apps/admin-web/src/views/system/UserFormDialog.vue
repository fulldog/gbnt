<script setup lang="ts">
import type { SysOrg, SysRole, SysUser } from "@gbnt/api-client";
import { ElMessage } from "element-plus";
import type { FormInstance, FormRules } from "element-plus";
import { reactive, shallowRef, watch } from "vue";
import { useAdminApi } from "@/api/runtime";
import OrgTreeSelect from "@/components/OrgTreeSelect.vue";
import AsyncError from "@/components/AsyncError.vue";
import { errorMessage } from "@/utils/error";

const { user = null, orgs, roles, sortSupported = false, optionsReady, optionsLoading, optionsError } = defineProps<{
  user?: SysUser | null;
  orgs: readonly SysOrg[];
  roles: readonly SysRole[];
  sortSupported?: boolean;
  optionsReady: boolean;
  optionsLoading: boolean;
  optionsError: string;
}>();

const emit = defineEmits<{ saved: []; retryOptions: [] }>();
const visible = defineModel<boolean>({ required: true });
const api = useAdminApi();
const formRef = shallowRef<FormInstance>();
const submitting = shallowRef(false);
const form = reactive({
  username: "",
  password: "",
  name: "",
  phone: "",
  org_id: undefined as number | undefined,
  role_id: undefined as number | undefined,
  sort: 100 as number | undefined,
});

const rules: FormRules<typeof form> = {
  username: [{ required: true, message: "请输入登录账号", trigger: "blur" }],
  name: [{ required: true, message: "请输入姓名", trigger: "blur" }],
  org_id: [{ required: true, message: "请选择所属单位", trigger: "change" }],
  role_id: [{ required: true, message: "请选择角色", trigger: "change" }],
  sort: [{ required: true, type: "integer", min: -2147483648, max: 2147483647, message: "请输入有效的排序整数", trigger: "change" }],
};

watch(visible, (open) => {
  if (!open) return;
  form.username = user?.username ?? "";
  form.password = "";
  form.name = user?.name ?? "";
  form.phone = user?.phone ?? "";
  form.org_id = user?.org_id || undefined;
  form.role_id = user?.role_id || undefined;
  form.sort = user?.sort ?? 100;
  formRef.value?.clearValidate();
});

async function submit(): Promise<void> {
  if (!optionsReady || optionsLoading || submitting.value) return;
  if (!(await formRef.value?.validate().catch(() => false))) return;
  if (!form.org_id || !form.role_id) return;
  if (!orgs.some((org) => org.id === form.org_id) || !roles.some((role) => role.id === form.role_id)) {
    ElMessage.error("所选单位或角色信息不可用，请重新选择后保存");
    return;
  }
  submitting.value = true;
  try {
    if (user) {
      await api.users.update(user.id, {
        name: form.name.trim(),
        phone: form.phone.trim(),
        org_id: form.org_id,
        role_id: form.role_id,
        ...(sortSupported ? { sort: form.sort } : {}),
        password: form.password.trim() || undefined,
      });
      ElMessage.success("工作人员已更新");
    } else {
      await api.users.create({
        username: form.username.trim(),
        password: form.password.trim() || undefined,
        name: form.name.trim(),
        phone: form.phone.trim(),
        org_id: form.org_id,
        role_id: form.role_id,
        ...(sortSupported ? { sort: form.sort } : {}),
        status: 1,
      });
      ElMessage.success("工作人员已新增");
    }
    visible.value = false;
    emit("saved");
  } catch (error) {
    ElMessage.error(errorMessage(error, user ? "工作人员更新失败" : "工作人员新增失败"));
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <ElDialog v-model="visible" :title="user ? '编辑工作人员' : '新增工作人员'" width="min(680px, 94vw)" destroy-on-close :close-on-click-modal="false">
    <AsyncError v-if="optionsError" class="mb-4" :message="optionsError" @retry="emit('retryOptions')" />
    <ElAlert v-else-if="!optionsReady" class="mb-4" type="info" :closable="false" title="正在加载单位和角色候选，请稍候。" />
    <ElAlert v-if="optionsReady && !sortSupported" class="mb-4" type="warning" :closable="false" title="当前服务暂不支持人员排序，需先完成数据库迁移并更新后端；其他资料仍可保存。" />
    <ElForm ref="formRef" :model="form" :rules="rules" :disabled="!optionsReady || submitting" label-position="right" label-width="100px">
      <div class="grid gap-x-4">
        <ElFormItem label="登录账号" prop="username">
          <ElInput v-model="form.username" :disabled="Boolean(user)" maxlength="64" autocomplete="off" />
        </ElFormItem>
        <ElFormItem label="所属单位" prop="org_id"><OrgTreeSelect v-model="form.org_id" :orgs="orgs" placeholder="请选择所属单位" :clearable="false" /></ElFormItem>
        <ElFormItem :label="user ? '新密码' : '初始密码'">
          <ElInput v-model="form.password" :placeholder="user ? '不修改请留空' : '留空时初始密码与账号一致'" type="password" show-password autocomplete="new-password" maxlength="14" />
        </ElFormItem>
        <ElFormItem label="姓名" prop="name"><ElInput v-model="form.name" maxlength="64" /></ElFormItem>
        <ElFormItem label="手机号"><ElInput v-model="form.phone" maxlength="32" /></ElFormItem>
        <ElFormItem label="角色" prop="role_id">
          <ElSelect v-model="form.role_id" class="w-full" filterable>
            <ElOption v-for="role in roles" :key="role.id" :label="`${role.name}（角色ID：${role.code || '未配置'}）`" :value="role.id" :disabled="role.status !== 1" />
          </ElSelect>
        </ElFormItem>
        <ElFormItem label="排序" prop="sort">
          <div class="w-full">
            <ElInputNumber v-model="form.sort" class="w-full" :min="-2147483648" :max="2147483647" :precision="0" :step="1" :disabled="!sortSupported" controls-position="right" />
            <div class="text-xs text-gray-500">数值越小越靠前，默认 100</div>
          </div>
        </ElFormItem>
      </div>
    </ElForm>
    <template #footer>
      <ElButton @click="visible = false">取消</ElButton>
      <ElButton type="primary" :loading="submitting || optionsLoading" :disabled="!optionsReady" @click="submit">保存</ElButton>
    </template>
  </ElDialog>
</template>
