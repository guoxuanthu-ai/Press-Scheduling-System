import { Box, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { can } from '../../contracts/auth';
import type { Mold } from '../../contracts/entities';
import { MOLD_STATUSES, moldStatusLabels, type MoldStatus } from '../../contracts/enums';
import { ExcelActions } from '../components/ExcelActions';
import { Badge, MoldStatusBadge } from '../components/StatusBadge';
import { Button, Card, EmptyState, ErrorState, Field, Input, Loading, Modal, PageHeader, Select, Textarea, useToast } from '../components/ui';
import { useAuth } from '../hooks/useAuth';
import { cn } from '../lib/utils';
import { trpc } from '../providers/trpc';

function MoldForm({ initial, onDone }: { initial?: Mold; onDone: () => void }) {
  const presses = trpc.press.list.useQuery();
  const [code, setCode] = useState(initial?.code ?? '');
  const [name, setName] = useState(initial?.name ?? '');
  const [status, setStatus] = useState<MoldStatus>(initial?.status ?? 'available');
  const [leadTimeDays, setLeadTimeDays] = useState(initial?.leadTimeDays ?? 10);
  const [pressIds, setPressIds] = useState<number[]>(initial?.pressIds ?? []);
  const [orderDate, setOrderDate] = useState(initial?.orderDate ?? '');
  const [remark, setRemark] = useState(initial?.remark ?? '');
  const utils = trpc.useUtils();
  const { toast } = useToast();
  const options = { onSuccess: async () => { await utils.mold.list.invalidate(); toast(initial ? '模具已更新，请重新排产' : '模具已新增'); onDone(); }, onError: (error: { message: string }) => toast(error.message, 'error') };
  const create = trpc.mold.create.useMutation(options);
  const update = trpc.mold.update.useMutation(options);
  function submit(event: FormEvent) {
    event.preventDefault();
    if (pressIds.length === 0) { toast('请至少勾选一台适配压机', 'error'); return; }
    const input = { code, name, status, leadTimeDays: Number(leadTimeDays), pressIds, orderDate: status === 'production' && orderDate ? orderDate : null, remark };
    if (initial) update.mutate({ id: initial.id, ...input });
    else create.mutate(input);
  }
  return <form onSubmit={submit} className="space-y-4"><div className="grid gap-4 sm:grid-cols-2"><Field label="模具编号" required><Input value={code} onChange={(event) => setCode(event.target.value)} required /></Field><Field label="模具名称" required><Input value={name} onChange={(event) => setName(event.target.value)} required /></Field><Field label="状态"><Select value={status} onChange={(event) => setStatus(event.target.value as MoldStatus)}>{MOLD_STATUSES.map((value) => <option key={value} value={value}>{moldStatusLabels[value]}</option>)}</Select></Field><Field label="开模周期（天）" required><Input type="number" min="1" max="365" value={leadTimeDays} onChange={(event) => setLeadTimeDays(Number(event.target.value))} required /></Field></div>{status === 'production' && <Field label="实际下单日期" hint="留空表示尚未下单"><Input type="date" value={orderDate} onChange={(event) => setOrderDate(event.target.value)} /></Field>}<Field label="适配压机" required><div className="grid max-h-56 grid-cols-2 gap-2 overflow-y-auto rounded-xl border border-slate-200 p-3 sm:grid-cols-3">{presses.data?.map((press) => <label key={press.id} className={cn('flex cursor-pointer items-center gap-2 rounded-lg border p-2.5 text-xs transition', pressIds.includes(press.id) ? 'border-brand-500 bg-brand-50 text-brand-800' : 'border-slate-200 text-slate-600 hover:bg-slate-50')}><input type="checkbox" className="accent-brand-600" checked={pressIds.includes(press.id)} onChange={() => setPressIds((current) => current.includes(press.id) ? current.filter((id) => id !== press.id) : [...current, press.id])} /><span>{press.name}</span><span className="ml-auto text-[10px] text-slate-400">{press.model}</span></label>)}</div></Field><Field label="适用产品 / 备注"><Textarea value={remark} onChange={(event) => setRemark(event.target.value)} /></Field><div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onDone}>取消</Button><Button type="submit" disabled={create.isPending || update.isPending}>保存模具</Button></div></form>;
}

