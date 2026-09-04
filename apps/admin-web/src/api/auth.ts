import type {
  AdminLoginInput,
  ApiClient,
  AuthUser,
  CaptchaResult,
  LoginResult,
  PasswordInput,
} from "@gbnt/api-client";

export function createAuthApi(client: ApiClient) {
  return {
    getCaptcha(): Promise<CaptchaResult> {
      return client.request<CaptchaResult>("/api/auth/captcha", { auth: false });
    },

    login(input: AdminLoginInput): Promise<LoginResult> {
      return client.request<LoginResult, AdminLoginInput>("/api/auth/login", {
        method: "POST",
        body: input,
        auth: false,
      });
    },

    getMe(): Promise<AuthUser> {
      return client.request<AuthUser>("/api/auth/me");
    },

    changePassword(input: PasswordInput): Promise<null> {
      return client.request<null, PasswordInput>("/api/auth/password", {
        method: "PUT",
        body: input,
      });
    },

    logout(): Promise<null> {
      return client.request<null>("/api/auth/logout", { method: "POST" });
    },
  } as const;
}

export type AuthApi = ReturnType<typeof createAuthApi>;
