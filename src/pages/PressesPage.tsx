import { Factory, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { can } from '../../contracts/auth';
import type { Press } from '../../contracts/entities';
import { PRESS_STATUSES, pressStatusLabels, type PressStatus } from '../../contracts/enums';
import { PressStatusBadge } from '../components/StatusBadge';
import { Button, Card, EmptyState, ErrorState, Field, Input, Loading, Modal, PageHeader, Select, Textarea, useToast } from '../components/ui';
import { useAuth } from '../hooks/useAuth';
import { trpc } from '../providers/trpc';

function PressForm({ initial, onDone }: { initial?: Press; onDone: () => void }) {
  const [name, setName] = useState(initial?.name ?? '');
  const [model, setModel] = useState(initial?.model ?? '');
  const [status, setStatus] = useState<PressStatus>(initial?.status ?? 'available');
  const [dailyHours, setDailyHours] = useState(initial?.dailyHours ?? 8);
  const [remark, setRemark] = useState(initial?.remark ?? '');
  const utils = trpc.useUtils();
  const { toast } = useToast();
  const options = {
    onSuccess: async () => { await utils.press.list.invalidate(); toast(initial ? '压机已更新，请重新排产以应用变更' : '压机已新增'); onDone(); },
    onError: (error: { message: string }) => toast(error.message, 'error'),
  };
  const create = trpc.press.create.useMutation(options);
  const update = trpc.press.update.useMutation(options);
  const pending = create.isPending || update.isPending;
  function submit(event: FormEvent) {
    event.preventDefault();
    const input = { name, model, status, dailyHours: Number(dailyHours), remark };
    if (initial) update.mutate({ id: initial.id, ...input });
    else create.mutate(input);
  }
  return <form onSubmit={submit} className="space-y-4"><div className="grid gap-4 sm:grid-cols-2"><Field label="压机名称" required><Input value={name} onChange={(event) => setName(event.target.value)} required /></Field><Field label="压机型号" required><Input value={model} onChange={(event) => setModel(event.target.value)} required /></Field><Field label="状态"><Select value={status} onChange={(event) => setStatus(event.target.value as PressStatus)}>{PRESS_STATUSES.map((value) => <option key={value} value={value}>{pressStatusLabels[value]}</option>)}</Select></Field><Field label="每日可排产工时" required><Input type="number" min="0.5" max="24" step="0.5" value={dailyHours} onChange={(event) => setDailyHours(Number(event.target.value))} required /></Field></div><Field label="备注"><Textarea value={remark} onChange={(event) => setRemark(event.target.value)} /></Field><div className="flex justify-end gap-2 pt-2"><Button type="button" variant="secondary" onClick={onDone}>取消</Button><Button type="submit" disabled={pending}>{pending ? '保存中…' : '保存压机'}</Button></div></form>;
}

export function PressesPage() {
  const list = trpc.press.list.useQuery();
  const [editing, setEditing] = useState<Press | 'new' | null>(null);
  const { user } = useAuth();
  const canEdit = user ? can(user.role, 'resource:write') : false;
  const utils = trpc.useUtils();
  const { toast } = useToast();
  const remove = trpc.press.remove.useMutation({ onSuccess: () => { utils.press.list.invalidate(); toast('压机已删除'); }, onError: (error) => toast(error.message, 'error') });
  if (list.isLoading) return <Loading />;
  if (list.isError) return <ErrorState message={list.error.message} retry={() => list.refetch()} />;
  const presses = list.data ?? [];
  return <div className="animate-rise"><PageHeader eyebrow="RESOURCE" title="压机资源" description={`共 ${presses.length} 台压机，${presses.filter((press) => press.status === 'available').length} 台可参与排产；${canEdit ? '可编辑资源。' : '当前角色仅可查看。'}`} actions={canEdit ? <Button onClick={() => setEditing('new')}><Plus size={16} />新增压机</Button> : undefined} />
    <Card className="overflow-hidden">{presses.length === 0 ? <EmptyState title="还没有压机" description="新增第一台压机后即可建立模具适配关系。" action={canEdit ? <Button onClick={() => setEditing('new')}>新增压机</Button> : undefined} /> : <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="p-4 font-medium">压机</th><th className="p-4 font-medium">型号</th><th className="p-4 font-medium">状态</th><th className="p-4 font-medium">每日工时</th><th className="p-4 font-medium">备注</th>{canEdit && <th className="p-4 text-right font-medium">操作</th>}</tr></thead><tbody>{presses.map((press) => <tr key={press.id} className="border-t border-slate-100 hover:bg-slate-50/60"><td className="p-4"><div className="flex items-center gap-3"><div className="rounded-lg bg-brand-50 p-2 text-brand-600"><Factory size={18} /></div><span className="font-semibold text-slate-800">{press.name}</span></div></td><td className="p-4 text-slate-600">{press.model}</td><td className="p-4"><PressStatusBadge value={press.status} /></td><td className="p-4 font-medium text-slate-700">{press.dailyHours}h</td><td className="max-w-56 truncate p-4 text-xs text-slate-500" title={press.remark}>{press.remark || '—'}</td>{canEdit && <td className="p-4"><div className="flex justify-end gap-1"><Button variant="ghost" size="sm" onClick={() => setEditing(press)}><Pencil size={15} />编辑</Button><Button variant="ghost" size="sm" className="text-red-600 hover:bg-red-50" onClick={() => { if (window.confirm(`确定删除 ${press.name}？若仍有关联模具，系统会阻止删除。`)) remove.mutate({ id: press.id }); }}><Trash2 size={15} /></Button></div></td>}</tr>)}</tbody></table></div>}</Card>
    {canEdit && <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? '新增压机' : '编辑压机'} description="压机状态变更后，请点击“重新排产”更新计划。">{editing && <PressForm key={editing === 'new' ? 'new' : editing.id} initial={editing === 'new' ? undefined : editing} onDone={() => setEditing(null)} />}</Modal>}
  </div>;
}
