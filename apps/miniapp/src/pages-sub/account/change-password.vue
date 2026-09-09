<script setup lang="ts">
import { computed, shallowRef } from "vue";
import { onLoad } from "@dcloudio/uni-app";
import { useAuthStore } from "@/stores/auth";

type PasswordField = "old" | "next" | "confirm";

const authStore = useAuthStore();
const oldPassword = shallowRef("");
const newPassword = shallowRef("");
const confirmPassword = shallowRef("");
const showOldPassword = shallowRef(false);
const showNewPassword = shallowRef(false);
const showConfirmPassword = shallowRef(false);
const submitting = shallowRef(false);
const errorMessage = shallowRef("");

const canSubmit = computed(
  () =>
    oldPassword.value.length > 0 &&
    newPassword.value.length > 0 &&
    confirmPassword.value.length > 0 &&
    !submitting.value,
);

function toggleVisibility(field: PasswordField): void {
  if (field === "old") showOldPassword.value = !showOldPassword.value;
  if (field === "next") showNewPassword.value = !showNewPassword.value;
  if (field === "confirm") showConfirmPassword.value = !showConfirmPassword.value;
}

function errorText(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "密码修改失败";
}

function validate(): string {
  if (!oldPassword.value) return "请填写原密码";
  if (!newPassword.value) return "请填写新密码";
  if (!confirmPassword.value) return "请再次输入新密码";
  if (newPassword.value !== confirmPassword.value) return "两次输入的新密码不一致";
  if (oldPassword.value === newPassword.value) return "新密码不能与原密码相同";
  if (!/^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d]{6,14}$/.test(newPassword.value)) {
    return "新密码须为 6–14 位字母与数字组合";
  }
  return "";
}

async function submit(): Promise<void> {
  if (submitting.value) return;
  const message = validate();
  if (message) {
    errorMessage.value = message;
    uni.showToast({ title: message, icon: "none" });
    return;
  }

  submitting.value = true;
  errorMessage.value = "";
  uni.hideKeyboard();
  try {
    await authStore.changePassword({
      old_password: oldPassword.value,
      new_password: newPassword.value,
      confirm_password: confirmPassword.value,
    });
    uni.showToast({ title: "密码已修改，请重新登录", icon: "success", duration: 1200 });
    setTimeout(() => {
      uni.reLaunch({ url: "/pages/login/index" });
    }, 1200);
  } catch (error) {
    errorMessage.value = errorText(error);
    uni.showToast({ title: errorMessage.value, icon: "none" });
  } finally {
    submitting.value = false;
  }
}

onLoad(async () => {
  await authStore.restore();
  if (!authStore.token) uni.reLaunch({ url: "/pages/login/index" });
});
</script>

<template>
  <view class="password-page">
    <form class="password-card" @submit="submit">
      <view v-if="errorMessage" class="password-card__error" role="alert">
        {{ errorMessage }}
      </view>

      <view class="password-field">
        <text class="password-field__label">原密码</text>
        <view class="password-field__control">
          <input
            v-model="oldPassword"
            class="password-field__input"
            :password="!showOldPassword"
            placeholder="请输入原密码"
            :disabled="submitting"
          />
          <button
            class="password-field__toggle"
            :aria-label="showOldPassword ? '隐藏原密码' : '显示原密码'"
            @tap="toggleVisibility('old')"
          >
            {{ showOldPassword ? "隐藏" : "显示" }}
          </button>
        </view>
      </view>

      <view class="password-field">
        <text class="password-field__label">新密码</text>
        <view class="password-field__control">
          <input
            v-model="newPassword"
            class="password-field__input"
            :password="!showNewPassword"
            placeholder="请输入新密码"
            maxlength="14"
            :disabled="submitting"
          />
          <button
            class="password-field__toggle"
            :aria-label="showNewPassword ? '隐藏新密码' : '显示新密码'"
            @tap="toggleVisibility('next')"
          >
            {{ showNewPassword ? "隐藏" : "显示" }}
          </button>
        </view>
      </view>

      <view class="password-field">
        <text class="password-field__label">确认新密码</text>
        <view class="password-field__control">
          <input
            v-model="confirmPassword"
            class="password-field__input"
            :password="!showConfirmPassword"
            placeholder="请再次输入新密码"
            maxlength="14"
            :disabled="submitting"
            confirm-type="done"
            @confirm="submit"
          />
          <button
            class="password-field__toggle"
            :aria-label="showConfirmPassword ? '隐藏确认密码' : '显示确认密码'"
            @tap="toggleVisibility('confirm')"
          >
            {{ showConfirmPassword ? "隐藏" : "显示" }}
          </button>
        </view>
      </view>

      <text class="password-card__hint">新密码须为 6–14 位字母与数字组合，修改后需要重新登录。</text>
      <button
        class="password-card__submit"
        form-type="submit"
        :disabled="!canSubmit"
        :loading="submitting"
      >
        {{ submitting ? "正在保存" : "确认修改" }}
      </button>
    </form>
  </view>
</template>

<style scoped lang="scss">
.password-page {
  min-height: 100vh;
  padding: 16px 16px calc(32px + env(safe-area-inset-bottom));
  background: #fff;
  color: var(--gbnt-text);
}




.password-card {
  padding: 0;
  border: 0;
  background: #fff;
}

.password-card__error {
  margin-bottom: 16px;
  padding: 10px 12px;
  border: 1px solid #f3b7b3;
  border-radius: 6px;
  background: #fff4f3;
  color: var(--gbnt-danger, #b42318);
  font-size: 13px;
  line-height: 1.5;
}

.password-field + .password-field {
  margin-top: 17px;
}

.password-field__label {
  display: block;
  margin-bottom: 8px;
  font-size: 14px;
  font-weight: 600;
}

.password-field__control {
  position: relative;
  display: flex;
  align-items: center;
  height: 44px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: #f0f4f8;
}

.password-field__input {
  flex: 1;
  min-width: 0;
  height: 44px;
  padding: 0 64px 0 12px;
  font-size: 14px;
}

.password-field__toggle {
  position: absolute;
  top: 0;
  right: 0;
  width: 64px;
  height: 44px;
  margin: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--gbnt-primary, #015cbb);
  font-size: 13px;
  line-height: 44px;
}

.password-field__toggle::after,
.password-card__submit::after {
  border: 0;
}

.password-card__submit {
  display: flex;
  width: 100%;
  height: 44px;
  align-items: center;
  justify-content: center;
  margin-top: 24px;
  border: 1px solid var(--gbnt-primary);
  border-radius: 8px;
  background: var(--gbnt-primary);
  color: #fff;
  font-size: 16px;
  font-weight: 600;
  line-height: 42px;
}

.password-card__submit[disabled] {
  background: #92acd3;
  color: rgba(255, 255, 255, 0.9);
}
.password-card__hint {
  display: block;
  margin-top: 12px;
  color: var(--gbnt-text-secondary);
  font-size: 12px;
  line-height: 1.6;
}
.password-field__control:focus-within {
  border-color: var(--gbnt-primary);
  background: #fff;
}
</style>
