import type { AuthUser, LoginResult } from "@gbnt/api-client";
import { beforeEach, describe, expect, it } from "vitest";
import {
  clearSession,
  readAccessToken,
  readRememberedAccount,
  readStoredUser,
  writeRememberedAccount,
  writeSession,
} from "@/api/session";

const user: AuthUser = {
  id: 7,
  username: "admin",
  name: "管理员",
  phone: "",
  org_id: 1,
  role_id: 1,
  is_super_admin: true,
  apis: "*",
};

beforeEach(() => {
  localStorage.clear();
});

describe("管理端会话存储", () => {
  it("持久化并读取后端登录结果", () => {
    const result: LoginResult = {
      token: "token-value",
      expires_at: "2026-09-04T18:00:00+08:00",
      user,
    };

    writeSession(result);
    expect(readAccessToken()).toBe(result.token);
    expect(readStoredUser()).toEqual(user);
  });

  it("退出时保留用户明确选择的记住账号", () => {
    writeRememberedAccount("admin");
    writeSession({ token: "token", expires_at: "", user });
    clearSession();

    expect(readAccessToken()).toBeNull();
    expect(readStoredUser()).toBeNull();
    expect(readRememberedAccount()).toBe("admin");
  });
});
