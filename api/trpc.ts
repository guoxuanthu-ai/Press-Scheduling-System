import { initTRPC, TRPCError } from '@trpc/server';
import superjson from 'superjson';
import { can, type Permission, type Role } from '../contracts/auth';
import type { DataStore } from '../db/store';

export interface SessionUser {
  id: number;
  username: string;
  name: string;
  role: Role;
}

export interface Context {
  store: DataStore;
  user: SessionUser | null;
}

const permissionByPath: Record<string, Permission> = {
  'press.create': 'resource:write',
  'press.update': 'resource:write',
  'press.remove': 'resource:write',
  'mold.create': 'resource:write',
  'mold.update': 'resource:write',
  'mold.remove': 'resource:write',
  'template.update': 'template:write',
  'task.create': 'task:write',
  'task.update': 'task:write',
  'task.remove': 'task:write',
  'task.updateProgress': 'task:write',
  'task.setStatus': 'task:write',
  'schedule.run': 'schedule:write',
  'user.list': 'user:write',
  'user.create': 'user:write',
  'user.update': 'user:write',
  'user.remove': 'user:delete',
};

const t = initTRPC.context<Context>().create({ transformer: superjson });

export const router = t.router;
export const protectedProcedure = t.procedure.use(({ ctx, next, path, type }) => {
  if (!ctx.user) throw new TRPCError({ code: 'UNAUTHORIZED', message: '请先登录账户' });
  const permission = permissionByPath[path] ?? (path.startsWith('user.') || type === 'mutation' ? 'user:write' : undefined);
  if (permission && !can(ctx.user.role, permission)) {
    throw new TRPCError({ code: 'FORBIDDEN', message: '当前账户没有执行此操作的权限' });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});
