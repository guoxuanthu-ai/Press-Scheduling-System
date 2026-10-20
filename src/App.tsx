import type { ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router';
import { AppLayout } from './components/AppLayout';
import { Loading } from './components/ui';
import { useAuth } from './hooks/useAuth';
import { Dashboard } from './pages/Dashboard';
import { Login } from './pages/Login';
import { MoldsPage } from './pages/MoldsPage';
import { NotFound } from './pages/NotFound';
import { PressesPage } from './pages/PressesPage';
import { SchedulePage } from './pages/SchedulePage';
import { TaskDetailPage } from './pages/TaskDetailPage';
import { TasksPage } from './pages/TasksPage';
import { TemplatesPage } from './pages/TemplatesPage';
import { UsersPage } from './pages/UsersPage';
import { WarningsPage } from './pages/WarningsPage';

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex min-h-screen items-center justify-center"><Loading label="正在恢复登录状态…" /></div>;
  return user ? children : <Navigate to="/login" replace />;
}

function AdminOnly({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  return user && (user.role === 'admin' || user.role === 'general_manager') ? children : <Navigate to="/" replace />;
}

export default function App() {
  return <Routes>
    <Route path="/login" element={<Login />} />
    <Route element={<RequireAuth><AppLayout /></RequireAuth>}>
      <Route index element={<Dashboard />} />
      <Route path="schedule" element={<SchedulePage />} />
      <Route path="tasks" element={<TasksPage />} />
      <Route path="tasks/:id" element={<TaskDetailPage />} />
      <Route path="presses" element={<PressesPage />} />
      <Route path="molds" element={<MoldsPage />} />
      <Route path="templates" element={<TemplatesPage />} />
      <Route path="warnings" element={<WarningsPage />} />
      <Route path="users" element={<AdminOnly><UsersPage /></AdminOnly>} />
    </Route>
    <Route path="*" element={<NotFound />} />
  </Routes>;
}
