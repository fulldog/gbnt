<script setup lang="ts">
import { computed, shallowRef } from "vue";
import { onHide, onLoad, onShow } from "@dcloudio/uni-app";
import AuthSlider from "@/components/auth/AuthSlider.vue";
import { useLoginInputFocus } from "@/composables/useLoginInputFocus";
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
const pageActive = shallowRef(true);
const compactLayout = shallowRef(false);
const sliderRef = shallowRef<SliderExpose | null>(null);
const { focusTarget, onFieldTouch, requestFocus, onFieldFocus, onFieldBlur, releaseFocus } =
  useLoginInputFocus(() => pageActive.value && !checkingSession.value && !authStore.loading);

function togglePassword(): void {
  if (authStore.loading) return;
  showPassword.value = !showPassword.value;
  void requestFocus("password", true);
}

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
  releaseFocus();
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
      agreed: true,
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
  // 仅按进入页面时的窗口选布局，键盘改变可视高度时不挪动输入框。
  try { compactLayout.value = uni.getWindowInfo().windowHeight <= 600; } catch { /* 使用标准布局。 */ }
  try {
    await authStore.restore();
    if (authStore.isAuthenticated) {
      await uni.switchTab({ url: "/pages/todo/index" });
    }
  } finally {
    checkingSession.value = false;
  }
});
onHide(() => { pageActive.value = false; });
onShow(() => { pageActive.value = true; });
</script>

<template>
  <view class="login-page" :class="{ 'login-page--compact': compactLayout }" @tap="releaseFocus">
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
          <view class="login-field__control" @touchstart="onFieldTouch('username')" @tap.stop>
            <image class="login-field__prefix" src="/static/icons/user-muted.png" mode="aspectFit" aria-hidden="true" />
            <input
              v-model="username"
              class="login-field__input"
              name="username"
              type="text"
              :focus="focusTarget === 'username'"
              placeholder="请输入账号"
              :disabled="authStore.loading"
              :cursor-spacing="96"
              :adjust-position="true"
              aria-label="账号"
              confirm-type="next"
              :confirm-hold="true"
              @focus="onFieldFocus('username')"
              @blur="onFieldBlur('username')"
              @confirm="requestFocus('password')"
            />
          </view>
        </view>

        <view class="login-field">
          <view class="login-field__control" @touchstart="onFieldTouch('password')" @tap.stop>
            <image class="login-field__prefix" src="/static/icons/lock-muted.png" mode="aspectFit" aria-hidden="true" />
            <input
              v-model="password"
              class="login-field__input"
              name="password"
              type="text"
              :focus="focusTarget === 'password'"
              :password="!showPassword"
              placeholder="请输入密码"
              :disabled="authStore.loading"
              :cursor-spacing="96"
              :adjust-position="true"
              aria-label="密码"
              confirm-type="done"
              @focus="onFieldFocus('password')"
              @blur="onFieldBlur('password')"
              @confirm="submit"
            />
            <button
              class="login-field__toggle"
              :aria-label="showPassword ? '隐藏密码' : '显示密码'"
              :disabled="authStore.loading"
              hover-class="login-field__toggle--pressed"
              @touchstart.stop
              @tap.stop="togglePassword"
            >
              <image :src="showPassword ? '/static/icons/eye-primary.png' : '/static/icons/eyeOff-primary.png'" class="login-field__eye" mode="aspectFit" aria-hidden="true" />
            </button>
          </view>
        </view>

        <view class="login-field login-field--slider">
          <AuthSlider
            ref="sliderRef"
            :disabled="authStore.loading"
            @invalidated="passToken = ''"
            @verified="onSliderVerified"
          />
        </view>

        <button
          class="login-card__submit"
          form-type="submit"
          :disabled="!canSubmit"
          :loading="authStore.loading"
        >
          {{ authStore.loading ? "正在登录" : "登录" }}
        </button>

        <checkbox-group class="login-agreement" @change="onAgreementChange">
          <label class="login-agreement__check" aria-label="同意用户协议与隐私政策">
            <checkbox class="login-agreement__native" value="agree" :checked="agreed" color="#015cbb" />
            <view class="login-agreement__mark" :class="{ 'login-agreement__mark--checked': agreed }" aria-hidden="true" />
          </label>
          <view class="login-agreement__text">
            <text>我已阅读并同意</text>
            <text class="login-agreement__link" role="link" hover-class="login-agreement__link--pressed" @tap.stop="openLegal('agreement')">
              《用户协议》
            </text>
            <text>和</text>
            <text class="login-agreement__link" role="link" hover-class="login-agreement__link--pressed" @tap.stop="openLegal('privacy')">
              《隐私政策》
            </text>
          </view>
        </checkbox-group>

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
  padding: max(108px, calc(64px + env(safe-area-inset-top, 0px))) 22px 20px;
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
  margin-top: 16px;
  font-size: 20px;
  font-weight: 700;
  letter-spacing: 0.01em;
  line-height: 1.4;
}

