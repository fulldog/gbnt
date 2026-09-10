import type { QuizType } from "@gbnt/api-client";

export interface SavedRectifyNote { type: QuizType; note: string; selected: boolean }

/** 整改说明按用户、问题与轮次隔离；临时照片不作跨页面可用的承诺。 */
export function rectifyDraftKey(userId: number | undefined, issueId: number, round: number): string {
  return userId && Number.isSafeInteger(userId) && userId > 0 &&
    Number.isSafeInteger(issueId) && issueId > 0 && Number.isSafeInteger(round) && round >= 0
    ? `gbnt:miniapp:rectify-draft:v1:${userId}:${issueId}:${round}` : "";
}

export function readRectifyNotes(key: string, types: readonly QuizType[]): SavedRectifyNote[] {
  if (!key) return [];
  try {
    const data: unknown = uni.getStorageSync(key);
    if (!Array.isArray(data)) return [];
    return data.filter((row): row is SavedRectifyNote => Boolean(row) &&
      types.includes(row.type) && typeof row.note === "string" && row.note.length <= 500 && typeof row.selected === "boolean");
  } catch { return []; }
}

export function saveRectifyNotes(key: string, notes: readonly SavedRectifyNote[]): boolean {
  if (!key) return false;
  try {
    const dirty = notes.filter((note) => note.note.trim());
    if (!dirty.length) uni.removeStorageSync(key);
    else uni.setStorageSync(key, dirty.map(({ type, note, selected }) => ({ type, note, selected })));
    return true;
  } catch { return false; }
}

/** 整单反馈使用独立键；首次打开合并旧版分项说明，避免更新后丢失未提交文字。 */
export function readRectifyFeedback(key: string, types: readonly QuizType[]): string {
  if (!key) return "";
  try {
    const value: unknown = uni.getStorageSync(`${key}:feedback`);
    if (value && typeof value === "object" && "note" in value && typeof value.note === "string") return value.note;
  } catch { /* 无法读取新草稿时尝试兼容旧版。 */ }
  return [...new Set(readRectifyNotes(key, types).map((item) => item.note.trim()).filter(Boolean))].join("\n");
}

export function saveRectifyFeedback(key: string, note: string): boolean {
  if (!key) return false;
  try {
    // 空字符串也保存，避免已主动清空的新草稿再次恢复旧说明。
    uni.setStorageSync(`${key}:feedback`, { note });
    return true;
  } catch { return false; }
}

export function clearRectifyFeedback(key: string): void {
  if (!key) return;
  try {
    uni.removeStorageSync(`${key}:feedback`);
    uni.removeStorageSync(key);
  } catch { /* 工单已提交成功，清理失败不重试业务提交。 */ }
}
