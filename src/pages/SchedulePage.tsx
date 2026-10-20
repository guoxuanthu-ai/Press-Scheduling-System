import { CalendarRange, GitBranch, RefreshCw, Wrench } from 'lucide-react';
import { useEffect, useState } from 'react';
import { can } from '../../contracts/auth';
import { todayLocal } from '../../contracts/date';
import { DailyBoard } from '../components/schedule/DailyBoard';
import { GanttChart } from '../components/schedule/GanttChart';
import { MoldAlerts } from '../components/schedule/MoldAlerts';
import { WarningList } from '../components/schedule/WarningList';
import { WeekendCalendar } from '../components/schedule/WeekendCalendar';
import { Button, Card, EmptyState, ErrorState, Input, Loading, PageHeader } from '../components/ui';
import { useAuth } from '../hooks/useAuth';
import { useSchedule } from '../hooks/useSchedule';
import { cn, formatTime } from '../lib/utils';
import { trpc } from '../providers/trpc';

type Tab = 'daily' | 'gantt' | 'molds';

export function SchedulePage() {
  const { latest, regenerate, run } = useSchedule();
  const presses = trpc.press.list.useQuery();
  const calendarQuery = trpc.schedule.calendar.useQuery();
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>('daily');
  const [baseDate, setBaseDate] = useState(todayLocal());
  const [workCalendar, setWorkCalendar] = useState<Record<string, boolean>>({});
  const canSchedule = user ? can(user.role, 'schedule:write') : false;
  useEffect(() => {
    if (calendarQuery.data) setWorkCalendar(calendarQuery.data);
  }, [calendarQuery.data]);
  if (latest.isLoading || presses.isLoading || calendarQuery.isLoading) return <Loading />;
  if (latest.isError) return <ErrorState message={latest.error.message} retry={() => latest.refetch()} />;
  const result = latest.data;
  return <div className="animate-rise"><PageHeader eyebrow="SCHEDULING" title="智能排班" description="基准日默认取本地系统日期，也可手动修改；周末可逐日设置加班，全部工序均保留决策解释。" actions={canSchedule ? <><Input type="date" value={baseDate} onChange={(event) => setBaseDate(event.target.value)} className="w-40" aria-label="排产基准日" /><Button onClick={() => regenerate(baseDate, workCalendar)} disabled={run.isPending}><RefreshCw size={16} className={run.isPending ? 'animate-spin' : ''} />{run.isPending ? '计算中…' : '生成 / 重新排产'}</Button></> : undefined} />
    <WeekendCalendar baseDate={baseDate} calendar={workCalendar} onChange={setWorkCalendar} readOnly={!canSchedule} horizonDays={result?.horizonDays ?? 180} />
    {!result ? <Card><EmptyState title="等待首次排产" description={canSchedule ? '选择排产基准日和周末加班设置后点击生成。系统会保存结果快照。' : '请等待生产或管理员生成首次排班。'} action={canSchedule ? <Button onClick={() => regenerate(baseDate, workCalendar)}>生成排班</Button> : undefined} /></Card> : <>
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">{[{ label: '排产基准日', value: result.baseDate }, { label: '排班工序段', value: `${result.assignments.length} 段` }, { label: '开模提醒', value: `${result.moldReminders.length} 条` }, { label: '最近计算', value: formatTime(result.generatedAt) }].map((item) => <Card key={item.label} className="p-4"><p className="text-xs text-slate-400">{item.label}</p><p className="mt-2 truncate text-sm font-semibold text-slate-700">{item.value}</p></Card>)}</div>
      <Card className="mb-6 p-4 sm:p-5"><div className="mb-5 flex gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1">{[{ id: 'daily' as const, label: '每日排班矩阵', icon: CalendarRange }, { id: 'gantt' as const, label: '任务全链甘特', icon: GitBranch }, { id: 'molds' as const, label: `开模提醒 ${result.moldReminders.length}`, icon: Wrench }].map(({ id, label, icon: Icon }) => <button key={id} onClick={() => setTab(id)} className={cn('flex min-h-10 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-lg px-4 text-xs font-medium transition', tab === id ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-800')}><Icon size={16} />{label}</button>)}</div>{tab === 'daily' && <DailyBoard result={result} presses={presses.data ?? []} />}{tab === 'gantt' && <GanttChart result={result} />}{tab === 'molds' && <MoldAlerts reminders={result.moldReminders} />}</Card>
      <Card className="p-5"><div className="mb-4"><h2 className="font-bold text-ink">本次排产预警</h2><p className="mt-1 text-xs text-slate-400">延期、开模逾期、今日到期与交付压线</p></div><WarningList warnings={result.warnings} /></Card>
    </>}
  </div>;
}
