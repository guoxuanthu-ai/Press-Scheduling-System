import { BellRing, Boxes, CalendarRange, ChevronRight, Factory, Gauge, LogOut, Menu, PanelsTopLeft, Settings2, Users, X } from 'lucide-react';
import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router';
import { roleLabels } from '../../contracts/auth';
import { useAuth } from '../hooks/useAuth';
import { useRealtimeSync } from '../hooks/useRealtimeSync';
import { cn } from '../lib/utils';
import { RouteErrorBoundary } from './RouteErrorBoundary';
import { Button } from './ui';

const navigation = [
  { to: '/', label: '排产总览', icon: Gauge },
  { to: '/schedule', label: '智能排班', icon: CalendarRange },
  { to: '/tasks', label: '打样任务', icon: Boxes },
  { to: '/warnings', label: '预警中心', icon: BellRing },
  { to: '/presses', label: '压机资源', icon: Factory },
  { to: '/molds', label: '模具台账', icon: PanelsTopLeft },
  { to: '/templates', label: '工艺模板', icon: Settings2 },
];

export function AppLayout() {
  const [open, setOpen] = useState(false);
  const { user, logout } = useAuth();
  const syncStatus = useRealtimeSync();
  const navigate = useNavigate();
  const items = user && (user.role === 'admin' || user.role === 'general_manager') ? [...navigation, { to: '/users', label: '账户权限', icon: Users }] : navigation;
  const sidebar = <div className="flex h-full flex-col bg-[#102d29] text-white">
    <div className="flex h-20 items-center gap-3 px-6">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-300 text-[#102d29] shadow-lg shadow-black/10"><Factory size={22} strokeWidth={2.4} /></div>
      <div><div className="text-lg font-bold tracking-wide">炽序</div><div className="text-[10px] tracking-[0.18em] text-emerald-100/60">INDUCTOR PLAN</div></div>
      <Button variant="ghost" size="sm" className="ml-auto text-white hover:bg-white/10 hover:text-white lg:hidden" onClick={() => setOpen(false)} aria-label="关闭导航"><X size={20} /></Button>
    </div>
    <div className="mx-6 mb-6 rounded-xl border border-white/10 bg-white/5 p-3">
      <p className="text-xs text-emerald-100/60">一体成型电感</p><p className="mt-1 text-sm font-medium">打样智能排产系统</p>
    </div>
    <nav className="flex-1 space-y-1 px-3">{items.map(({ to, label, icon: Icon }) => <NavLink key={to} to={to} end={to === '/'} onClick={() => setOpen(false)} className={({ isActive }) => cn('group flex items-center gap-3 rounded-xl px-4 py-3 text-sm transition', isActive ? 'bg-emerald-300 font-semibold text-[#102d29] shadow-md' : 'text-emerald-50/70 hover:bg-white/10 hover:text-white')}>
      <Icon size={18} /><span>{label}</span><ChevronRight size={14} className="ml-auto opacity-0 transition group-hover:opacity-60" />
    </NavLink>)}</nav>
    <div className="p-4">
      <div className="mb-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[11px] leading-5 text-emerald-50/60"><div className="flex items-center gap-2"><span className={cn('h-2 w-2 rounded-full', syncStatus === 'online' ? 'bg-emerald-300' : syncStatus === 'offline' ? 'bg-red-400' : 'bg-amber-300')} />{syncStatus === 'online' ? '实时同步已连接' : syncStatus === 'offline' ? '同步连接中断，正在重试' : '正在连接实时同步'}</div><p className="mt-1 text-emerald-50/40">当前角色：{user ? roleLabels[user.role] : '—'}</p></div>
      <div className="flex items-center gap-3 rounded-xl px-2 py-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-sm font-semibold">{user?.name.slice(0, 1)}</div>
        <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{user?.name}</p><p className="text-xs text-emerald-50/50">{user?.username}</p></div>
        <Button variant="ghost" size="sm" className="px-2 text-emerald-50/60 hover:bg-white/10 hover:text-white" aria-label="退出登录" onClick={async () => { await logout(); navigate('/login'); }}><LogOut size={17} /></Button>
      </div>
    </div>
  </div>;

  return <div className="min-h-screen bg-[#f5f7f7]">
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 lg:block">{sidebar}</aside>
    {open && <div className="fixed inset-0 z-40 bg-slate-950/40 lg:hidden" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}><aside className="h-full w-72 max-w-[85vw]">{sidebar}</aside></div>}
    <div className="lg:pl-64">
      <header className="sticky top-0 z-20 flex h-16 items-center border-b border-slate-200/70 bg-white/90 px-4 backdrop-blur lg:hidden">
        <Button variant="ghost" size="sm" className="px-2" onClick={() => setOpen(true)} aria-label="打开导航"><Menu size={22} /></Button>
        <div className="ml-2 font-bold text-brand-900">炽序 · 打样排产</div>
        <div className="ml-auto text-xs text-slate-500">{new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' }).format(new Date())}</div>
      </header>
      <main className="mx-auto max-w-[1600px] p-4 sm:p-6 lg:p-8"><RouteErrorBoundary><Outlet /></RouteErrorBoundary></main>
    </div>
  </div>;
}