export function MoldsPage() {
  const list = trpc.mold.list.useQuery();
  const presses = trpc.press.list.useQuery();
  const [editing, setEditing] = useState<Mold | 'new' | null>(null);
  const [filter, setFilter] = useState('');
  const { user } = useAuth();
  const canEdit = user ? can(user.role, 'resource:write') : false;
  const utils = trpc.useUtils();
  const { toast } = useToast();
  const remove = trpc.mold.remove.useMutation({ onSuccess: () => { utils.mold.list.invalidate(); toast('模具已删除'); }, onError: (error) => toast(error.message, 'error') });
  if (list.isLoading || presses.isLoading) return <Loading />;
  if (list.isError) return <ErrorState message={list.error.message} retry={() => list.refetch()} />;
  const molds = (list.data ?? []).filter((mold) => `${mold.code}${mold.name}`.toLowerCase().includes(filter.toLowerCase()));
  return <div className="animate-rise"><PageHeader eyebrow="TOOLING" title="模具台账" description={`维护模具状态、开模周期和适配压机；${canEdit ? '可编辑模具。' : '当前角色仅可查看。'}`} actions={<><ExcelActions entity="molds" canImport={canEdit} onImported={() => utils.mold.list.invalidate()} />{canEdit && <Button onClick={() => setEditing('new')}><Plus size={16} />新增模具</Button>}</>} />
    <Card className="overflow-hidden"><div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between"><Input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="搜索模具编号或名称" className="max-w-sm" /><p className="text-xs text-slate-400">在制 {(list.data ?? []).filter((mold) => mold.status === 'production').length} 副 · 可用 {(list.data ?? []).filter((mold) => mold.status === 'available').length} 副</p></div>{molds.length === 0 ? <EmptyState title="没有匹配的模具" description="调整搜索条件或新增模具。" /> : <div className="overflow-x-auto"><table className="w-full min-w-[920px] text-left text-sm"><thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="p-4 font-medium">模具</th><th className="p-4 font-medium">状态</th><th className="p-4 font-medium">开模周期</th><th className="p-4 font-medium">适配压机</th><th className="p-4 font-medium">下单 / 备注</th>{canEdit && <th className="p-4 text-right font-medium">操作</th>}</tr></thead><tbody>{molds.map((mold) => <tr key={mold.id} className="border-t border-slate-100 hover:bg-slate-50/60"><td className="p-4"><div className="flex items-center gap-3"><div className="rounded-lg bg-slate-100 p-2 text-slate-600"><Box size={18} /></div><div><p className="font-semibold text-slate-800">{mold.code}</p><p className="mt-1 text-xs text-slate-400">{mold.name}</p></div></div></td><td className="p-4"><MoldStatusBadge value={mold.status} /></td><td className="p-4 text-slate-600">{mold.leadTimeDays} 天</td><td className="p-4"><div className="flex max-w-sm flex-wrap gap-1">{mold.pressIds.map((id) => { const press = presses.data?.find((item) => item.id === id); return <Badge key={id} color="slate">{press?.name ?? `压机#${id}`}</Badge>; })}</div></td><td className="p-4 text-xs text-slate-500">{mold.status === 'production' ? <p className={mold.orderDate ? 'text-blue-600' : 'font-medium text-amber-600'}>{mold.orderDate ? `已下单 ${mold.orderDate}` : '尚未下单'}</p> : null}<p className="mt-1 max-w-40 truncate">{mold.remark || '—'}</p></td>{canEdit && <td className="p-4"><div className="flex justify-end gap-1"><Button variant="ghost" size="sm" onClick={() => setEditing(mold)}><Pencil size={15} />编辑</Button><Button variant="ghost" size="sm" className="text-red-600 hover:bg-red-50" onClick={() => { if (window.confirm(`确定删除 ${mold.code}？`)) remove.mutate({ id: mold.id }); }}><Trash2 size={15} /></Button></div></td>}</tr>)}</tbody></table></div>}</Card>
    {canEdit && <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? '新增模具' : '编辑模具'} description="Core 模与合压模使用同一套资源和适配规则。" wide>{editing && <MoldForm key={editing === 'new' ? 'new' : editing.id} initial={editing === 'new' ? undefined : editing} onDone={() => setEditing(null)} />}</Modal>}
  </div>;
}
