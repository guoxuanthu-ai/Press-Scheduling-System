import { ArrowRight, Boxes, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { can } from '../../contracts/auth';
import type { SampleTask } from '../../contracts/entities';
import { TASK_STATUSES, taskStatusLabels, techRouteLabels, type TaskStatus } from '../../contracts/enums';
import { PriorityBadge, TaskStatusBadge } from '../components/StatusBadge';
import { TaskForm } from '../components/TaskForm';
import { Button, Card, EmptyState, ErrorState, Input, Loading, Modal, PageHeader, Select, useToast } from '../components/ui';
import { useAuth } from '../hooks/useAuth';
import { useSchedule } from '../hooks/useSchedule';
import { trpc } from '../providers/trpc';

export function TasksPage() {
  const list = trpc.task.list.useQuery();
  const { latest, regenerate, run } = useSchedule();
  const { user } = useAuth();
  const [editing, setEditing] = useState<SampleTask | 'new' | null>(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<TaskStatus | 'all'>('all');
  const canEdit = user ? can(user.role, 'task:write') : false;
  const canSchedule = user ? can(user.role, 'schedule:write') : false;
  const utils = trpc.useUtils();
  const { toast } = useToast();
  const remove = trpc.task.remove.useMutation({
    onSuccess: async () => { await utils.task.invalidate(); toast('任务已删除，历史排产快照仍保留用于追溯'); },
    onError: (error) => toast(error.message, 'error'),
  });
  if (list.isLoading) return <Loading />;
  if (list.isError) return <ErrorState message={list.error.message} retry={() => list.refetch()} />;
  const tasks = (list.data ?? []).filter((task) => (status === 'all' || task.status === status) && task.productName.toLowerCase().includes(search.toLowerCase()));
  return <div className="animate-rise"><PageHeader eyebrow="SAMPLE TASKS" title="打样任务" description="维护多 Core + 合压 + 后工序完整链条，录入实际进度后可一键滚动重排。" actions={<>{canSchedule && <Button variant="secondary" onClick={() => regenerate()} disabled={run.isPending}><RefreshCw size={16} className={run.isPending ? 'animate-spin' : ''} />重新排产</Button>}{canEdit && <Button onClick={() => setEditing('new')}><Plus size={16} />新建任务</Button>}</>} />
    <Card className="overflow-hidden"><div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row"><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索产品名称 / 型号" className="sm:max-w-sm" /><Select value={status} onChange={(event) => setStatus(event.target.value as TaskStatus | 'all')} className="sm:max-w-44"><option value="all">全部状态</option>{TASK_STATUSES.map((value) => <option key={value} value={value}>{taskStatusLabels[value]}</option>)}</Select><span className="self-center text-xs text-slate-400 sm:ml-auto">共 {tasks.length} 项任务</span></div>
      {tasks.length === 0 ? <EmptyState title="没有匹配的任务" description="调整筛选条件，或创建一个新的打样任务。" action={canEdit ? <Button onClick={() => setEditing('new')}><Plus size={16} />新建任务</Button> : undefined} /> : <div className="overflow-x-auto"><table className="w-full min-w-[1080px] text-left text-sm"><thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="p-4 font-medium">产品 / 工艺结构</th><th className="p-4 font-medium">技术路线</th><th className="p-4 font-medium">交期 / 优先级</th><th className="p-4 font-medium">实际进度</th><th className="p-4 font-medium">预计交付</th><th className="p-4 font-medium">状态</th><th className="p-4 text-right font-medium">操作</th></tr></thead><tbody>{tasks.map((task) => {
        const plan = latest.data?.taskPlans.find((item) => item.taskId === task.id);
        const pressingHours = task.pressingSteps.reduce((sum, step) => sum + step.requiredHours, 0);
        const completedHours = task.pressingSteps.reduce((sum, step) => sum + step.completedHours, 0);
        const pressingProgress = pressingHours ? completedHours / pressingHours : 1;
        const postProgress = task.postSteps.length ? task.postSteps.filter((step) => step.status === 'completed').length / task.postSteps.length : 1;
        const progress = task.status === 'completed' ? 100 : Math.round((pressingProgress * 0.7 + postProgress * 0.3) * 100);
        return <tr key={task.id} className="border-t border-slate-100 hover:bg-slate-50/60"><td className="p-4"><div className="flex items-center gap-3"><div className="rounded-lg bg-brand-50 p-2 text-brand-600"><Boxes size={18} /></div><div><Link to={`/tasks/${task.id}`} className="font-semibold text-slate-800 hover:text-brand-600">{task.productName}</Link><p className="mt-1 text-xs text-slate-400">{task.pressingSteps.filter((step) => step.stepType === 'core').length} Core + 合压 + {task.postSteps.length} 后工序{task.quantity ? ` · ${task.quantity}件` : ''}</p></div></div></td><td className="p-4 text-xs text-slate-600">{techRouteLabels[task.techRoute]}</td><td className="p-4"><p className="mb-2 text-xs font-medium text-slate-600">{task.deadline}</p><PriorityBadge value={task.priority} /></td><td className="p-4"><div className="flex items-center gap-2"><div className="h-2 w-24 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-brand-500" style={{ width: `${progress}%` }} /></div><span className="text-xs text-slate-500">{progress}%</span></div></td><td className="p-4"><p className={plan?.delayDays ? 'font-semibold text-red-600' : 'text-slate-600'}>{plan?.estimatedDelivery ?? '未排产'}</p>{plan?.delayDays ? <p className="mt-1 text-xs text-red-500">延期 {plan.delayDays} 天</p> : null}</td><td className="p-4"><TaskStatusBadge value={task.status} /></td><td className="p-4"><div className="flex justify-end gap-1">{canEdit && task.status !== 'completed' && task.status !== 'cancelled' && <Button variant="ghost" size="sm" onClick={() => setEditing(task)}><Pencil size={15} />编辑</Button>}<Link to={`/tasks/${task.id}`}><Button variant="ghost" size="sm">查看<ArrowRight size={15} /></Button></Link>{canEdit && <Button variant="ghost" size="sm" className="text-red-600 hover:bg-red-50" disabled={remove.isPending} onClick={() => { if (window.confirm(`确定删除任务“${task.productName}”？此操作不可撤销，但历史排产快照会保留。`)) remove.mutate({ id: task.id }); }}><Trash2 size={15} />删除</Button>}</div></td></tr>;
      })}</tbody></table></div>}</Card>
    <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? '新建打样任务' : '编辑打样任务'} description={editing === 'new' ? '按产品 → 压制结构 → 后工序三步完成录入' : '修改工序结构时会保留已有工序的实际进度'} wide>{editing && <TaskForm key={editing === 'new' ? 'new' : `${editing.id}-${editing.updatedAt}`} initial={editing === 'new' ? undefined : editing} onDone={() => setEditing(null)} />}</Modal>
  </div>;
}
