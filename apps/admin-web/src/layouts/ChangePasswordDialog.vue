<script setup lang="ts">
import { ElMessage } from "element-plus";
import type { FormInstance, FormRules } from "element-plus";
import { reactive, shallowRef } from "vue";
import { useRouter } from "vue-router";
import { useAdminApi } from "@/api/runtime";
import { useAuthStore } from "@/stores/auth";
import { usePermissionStore } from "@/stores/permission";
import { errorMessage } from "@/utils/error";

const visible = defineModel<boolean>({ required: true });
const api = useAdminApi();
const auth = useAuthStore();
const permission = usePermissionStore();
const router = useRouter();
const formRef = shallowRef<FormInstance>();
const submitting = shallowRef(false);
const form = reactive({ old_password: "", new_password: "", confirm_password: "" });

const rules: FormRules<typeof form> = {
  old_password: [{ required: true, message: "请输入当前密码", trigger: "blur" }],
  new_password: [
    { required: true, message: "请输入新密码", trigger: "blur" },
    { min: 6, message: "新密码至少 6 位", trigger: "blur" },
  ],
  confirm_password: [
    { required: true, message: "请再次输入新密码", trigger: "blur" },
    {
      validator: (_rule, value, callback) => {
        if (value !== form.new_password) callback(new Error("两次输入的新密码不一致"));
        else callback();
      },
      trigger: "blur",
    },
  ],
};

function reset(): void {
  form.old_password = "";
  form.new_password = "";
  form.confirm_password = "";
  formRef.value?.clearValidate();
}

async function submit(): Promise<void> {
  if (!(await formRef.value?.validate().catch(() => false))) return;
  submitting.value = true;
  try {
    await api.auth.changePassword({ ...form });
  } catch (error) {
    ElMessage.error(errorMessage(error, "密码修改失败"));
    return;
  } finally {
    submitting.value = false;
  }

  ElMessage.success("密码已修改，请重新登录");
  visible.value = false;
  auth.reset();
  permission.reset();
  await router.replace("/login");
}
</script>

<template>
  <ElDialog v-model="visible" title="修改密码" width="min(460px, 92vw)" destroy-on-close @closed="reset">
    <ElForm ref="formRef" :model="form" :rules="rules" label-position="top">
      <ElFormItem label="当前密码" prop="old_password">
        <ElInput v-model="form.old_password" type="password" show-password autocomplete="current-password" />
      </ElFormItem>
      <ElFormItem label="新密码" prop="new_password">
        <ElInput v-model="form.new_password" type="password" show-password autocomplete="new-password" />
      </ElFormItem>
      <ElFormItem label="确认新密码" prop="confirm_password">
        <ElInput v-model="form.confirm_password" type="password" show-password autocomplete="new-password" />
      </ElFormItem>
    </ElForm>
    <template #footer>
      <ElButton @click="visible = false">取消</ElButton>
      <ElButton type="primary" :loading="submitting" @click="submit">确认修改</ElButton>
    </template>
  </ElDialog>
</template>
