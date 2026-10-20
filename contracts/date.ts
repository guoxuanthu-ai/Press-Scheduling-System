export interface TimePoint {
  date: string;
  hour: number;
}

const DAY_MS = 86_400_000;

export function dateToMs(date: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) throw new Error(`无效日期：${date}`);
  const [, year, month, day] = match;
  const ms = Date.UTC(Number(year), Number(month) - 1, Number(day));
  if (new Date(ms).toISOString().slice(0, 10) !== date) throw new Error(`无效日期：${date}`);
  return ms;
}

export function addDays(date: string, days: number): string {
  return new Date(dateToMs(date) + days * DAY_MS).toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((dateToMs(to) - dateToMs(from)) / DAY_MS);
}

export function todayLocal(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function addCalendarHours(point: TimePoint, hours: number): TimePoint {
  const ms = dateToMs(point.date) + (point.hour + hours) * 3_600_000;
  const value = new Date(ms);
  return {
    date: value.toISOString().slice(0, 10),
    hour: (value.getUTCHours() + value.getUTCMinutes() / 60) + value.getUTCSeconds() / 3600,
  };
}

export function comparePoints(a: TimePoint, b: TimePoint): number {
  return a.date === b.date ? a.hour - b.hour : a.date.localeCompare(b.date);
}

export function maxPoint(a: TimePoint, b: TimePoint): TimePoint {
  return comparePoints(a, b) >= 0 ? a : b;
}

export function formatDateCN(date?: string): string {
  if (!date) return '—';
  const [, month, day] = date.split('-');
  return `${Number(month)}月${Number(day)}日`;
}

export function roundHour(value: number): number {
  return Math.round(value * 100) / 100;
}
