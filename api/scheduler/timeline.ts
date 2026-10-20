import { addDays, comparePoints, roundHour, type TimePoint } from '../../contracts/date';

export interface Interval {
  start: number;
  end: number;
}

export interface AllocationSegment extends Interval {
  date: string;
}

interface ResourceKey {
  kind: 'press' | 'mold';
  id: number;
  date: string;
}

const keyOf = ({ kind, id, date }: ResourceKey) => `${kind}:${id}:${date}`;

function subtractBusy(dailyHours: number, busy: Interval[]): Interval[] {
  const merged: Interval[] = [];
  for (const interval of [...busy].sort((a, b) => a.start - b.start)) {
    const last = merged.at(-1);
    if (last && interval.start <= last.end) last.end = Math.max(last.end, interval.end);
    else merged.push({ ...interval });
  }
  const free: Interval[] = [];
  let cursor = 0;
  for (const interval of merged) {
    if (interval.start > cursor) free.push({ start: cursor, end: Math.min(interval.start, dailyHours) });
    cursor = Math.max(cursor, interval.end);
  }
  if (cursor < dailyHours) free.push({ start: cursor, end: dailyHours });
  return free.filter((interval) => interval.end - interval.start > 0.001);
}

export class Timeline {
  private readonly busy = new Map<string, Interval[]>();

  constructor(private readonly isWorkingDay: (date: string) => boolean = () => true) {}

  private intervals(kind: 'press' | 'mold', id: number, date: string): Interval[] {
    return this.busy.get(keyOf({ kind, id, date })) ?? [];
  }

  free(pressId: number, moldId: number, date: string, dailyHours: number): Interval[] {
    return subtractBusy(dailyHours, [
      ...this.intervals('press', pressId, date),
      ...this.intervals('mold', moldId, date),
    ]);
  }

  findAllocation(
    pressId: number,
    moldId: number,
    dailyHours: number,
    hours: number,
    earliest: TimePoint,
    baseDate: string,
    horizonDays: number,
  ): AllocationSegment[] | null {
    for (let offset = 0; offset <= horizonDays; offset += 1) {
      const date = addDays(baseDate, offset);
      if (date < earliest.date || !this.isWorkingDay(date)) continue;
      const intervals = this.free(pressId, moldId, date, dailyHours);
      for (const interval of intervals) {
        const start = date === earliest.date ? Math.max(interval.start, earliest.hour) : interval.start;
        if (start >= interval.end - 0.001) continue;
        const segments = this.tryFrom(pressId, moldId, dailyHours, hours, { date, hour: start }, interval, horizonDays - offset);
        if (segments) return segments;
      }
    }
    return null;
  }

  private tryFrom(
    pressId: number,
    moldId: number,
    dailyHours: number,
    hours: number,
    start: TimePoint,
    firstInterval: Interval,
    remainingHorizon: number,
  ): AllocationSegment[] | null {
    const segments: AllocationSegment[] = [];
    let remaining = hours;
    let date = start.date;
    let interval = firstInterval;
    let startHour = start.hour;
    let day = 0;
    while (remaining > 0.001) {
      if (day > remainingHorizon) return null;
      const used = Math.min(remaining, interval.end - startHour);
      if (used <= 0.001) return null;
      segments.push({ date, start: startHour, end: roundHour(startHour + used) });
      remaining = roundHour(remaining - used);
      if (remaining <= 0.001) break;
      day += 1;
      date = addDays(date, 1);
      startHour = 0;
      while (!this.isWorkingDay(date)) {
        day += 1;
        date = addDays(date, 1);
        if (day > remainingHorizon) return null;
      }
      const next = this.free(pressId, moldId, date, dailyHours).find((item) => item.start <= 0.001);
      if (!next) return null;
      interval = next;
    }
    return segments;
  }

  commit(pressId: number, moldId: number, segments: AllocationSegment[]): void {
    for (const segment of segments) {
      for (const kind of ['press', 'mold'] as const) {
        const id = kind === 'press' ? pressId : moldId;
        const key = keyOf({ kind, id, date: segment.date });
        const current = this.busy.get(key) ?? [];
        current.push({ start: segment.start, end: segment.end });
        this.busy.set(key, current);
      }
    }
  }
}

export function allocationStart(segments: AllocationSegment[]): TimePoint {
  const first = segments[0];
  return { date: first.date, hour: first.start };
}

export function allocationEnd(segments: AllocationSegment[]): TimePoint {
  const last = segments.at(-1)!;
  return { date: last.date, hour: last.end };
}

export function isEarlierAllocation(a: AllocationSegment[], b: AllocationSegment[]): boolean {
  const startComparison = comparePoints(allocationStart(a), allocationStart(b));
  if (startComparison !== 0) return startComparison < 0;
  return comparePoints(allocationEnd(a), allocationEnd(b)) < 0;
}
