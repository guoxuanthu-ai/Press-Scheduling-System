import { KeyRound, Pencil, Plus, Trash2, UserCog } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { can, ROLES, roleLabels, type Role } from '../../contracts/auth';
import { Badge } from '../components/StatusBadge';
import { Button, Card, ErrorState, Field, Input, Loading, Modal, PageHeader, Select, useToast } from '../components/ui';
import { useAuth } from '../hooks/useAuth';
import { trpc } from '../providers/trpc';

interface Account { id: number; username: string; name: string; role: Role; active: boolean; createdAt: string; updatedAt: string }

function roleDescription(role: Role): string {
  if (role === 'general_manager') return '全部业务权限、账户管理及删除其他账户';
  if (role === 'admin') return '全部业务功能；仅可管理市场和生产账户';
  if (role === 'market') return '打样任务新增和编辑，其余业务数据只读';
  return '压机/模具维护、排产，打样任务只读';
}

function canEditAccount(currentRole: Role | undefined, targetRole: Role): boolean {
  if (currentRole === 'general_manager') return true;
  return currentRole === 'admin' && (targetRole === 'market' || targetRole === 'production');
}

function AccountForm({ initial, currentRole, onDone }: { initial?: Account; currentRole?: Role; onDone: () => void }) {
  const [username, setUsername] = useState(initial?.username ?? '');
  const [name, setName] = useState(initial?.name ?? '');
  const [role, setRole] = useState<Role>(initial?.role ?? 'market');
  const [active, setActive] = useState(initial?.active ?? true);
  const [password, setPassword] = useState('');
  const utils = trpc.useUtils();
  const { toast } = useToast();
  const onError = (error: { message: string }) => toast(error.message, 'error');
  const create = trpc.user.create.useMutation({ onSuccess: async () => { await utils.user.list.invalidate(); toast('账户已创建'); onDone(); }, onError });
  const update = trpc.user.update.useMutation({ onSuccess: async () => { await utils.user.list.invalidate(); toast('账户权限已更新，相关旧会话已失效'); onDone(); }, onError });
  const pending = create.isPending || update.isPending;
  const availableRoles = currentRole === 'general_manager' ? ROLES : (['market', 'production'] as const);
  function submit(event: FormEvent) {
    event.preventDefault();
    if (initial) update.mutate({ id: initial.id, name, role, active, ...(password ? { password } : {}) });
    else create.mutate({ username, name, role, password });
  }
  return <form onSubmit={submit} className="space-y-4"><div className="grid gap-4 sm:grid-cols-2"><Field label="用户名" required hint="字母开头，可含数字和下划线"><Input value={username} onChange={(event) => setUsername(event.target.value)} disabled={Boolean(initial)} required pattern="[a-zA-Z][a-zA-Z0-9_]{2,29}" autoComplete="off" /></Field><Field label="显示名称" required><Input value={name} onChange={(event) => setName(event.target.value)} required maxLength={30} /></Field><Field label="账户角色"><Select value={role} onChange={(event) => setRole(event.target.value as Role)}>{availableRoles.map((value) => <option key={value} value={value}>{roleLabels[value]}</option>)}</Select></Field><Field label={initial ? '重置密码（可选）' : '初始密码'} required={!initial} hint="至少 8 位；修改后旧会话失效"><Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required={!initial} minLength={8} maxLength={72} autoComplete="new-password" placeholder={initial ? '留空则不修改密码' : '请输入初始密码'} /></Field></div>{initial && <label className="flex items-center gap-2 rounded-xl bg-slate-50 p-3 text-sm text-slate-700"><input type="checkbox" className="h-4 w-4 accent-brand-600" checked={active} onChange={(event) => setActive(event.target.checked)} />允许该账户登录系统</label>}<div className="rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-500">{roleDescription(role)}</div><div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onDone}>取消</Button><Button type="submit" disabled={pending}>{pending ? '保存中…' : initial ? '保存账户' : '创建账户'}</Button></div></form>;
}

export function UsersPage() {
  const list = trpc.user.list.useQuery();
  const [editing, setEditing] = useState<Account | 'new' | null>(null);
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const { toast } = useToast();
  const remove = trpc.user.remove.useMutation({
    onSuccess: async () => { await utils.user.list.invalidate(); toast('账户已删除，相关会话已注销'); },
    onError: (error) => toast(error.message, 'error'),
  });
  if (list.isLoading) return <Loading />;
  if (list.isError) return <ErrorState message={list.error.message} retry={() => list.refetch()} />;
  const accounts = list.data ?? [];
  const canDelete = user ? can(user.role, 'user:delete') : false;
  return <div className="animate-rise"><PageHeader eyebrow="ACCESS CONTROL" title="账户与权限" description="总经理可管理全部账户并删除其他账户；管理员只能新增和编辑市场、生产账户。" actions={<Button onClick={() => setEditing('new')}><Plus size={16} />新增账户</Button>} />
    <div className="mb-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">{ROLES.map((role) => <Card key={role} className="p-4"><div className="flex items-center gap-3"><div className="rounded-xl bg-brand-50 p-2 text-brand-600"><UserCog size={19} /></div><div><p className="font-semibold text-slate-800">{roleLabels[role]}</p><p className="text-xs text-slate-400">{accounts.filter((account) => account.role === role && account.active).length} 个有效账户</p></div></div><p className="mt-3 text-xs leading-5 text-slate-500">{roleDescription(role)}</p></Card>)}</div>
    <Card className="overflow-hidden"><div className="overflow-x-auto"><table className="w-full min-w-[820px] text-left text-sm"><thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="p-4 font-medium">账户</th><th className="p-4 font-medium">角色</th><th className="p-4 font-medium">状态</th><th className="p-4 font-medium">最近更新</th><th className="p-4 text-right font-medium">操作</th></tr></thead><tbody>{accounts.map((account) => <tr key={account.id} className="border-t border-slate-100"><td className="p-4"><p className="font-semibold text-slate-800">{account.name}</p><p className="mt-1 text-xs text-slate-400">{account.username}</p></td><td className="p-4"><Badge color={account.role === 'general_manager' ? 'red' : account.role === 'admin' ? 'purple' : account.role === 'market' ? 'blue' : 'green'}>{roleLabels[account.role]}</Badge></td><td className="p-4"><Badge color={account.active ? 'green' : 'slate'}>{account.active ? '有效' : '已停用'}</Badge></td><td className="p-4 text-xs text-slate-500">{new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(account.updatedAt))}</td><td className="p-4"><div className="flex justify-end gap-1">{canEditAccount(user?.role, account.role) && <Button variant="ghost" size="sm" onClick={() => setEditing(account)}>{account.role === 'admin' || account.role === 'general_manager' ? <KeyRound size={15} /> : <Pencil size={15} />}编辑</Button>}{canDelete && account.id !== user?.id && <Button variant="ghost" size="sm" className="text-red-600 hover:bg-red-50" disabled={remove.isPending} onClick={() => { if (window.confirm(`确定删除账户“${account.name}（${account.username}）”？该账户的所有登录会话将立即失效。`)) remove.mutate({ id: account.id }); }}><Trash2 size={15} />删除</Button>}</div></td></tr>)}</tbody></table></div></Card>
    <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? '新增账户' : '编辑账户与角色'} description="密码仅以加盐哈希保存，会话令牌不会明文入库">{editing && <AccountForm key={editing === 'new' ? 'new' : `${editing.id}-${editing.updatedAt}`} initial={editing === 'new' ? undefined : editing} currentRole={user?.role} onDone={() => setEditing(null)} />}</Modal>
  </div>;
}
