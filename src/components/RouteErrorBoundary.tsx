import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from './ui';

interface State { error: Error | null }

export class RouteErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('页面渲染失败', error, info.componentStack);
  }

  render(): ReactNode {
    if (this.state.error) {
      return <div role="alert" className="flex min-h-64 flex-col items-center justify-center rounded-2xl border border-red-200 bg-white p-6 text-center"><h2 className="font-bold text-red-700">页面渲染失败</h2><p className="mt-3 max-w-2xl break-words text-sm text-slate-600">{this.state.error.message}</p><Button variant="secondary" className="mt-5" onClick={() => window.location.reload()}>重新加载</Button></div>;
    }
    return this.props.children;
  }
}
