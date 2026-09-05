import { computed, shallowRef } from "vue";
import type { UploadedPhoto } from "@/domain/issues/form";

export interface PhotoUploadJob {
  id: number;
  path: string;
  capturedAt: number;
  source: "camera" | "unknown";
  status: "queued" | "uploading" | "failed";
  error: string;
}

/** 逐张提交成功结果；失败保留临时文件供重试，不丢弃同批成功照片。 */
export function usePhotoUploads(
  upload: (job: PhotoUploadJob) => Promise<UploadedPhoto>,
  completed: (photo: UploadedPhoto) => void,
) {
  const jobs = shallowRef<PhotoUploadJob[]>([]);
  const running = shallowRef(false);
  const pending = computed(() => jobs.value.length > 0);
  let nextId = 0;
  let disposed = false;

  function update(id: number, patch: Partial<PhotoUploadJob>): void {
    jobs.value = jobs.value.map((job) => job.id === id ? { ...job, ...patch } : job);
  }

  async function run(): Promise<void> {
    if (running.value || disposed) return;
    running.value = true;
    try {
      let job: PhotoUploadJob | undefined;
      while (!disposed && (job = jobs.value.find((item) => item.status === "queued"))) {
        update(job.id, { status: "uploading", error: "" });
        try {
          const photo = await upload(job);
          if (disposed) return;
          completed(photo);
          jobs.value = jobs.value.filter((item) => item.id !== job!.id);
        } catch (error) {
          if (disposed) return;
          update(job.id, { status: "failed", error: error instanceof Error ? error.message : "照片上传失败，请重试" });
        }
      }
    } finally {
      running.value = false;
    }
  }

  function enqueue(paths: readonly string[], source: PhotoUploadJob["source"], capturedAt = Date.now()): void {
    if (disposed) return;
    jobs.value = [...jobs.value, ...paths.map((path): PhotoUploadJob => ({
      id: ++nextId, path, source, capturedAt, status: "queued", error: "",
    }))];
    void run();
  }

  function retry(id: number): void {
    if (jobs.value.find((item) => item.id === id)?.status !== "failed") return;
    update(id, { status: "queued", error: "" });
    void run();
  }

  function remove(id: number): void {
    if (jobs.value.find((item) => item.id === id)?.status !== "failed") return;
    jobs.value = jobs.value.filter((item) => item.id !== id);
  }

  function dispose(): void {
    disposed = true;
    jobs.value = [];
  }

  return { jobs, running, pending, enqueue, retry, remove, dispose };
}
