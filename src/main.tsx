import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import App from './App';
import { ToastProvider } from './components/ui';
import { AuthProvider } from './hooks/useAuth';
import { TRPCProvider } from './providers/trpc';
import './index.css';

if (import.meta.env.PROD) {
  const report = (message: string, stack?: string) => {
    void fetch('/api/client-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: message.slice(0, 1000), stack: stack?.slice(0, 4000) }),
    }).catch(() => undefined);
  };
  window.addEventListener('error', (event) => report(event.message, event.error?.stack));
  window.addEventListener('unhandledrejection', (event) => report(String(event.reason), event.reason?.stack));
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <TRPCProvider>
      <ToastProvider>
        <AuthProvider>
          <BrowserRouter><App /></BrowserRouter>
        </AuthProvider>
      </ToastProvider>
    </TRPCProvider>
  </StrictMode>,
);
