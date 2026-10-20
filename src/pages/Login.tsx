import { ArrowRight, CalendarRange, Factory, GitBranch, ShieldCheck } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { Button, Input } from '../components/ui';
import { useAuth } from '../hooks/useAuth';

export function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  if (user) return <Navigate to="/" replace />;
  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError('');
    try { await login(username, password); navigate('/'); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '登录失败'); }
    finally { setPending(false); }
  }
  return <main className="grid min-h-screen bg-white lg:grid-cols-[1.05fr_0.95fr]">
    <section className="relative hidden overflow-hidden bg-[#102d29] p-12 text-white lg:flex lg:flex-col lg:justify-between">
      <div className="absolute -right-32 -top-32 h-96 w-96 rounded-full border-[70px] border-emerald-300/5" /><div className="absolute -bottom-40 -left-20 h-96 w-96 rounded-full bg-emerald-300/5 blur-2xl" />
      <div className="relative flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-300 text-[#102d29]"><Factory size={24} /></div><div><p className="text-xl font-bold">炽序</p><p className="text-[10px] tracking-[0.22em] text-emerald-100/60">INDUCTOR PLAN</p></div></div>
      <div className="relative max-w-xl"><p className="mb-5 text-xs font-semibold tracking-[0.25em] text-emerald-300">一体成型电感 · 智能排产</p><h1 className="text-balance text-5xl font-bold leading-[1.2]">排产效率最优的<br /><span className="text-emerald-300">数字化系统。</span></h1><p className="mt-6 max-w-lg text-base leading-8 text-emerald-50/60">从多 Core 并行压制到合压、后工序交付，用确定性的排产规则提前发现每一个延期风险。</p>
        <div className="mt-10 grid grid-cols-3 gap-3">{[{ icon: GitBranch, text: '多工序联动' }, { icon: CalendarRange, text: '滚动排产' }, { icon: ShieldCheck, text: '交期预警' }].map(({ icon: Icon, text }) => <div key={text} className="rounded-2xl border border-white/10 bg-white/5 p-4"><Icon className="mb-3 text-emerald-300" size={20} /><p className="text-xs text-emerald-50/75">{text}</p></div>)}</div>
      </div>
      <p className="relative text-xs text-emerald-50/35">SECURE WORKSPACE · 实时同步生产版</p>
    </section>
    <section className="flex items-center justify-center bg-[#f7f9f8] px-5 py-10 sm:px-10"><div className="w-full max-w-md animate-rise">
      <div className="mb-10 flex items-center gap-3 lg:hidden"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-white"><Factory size={22} /></div><div><p className="font-bold text-brand-900">炽序</p><p className="text-[10px] tracking-widest text-slate-400">INDUCTOR PLAN</p></div></div>
      <p className="text-sm font-semibold text-brand-600">欢迎回来</p><h2 className="mt-2 text-3xl font-bold tracking-tight text-ink">进入打样排产工作台</h2><p className="mt-3 text-sm leading-6 text-slate-500">使用企业账户登录。任务、资源和排产变更会实时同步到其他在线设备。</p>
      <form onSubmit={submit} className="mt-8 space-y-5"><label className="block space-y-2"><span className="text-sm font-medium text-slate-700">用户名</span><Input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" maxLength={30} required placeholder="请输入用户名" className="min-h-12" /></label><label className="block space-y-2"><span className="text-sm font-medium text-slate-700">密码</span><Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required placeholder="请输入密码" className="min-h-12" /></label>{error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-600">{error}</p>}<Button type="submit" size="lg" className="w-full" disabled={pending}>{pending ? '正在验证…' : '登录系统'}<ArrowRight size={18} /></Button></form>
    </div></section>
  </main>;
}
