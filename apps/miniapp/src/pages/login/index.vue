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
    <view class="login-page__decor login-page__decor--one" />
    <view class="login-page__decor login-page__decor--two" />

    <view class="login-page__content">
      <view class="login-page__brand">
        <view class="login-page__logo" aria-hidden="true">
          <text class="login-page__logo-mark">田</text>
        </view>
        <text class="login-page__title">农田专项整治</text>
        <text class="login-page__subtitle">现场巡查与整改工作平台</text>
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
            <text class="login-field__prefix" aria-hidden="true">人</text>
            <input
              v-model="username"
              class="login-field__input"
              name="username"
              type="text"
              placeholder="请输入账号"
              :disabled="authStore.loading"
              confirm-type="next"
            />
          </view>
        </view>

        <view class="login-field">
          <text class="login-field__label">密码</text>
          <view class="login-field__control">
            <text class="login-field__prefix" aria-hidden="true">锁</text>
            <input
              v-model="password"
              class="login-field__input login-field__input--password"
              name="password"
              :password="!showPassword"
              placeholder="请输入密码"
              :disabled="authStore.loading"
              confirm-type="done"
              @confirm="submit"
            />
            <button
              class="login-field__toggle"
              :aria-label="showPassword ? '隐藏密码' : '显示密码'"
              @tap="showPassword = !showPassword"
            >
              {{ showPassword ? "隐藏" : "显示" }}
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
          <label class="login-agreement__check">
            <checkbox value="agree" :checked="agreed" color="#015cbb" />
          </label>
          <view class="login-agreement__text">
            <text>我已阅读并同意</text>
            <text class="login-agreement__link" @tap.stop="openLegal('agreement')">
              《用户协议》
            </text>
            <text>和</text>
            <text class="login-agreement__link" @tap.stop="openLegal('privacy')">
              《隐私政策》
            </text>
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
  min-height: 100vh;
  overflow: hidden;
  background: linear-gradient(160deg, #015cbb 0%, #0b4d93 42%, #eef5fb 42.2%, #ffffff 76%);
  color: var(--gbnt-text, #152033);
}

.login-page__decor {
  position: absolute;
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 50%;
}

.login-page__decor--one {
  top: -90px;
  right: -110px;
  width: 300px;
  height: 300px;
}

.login-page__decor--two {
  top: 82px;
  left: -86px;
  width: 210px;
  height: 210px;
}

.login-page__content {
  position: relative;
  z-index: 1;
  padding: calc(54px + env(safe-area-inset-top)) 24px 100px;
}

.login-page__brand {
  display: flex;
  flex-direction: column;
  align-items: center;
  color: #ffffff;
}

.login-page__logo {
  display: flex;
  width: 68px;
  height: 68px;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(255, 255, 255, 0.5);
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.15);
}

.login-page__logo-mark {
  font-size: 34px;
  font-weight: 700;
}

.login-page__title {
  margin-top: 14px;
  font-size: 26px;
  font-weight: 700;
  letter-spacing: 2px;
}

.login-page__subtitle {
  margin-top: 7px;
  color: rgba(255, 255, 255, 0.82);
  font-size: 13px;
}

.login-page__checking,
.login-card {
  margin-top: 34px;
  border: 1px solid rgba(220, 228, 238, 0.9);
  border-radius: 10px;
  background: #ffffff;
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
  width: 46px;
  color: var(--gbnt-text-secondary, #526277);
  font-size: 13px;
  text-align: center;
}

.login-field__input {
  flex: 1;
  height: 48px;
  padding-right: 12px;
  font-size: 15px;
  box-sizing: border-box;
}

.login-field__input--password {
  padding-right: 64px;
}

.login-field__toggle {
  position: absolute;
  top: 2px;
  right: 0;
  width: 60px;
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

.login-field--slider {
  margin-bottom: 4px;
}

.login-agreement {
  display: flex;
  align-items: flex-start;
  margin-top: 14px;
  color: var(--gbnt-text-secondary, #526277);
  font-size: 12px;
  line-height: 1.8;
}

.login-agreement__check {
  display: flex;
  width: 44px;
  height: 44px;
  flex: none;
  align-items: center;
  justify-content: flex-start;
  margin-top: -7px;
}

.login-agreement__check checkbox {
  transform: scale(0.8);
  transform-origin: left center;
}

.login-agreement__text {
  flex: 1;
}

.login-agreement__link {
  color: var(--gbnt-primary, #015cbb);
}

.login-card__submit {
  display: flex;
  width: 100%;
  height: 48px;
  align-items: center;
  justify-content: center;
  margin-top: 12px;
  border-radius: 6px;
  background: var(--gbnt-primary, #015cbb);
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
  color: #8a94a3;
  font-size: 11px;
  line-height: 1.5;
  text-align: center;
}

.login-page__footer {
  position: absolute;
  right: 0;
  bottom: calc(18px + env(safe-area-inset-bottom));
  left: 0;
  z-index: 1;
  color: #738196;
  font-size: 12px;
  text-align: center;
}
</style>