.login-page__checking,
.login-card {
  margin-top: 50px;
  border-radius: 8px;
  background: var(--gb-color-surface);
}

.login-page__checking {
  padding: 48px 20px;
  color: var(--gbnt-text-secondary, #526277);
  text-align: center;
}

.login-card {
  display: block;
  width: 100%;
  padding: 22px 18px 20px;
  box-sizing: border-box;
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

.login-field__control {
  position: relative;
  display: flex;
  height: 44px;
  align-items: center;
  overflow: hidden;
  border: 0;
  border-radius: 6px;
  background: #f0f4f8;
}

.login-field__prefix {
  flex: none;
  width: 18px;
  height: 18px;
  margin: 0 10px 0 12px;
}

.login-field__input {
  flex: 1;
  min-width: 0;
  height: 100%;
  margin: 0;
  padding: 0 12px 0 0;
  border: 0;
  background: transparent;
  color: inherit;
  box-shadow: none;
  font-size: 14px;
  line-height: 44px;
  box-sizing: border-box;
}

.login-field__toggle {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 44px;
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

.login-field__eye {
  width: 18px;
  height: 18px;
  filter: grayscale(1);
  opacity: .6;
}
.login-field__toggle--pressed {
  opacity: 0.65;
}

.login-agreement {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-top: 14px;
  color: var(--gbnt-text-secondary, #526277);
  font-size: 12px;
  line-height: 1.55;
}

.login-agreement__check {
  position: relative;
  display: flex;
  width: 16px;
  height: 20px;
  flex: none;
  align-items: center;
  justify-content: center;
}

.login-agreement__native {
  position: absolute;
  z-index: 1;
  top: -12px;
  left: -14px;
  width: 44px;
  height: 44px;
  opacity: 0;
}

.login-agreement__mark {
  position: relative;
  width: 16px;
  height: 16px;
  border: 1px solid #b7c6d8;
  border-radius: 50%;
  background: #fff;
  pointer-events: none;
}

.login-agreement__mark--checked {
  border-color: var(--gbnt-primary, #015cbb);
  background: var(--gbnt-primary, #015cbb);
}

.login-agreement__mark--checked::after {
  position: absolute;
  top: 1px;
  left: 4px;
  width: 4px;
  height: 8px;
  border: solid #fff;
  border-width: 0 1.5px 1.5px 0;
  transform: rotate(45deg);
  content: "";
}

.login-agreement__text {
  display: block;
  min-width: 0;
  flex: 1;
}

.login-agreement__link {
  display: inline;
  color: var(--gbnt-primary, #015cbb);
  font-size: inherit;
  line-height: inherit;
  vertical-align: baseline;
}

.login-agreement__link--pressed {
  opacity: 0.65;
}

.login-card__submit {
  display: flex;
  width: 100%;
  height: 44px;
  align-items: center;
  justify-content: center;
  margin: 20px 0 0;
  border-radius: 6px;
  background: var(--gbnt-primary, #015cbb);
  color: #ffffff;
  font-size: 16px;
  line-height: 44px;
  letter-spacing: 0.2em;
  text-indent: 0.2em;
  font-weight: 600;
}

.login-card__submit[disabled] {
  background: #92acd3;
  color: rgba(255, 255, 255, 0.9);
}

.login-card__submit::after {
  border: 0;
}

.login-page__footer {
  position: relative;
  z-index: 1;
  margin-top: auto;
  padding: 20px 16px calc(28px + env(safe-area-inset-bottom, 0px));
  color: var(--gb-color-text-secondary);
  font-size: 12px;
  text-align: center;
}

.login-page--compact {
  .login-page__content {
    padding-top: max(76px, calc(44px + env(safe-area-inset-top, 0px)));
  }
  .login-card, .login-page__checking {
    margin-top: 24px;
  }
}
.login-field__control:focus-within {
  background: #fff;
  box-shadow: inset 0 0 0 1px var(--gbnt-primary);
}
</style>
