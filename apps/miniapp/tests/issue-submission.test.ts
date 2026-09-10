import { describe, expect, it } from "vitest";
import { prepareIssueSubmission, resolveFacilityCodeMode } from "@gbnt/api-client";

describe("共享提交契约", () => {
  it("相同请求重试复用 ID，业务内容或签名变化后才更换", () => {
    const input = { org_id: 1, type: "road", code_mode: "auto", reporter_signature_file_id: "signature" };
    const first = prepareIssueSubmission(input);
    expect(prepareIssueSubmission({ ...input }, first)).toEqual(first);
    expect(prepareIssueSubmission({ ...input, org_id: 2 }, first).requestId).not.toBe(first.requestId);
    expect(prepareIssueSubmission({ ...input, reporter_signature_file_id: "new" }, first).requestId).not.toBe(first.requestId);
    expect(prepareIssueSubmission(input, { requestId: "bad", payload: first.payload }).requestId).not.toBe("bad");
  });
  it("明确手动空值不退回自动，旧非空草稿保守保留", () => {
    expect(resolveFacilityCodeMode({ code: "", codeMode: "manual" })).toBe("manual");
    expect(resolveFacilityCodeMode({ code: "01" })).toBe("manual");
    expect(resolveFacilityCodeMode({ code: "" })).toBe("auto");
    expect(resolveFacilityCodeMode({ code: "03", codeSource: "auto" })).toBe("auto");
  });
});
