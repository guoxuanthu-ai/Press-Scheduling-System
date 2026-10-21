import { ArrowRight, Plus, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { addDays, todayLocal } from '../../contracts/date';
import type { SampleTask } from '../../contracts/entities';
import { PRIORITIES, priorityLabels, PROCESS_NAMES, TECH_ROUTES, techRouteLabels, type Priority, type ProcessName, type TechRoute } from '../../contracts/enums';
import { trpc } from '../providers/trpc';
import { Button, EmptyState, Field, Input, Loading, Select, Textarea, useToast } from './ui';

interface StepDraft { key: number; id?: number; stepType: 'core' | 'final'; name: string; moldId: number; requiredHours: number }
interface PostDraft { key: number; id?: number; processName: ProcessName; durationHours: number }
let draftKey = 1;
const nextKey = () => draftKey++;

export function TaskForm({ initial, onDone }: { initial?: SampleTask; onDone: () => void }) {
  const molds = trpc.mold.list.useQuery();
  const templates = trpc.template.list.useQuery();
  const [productName, setProductName] = useState(initial?.productName ?? '');
  const [techRoute, setTechRoute] = useState<TechRoute>(initial?.techRoute ?? 'amorphous_180');
  const [deadline, setDeadline] = useState(initial?.deadline ?? addDays(todayLocal(), 14));
  const [priority, setPriority] = useState<Priority>(initial?.priority ?? 'P1');
  const [quantity, setQuantity] = useState(initial?.quantity ?? 10);
  const [remark, setRemark] = useState(initial?.remark ?? '');
  const [pressingSteps, setPressingSteps] = useState<StepDraft[]>(() => initial?.pressingSteps.map((step) => ({
    key: nextKey(), id: step.id, stepType: step.stepType, name: step.name, moldId: step.moldId, requiredHours: step.requiredHours,
  })) ?? [
    { key: nextKey(), stepType: 'core', name: 'Core A', moldId: 0, requiredHours: 8 },
    { key: nextKey(), stepType: 'final', name: '合压', moldId: 0, requiredHours: 6 },
  ]);
  const [postSteps, setPostSteps] = useState<PostDraft[]>(() => initial?.postSteps.map((step) => ({
    key: nextKey(), id: step.id, processName: step.processName, durationHours: step.durationHours,
  })) ?? []);
  const postInitialized = useRef(Boolean(initial));
  useEffect(() => {
    if (postInitialized.current || !templates.data) return;
    const template = templates.data.find((item) => item.techRoute === techRoute);
    if (template) {
      postInitialized.current = true;
      setPostSteps(template.steps.map((step) => ({ key: nextKey(), processName: step.processName, durationHours: step.durationHours })));
    }
  }, [techRoute, templates.data]);
  const effectivePressing = pressingSteps.map((step) => step.moldId === 0 && molds.data?.[0] ? { ...step, moldId: molds.data[0].id } : step);
  const utils = trpc.useUtils();
  const { toast } = useToast();
  const onError = (error: { message: string }) => toast(error.message, 'error');
  const create = trpc.task.create.useMutation({
    onSuccess: async () => { await utils.task.invalidate(); toast('打样任务已创建，后工序快照已保存'); onDone(); }, onError,
  });
  const update = trpc.task.update.useMutation({
    onSuccess: async () => { await utils.task.invalidate(); toast('打样任务已更新，实际进度已保留'); onDone(); }, onError,
  });
  const pending = create.isPending || update.isPending;

  function changeRoute(route: TechRoute) {
    if (initial?.postSteps.some((step) => step.status === 'completed') && !window.confirm('切换技术路线会按新模板重设后工序，已有后工序进度将随旧工序移除。确定继续？')) return;
    setTechRoute(route);
    const template = templates.data?.find((item) => item.techRoute === route);
    setPostSteps(template?.steps.map((step) => ({ key: nextKey(), processName: step.processName, durationHours: step.durationHours })) ?? []);
  }
  function updateStep(key: number, patch: Partial<StepDraft>) {
    setPressingSteps((current) => current.map((step) => step.key === key ? { ...step, ...patch } : step));
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    const shared = {
      productName, techRoute, deadline, priority, quantity: quantity > 0 ? Number(quantity) : null, remark,
      pressingSteps: effectivePressing.map(({ id, stepType, name, moldId, requiredHours }) => ({ id, stepType, name, moldId, requiredHours: Number(requiredHours) })),
      postSteps: postSteps.map(({ id, processName, durationHours }) => ({ id, processName, durationHours: Number(durationHours) })),
    };
    if (initial) update.mutate({ id: initial.id, ...shared });
    else create.mutate(shared);
  }
  if (molds.isLoading || templates.isLoading) return <Loading />;
  if (!molds.data?.length) return <EmptyState title="请先建立模具台账" description="每道压制工序都需要关联专用模具。" />;
  return <form onSubmit={submit} className="space-y-7">
    <section><h3 className="mb-4 text-sm font-bold text-slate-800">01 · 产品与交付</h3><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"><Field label="产品名称 / 型号" required className="lg:col-span-2"><Input value={productName} onChange={(event) => setProductName(event.target.value)} placeholder="例如：AI-PSU-5200" required /></Field><Field label="技术路线" required><Select value={techRoute} onChange={(event) => changeRoute(event.target.value as TechRoute)}>{TECH_ROUTES.map((route) => <option key={route} value={route}>{techRouteLabels[route]}</option>)}</Select></Field><Field label="交付日期" required><Input type="date" value={deadline} onChange={(event) => setDeadline(event.target.value)} required /></Field><Field label="重要程度"><Select value={priority} onChange={(event) => setPriority(event.target.value as Priority)}>{PRIORITIES.map((value) => <option key={value} value={value}>{priorityLabels[value]}</option>)}</Select></Field><Field label="打样数量"><Input type="number" min="1" value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} /></Field></div><Field label="备注" className="mt-4"><Textarea value={remark} onChange={(event) => setRemark(event.target.value)} placeholder="客户、项目或特殊工艺要求" /></Field></section>
    <section><div className="mb-4 flex items-center justify-between"><div><h3 className="text-sm font-bold text-slate-800">02 · 压制工序</h3><p className="mt-1 text-xs text-slate-400">0~N 个 Core 可并行；合压自动等待全部 Core 完成，也可直接合压{initial ? '；已有进度会保留' : ''}</p></div><Button type="button" variant="secondary" size="sm" onClick={() => { const count = pressingSteps.filter((step) => step.stepType === 'core').length; setPressingSteps((current) => [...current.slice(0, -1), { key: nextKey(), stepType: 'core', name: `Core ${String.fromCharCode(65 + count)}`, moldId: molds.data![0].id, requiredHours: 8 }, current.at(-1)!]); }}><Plus size={15} />添加 Core</Button></div><div className="space-y-3">{effectivePressing.map((step, index) => <div key={step.key} className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3 sm:grid-cols-[1fr_1.2fr_0.7fr_auto] sm:items-end"><Field label={step.stepType === 'core' ? `预压 Core ${index + 1}` : '合压工序'}><Input value={step.name} onChange={(event) => updateStep(step.key, { name: event.target.value })} required /></Field><Field label="专用模具"><Select value={step.moldId} onChange={(event) => updateStep(step.key, { moldId: Number(event.target.value) })}>{molds.data?.map((mold) => <option key={mold.id} value={mold.id}>{mold.code} · {mold.name}</option>)}</Select></Field><Field label="所需工时"><Input type="number" min="0.5" step="0.5" value={step.requiredHours} onChange={(event) => updateStep(step.key, { requiredHours: Number(event.target.value) })} required /></Field>{step.stepType === 'core' ? <Button type="button" variant="ghost" size="sm" className="mb-1 text-red-600" onClick={() => setPressingSteps((current) => current.filter((item) => item.key !== step.key))} aria-label="删除 Core"><Trash2 size={16} /></Button> : <span className="mb-3 text-xs text-slate-400">固定 1 道</span>}</div>)}</div></section>
    <section><div className="mb-4"><h3 className="text-sm font-bold text-slate-800">03 · 后工序快照</h3><p className="mt-1 text-xs text-slate-400">已按 {techRouteLabels[techRoute]} 模板带出，可针对本任务微调</p></div><div className="space-y-3">{postSteps.map((step, index) => <div key={step.key} className="grid grid-cols-[1fr_0.7fr_auto] items-end gap-3 rounded-xl border border-slate-200 p-3"><Field label={`后工序 ${index + 1}`}><Select value={step.processName} onChange={(event) => setPostSteps((current) => current.map((item) => item.key === step.key ? { ...item, processName: event.target.value as ProcessName } : item))}>{PROCESS_NAMES.map((name) => <option key={name} value={name}>{name}</option>)}</Select></Field><Field label="耗时（小时）"><Input type="number" min="0.5" step="0.5" value={step.durationHours} onChange={(event) => setPostSteps((current) => current.map((item) => item.key === step.key ? { ...item, durationHours: Number(event.target.value) } : item))} required /></Field><Button type="button" variant="ghost" size="sm" className="mb-1 text-red-600" onClick={() => setPostSteps((current) => current.filter((item) => item.key !== step.key))}><Trash2 size={16} /></Button></div>)}</div>{postSteps.length < PROCESS_NAMES.length && <Button type="button" variant="ghost" size="sm" className="mt-2" onClick={() => { const name = PROCESS_NAMES.find((item) => !postSteps.some((step) => step.processName === item)); if (name) setPostSteps((current) => [...current, { key: nextKey(), processName: name, durationHours: 8 }]); }}><Plus size={15} />添加后工序</Button>}</section>
    <div className="sticky bottom-0 -mx-5 flex justify-end gap-2 border-t border-slate-100 bg-white px-5 py-4 sm:-mx-6 sm:px-6"><Button type="button" variant="secondary" onClick={onDone}>取消</Button><Button type="submit" disabled={pending}>{pending ? '保存中…' : initial ? '保存任务修改' : '创建打样任务'}<ArrowRight size={16} /></Button></div>
  </form>;
}
