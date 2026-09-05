import { describe, expect, it, vi } from "vitest";
import { usePhotoUploads, type PhotoUploadJob } from "@/composables/report/usePhotoUploads";
import { changeQuizAnswer, createReportForm } from "@/domain/issues/form";
import { validateBasicStep, validateQuizItem } from "@/domain/issues/validation";
import { deviceFailureMessage } from "@/utils/device-permissions";

describe("照片上传恢复", () => {
  it("同批失败不丢成功项，只重试失败项且保留原取证时间", async () => {
    const upload = vi.fn(async (job: PhotoUploadJob) => {
      if (job.path === "bad" && upload.mock.calls.filter(([item]) => item.path === "bad").length === 1) throw new Error("网络中断");
      return { fileId: job.path, url: job.path, capturedAt: job.capturedAt, source: job.source };
    });
    const completed = vi.fn();
    const queue = usePhotoUploads(upload, completed);
    queue.enqueue(["one", "bad", "three"], "camera", 123);
    await vi.waitFor(() => expect(queue.running.value).toBe(false));
    expect(completed.mock.calls.map(([photo]) => photo.fileId)).toEqual(["one", "three"]);
    expect(queue.pending.value).toBe(true);
    expect(queue.jobs.value[0]?.status).toBe("failed");
    queue.retry(queue.jobs.value[0]!.id);
    await vi.waitFor(() => expect(queue.pending.value).toBe(false));
    expect(upload).toHaveBeenCalledTimes(4);
    expect(completed.mock.lastCall?.[0]).toMatchObject({ fileId: "bad", capturedAt: 123, source: "camera" });
  });

  it("卸载后不回填图片，也不继续上传后续文件", async () => {
    let resolve!: (value: { fileId: string; url: string }) => void;
    const upload = vi.fn(() => new Promise<{ fileId: string; url: string }>((done) => { resolve = done; }));
    const completed = vi.fn();
    const queue = usePhotoUploads(upload, completed);
    queue.enqueue(["one", "two"], "unknown");
    queue.dispose();
    resolve({ fileId: "one", url: "one" });
    await vi.waitFor(() => expect(queue.running.value).toBe(false));
    expect(upload).toHaveBeenCalledTimes(1);
    expect(completed).not.toHaveBeenCalled();
  });

  it("失败项移除后解除跳步阻塞", async () => {
    const queue = usePhotoUploads(async () => { throw new Error("失败"); }, vi.fn());
    queue.enqueue(["one"], "unknown");
    await vi.waitFor(() => expect(queue.running.value).toBe(false));
    queue.remove(queue.jobs.value[0]!.id);
    expect(queue.pending.value).toBe(false);
  });
});

describe("现场数据校验", () => {
  it("机井数量小数不能拖到最终接口才发现", () => {
    const form = createReportForm();
    form.details.outletTotal = "1.5";
    expect(validateBasicStep(form)).toContain("出水口总数必须是非负整数");
  });
  it.each([[null, null], [0, 0], [91, 116], [36, 181]])("拒绝无效现场坐标 %s %s", (lat, lng) => {
    const form = createReportForm();
    Object.assign(form, { address: "手填地址", lat, lng });
    expect(validateBasicStep(form)).toContain("请在地图中选择有效现场位置，照片水印需要真实坐标");
  });
  it("切换到出水取证会清理普通来源照片", () => {
    const quiz = createReportForm().quizzes[0]!;
    quiz.value = false;
    quiz.photos = [{ fileId: "old", url: "old", source: "unknown" }];
    changeQuizAnswer(quiz, true);
    expect(quiz.photos).toEqual([]);
  });
  it("旧草稿不能缺少取证来源和时间仍通过校验", () => {
    const quiz = createReportForm().quizzes[0]!;
    quiz.value = true;
    quiz.photos = [{ fileId: "a", url: "a" }, { fileId: "b", url: "b" }];
    expect(validateQuizItem("well", quiz)).toContain("机井出水照片缺少拍摄时间，请重新拍摄");
    expect(validateQuizItem("well", quiz)).toContain("机井出水取证照片须重新使用现场拍摄，不支持相册或旧来源照片");
  });
  it("取消不报错，拒绝权限给中文恢复路径", () => {
    expect(deviceFailureMessage({ errMsg: "chooseMedia:fail cancel" }, "拍照")).toBe("");
    expect(deviceFailureMessage({ errMsg: "chooseMedia:fail auth deny" }, "拍照")).toContain("设置中授权");
  });
});
