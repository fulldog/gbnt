const DAY_MS = 86_400_000;
const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;

/** 业务日期统一使用北京时间；不依赖设备时区和小程序 Intl 实现。 */
export function businessToday(now = Date.now()): string {
  return new Date(now + SHANGHAI_OFFSET_MS).toISOString().slice(0, 10);
}

export function calendarDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:$|T| )/.exec(value.trim());
  if (!match || Number(match[1]) < 1900) return null;
  const candidate = `${match[1]}-${match[2]}-${match[3]}`;
  const timestamp = Date.parse(`${candidate}T00:00:00Z`);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== candidate) return null;
  return candidate;
}

export function businessDateTime(value: unknown): string | null {
  if (!calendarDate(value) || typeof value !== "string") return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const normalized = value.trim().replace(" ", "T");
  const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized);
  const timestamp = Date.parse(hasTimezone ? normalized : `${normalized}+08:00`);
  if (!Number.isFinite(timestamp)) return null;
  return new Date(timestamp + SHANGHAI_OFFSET_MS).toISOString().slice(0, 16).replace("T", " ");
}

export function calendarDayDifference(target: string, today: string): number | null {
  const targetDate = calendarDate(target);
  const todayDate = calendarDate(today);
  if (!targetDate || !todayDate) return null;
  return Math.round((Date.parse(`${targetDate}T00:00:00Z`) - Date.parse(`${todayDate}T00:00:00Z`)) / DAY_MS);
}

export function millisecondsUntilBusinessMidnight(now = Date.now()): number {
  return DAY_MS - ((now + SHANGHAI_OFFSET_MS) % DAY_MS) + 100;
}
