<script setup lang="ts">
import type { SysOrg, SysRole, SysUser } from "@gbnt/api-client";
import { ElMessage } from "element-plus";
import type { FormInstance, FormRules } from "element-plus";
import { reactive, shallowRef, watch } from "vue";
import { useAdminApi } from "@/api/runtime";
import OrgTreeSelect from "@/components/OrgTreeSelect.vue";
import { errorMessage } from "@/utils/error";

const { user = null, orgs, roles } = defineProps<{
  user?: SysUser | null;
  orgs: readonly SysOrg[];
  roles: readonly SysRole[];
}>();

const emit = defineEmits<{ saved: [] }>();
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
  status: 1,
});

const rules: FormRules<typeof form> = {
  username: [{ required: true, message: "请输入登录账号", trigger: "blur" }],
  name: [{ required: true, message: "请输入姓名", trigger: "blur" }],
  org_id: [{ required: true, message: "请选择所属组织", trigger: "change" }],
  role_id: [{ required: true, message: "请选择角色", trigger: "change" }],
};

watch(visible, (open) => {
  if (!open) return;
  form.username = user?.username ?? "";
  form.password = "";
  form.name = user?.name ?? "";
  form.phone = user?.phone ?? "";
  form.org_id = user?.org_id || undefined;
  form.role_id = user?.role_id || undefined;
  form.status = user?.status ?? 1;
  formRef.value?.clearValidate();
});

async function submit(): Promise<void> {
  if (!(await formRef.value?.validate().catch(() => false))) return;
  if (!form.org_id || !form.role_id) return;
  submitting.value = true;
  try {
    if (user) {
      await api.users.update(user.id, {
        name: form.name.trim(),
        phone: form.phone.trim(),
        org_id: form.org_id,
        role_id: form.role_id,
        status: form.status,
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
        status: form.status,
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

function updateStatus(value: string | number | boolean | undefined): void {
  if (typeof value === "number") form.status = value;
}
</script>

<template>
  <ElDialog v-model="visible" :title="user ? '编辑工作人员' : '新增工作人员'" width="min(680px, 94vw)" destroy-on-close :close-on-click-modal="false">
    <ElForm ref="formRef" :model="form" :rules="rules" label-position="top">
      <div class="grid gap-x-4 sm:grid-cols-2">
        <ElFormItem label="登录账号" prop="username">
          <ElInput v-model="form.username" :disabled="Boolean(user)" maxlength="64" autocomplete="off" />
        </ElFormItem>
        <ElFormItem :label="user ? '新密码（不修改请留空）' : '初始密码（留空等于账号）'">
          <ElInput v-model="form.password" type="password" show-password autocomplete="new-password" />
        </ElFormItem>
        <ElFormItem label="姓名" prop="name"><ElInput v-model="form.name" maxlength="64" /></ElFormItem>
        <ElFormItem label="手机号"><ElInput v-model="form.phone" maxlength="32" /></ElFormItem>
        <ElFormItem label="所属组织" prop="org_id"><OrgTreeSelect v-model="form.org_id" :orgs="orgs" :clearable="false" /></ElFormItem>
        <ElFormItem label="角色" prop="role_id">
          <ElSelect v-model="form.role_id" class="w-full" filterable>
            <ElOption v-for="role in roles" :key="role.id" :label="role.name" :value="role.id" :disabled="role.status !== 1" />
          </ElSelect>
        </ElFormItem>
        <ElFormItem label="状态">
          <ElRadioGroup :model-value="form.status" @update:model-value="updateStatus">
            <ElRadio :value="1">启用</ElRadio>
            <ElRadio :value="0">停用</ElRadio>
          </ElRadioGroup>
        </ElFormItem>
      </div>
    </ElForm>
    <template #footer>
      <ElButton @click="visible = false">取消</ElButton>
      <ElButton type="primary" :loading="submitting" @click="submit">保存</ElButton>
    </template>
  </ElDialog>
</template>
