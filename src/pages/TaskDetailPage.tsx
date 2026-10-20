import { ArrowLeft, CheckCircle2, Pencil, RefreshCw, Trash2, XCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { can } from '../../contracts/auth';
import type { SampleTask } from '../../contracts/entities';
import { stepStatusLabels, techRouteLabels, type StepStatus } from '../../contracts/enums';
import { PriorityBadge, StepStatusBadge, TaskStatusBadge } from '../components/StatusBadge';
import { StepChain } from '../components/StepChain';
import { TaskForm } from '../components/TaskForm';
import { Button, Card, ErrorState, Input, Loading, Modal, PageHeader, Select, useToast } from '../components/ui';
import { useAuth } from '../hooks/useAuth';
import { useSchedule } from '../hooks/useSchedule';
import { formatHours } from '../lib/utils';
import { trpc } from '../providers/trpc';

function ProgressEditor({ task }: { task: SampleTask }) {
  const [hours, setHours] = useState<Record<number, number>>({});
  const [postStatuses, setPostStatuses] = useState<Record<number, StepStatus>>({});
  const utils = trpc.useUtils();
  const { toast } = useToast();
  const { user } = useAuth();
  useEffect(() => {
    setHours(Object.fromEntries(task.pressingSteps.map((step) => [step.id, step.completedHours])));
    setPostStatuses(Object.fromEntries(task.postSteps.map((step) => [step.id, step.status])));
  }, [task.id, task.updatedAt]);
  const update = trpc.task.updateProgress.useMutation({
    onSuccess: async () => { await utils.task.invalidate(); toast('实际进度已保存，请重新排产计算后续影响'); },
    onError: (error) => toast(error.message, 'error'),
  });
  const disabled = task.status === 'cancelled' || task.status === 'completed' || !user || !can(user.role, 'task:write');
  return <div><div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm"><thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="p-3 font-medium">工序</th><th className="p-3 font-medium">计划 / 资源</th><th className="p-3 font-medium">实际进度</th><th className="p-3 font-medium">状态</th></tr></thead><tbody>
    {task.pressingSteps.map((step) => <tr key={step.id} className="border-t border-slate-100"><td className="p-3"><p className="font-semibold text-slate-700">{step.name}</p><p className="mt-1 text-xs text-slate-400">{step.stepType === 'core' ? '预压 core' : '合压'} · 需求 {formatHours(step.requiredHours)}</p></td><td className="p-3 text-xs text-slate-500"><PlanText task={task} stepId={step.id} /></td><td className="p-3"><div className="flex items-center gap-2"><Input type="number" min="0" max={step.requiredHours} step="0.5" value={hours[step.id] ?? 0} disabled={disabled} onChange={(event) => setHours((current) => ({ ...current, [step.id]: Number(event.target.value) }))} className="w-28" /><span className="text-xs text-slate-400">/ {step.requiredHours}h</span></div></td><td className="p-3"><StepStatusBadge value={step.status} /></td></tr>)}
    {task.postSteps.map((step) => <tr key={step.id} className="border-t border-slate-100"><td className="p-3"><p className="font-semibold text-slate-700">{step.processName}</p><p className="mt-1 text-xs text-slate-400">后工序 {step.seq} · {formatHours(step.durationHours)}</p></td><td className="p-3 text-xs text-slate-500"><PostPlanText task={task} stepId={step.id} /></td><td className="p-3"><Select value={postStatuses[step.id] ?? step.status} disabled={disabled} onChange={(event) => setPostStatuses((current) => ({ ...current, [step.id]: event.target.value as StepStatus }))} className="w-32">{Object.entries(stepStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></td><td className="p-3"><StepStatusBadge value={step.status} /></td></tr>)}
  </tbody></table></div><div className="mt-4 flex items-center justify-between gap-3"><p className="text-xs text-slate-400">{disabled && task.status !== 'cancelled' && task.status !== 'completed' ? '当前角色仅可查看实际进度。' : '已完成工时不会重排；剩余工时将从新的基准日开始滚动。'}</p>{!disabled && <Button disabled={update.isPending} onClick={() => update.mutate({ taskId: task.id, pressingSteps: task.pressingSteps.map((step) => ({ id: step.id, completedHours: Number(hours[step.id] ?? 0) })), postSteps: task.postSteps.map((step) => ({ id: step.id, status: postStatuses[step.id] ?? step.status })) })}>{update.isPending ? '保存中…' : '保存全部进度'}</Button>}</div></div>;
}

function PlanText({ task, stepId }: { task: SampleTask; stepId: number }) {
  const latest = trpc.schedule.latest.useQuery();
  const plan = latest.data?.taskPlans.find((item) => item.taskId === task.id)?.pressingSteps.find((item) => item.stepId === stepId);
  if (plan?.unschedulableReason) return <span className="text-red-600">{plan.unschedulableReason}</span>;
  if (!plan?.startDate) return '尚未排产';
  return <>{plan.startDate} → {plan.endDate}<br /><span className="text-brand-600">{plan.pressName} · 剩余 {formatHours(plan.remainingHours)}</span></>;
}
function PostPlanText({ task, stepId }: { task: SampleTask; stepId: number }) {
  const latest = trpc.schedule.latest.useQuery();
  const plan = latest.data?.taskPlans.find((item) => item.taskId === task.id)?.postSteps.find((item) => item.stepId === stepId);
  return plan?.startDate ? <>{plan.startDate} → {plan.endDate}</> : '尚未排产';
}

export function TaskDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const taskId = Number(id);
  const task = trpc.task.get.useQuery({ id: taskId }, { enabled: Number.isInteger(taskId) && taskId > 0 });
  const molds = trpc.mold.list.useQuery();
  const { latest, regenerate, run } = useSchedule();
  const { user } = useAuth();
  const [editing, setEditing] = useState(false);
  const utils = trpc.useUtils();
  const { toast } = useToast();
  const setStatus = trpc.task.setStatus.useMutation({ onSuccess: async () => { await Promise.all([utils.task.invalidate(), utils.schedule.invalidate()]); toast('任务状态已更新'); }, onError: (error) => toast(error.message, 'error') });
  const remove = trpc.task.remove.useMutation({
    onSuccess: async () => { await utils.task.invalidate(); toast('任务已删除'); navigate('/tasks'); },
    onError: (error) => toast(error.message, 'error'),
  });
  if (task.isLoading || molds.isLoading) return <Loading />;
  if (task.isError) return <ErrorState message={task.error.message} retry={() => task.refetch()} />;
  if (!task.data) return <ErrorState message="任务编号无效" />;
  const current = task.data;
  const canEdit = user ? can(user.role, 'task:write') : false;
  const canSchedule = user ? can(user.role, 'schedule:write') : false;
  const plan = latest.data?.taskPlans.find((item) => item.taskId === current.id);
  const traces = latest.data?.debug.trace.filter((item) => item.taskId === current.id) ?? [];
  return <div className="animate-rise"><Link to="/tasks" className="mb-4 inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-brand-600"><ArrowLeft size={15} />返回任务列表</Link>
    <PageHeader eyebrow={`TASK #${current.id}`} title={current.productName} description={`${techRouteLabels[current.techRoute]} · 交期 ${current.deadline}${current.quantity ? ` · ${current.quantity} 件` : ''}`} actions={<><PriorityBadge value={current.priority} /><TaskStatusBadge value={current.status} />{canEdit && current.status !== 'completed' && current.status !== 'cancelled' && <Button variant="secondary" onClick={() => setEditing(true)}><Pencil size={16} />编辑任务</Button>}{canSchedule && <Button variant="secondary" onClick={() => regenerate()} disabled={run.isPending}><RefreshCw size={16} className={run.isPending ? 'animate-spin' : ''} />重排此进度</Button>}</>} />
    {plan?.unschedulableReason && <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"><strong>不可排原因：</strong>{plan.unschedulableReason}</div>}
    <div className="mb-6 grid gap-4 sm:grid-cols-3"><Card className="p-4"><p className="text-xs text-slate-400">预计交付</p><p className={plan?.delayDays ? 'mt-2 text-xl font-bold text-red-600' : 'mt-2 text-xl font-bold text-ink'}>{plan?.estimatedDelivery ?? '待排产'}</p>{plan?.delayDays ? <p className="mt-1 text-xs text-red-500">超过交期 {plan.delayDays} 天</p> : null}</Card><Card className="p-4"><p className="text-xs text-slate-400">压制剩余</p><p className="mt-2 text-xl font-bold text-ink">{formatHours(current.pressingSteps.reduce((sum, step) => sum + step.requiredHours - step.completedHours, 0))}</p></Card><Card className="p-4"><p className="text-xs text-slate-400">瓶颈定位</p><p className="mt-2 text-sm font-semibold text-slate-700">{plan?.bottleneck ?? '暂无延期瓶颈'}</p></Card></div>
    <Card className="mb-6 p-5"><div className="mb-4"><h2 className="font-bold text-ink">全链路工序结构</h2><p className="mt-1 text-xs text-slate-400">Core × N → 合压 → 后工序，节点展示实际状态与最近计划</p></div><StepChain task={current} plan={plan} /></Card>
    <Card className="mb-6 p-5"><div className="mb-4"><h2 className="font-bold text-ink">实际进度录入</h2><p className="mt-1 text-xs text-slate-400">压制工序按已完成工时录入，后工序按状态标记</p></div><ProgressEditor task={current} /></Card>
    <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]"><Card className="p-5"><h2 className="mb-4 font-bold text-ink">排产决策解释</h2>{traces.length ? <div className="space-y-3">{traces.map((trace, index) => <div key={`${trace.stepId}-${index}`} className="rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-600">{trace.message}</div>)}</div> : <p className="text-sm text-slate-400">生成排班后，这里会解释每道工序为何排在该日期和压机。</p>}</Card>
      <Card className="p-5"><h2 className="mb-4 font-bold text-ink">任务操作</h2><p className="mb-4 text-xs leading-5 text-slate-500">整单完成后不再参与排产；取消任务会保留台账和工序记录。</p>{canEdit ? <div className="flex flex-col gap-2"><Button variant="secondary" disabled={current.status === 'completed'} onClick={() => { if (window.confirm('确定将整单标记为已完成？所有工序进度也会同步完成。')) setStatus.mutate({ id: current.id, status: 'completed' }); }}><CheckCircle2 size={16} />标记整单完成</Button><Button variant="danger" disabled={current.status === 'cancelled'} onClick={() => { if (window.confirm('确定取消该任务？')) setStatus.mutate({ id: current.id, status: 'cancelled' }); }}><XCircle size={16} />取消任务</Button>{(current.status === 'cancelled' || current.status === 'completed') && <Button variant="ghost" onClick={() => setStatus.mutate({ id: current.id, status: 'in_progress' })}>重新开启任务</Button>}<Button variant="ghost" className="mt-2 text-red-600 hover:bg-red-50" disabled={remove.isPending} onClick={() => { if (window.confirm(`确定永久删除任务“${current.productName}”？此操作不可撤销，历史排产快照会保留。`)) remove.mutate({ id: current.id }); }}><Trash2 size={16} />永久删除任务</Button></div> : <p className="text-xs text-slate-400">当前角色仅可查看任务，不能变更状态。</p>}{current.remark && <div className="mt-5 rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-800"><strong>备注：</strong>{current.remark}</div>}</Card></div>
    <Modal open={editing} onClose={() => setEditing(false)} title="编辑打样任务" description="修改工序结构时会保留已有工序的实际进度" wide><TaskForm initial={current} onDone={() => setEditing(false)} /></Modal>
  </div>;
}
