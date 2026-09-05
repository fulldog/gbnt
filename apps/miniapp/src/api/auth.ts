import type {
  ApiClient,
  MiniappLoginInput,
  PasswordInput,
  SliderFinishInput,
  SliderFinishResult,
  SliderStartResult,
} from "@gbnt/api-client";
import { parseAuthUser, parseLogin, parseSliderStart, parseSliderFinish } from "./response";
import type { MiniappAuthUser, MiniappLoginResult } from "./types";

export function createAuthApi(client: ApiClient) {
  return {
    async startSlider(): Promise<SliderStartResult> {
      return parseSliderStart(await client.request<unknown>("/api/app/auth/slider/start", {
        method: "POST",
        auth: false,
      }));
    },

    async finishSlider(input: SliderFinishInput): Promise<SliderFinishResult> {
      return parseSliderFinish(await client.request<unknown, SliderFinishInput>(
        "/api/app/auth/slider/finish",
        {
          method: "POST",
          body: input,
          auth: false,
        },
      ));
    },

    async login(input: MiniappLoginInput): Promise<MiniappLoginResult> {
      return parseLogin(await client.request<unknown, MiniappLoginInput>("/api/app/auth/login", {
        method: "POST",
        body: input,
        auth: false,
      }));
    },

    async getMe(): Promise<MiniappAuthUser> {
      return parseAuthUser(await client.request<unknown>("/api/app/auth/me"));
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
