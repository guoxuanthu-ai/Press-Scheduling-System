import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useState } from 'react';
import { addDays, formatDateCN } from '../../../contracts/date';
import type { Press } from '../../../contracts/entities';
import type { ScheduleResult } from '../../../contracts/schedule';
import { cn, formatHours } from '../../lib/utils';
import { Button, EmptyState } from '../ui';

export function DailyBoard({ result, presses }: { result: ScheduleResult; presses: Press[] }) {
  const [offset, setOffset] = useState(0);
  useEffect(() => setOffset(0), [result.generatedAt]);
  const dates = Array.from({ length: 7 }, (_, index) => addDays(result.baseDate, offset + index));
  const availablePresses = presses.filter((press) => press.status === 'available');
  if (availablePresses.length === 0) return <EmptyState title="没有可用压机" description="请先将至少一台压机设置为可用状态。" />;
  return <div>
    <div className="mb-4 flex items-center justify-between gap-3">
      <div><p className="text-sm font-semibold text-slate-800">{formatDateCN(dates[0])} — {formatDateCN(dates.at(-1))}</p><p className="mt-1 text-xs text-slate-400">每格展示产品 / 工序 / 模具 / 投入工时</p></div>
      <div className="flex items-center gap-1"><Button variant="secondary" size="sm" onClick={() => setOffset((value) => Math.max(0, value - 7))} disabled={offset === 0} aria-label="上一周"><ChevronLeft size={16} /></Button><Button variant="ghost" size="sm" onClick={() => setOffset(0)}>本次基准</Button><Button variant="secondary" size="sm" onClick={() => setOffset((value) => value + 7)} aria-label="下一周"><ChevronRight size={16} /></Button></div>
    </div>
    <div className="overflow-x-auto rounded-xl border border-slate-200"><table className="w-full min-w-[1050px] border-collapse text-left">
      <thead><tr className="bg-slate-50"><th className="sticky left-0 z-10 w-36 border-b border-r border-slate-200 bg-slate-50 p-3 text-xs font-semibold text-slate-600">压机 / 日期</th>{dates.map((date, index) => <th key={date} className={cn('min-w-36 border-b border-slate-200 p-3 text-center', date === result.baseDate && 'bg-brand-50')}><p className="text-xs font-semibold text-slate-700">{formatDateCN(date)}</p><p className="mt-1 text-[10px] font-normal text-slate-400">{['周日', '周一', '周二', '周三', '周四', '周五', '周六'][new Date(`${date}T00:00:00`).getDay()]}{offset + index === 0 && ' · 基准'}</p></th>)}</tr></thead>
      <tbody>{availablePresses.map((press) => <tr key={press.id} className="group"><th className="sticky left-0 z-10 border-b border-r border-slate-200 bg-white p-3 text-left group-last:border-b-0"><p className="text-sm font-semibold text-slate-800">{press.name}</p><p className="mt-1 text-[11px] font-normal text-slate-400">{press.model} · {press.dailyHours}h/日</p></th>{dates.map((date) => {
        const assignments = result.assignments.filter((item) => item.pressId === press.id && item.date === date);
        const load = result.dailyLoads.find((item) => item.pressId === press.id && item.date === date);
        const working = result.workingDays?.[date] ?? true;
        return <td key={date} className={cn('min-h-24 border-b border-slate-100 p-2 align-top group-last:border-b-0', date === result.baseDate && 'bg-brand-50/40', !working && 'bg-slate-50')}>
          <div className="space-y-1.5">{assignments.map((assignment) => <div key={assignment.id} className={cn('rounded-lg border-l-2 bg-white p-2 shadow-sm ring-1 ring-slate-100', assignment.stepType === 'final' ? 'border-violet-500' : 'border-brand-500')} title={`${assignment.startHour}h - ${assignment.endHour}h`}><p className="truncate text-[11px] font-semibold text-slate-800">{assignment.productName}</p><p className="mt-0.5 truncate text-[11px] text-slate-600">{assignment.stepName} · {assignment.moldCode}</p><p className="mt-1 text-[10px] font-medium text-brand-600">{formatHours(assignment.hours)} <span className="text-slate-400">{assignment.startHour}–{assignment.endHour}h</span></p></div>)}</div>
          {assignments.length === 0 && <div className="flex h-16 items-center justify-center text-xs text-slate-300">{working ? '空闲' : '休息'}</div>}
          {load && load.scheduledHours > 0 && <div className="mt-2 h-1 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-brand-500" style={{ width: `${load.utilization}%` }} /></div>}
        </td>;
      })}</tr>)}</tbody>
    </table></div>
  </div>;
}
