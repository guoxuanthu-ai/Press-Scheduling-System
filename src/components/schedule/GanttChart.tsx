import { addDays, daysBetween, formatDateCN } from '../../../contracts/date';
import type { ScheduleResult } from '../../../contracts/schedule';
import { cn } from '../../lib/utils';
import { EmptyState } from '../ui';
import { PriorityBadge } from '../StatusBadge';

interface Bar { id: number; name: string; start: string; end: string; startHour: number; endHour: number; kind: 'core' | 'final' | 'post' }

export function GanttChart({ result }: { result: ScheduleResult }) {
  const plans = result.taskPlans.filter((plan) => plan.estimatedDelivery || plan.pressingSteps.some((step) => step.startDate));
  if (plans.length === 0) return <EmptyState title="暂无可绘制的任务计划" description="请先完成任务排产，或检查不可排原因。" />;
  const maxDate = plans.reduce((max, plan) => plan.estimatedDelivery && plan.estimatedDelivery > max ? plan.estimatedDelivery : max, addDays(result.baseDate, 13));
  const totalDays = Math.min(60, Math.max(14, daysBetween(result.baseDate, maxDate) + 1));
  const dates = Array.from({ length: totalDays }, (_, index) => addDays(result.baseDate, index));
  return <div>
    <div className="mb-4 flex flex-wrap items-center gap-4 text-xs text-slate-500"><span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-brand-500" />预压 core</span><span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-violet-500" />合压</span><span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-amber-400" />后工序</span><span className="ml-auto">时间范围 {totalDays} 天</span></div>
    <div className="overflow-x-auto rounded-xl border border-slate-200"><div style={{ minWidth: 220 + totalDays * 42 }}>
      <div className="flex border-b border-slate-200 bg-slate-50"><div className="w-56 shrink-0 border-r border-slate-200 p-3 text-xs font-semibold text-slate-600">任务 / 技术路线</div><div className="grid flex-1" style={{ gridTemplateColumns: `repeat(${totalDays}, minmax(0, 1fr))` }}>{dates.map((date) => <div key={date} className={cn('border-r border-slate-100 py-2 text-center text-[10px] text-slate-400', date === result.baseDate && 'bg-brand-50 text-brand-700')}><p>{Number(date.slice(8))}日</p><p>{Number(date.slice(5, 7))}月</p></div>)}</div></div>
      {plans.map((plan) => {
        const bars: Bar[] = [
          ...plan.pressingSteps.filter((step) => step.startDate && step.endDate).map((step) => ({ id: step.stepId, name: `${step.name} · ${step.pressName ?? ''}`, start: step.startDate!, end: step.endDate!, startHour: step.startHour ?? 0, endHour: step.endHour ?? 0, kind: step.stepType })),
          ...plan.postSteps.filter((step) => step.startDate && step.endDate).map((step) => ({ id: step.stepId, name: step.name, start: step.startDate!, end: step.endDate!, startHour: step.startHour ?? 0, endHour: step.endHour ?? 0, kind: 'post' as const })),
        ];
        return <div key={plan.taskId} className="flex border-b border-slate-100 last:border-b-0"><div className="w-56 shrink-0 border-r border-slate-200 p-3"><div className="flex items-center gap-2"><p className="truncate text-sm font-semibold text-slate-800">{plan.productName}</p><PriorityBadge value={plan.priority} /></div><p className="mt-1 text-[11px] text-slate-400">交期 {formatDateCN(plan.deadline)} · 预计 {formatDateCN(plan.estimatedDelivery)}</p></div><div className="relative flex-1 py-2" style={{ backgroundImage: 'linear-gradient(to right, #f1f5f9 1px, transparent 1px)', backgroundSize: `${100 / totalDays}% 100%` }}>
          {bars.map((bar, index) => {
            const leftDays = daysBetween(result.baseDate, bar.start) + bar.startHour / 24;
            const endDays = daysBetween(result.baseDate, bar.end) + bar.endHour / 24;
            const left = Math.max(0, leftDays / totalDays * 100);
            const width = Math.max(0.7, (endDays - leftDays) / totalDays * 100);
            return <div key={`${bar.id}-${index}`} title={`${bar.name}：${bar.start} → ${bar.end}`} className={cn('absolute flex h-5 items-center overflow-hidden rounded-md px-2 text-[10px] font-medium text-white shadow-sm', bar.kind === 'core' ? 'bg-brand-500' : bar.kind === 'final' ? 'bg-violet-500' : 'bg-amber-400 text-amber-950')} style={{ left: `${left}%`, width: `${width}%`, top: 8 + index * 24 }}><span className="truncate">{bar.name}</span></div>;
          })}
          <div style={{ height: Math.max(40, 16 + bars.length * 24) }} />
        </div></div>;
      })}
    </div></div>
  </div>;
}
