import { Link } from 'react-router';
import { Button } from '../components/ui';

export function NotFound() {
  return <div className="flex min-h-[70vh] flex-col items-center justify-center text-center"><p className="text-7xl font-black text-brand-100">404</p><h1 className="mt-4 text-xl font-bold text-ink">页面不存在</h1><p className="mt-2 text-sm text-slate-500">你访问的页面可能已移动或地址有误。</p><Link to="/" className="mt-6"><Button>返回排产总览</Button></Link></div>;
}
