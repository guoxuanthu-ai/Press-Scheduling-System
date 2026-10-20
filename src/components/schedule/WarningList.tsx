import { AlertOctagon, AlertTriangle, BellRing, Clock3 } from 'lucide-react';
import type { ScheduleWarning } from '../../../contracts/schedule';
import { cn } from '../../lib/utils';
import { Badge } from '../StatusBadge';
import { EmptyState } from '../ui';

const labels = { delayed: '延期预警', mold_overdue: '开模逾期', due_today: '今日到期', tight: '交付压线', unschedulable: '不可排产' };

export function WarningList({ warnings, compact = false }: { warnings: ScheduleWarning[]; compact?: boolean }) {
  if (warnings.length === 0) return <EmptyState title="当前没有预警" description="所有已排任务均未触发延期、开模逾期或今日到期预警。" />;
  return <div className="space-y-3">{warnings.map((warning) => {
    const Icon = warning.type === 'delayed' || warning.type === 'unschedulable' ? AlertOctagon : warning.type === 'mold_overdue' ? AlertTriangle : warning.type === 'due_today' ? Clock3 : BellRing;
    return <article key={warning.id} className={cn('flex gap-3 rounded-xl border p-4', warning.level === 'red' ? 'border-red-200 bg-red-50/60' : 'border-amber-200 bg-amber-50/60')}>
      <div className={cn('mt-0.5 shrink-0', warning.level === 'red' ? 'text-red-600' : 'text-amber-600')}><Icon size={20} /></div>
      <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className={cn('text-sm font-semibold', warning.level === 'red' ? 'text-red-900' : 'text-amber-900')}>{warning.title}</h3><Badge color={warning.level === 'red' ? 'red' : 'yellow'}>{labels[warning.type]}</Badge></div><p className={cn('mt-1.5 text-xs leading-5', warning.level === 'red' ? 'text-red-700' : 'text-amber-700')}>{warning.description}</p>{!compact && warning.bottleneck && <p className="mt-2 text-xs font-medium text-slate-600">瓶颈定位：{warning.bottleneck}</p>}</div>
    </article>;
  })}</div>;
}
