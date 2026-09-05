<script setup lang="ts">
import { computed, shallowRef } from "vue";
import { onLoad } from "@dcloudio/uni-app";
import AuthSlider from "@/components/auth/AuthSlider.vue";
import { useAuthStore } from "@/stores/auth";

interface SliderExpose {
  reset: () => Promise<void>;
}

interface CheckboxChangeEvent {
  detail: { value: string[] };
}

const authStore = useAuthStore();
const username = shallowRef("");
const password = shallowRef("");
const passToken = shallowRef("");
const agreed = shallowRef(false);
const showPassword = shallowRef(false);
const errorMessage = shallowRef("");
const checkingSession = shallowRef(true);
const sliderRef = shallowRef<SliderExpose | null>(null);

const canSubmit = computed(
  () =>
    username.value.trim().length > 0 &&
    password.value.length > 0 &&
    passToken.value.length > 0 &&
    agreed.value &&
    !authStore.loading,
);

function errorText(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "登录失败，请稍后重试";
}

function onAgreementChange(event: CheckboxChangeEvent): void {
  agreed.value = event.detail.value.includes("agree");
}

function openLegal(page: "agreement" | "privacy"): void {
  uni.navigateTo({ url: `/pages-sub/legal/${page}` });
}

function onSliderVerified(token: string): void {
  passToken.value = token;
  errorMessage.value = "";
}

async function submit(): Promise<void> {
  if (!agreed.value) {
    uni.showToast({ title: "请先阅读并同意用户协议与隐私政策", icon: "none" });
    return;
  }
  if (!canSubmit.value) return;

  errorMessage.value = "";
  try {
    await authStore.signIn({
      username: username.value.trim(),
      password: password.value,
      pass_token: passToken.value,
    });
    await uni.switchTab({ url: "/pages/todo/index" });
  } catch (error) {
    errorMessage.value = errorText(error);
    passToken.value = "";
    uni.showToast({ title: errorMessage.value, icon: "none" });
    await sliderRef.value?.reset();
  }
}

onLoad(async () => {
  try {
    await authStore.restore();
    if (authStore.isAuthenticated) {
      await uni.switchTab({ url: "/pages/todo/index" });
    }
  } finally {
    checkingSession.value = false;
  }
});
</script>

<template>
  <view class="login-page">
    <image class="login-page__background" src="/static/brand/login-background.jpg" mode="aspectFill" aria-hidden="true" />

    <view class="login-page__content">
      <view class="login-page__brand">
        <image class="login-page__logo" src="/static/brand/logo.png" mode="aspectFit" aria-label="农田专项整治标志" />
        <text class="login-page__title">农田专项整治</text>
      </view>

      <view v-if="checkingSession" class="login-page__checking">
        <text>正在检查登录状态…</text>
      </view>

      <form v-else class="login-card" @submit="submit">
        <view v-if="errorMessage" class="login-card__error" role="alert">
          {{ errorMessage }}
        </view>

        <view class="login-field">
          <text class="login-field__label">账号</text>
          <view class="login-field__control">
            <image class="login-field__prefix" src="/static/icons/user-muted.png" mode="aspectFit" aria-hidden="true" />
            <input
              v-model="username"
              class="login-field__input"
              name="username"
              type="text"
              placeholder="请输入账号"
              :disabled="authStore.loading"
              :cursor-spacing="96"
              :adjust-position="true"
              aria-label="账号"
              confirm-type="next"
            />
          </view>
        </view>

        <view class="login-field">
          <text class="login-field__label">密码</text>
          <view class="login-field__control">
            <image class="login-field__prefix" src="/static/icons/lock-muted.png" mode="aspectFit" aria-hidden="true" />
            <input
              v-model="password"
              class="login-field__input login-field__input--password"
              name="password"
              :password="!showPassword"
              placeholder="请输入密码"
              :disabled="authStore.loading"
              :cursor-spacing="96"
              :adjust-position="true"
              aria-label="密码"
              confirm-type="done"
              @confirm="submit"
            />
            <button
              class="login-field__toggle"
              :aria-label="showPassword ? '隐藏密码' : '显示密码'"
              :disabled="authStore.loading"
              hover-class="login-field__toggle--pressed"
              @tap="showPassword = !showPassword"
            >
              <image :src="showPassword ? '/static/icons/eye-primary.png' : '/static/icons/eyeOff-primary.png'" class="login-field__eye" mode="aspectFit" aria-hidden="true" />
            </button>
          </view>
        </view>

        <view class="login-field login-field--slider">
          <text class="login-field__label">安全验证</text>
          <AuthSlider
            ref="sliderRef"
            :disabled="authStore.loading"
            @invalidated="passToken = ''"
            @verified="onSliderVerified"
          />
        </view>

        <checkbox-group class="login-agreement" @change="onAgreementChange">
          <label class="login-agreement__check" aria-label="同意用户协议与隐私政策">
            <checkbox value="agree" :checked="agreed" color="#015cbb" />
          </label>
          <view class="login-agreement__text">
            <text>我已阅读并同意</text>
            <button class="login-agreement__link" hover-class="login-agreement__link--pressed" @tap.stop="openLegal('agreement')">
              《用户协议》
            </button>
            <text>和</text>
            <button class="login-agreement__link" hover-class="login-agreement__link--pressed" @tap.stop="openLegal('privacy')">
              《隐私政策》
            </button>
          </view>
        </checkbox-group>

        <button
          class="login-card__submit"
          form-type="submit"
          :disabled="!canSubmit"
          :loading="authStore.loading"
        >
          {{ authStore.loading ? "正在登录" : "登录" }}
        </button>

        <text class="login-card__legal-note">协议页面当前为开发占位，上线前必须替换为正式法务文本</text>
      </form>
    </view>

    <view class="login-page__footer">
      <text>聊城经济技术开发区管委会</text>
    </view>
  </view>
