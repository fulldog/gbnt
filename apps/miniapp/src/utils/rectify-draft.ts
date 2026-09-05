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
