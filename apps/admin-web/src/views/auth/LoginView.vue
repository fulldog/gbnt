<script setup lang="ts">
import { Iphone, Refresh, Right } from "@element-plus/icons-vue";
import { ElMessage } from "element-plus";
import type { CheckboxValueType, FormInstance, FormRules } from "element-plus";
import { onMounted, reactive, shallowRef } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useAdminApi } from "@/api/runtime";
import appLogoUrl from "@/assets/app-logo.png";
import loginBackgroundUrl from "@/assets/login-background.png";
import { useAuthStore } from "@/stores/auth";
import { errorMessage } from "@/utils/error";

const api = useAdminApi();
const auth = useAuthStore();
const route = useRoute();
const router = useRouter();
const formRef = shallowRef<FormInstance>();
const captchaImage = shallowRef("");
const captchaLoading = shallowRef(false);
const remember = shallowRef(Boolean(auth.rememberedAccount));
const form = reactive({
  username: auth.rememberedAccount,
  password: "",
  captcha_id: "",
  captcha: "",
});

const rules: FormRules<typeof form> = {
  username: [{ required: true, message: "请输入登录账号", trigger: "blur" }],
  password: [{ required: true, message: "请输入登录密码", trigger: "blur" }],
  captcha: [{ required: true, message: "请输入图形验证码", trigger: "blur" }],
};

async function loadCaptcha(): Promise<void> {
  captchaLoading.value = true;
  try {
    const result = await api.auth.getCaptcha();
    form.captcha_id = result.captcha_id;
    form.captcha = "";
    captchaImage.value = result.image_base64;
  } catch (error) {
    ElMessage.error(errorMessage(error, "验证码加载失败"));
  } finally {
    captchaLoading.value = false;
  }
}

function safeRedirect(value: unknown): string {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//")
    ? value
    : "/workbench";
}

async function submit(): Promise<void> {
  if (!(await formRef.value?.validate().catch(() => false))) return;
  try {
    await auth.signIn({ ...form }, remember.value);
  } catch (error) {
    ElMessage.error(errorMessage(error, "登录失败"));
    await loadCaptcha();
    return;
  }

  ElMessage.success("登录成功");
  await router.replace(safeRedirect(route.query.redirect));
}

function updateRemember(value: CheckboxValueType): void {
  remember.value = Boolean(value);
}

onMounted(() => {
  void loadCaptcha();
});
</script>

<template>
  <main class="relative flex h-dvh justify-end overflow-x-hidden overflow-y-auto bg-[#0a1f36]">
    <img
      :src="loginBackgroundUrl"
      alt=""
      class="pointer-events-none fixed inset-0 h-full w-full object-cover object-center"
      aria-hidden="true"
    />

    <section
      class="login-panel"
      aria-labelledby="login-title"
    >
      <div class="w-full max-w-[380px]" @submit.prevent="submit">
        <header class="mb-8">
          <img :src="appLogoUrl" alt="" class="mb-4 h-32 w-32 object-contain" />
          <p class="m-0 text-sm text-slate-500">欢迎使用</p>
          <h1 id="login-title" class="mt-1.5 mb-0 text-xl font-bold text-slate-900">高标准农田专项整治平台</h1>
        </header>

        <ElForm ref="formRef" :model="form" :rules="rules" label-position="top" size="large" class="login-form" hide-required-asterisk>
          <ElFormItem label="账号" prop="username">
            <ElInput v-model="form.username" :suffix-icon="Iphone" autocomplete="username" placeholder="请输入登录账号" />
          </ElFormItem>
          <ElFormItem label="密码" prop="password">
            <ElInput
              v-model="form.password"
              type="password"
              show-password
              autocomplete="current-password"
              placeholder="请输入登录密码"
            />
          </ElFormItem>
          <ElFormItem label="验证码" prop="captcha">
            <div class="flex w-full items-stretch gap-2.5">
              <ElInput v-model="form.captcha" maxlength="8" placeholder="请输入验证码" />
              <button
                type="button"
                class="flex h-11 w-30 shrink-0 items-center justify-center overflow-hidden rounded-md border border-slate-200 bg-white hover:border-[var(--gbnt-primary)]"
                aria-label="刷新图形验证码"
                :disabled="captchaLoading"
                @click="loadCaptcha"
              >
                <img v-if="captchaImage" :src="captchaImage" alt="图形验证码" class="h-full w-full object-cover" />
                <ElIcon v-else class="animate-spin"><Refresh /></ElIcon>
              </button>
            </div>
          </ElFormItem>

          <div class="login-remember">
            <ElCheckbox :model-value="remember" @update:model-value="updateRemember">记住账号</ElCheckbox>
          </div>
          <ElButton native-type="submit" type="primary" class="login-submit" :loading="auth.loading" v-bind="{ 'aria-label': '登录' }">
            <ElIcon v-if="!auth.loading" :size="22"><Right /></ElIcon><span class="sr-only">登录</span>
          </ElButton>
        </ElForm>
      </div>
    </section>
  </main>
</template>

<style scoped>
.login-panel { position: relative; z-index: 1; display: flex; align-items: center; justify-content: center; width: 40%; min-width: 320px; max-width: 520px; min-height: 100dvh; padding: 48px 56px; background: #fff; }
.login-form :deep(.el-form-item) { margin-bottom: 18px; }
.login-form :deep(.el-form-item__label) { margin-bottom: 8px; height: auto; padding: 0; line-height: 1.4; font-size: 14px; font-weight: 500; }
.login-form :deep(.el-input__wrapper) { min-height: 44px; border-radius: 6px; padding: 0 14px; box-shadow: 0 0 0 1px #e2e8f0 inset; }
.login-form :deep(.el-input__wrapper.is-focus) { box-shadow: 0 0 0 1px var(--gbnt-primary) inset; }
.login-form :deep(.el-input__inner) { height: 44px; font-size: 14px; }
/* 裁剪浏览器自动填充底色，避免覆盖外层输入框描边。 */
.login-form :deep(.el-input__inner:is(:autofill, :-webkit-autofill)) {
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: var(--el-input-text-color, var(--el-text-color-regular));
  caret-color: var(--el-input-text-color, var(--el-text-color-regular));
}
.login-remember { margin: 0 0 18px; }
.login-remember :deep(.el-checkbox) { height: 22px; color: #6b7a90; }
.login-submit { width: 32%; height: 44px; padding: 0; }
@media (max-width: 960px) { .login-panel { width: 100%; min-width: 0; max-width: none; padding: 40px 24px; } }
</style>
