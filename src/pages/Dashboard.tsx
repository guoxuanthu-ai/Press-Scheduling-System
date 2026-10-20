import { AlertTriangle, ArrowRight, CalendarCheck, Clock3, Factory, Gauge, Hammer, Play, RefreshCw, Wrench } from 'lucide-react';
import { Link } from 'react-router';
import { can } from '../../contracts/auth';
import { addDays, formatDateCN, todayLocal } from '../../contracts/date';
import { Badge, PriorityBadge } from '../components/StatusBadge';
import { WarningList } from '../components/schedule/WarningList';
import { Button, Card, EmptyState, ErrorState, Loading, PageHeader } from '../components/ui';
import { useAuth } from '../hooks/useAuth';
import { useSchedule } from '../hooks/useSchedule';
import { cn, formatHours, formatTime } from '../lib/utils';
import { trpc } from '../providers/trpc';

export function Dashboard() {
  const { user } = useAuth();
  const { latest, regenerate, run } = useSchedule();
  const presses = trpc.press.list.useQuery();
  const canSchedule = user ? can(user.role, 'schedule:write') : false;
  const result = latest.data;
  if (latest.isLoading || presses.isLoading) return <Loading />;
  if (latest.isError) return <ErrorState message={latest.error.message} retry={() => latest.refetch()} />;
  const todayAssignments = result?.assignments.filter((item) => item.date === result.baseDate) ?? [];
  const metrics = [
    { label: '进行中任务', value: result?.metrics.activeTasks ?? 0, unit: '项', icon: Clock3, color: 'bg-blue-50 text-blue-600', note: '待排产与进行中' },
    { label: '延期预警', value: result?.metrics.delayedTasks ?? 0, unit: '项', icon: AlertTriangle, color: 'bg-red-50 text-red-600', note: '含不可排任务' },
    { label: '需立即开模', value: result?.metrics.urgentMolds ?? 0, unit: '副', icon: Wrench, color: 'bg-amber-50 text-amber-600', note: '待下单且时间紧迫' },
    { label: '今日压机利用率', value: result?.metrics.todayUtilization ?? 0, unit: '%', icon: Gauge, color: 'bg-emerald-50 text-emerald-600', note: '按可用工时计算' },
  ];
  return <div className="animate-rise">
    <PageHeader eyebrow="PRODUCTION CONTROL" title={`你好，${user?.name}`} description="从这里掌握今天的打样节奏，提前处理每一个交付瓶颈。" actions={<>{canSchedule && <Button onClick={() => regenerate()} disabled={run.isPending}><RefreshCw size={16} className={run.isPending ? 'animate-spin' : ''} />{result ? '重新排产' : '生成排班'}</Button>}<Link to="/tasks"><Button variant="secondary">管理任务<ArrowRight size={16} /></Button></Link></>} />
    <div className="mb-6 grid grid-cols-2 gap-3 xl:grid-cols-4">{metrics.map(({ label, value, unit, icon: Icon, color, note }) => <Card key={label} className="p-4 sm:p-5"><div className="flex items-start justify-between"><div className={cn('rounded-xl p-2.5', color)}><Icon size={20} /></div><span className="hidden text-[11px] text-slate-400 sm:block">{note}</span></div><p className="mt-5 text-sm text-slate-500">{label}</p><p className="mt-1 text-3xl font-bold tracking-tight text-ink tabular">{value}<span className="ml-1 text-sm font-medium text-slate-400">{unit}</span></p></Card>)}</div>
    {!result ? <Card><EmptyState title="还没有排产结果" description={canSchedule ? '系统已准备初始压机、模具和示例任务。点击“生成排班”即可得到每日矩阵、任务甘特和交期预警。' : '请等待生产或管理员生成首次排班。'} action={canSchedule ? <Button onClick={() => regenerate()} disabled={run.isPending}><Play size={16} />立即生成排班</Button> : undefined} /></Card> : <>
      <div className="mb-6 grid gap-6 xl:grid-cols-[1.65fr_1fr]">
        <Card className="overflow-hidden"><div className="flex items-center justify-between border-b border-slate-100 p-5"><div><h2 className="font-bold text-ink">今日排班</h2><p className="mt-1 text-xs text-slate-400">{result.baseDate} · {todayAssignments.length} 个工序段</p></div><Link to="/schedule" className="text-xs font-medium text-brand-600 hover:text-brand-700">查看完整排班 →</Link></div>
          <div className="divide-y divide-slate-100">{presses.data?.filter((press) => press.status === 'available').map((press) => {
            const items = todayAssignments.filter((item) => item.pressId === press.id);
            const load = result.dailyLoads.find((item) => item.date === result.baseDate && item.pressId === press.id);
            return <div key={press.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center"><div className="flex w-full items-center gap-3 sm:w-44"><div className={cn('rounded-lg p-2', items.length ? 'bg-brand-50 text-brand-600' : 'bg-slate-100 text-slate-400')}><Factory size={18} /></div><div><p className="text-sm font-semibold text-slate-800">{press.name}</p><p className="text-xs text-slate-400">{press.model}</p></div></div><div className="min-w-0 flex-1">{items.length ? <div className="flex flex-wrap gap-2">{items.map((item) => <Link to={`/tasks/${item.taskId}`} key={item.id} className="rounded-lg bg-slate-50 px-3 py-2 text-xs hover:bg-brand-50"><span className="font-semibold text-slate-700">{item.productName}</span><span className="mx-1.5 text-slate-300">|</span><span className="text-slate-500">{item.stepName} · {formatHours(item.hours)}</span></Link>)}</div> : <span className="text-xs text-slate-400">今日暂无排产</span>}</div><div className="w-full sm:w-20"><p className="mb-1 text-right text-xs font-semibold text-slate-600">{load?.utilization ?? 0}%</p><div className="h-1.5 rounded-full bg-slate-100"><div className="h-full rounded-full bg-brand-500" style={{ width: `${load?.utilization ?? 0}%` }} /></div></div></div>;
          })}</div>
        </Card>
        <Card className="p-5"><div className="mb-4 flex items-center justify-between"><div><h2 className="font-bold text-ink">风险雷达</h2><p className="mt-1 text-xs text-slate-400">优先处理红色预警</p></div><Link to="/warnings"><Badge color={result.warnings.length ? 'red' : 'green'}>{result.warnings.length} 条</Badge></Link></div><div className="max-h-[480px] overflow-y-auto pr-1"><WarningList warnings={result.warnings.slice(0, 5)} compact /></div></Card>
      </div>
      <div className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
        <Card className="p-5"><div className="mb-6 flex items-center justify-between"><div><h2 className="font-bold text-ink">近 7 天压机负荷</h2><p className="mt-1 text-xs text-slate-400">全部可用压机产能汇总</p></div><CalendarCheck size={20} className="text-brand-600" /></div><div className="flex h-48 items-end gap-3">{Array.from({ length: 7 }, (_, index) => {
          const date = addDays(result.baseDate, index);
          const loads = result.dailyLoads.filter((item) => item.date === date);
          const scheduled = loads.reduce((sum, item) => sum + item.scheduledHours, 0);
          const capacity = loads.reduce((sum, item) => sum + item.capacityHours, 0);
          const utilization = capacity ? Math.round(scheduled / capacity * 100) : 0;
          return <div key={date} className="flex h-full flex-1 flex-col items-center justify-end gap-2"><p className="text-xs font-semibold text-slate-600">{utilization}%</p><div className="flex h-32 w-full max-w-12 items-end overflow-hidden rounded-t-lg bg-slate-100"><div className={cn('w-full rounded-t-lg transition-all', utilization > 90 ? 'bg-amber-400' : 'bg-brand-500')} style={{ height: `${Math.max(2, utilization)}%` }} /></div><p className="text-[11px] text-slate-400">{index === 0 ? '今天' : formatDateCN(date)}</p></div>;
        })}</div></Card>
        <Card className="p-5"><div className="mb-4"><h2 className="font-bold text-ink">交付清单</h2><p className="mt-1 text-xs text-slate-400">按优先级与交期排序</p></div><div className="space-y-2">{result.taskPlans.slice(0, 5).map((plan) => <Link to={`/tasks/${plan.taskId}`} key={plan.taskId} className="flex items-center gap-3 rounded-xl border border-slate-100 p-3 transition hover:border-brand-100 hover:bg-brand-50/40"><PriorityBadge value={plan.priority} /><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-slate-700">{plan.productName}</p><p className="mt-1 text-[11px] text-slate-400">交期 {plan.deadline}</p></div><div className="text-right"><p className={cn('text-xs font-semibold', plan.delayDays > 0 ? 'text-red-600' : 'text-slate-600')}>{plan.estimatedDelivery ?? '不可排'}</p>{plan.delayDays > 0 && <p className="mt-1 text-[10px] text-red-500">延期 {plan.delayDays} 天</p>}</div></Link>)}</div><p className="mt-4 text-right text-[11px] text-slate-400">最近计算 {formatTime(result.generatedAt)} · 基准 {result.baseDate || todayLocal()}</p></Card>
      </div>
    </>}
  </div>;
}
