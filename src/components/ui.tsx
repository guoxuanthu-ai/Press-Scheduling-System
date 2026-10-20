import { AlertCircle, CheckCircle2, Inbox, Loader2, X } from 'lucide-react';
import { createContext, useCallback, useContext, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cn } from '../lib/utils';

export function Button({ className, variant = 'primary', size = 'md', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
}) {
  return <button className={cn(
    'inline-flex items-center justify-center gap-2 rounded-xl font-medium transition focus:outline-none focus:ring-2 focus:ring-brand-500/30 disabled:cursor-not-allowed disabled:opacity-50',
    size === 'sm' ? 'min-h-8 px-3 text-xs' : size === 'lg' ? 'min-h-12 px-6 text-base' : 'min-h-10 px-4 text-sm',
    variant === 'primary' && 'bg-brand-600 text-white shadow-sm hover:bg-brand-700',
    variant === 'secondary' && 'border border-slate-200 bg-white text-slate-700 hover:border-brand-500 hover:text-brand-700',
    variant === 'ghost' && 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
    variant === 'danger' && 'bg-red-50 text-red-700 hover:bg-red-100',
    className,
  )} {...props} />;
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <section className={cn('rounded-2xl border border-slate-200/80 bg-white shadow-panel', className)}>{children}</section>;
}

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description?: string; actions?: ReactNode }) {
  return <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
    <div>
      {eyebrow && <p className="mb-1 text-xs font-semibold uppercase tracking-[0.2em] text-brand-600">{eyebrow}</p>}
      <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">{title}</h1>
      {description && <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">{description}</p>}
    </div>
    {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
  </div>;
}

export const inputClass = 'min-h-10 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 disabled:bg-slate-50';
export function Input(props: InputHTMLAttributes<HTMLInputElement>) { return <input {...props} className={cn(inputClass, props.className)} />; }
export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) { return <select {...props} className={cn(inputClass, props.className)} />; }
export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) { return <textarea {...props} className={cn(inputClass, 'min-h-20 resize-y', props.className)} />; }
export function Field({ label, required, hint, children, className }: { label: string; required?: boolean; hint?: string; children: ReactNode; className?: string }) {
  return <label className={cn('block space-y-1.5', className)}><span className="text-xs font-medium text-slate-600">{label}{required && <span className="ml-1 text-red-500">*</span>}</span>{children}{hint && <span className="block text-xs text-slate-400">{hint}</span>}</label>;
}

export function Modal({ open, onClose, title, description, children, wide }: { open: boolean; onClose: () => void; title: string; description?: string; children: ReactNode; wide?: boolean }) {
  if (!open) return null;
  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 p-0 backdrop-blur-sm sm:items-center sm:p-6" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div role="dialog" aria-modal="true" aria-label={title} className={cn('max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-white shadow-2xl sm:rounded-2xl', wide ? 'max-w-5xl' : 'max-w-lg')}>
      <div className="sticky top-0 z-10 flex items-start justify-between border-b border-slate-100 bg-white/95 px-5 py-4 backdrop-blur sm:px-6">
        <div><h2 className="text-lg font-bold text-ink">{title}</h2>{description && <p className="mt-1 text-xs text-slate-500">{description}</p>}</div>
        <Button variant="ghost" size="sm" className="px-2" onClick={onClose} aria-label="关闭"><X size={18} /></Button>
      </div>
      <div className="p-5 sm:p-6">{children}</div>
    </div>
  </div>;
}

export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <div className="flex flex-col items-center justify-center px-6 py-14 text-center"><div className="mb-4 rounded-2xl bg-slate-100 p-4 text-slate-400"><Inbox size={28} /></div><h3 className="font-semibold text-slate-800">{title}</h3><p className="mt-2 max-w-sm text-sm leading-6 text-slate-500">{description}</p>{action && <div className="mt-5">{action}</div>}</div>;
}

export function Loading({ label = '正在加载数据…' }: { label?: string }) {
  return <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-slate-500"><Loader2 size={18} className="animate-spin text-brand-600" />{label}</div>;
}

export function ErrorState({ message, retry }: { message: string; retry?: () => void }) {
  return <div className="flex min-h-40 flex-col items-center justify-center gap-3 p-6 text-center"><AlertCircle className="text-red-500" /><p className="text-sm text-slate-600">{message}</p>{retry && <Button variant="secondary" size="sm" onClick={retry}>重新加载</Button>}</div>;
}

interface ToastItem { id: number; message: string; kind: 'success' | 'error' }
const ToastContext = createContext<{ toast: (message: string, kind?: 'success' | 'error') => void } | null>(null);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const toast = useCallback((message: string, kind: 'success' | 'error' = 'success') => {
    const id = Date.now() + Math.random();
    setItems((current) => [...current, { id, message, kind }]);
    window.setTimeout(() => setItems((current) => current.filter((item) => item.id !== id)), 4000);
  }, []);
  return <ToastContext.Provider value={{ toast }}>{children}<div className="pointer-events-none fixed bottom-5 right-5 z-[70] flex w-[calc(100%-2.5rem)] max-w-sm flex-col gap-2">{items.map((item) => <div key={item.id} className={cn('pointer-events-auto flex items-start gap-3 rounded-xl border bg-white p-4 text-sm shadow-xl', item.kind === 'error' ? 'border-red-200 text-red-700' : 'border-emerald-200 text-emerald-800')}>{item.kind === 'error' ? <AlertCircle size={18} className="mt-0.5 shrink-0" /> : <CheckCircle2 size={18} className="mt-0.5 shrink-0" />}<span>{item.message}</span></div>)}</div></ToastContext.Provider>;
}
export function useToast() {
  const value = useContext(ToastContext);
  if (!value) throw new Error('useToast 必须在 ToastProvider 中使用');
  return value;
}