</template>

<style scoped lang="scss">
.login-page {
  position: relative;
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background: var(--gb-color-background);
  color: var(--gbnt-text, #152033);
}

.login-page__background {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100vh;
  pointer-events: none;
}

.login-page__content {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 480px;
  margin: 0 auto;
  padding: calc(68px + env(safe-area-inset-top)) 22px 20px;
}

.login-page__brand {
  display: flex;
  flex-direction: column;
  align-items: center;
  color: var(--gb-color-text-primary);
}

.login-page__logo {
  display: block;
  width: 72px;
  height: 72px;
  border-radius: 50%;
  background: var(--gb-color-surface);
}

.login-page__title {
  margin-top: 14px;
  font-size: 20px;
  font-weight: 700;
  letter-spacing: 2px;
}

.login-page__checking,
.login-card {
  margin-top: 42px;
  border-radius: var(--gb-radius-lg);
  background: var(--gb-color-surface);
}

.login-page__checking {
  padding: 48px 20px;
  color: var(--gbnt-text-secondary, #526277);
  text-align: center;
}

.login-card {
  padding: 22px 20px 20px;
}

.login-card__error {
  margin-bottom: 16px;
  padding: 10px 12px;
  border: 1px solid #f3b7b3;
  border-radius: 6px;
  background: #fff4f3;
  color: var(--gbnt-danger, #b42318);
  font-size: 13px;
  line-height: 1.5;
}

.login-field + .login-field {
  margin-top: 16px;
}

.login-field__label {
  display: block;
  margin-bottom: 7px;
  color: var(--gbnt-text, #152033);
  font-size: 14px;
  font-weight: 600;
}

.login-field__control {
  position: relative;
  display: flex;
  height: 48px;
  align-items: center;
  border: 1px solid var(--gbnt-border, #dce4ee);
  border-radius: 6px;
  background: #ffffff;
}

.login-field__prefix {
  flex: none;
  width: 20px;
  height: 20px;
  margin: 0 12px;
}

.login-field__input {
  flex: 1;
  min-width: 0;
  height: 48px;
  padding-right: 12px;
  font-size: 16px;
  box-sizing: border-box;
}

.login-field__input--password {
  padding-right: 64px;
}

.login-field__toggle {
  position: absolute;
  top: 2px;
  right: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 52px;
  height: 44px;
  margin: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--gbnt-primary, #015cbb);
  font-size: 13px;
  line-height: 44px;
}

.login-field__toggle::after {
  border: 0;
}

.login-field__eye { width: 22px; height: 22px; }
.login-field__toggle--pressed { opacity: 0.65; }

.login-field--slider {
  margin-bottom: 4px;
}

.login-agreement {
  display: flex;
  align-items: center;
  margin-top: 14px;
  color: var(--gbnt-text-secondary, #526277);
  font-size: 13px;
  line-height: 1.8;
}

.login-agreement__check {
  display: flex;
  width: 44px;
  height: 44px;
  flex: none;
  align-items: center;
  justify-content: flex-start;
}

.login-agreement__check checkbox {
  transform: scale(0.8);
  transform-origin: left center;
}

.login-agreement__text {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  min-width: 0;
  flex: 1;
}

.login-agreement__link {
  display: inline-flex;
  min-width: 44px;
  min-height: 44px;
  align-items: center;
  justify-content: center;
  margin: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--gbnt-primary, #015cbb);
  font-size: inherit;
  line-height: 1.5;
}

.login-agreement__link::after { border: 0; }
.login-agreement__link--pressed { opacity: 0.65; }

.login-card__submit {
  display: flex;
  width: 100%;
  height: 48px;
  align-items: center;
  justify-content: center;
  margin-top: 12px;
  border-radius: 6px;
  background: var(--gbnt-primary, #015cbb);
  color: #ffffff;
  font-size: 16px;
  line-height: 48px;
}

.login-card__submit[disabled] {
  background: #a9bfd8;
  color: rgba(255, 255, 255, 0.9);
}

.login-card__submit::after {
  border: 0;
}

.login-card__legal-note {
  display: block;
  margin-top: 12px;
  color: var(--gb-color-text-secondary);
  font-size: 12px;
  line-height: 1.5;
  text-align: center;
}

.login-page__footer {
  position: relative;
  z-index: 1;
  margin-top: auto;
  padding: 16px 16px calc(24px + env(safe-area-inset-bottom));
  color: var(--gb-color-text-secondary);
  font-size: 12px;
  text-align: center;
}

@media (max-height: 600px) {
  .login-page__content { padding-top: calc(32px + env(safe-area-inset-top)); }
  .login-card, .login-page__checking { margin-top: 24px; }
}
</style>
