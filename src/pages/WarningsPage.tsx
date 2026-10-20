import { BellRing, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { can } from '../../contracts/auth';
import { Badge } from '../components/StatusBadge';
import { MoldAlerts } from '../components/schedule/MoldAlerts';
import { WarningList } from '../components/schedule/WarningList';
import { Button, Card, EmptyState, ErrorState, Loading, PageHeader } from '../components/ui';
import { useAuth } from '../hooks/useAuth';
import { useSchedule } from '../hooks/useSchedule';
import { cn } from '../lib/utils';

export function WarningsPage() {
  const { latest, regenerate, run } = useSchedule();
  const { user } = useAuth();
  const [level, setLevel] = useState<'all' | 'red' | 'yellow'>('all');
  const canSchedule = user ? can(user.role, 'schedule:write') : false;
  if (latest.isLoading) return <Loading />;
  if (latest.isError) return <ErrorState message={latest.error.message} retry={() => latest.refetch()} />;
  const result = latest.data;
  const warnings = (result?.warnings ?? []).filter((warning) => level === 'all' || warning.level === level);
  const red = result?.warnings.filter((warning) => warning.level === 'red').length ?? 0;
  const yellow = result?.warnings.filter((warning) => warning.level === 'yellow').length ?? 0;
  return <div className="animate-rise"><PageHeader eyebrow="RISK CENTER" title="交期预警中心" description="集中处理延期、开模逾期、今日到期和压线任务；进度或资源变更后请重新排产。" actions={canSchedule ? <Button onClick={() => regenerate()} disabled={run.isPending}><RefreshCw size={16} className={run.isPending ? 'animate-spin' : ''} />重新校验交期</Button> : undefined} />
    {!result ? <Card><EmptyState title="暂无预警数据" description={canSchedule ? '首次生成排班后，系统会在这里汇总全部交付风险。' : '请等待生产或管理员生成排班。'} action={canSchedule ? <Button onClick={() => regenerate()}>生成排班并校验</Button> : undefined} /></Card> : <>
      <div className="mb-6 grid grid-cols-3 gap-3"><Card className="p-4 sm:p-5"><p className="text-xs text-slate-400">全部预警</p><p className="mt-2 text-2xl font-bold text-ink">{result.warnings.length}</p></Card><Card className="border-red-100 bg-red-50/40 p-4 sm:p-5"><p className="text-xs text-red-500">红色 / 需立即处理</p><p className="mt-2 text-2xl font-bold text-red-700">{red}</p></Card><Card className="border-amber-100 bg-amber-50/40 p-4 sm:p-5"><p className="text-xs text-amber-600">黄色 / 持续关注</p><p className="mt-2 text-2xl font-bold text-amber-700">{yellow}</p></Card></div>
      <div className="grid items-start gap-6 xl:grid-cols-[1fr_1fr]"><Card className="p-5"><div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-2"><BellRing size={19} className="text-red-500" /><h2 className="font-bold text-ink">任务风险清单</h2></div><div className="flex gap-1 rounded-lg bg-slate-100 p-1">{(['all', 'red', 'yellow'] as const).map((value) => <button key={value} onClick={() => setLevel(value)} className={cn('rounded-md px-3 py-1.5 text-xs', level === value ? 'bg-white font-semibold text-slate-800 shadow-sm' : 'text-slate-500')}>{value === 'all' ? '全部' : value === 'red' ? '红色' : '黄色'}</button>)}</div></div><WarningList warnings={warnings} /></Card>
      <Card className="p-5"><div className="mb-5 flex items-center justify-between"><div><h2 className="font-bold text-ink">新开模决策</h2><p className="mt-1 text-xs text-slate-400">按最晚下单日排序</p></div><Badge color={result.moldReminders.some((item) => item.overdue) ? 'red' : 'green'}>{result.moldReminders.filter((item) => !item.ordered).length} 副待下单</Badge></div><MoldAlerts reminders={result.moldReminders} /></Card></div>
    </>}
  </div>;
}
