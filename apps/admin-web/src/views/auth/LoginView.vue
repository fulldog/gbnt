<script setup lang="ts">
import { Lock, Refresh, User } from "@element-plus/icons-vue";
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
      class="relative z-10 flex min-h-dvh w-full items-center justify-center bg-white px-6 py-10 shadow-[-16px_0_48px_rgba(15,23,42,0.08)] sm:px-10 min-[961px]:w-[40%] min-[961px]:min-w-[320px] min-[961px]:max-w-[520px] min-[961px]:px-14"
      aria-labelledby="login-title"
    >
      <div class="w-full max-w-[380px]" @submit.prevent="submit">
        <header class="mb-8">
          <img :src="appLogoUrl" alt="" class="mb-5 h-24 w-24 object-contain sm:h-28 sm:w-28" />
          <p class="m-0 text-sm text-slate-500">欢迎使用</p>
          <h1 id="login-title" class="mt-1 mb-0 text-xl font-bold text-slate-900">高标准农田专项整治平台</h1>
          <p class="mt-2 mb-0 text-sm text-slate-500">请输入管理员账号和图形验证码。</p>
        </header>

        <ElForm ref="formRef" :model="form" :rules="rules" label-position="top" size="large">
          <ElFormItem label="登录账号" prop="username">
            <ElInput v-model="form.username" :prefix-icon="User" autocomplete="username" placeholder="请输入登录账号" />
          </ElFormItem>
          <ElFormItem label="登录密码" prop="password">
            <ElInput
              v-model="form.password"
              type="password"
              show-password
              :prefix-icon="Lock"
              autocomplete="current-password"
              placeholder="请输入登录密码"
            />
          </ElFormItem>
          <ElFormItem label="图形验证码" prop="captcha">
            <div class="flex w-full items-stretch gap-2">
              <ElInput v-model="form.captcha" maxlength="8" placeholder="请输入验证码" />
              <button
                type="button"
                class="flex h-10 w-32 shrink-0 items-center justify-center overflow-hidden rounded-md border border-slate-300 bg-white hover:border-[var(--gbnt-primary)]"
                aria-label="刷新图形验证码"
                :disabled="captchaLoading"
                @click="loadCaptcha"
              >
                <img v-if="captchaImage" :src="captchaImage" alt="图形验证码" class="h-full w-full object-cover" />
                <ElIcon v-else class="animate-spin"><Refresh /></ElIcon>
              </button>
            </div>
          </ElFormItem>

          <div class="mb-6 flex items-center justify-between">
            <ElCheckbox :model-value="remember" @update:model-value="updateRemember">记住账号</ElCheckbox>
            <button type="button" class="text-sm text-[var(--gbnt-primary)] hover:underline" @click="loadCaptcha">
              看不清，换一张
            </button>
          </div>

          <ElButton native-type="submit" type="primary" class="!w-full" :loading="auth.loading">
            登录
          </ElButton>
        </ElForm>
      </div>
    </section>
  </main>
</template>
