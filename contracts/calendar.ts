import { addDays, dateToMs } from './date';

export function isWeekendDate(date: string): boolean {
  const day = new Date(dateToMs(date)).getUTCDay();
  return day === 0 || day === 6;
}

export function isWorkingDate(date: string, calendar: Record<string, boolean> = {}): boolean {
  return calendar[date] ?? !isWeekendDate(date);
}

export function buildWorkingDays(baseDate: string, horizonDays: number, calendar: Record<string, boolean> = {}): Record<string, boolean> {
  const result: Record<string, boolean> = {};
  for (let offset = 0; offset <= horizonDays; offset += 1) {
    const date = addDays(baseDate, offset);
    result[date] = isWorkingDate(date, calendar);
  }
  return result;
}

export function listWeekendDates(baseDate: string, horizonDays: number): string[] {
  const dates: string[] = [];
  for (let offset = 0; offset <= horizonDays; offset += 1) {
    const date = addDays(baseDate, offset);
    if (isWeekendDate(date)) dates.push(date);
  }
  return dates;
}
