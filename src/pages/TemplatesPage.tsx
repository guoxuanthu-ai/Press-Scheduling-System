import { ArrowDown, ArrowUp, Plus, Save, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { can } from '../../contracts/auth';
import type { RouteTemplate } from '../../contracts/entities';
import { PROCESS_NAMES, TECH_ROUTES, techRouteLabels, type ProcessName, type TechRoute } from '../../contracts/enums';
import { ExcelActions } from '../components/ExcelActions';
import { Badge } from '../components/StatusBadge';
import { Button, Card, ErrorState, Field, Input, Loading, PageHeader, Select, useToast } from '../components/ui';
import { useAuth } from '../hooks/useAuth';
import { cn } from '../lib/utils';
import { trpc } from '../providers/trpc';

interface EditableStep { processName: ProcessName; durationHours: number }

function TemplateEditor({ template }: { template: RouteTemplate }) {
  const [steps, setSteps] = useState<EditableStep[]>(template.steps.map((step) => ({ processName: step.processName, durationHours: step.durationHours })));
  const utils = trpc.useUtils();
  const { toast } = useToast();
  const update = trpc.template.update.useMutation({
    onSuccess: async () => { await utils.template.list.invalidate(); toast('工艺模板已保存，仅影响之后新建的任务'); },
    onError: (error) => toast(error.message, 'error'),
  });
  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= steps.length) return;
    setSteps((current) => { const next = [...current]; [next[index], next[target]] = [next[target], next[index]]; return next; });
  }
  return <div><div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-lg font-bold text-ink">{techRouteLabels[template.techRoute]}</h2><p className="mt-1 text-xs text-slate-400">共 {steps.length} 道后工序 · 累计 {steps.reduce((sum, step) => sum + step.durationHours, 0)}h</p></div><Button onClick={() => update.mutate({ techRoute: template.techRoute, steps })} disabled={update.isPending || steps.length === 0}><Save size={16} />{update.isPending ? '保存中…' : '保存模板'}</Button></div>
    <div className="space-y-3">{steps.map((step, index) => <div key={`${step.processName}-${index}`} className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3 sm:flex-row sm:items-end"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-sm font-bold text-brand-600 ring-1 ring-slate-200">{index + 1}</div><Field label="后工序" className="flex-1"><Select value={step.processName} onChange={(event) => setSteps((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, processName: event.target.value as ProcessName } : item))}>{PROCESS_NAMES.map((name) => <option key={name} value={name}>{name}</option>)}</Select></Field><Field label="耗时（小时）" className="flex-1"><Input type="number" min="0.5" step="0.5" value={step.durationHours} onChange={(event) => setSteps((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, durationHours: Number(event.target.value) } : item))} /></Field><div className="flex gap-1"><Button type="button" variant="secondary" size="sm" onClick={() => move(index, -1)} disabled={index === 0} aria-label="上移"><ArrowUp size={15} /></Button><Button type="button" variant="secondary" size="sm" onClick={() => move(index, 1)} disabled={index === steps.length - 1} aria-label="下移"><ArrowDown size={15} /></Button><Button type="button" variant="ghost" size="sm" className="text-red-600" onClick={() => setSteps((current) => current.filter((_, itemIndex) => itemIndex !== index))} aria-label="删除"><Trash2 size={15} /></Button></div></div>)}</div>
    <Button variant="secondary" className="mt-4 w-full border-dashed" onClick={() => { const unused = PROCESS_NAMES.find((name) => !steps.some((step) => step.processName === name)); if (!unused) { toast('五类后工序均已添加', 'error'); return; } setSteps((current) => [...current, { processName: unused, durationHours: 8 }]); }}><Plus size={16} />添加后工序</Button>
  </div>;
}

export function TemplatesPage() {
  const list = trpc.template.list.useQuery();
  const [selected, setSelected] = useState<TechRoute>('amorphous_180');
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const canEdit = user ? can(user.role, 'template:write') : false;
  if (list.isLoading) return <Loading />;
  if (list.isError) return <ErrorState message={list.error.message} retry={() => list.refetch()} />;
  const template = list.data?.find((item) => item.techRoute === selected);
  return <div className="animate-rise"><PageHeader eyebrow="PROCESS ROUTE" title="工艺路线模板" description="按技术路线维护固定后工序、顺序和耗时。新建任务时自动复制快照，后续模板修改不会影响已有任务。" actions={<ExcelActions entity="templates" canImport={canEdit} onImported={() => utils.template.list.invalidate()} />} />
    <div className="mb-5 grid gap-3 lg:grid-cols-3">{TECH_ROUTES.map((route) => { const item = list.data?.find((entry) => entry.techRoute === route); return <button key={route} onClick={() => setSelected(route)} className={cn('rounded-2xl border p-4 text-left transition', selected === route ? 'border-brand-500 bg-brand-50 shadow-sm' : 'border-slate-200 bg-white hover:border-brand-100')}><div className="flex items-center justify-between"><p className={cn('font-semibold', selected === route ? 'text-brand-800' : 'text-slate-700')}>{techRouteLabels[route]}</p>{selected === route && <Badge color={canEdit ? 'green' : 'slate'}>{canEdit ? '编辑中' : '查看中'}</Badge>}</div><p className="mt-2 text-xs text-slate-400">{item?.steps.length ?? 0} 道工序 · {item?.steps.reduce((sum, step) => sum + step.durationHours, 0) ?? 0}h</p></button>; })}</div>
    <div className="mb-5 rounded-xl border border-blue-200 bg-blue-50 p-4 text-xs leading-5 text-blue-700"><strong>快照规则：</strong>任务创建后会独立保存当时的后工序列表。{canEdit ? '此处修改只作用于之后创建的任务。' : '当前角色仅可查看，只有管理员或总经理可以修改模板。'}</div>
    <Card className="p-5 sm:p-6">{template && (canEdit ? <TemplateEditor key={`${template.techRoute}-${template.updatedAt}`} template={template} /> : <div><h2 className="mb-4 text-lg font-bold text-ink">{techRouteLabels[template.techRoute]}</h2><div className="space-y-2">{template.steps.map((step) => <div key={step.id} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white font-semibold text-brand-600 ring-1 ring-slate-200">{step.seq}</span><span className="font-medium text-slate-700">{step.processName}</span><span className="ml-auto text-slate-500">{step.durationHours}h</span></div>)}</div></div>)}</Card>
  </div>;
}
