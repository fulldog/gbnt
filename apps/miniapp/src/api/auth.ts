import type {
  ApiClient,
  AuthUser,
  LoginResult,
  MiniappLoginInput,
  PasswordInput,
  SliderFinishInput,
  SliderFinishResult,
  SliderStartResult,
} from "@gbnt/api-client";

export function createAuthApi(client: ApiClient) {
  return {
    startSlider(): Promise<SliderStartResult> {
      return client.request<SliderStartResult>("/api/app/auth/slider/start", {
        method: "POST",
        auth: false,
      });
    },

    finishSlider(input: SliderFinishInput): Promise<SliderFinishResult> {
      return client.request<SliderFinishResult, SliderFinishInput>(
        "/api/app/auth/slider/finish",
        {
          method: "POST",
          body: input,
          auth: false,
        },
      );
    },

    login(input: MiniappLoginInput): Promise<LoginResult> {
      return client.request<LoginResult, MiniappLoginInput>("/api/app/auth/login", {
        method: "POST",
        body: input,
        auth: false,
      });
    },

    getMe(): Promise<AuthUser> {
      return client.request<AuthUser>("/api/app/auth/me");
    },

    changePassword(input: PasswordInput): Promise<null> {
      return client.request<null, PasswordInput>("/api/app/auth/password", {
        method: "PUT",
        body: input,
      });
    },

    logout(): Promise<null> {
      return client.request<null>("/api/app/auth/logout", { method: "POST" });
    },
  } as const;
}

export type AuthApi = ReturnType<typeof createAuthApi>;
