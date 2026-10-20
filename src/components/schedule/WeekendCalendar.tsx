import { CalendarPlus, ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import { isWorkingDate, listWeekendDates } from '../../../contracts/calendar';
import { formatDateCN } from '../../../contracts/date';
import { cn } from '../../lib/utils';
import { Badge } from '../StatusBadge';
import { Button } from '../ui';

export function WeekendCalendar({ baseDate, calendar, onChange, readOnly = false, horizonDays = 180 }: {
  baseDate: string;
  calendar: Record<string, boolean>;
  onChange: (calendar: Record<string, boolean>) => void;
  readOnly?: boolean;
  horizonDays?: number;
}) {
  const [showAll, setShowAll] = useState(false);
  const dates = listWeekendDates(baseDate, horizonDays);
  const visibleDates = showAll ? dates : dates.slice(0, 8);
  const overtimeCount = dates.filter((date) => isWorkingDate(date, calendar)).length;
  return <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-panel sm:p-5">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-start gap-3"><div className="rounded-xl bg-amber-50 p-2 text-amber-600"><CalendarPlus size={20} /></div><div><h2 className="text-sm font-bold text-ink">周末与加班设置</h2><p className="mt-1 text-xs leading-5 text-slate-400">周六、周日默认休息，可逐日勾选加班。设置随本次排产保存，后工序仍按自然时间连续计算。</p></div></div><Badge color={overtimeCount ? 'yellow' : 'slate'}>{overtimeCount} 天加班</Badge></div>
    <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{visibleDates.map((date) => {
      const working = isWorkingDate(date, calendar);
      const weekday = new Date(`${date}T00:00:00`).getDay() === 6 ? '周六' : '周日';
      return <label key={date} className={cn('flex items-center gap-3 rounded-xl border p-3 text-sm transition', working ? 'border-amber-300 bg-amber-50' : 'border-slate-200 bg-slate-50', readOnly ? 'cursor-default' : 'cursor-pointer hover:border-brand-500')}>
        <input type="checkbox" className="h-4 w-4 accent-amber-600" checked={working} disabled={readOnly} onChange={(event) => onChange({ ...calendar, [date]: event.target.checked })} />
        <span className={working ? 'font-medium text-amber-800' : 'text-slate-600'}>{formatDateCN(date)} · {weekday}</span>
        <span className={cn('ml-auto text-xs', working ? 'text-amber-600' : 'text-slate-400')}>{working ? '加班排产' : '休息'}</span>
      </label>;
    })}</div>
    {dates.length > 8 && <Button variant="ghost" size="sm" className="mt-3 w-full" onClick={() => setShowAll((value) => !value)}>{showAll ? <ChevronUp size={15} /> : <ChevronDown size={15} />}{showAll ? '收起周末设置' : `展开全部 ${dates.length} 个周末日期`}</Button>}
    {readOnly && <p className="mt-3 text-xs text-slate-400">当前角色仅可查看，加班设置由管理员或生产账户修改。</p>}
  </section>;
}
