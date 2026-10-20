import { ArrowRight, Layers3 } from 'lucide-react';
import type { SampleTask } from '../../contracts/entities';
import type { TaskPlan } from '../../contracts/schedule';
import { cn } from '../lib/utils';
import { StepStatusBadge } from './StatusBadge';

export function StepChain({ task, plan, compact = false }: { task: SampleTask; plan?: TaskPlan; compact?: boolean }) {
  const cores = task.pressingSteps.filter((step) => step.stepType === 'core');
  const final = task.pressingSteps.find((step) => step.stepType === 'final');
  const node = (id: number, name: string, subtitle: string, status: 'pending' | 'in_progress' | 'completed', scheduled?: string) => <div key={id} className={cn('min-w-0 rounded-xl border border-slate-200 bg-white p-3', compact ? 'w-36' : 'w-40')}>
    <div className="flex items-start justify-between gap-2"><p className="truncate text-sm font-semibold text-slate-800" title={name}>{name}</p><StepStatusBadge value={status} /></div>
    <p className="mt-1 truncate text-xs text-slate-500">{subtitle}</p>
    {scheduled && <p className="mt-2 text-xs font-medium text-brand-600">{scheduled}</p>}
  </div>;
  return <div className="overflow-x-auto pb-2"><div className="flex min-w-max items-center gap-3">
    <div className="relative flex gap-2 rounded-2xl bg-slate-50 p-2"><div className="pointer-events-none absolute -right-3 top-1/2 h-px w-3 bg-slate-300" />{cores.map((step) => {
      const stepPlan = plan?.pressingSteps.find((item) => item.stepId === step.id);
      return node(step.id, step.name, `${step.requiredHours}h · 预压`, step.status, stepPlan?.startDate ? `${stepPlan.startDate} · ${stepPlan.pressName}` : stepPlan?.unschedulableReason);
    })}</div>
    <ArrowRight size={18} className="shrink-0 text-slate-400" />
    {final && (() => { const stepPlan = plan?.pressingSteps.find((item) => item.stepId === final.id); return node(final.id, final.name, `${final.requiredHours}h · 合压`, final.status, stepPlan?.startDate ? `${stepPlan.startDate} · ${stepPlan.pressName}` : stepPlan?.unschedulableReason); })()}
    {task.postSteps.length > 0 && <ArrowRight size={18} className="shrink-0 text-slate-400" />}
    <div className="flex items-center gap-2">{task.postSteps.map((step, index) => {
      const stepPlan = plan?.postSteps.find((item) => item.stepId === step.id);
      return <div key={step.id} className="flex items-center gap-2">{index > 0 && <ArrowRight size={14} className="text-slate-300" />}{node(step.id, step.processName, `${step.durationHours}h · 后工序`, step.status, stepPlan?.startDate ? `${stepPlan.startDate} → ${stepPlan.endDate}` : undefined)}</div>;
    })}</div>
    {task.postSteps.length === 0 && <div className="flex items-center gap-2 text-xs text-slate-400"><Layers3 size={16} />无后工序</div>}
  </div></div>;
}
