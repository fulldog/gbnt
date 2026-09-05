import { onScopeDispose, shallowRef } from "vue";
import type { ShallowRef } from "vue";
import { errorMessage as describeError } from "@/utils/error";

interface LatestQueryOptions<T> {
  initial: () => T;
  /** 在首次 await 前读取查询参数，保证每次请求使用自己的快照。 */
  load: () => Promise<T>;
  errorMessage: string;
}

/** 页面级读取状态：仅最新请求可更新数据、错误和 loading。 */
export function useLatestQuery<T>(options: LatestQueryOptions<T>) {
  const data: ShallowRef<T> = shallowRef(options.initial());
  const loading = shallowRef(false);
  const loadError = shallowRef("");
  const hasLoaded = shallowRef(false);
  let sequence = 0;
  let disposed = false;

  function invalidate(): void {
    sequence += 1;
    data.value = options.initial();
    loading.value = false;
    loadError.value = "";
    hasLoaded.value = false;
  }

  async function run(): Promise<boolean> {
    if (disposed) return false;
    const requestId = ++sequence;
    data.value = options.initial();
    loadError.value = "";
    hasLoaded.value = false;
    loading.value = true;
    try {
      const result = await options.load();
      if (disposed || requestId !== sequence) return false;
      data.value = result;
      hasLoaded.value = true;
      return true;
    } catch (error) {
      if (!disposed && requestId === sequence) {
        loadError.value = describeError(error, options.errorMessage);
      }
      return false;
    } finally {
      if (!disposed && requestId === sequence) loading.value = false;
    }
  }

  onScopeDispose(() => {
    invalidate();
    disposed = true;
  });
  return { data, loading, loadError, hasLoaded, run, invalidate };
}
