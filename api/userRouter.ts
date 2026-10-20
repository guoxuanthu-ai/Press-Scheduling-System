import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { ROLES } from '../contracts/auth';
import { hashPassword } from '../db/authUtils';
import { protectedProcedure, router } from './trpc';

const passwordSchema = z.string().min(8, '密码至少 8 位').max(72, '密码最长 72 位');
const usernameSchema = z.string().trim().toLowerCase().regex(/^[a-z][a-z0-9_]{2,29}$/, '用户名需以字母开头，仅含字母、数字、下划线');

export const userRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => (await ctx.store.read()).users.map((user) => ({
    id: user.id,
    username: user.username,
    name: user.name,
    role: user.role,
    active: user.active,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  }))),
  create: protectedProcedure.input(z.object({
    username: usernameSchema,
    name: z.string().trim().min(1, '请输入显示名称').max(30),
    role: z.enum(ROLES),
    password: passwordSchema,
  })).mutation(async ({ ctx, input }) => ctx.store.mutate((data) => {
    if (input.role === 'general_manager' && ctx.user.role !== 'general_manager') {
      throw new TRPCError({ code: 'FORBIDDEN', message: '只有总经理可以授予总经理角色' });
    }
    if (data.users.some((user) => user.username === input.username)) {
      throw new TRPCError({ code: 'CONFLICT', message: '用户名已存在' });
    }
    const timestamp = new Date().toISOString();
    const user = {
      id: data.nextId++,
      username: input.username,
      name: input.name,
      role: input.role,
      active: true,
      passwordHash: hashPassword(input.password),
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    data.users.push(user);
    const { passwordHash: _, ...safeUser } = user;
    return safeUser;
  })),
  update: protectedProcedure.input(z.object({
    id: z.number().int().positive(),
    name: z.string().trim().min(1).max(30).optional(),
    role: z.enum(ROLES).optional(),
    active: z.boolean().optional(),
    password: passwordSchema.optional(),
  }).refine((input) => input.name !== undefined || input.role !== undefined || input.active !== undefined || input.password !== undefined, '没有需要保存的变更')).mutation(async ({ ctx, input }) => ctx.store.mutate((data) => {
    if (input.role === 'general_manager' && ctx.user.role !== 'general_manager') {
      throw new TRPCError({ code: 'FORBIDDEN', message: '只有总经理可以授予总经理角色' });
    }
    const user = data.users.find((item) => item.id === input.id);
    if (!user) throw new TRPCError({ code: 'NOT_FOUND', message: '账户不存在' });
    const nextRole = input.role ?? user.role;
    const nextActive = input.active ?? user.active;
    const removesAdmin = user.role === 'admin' && user.active && (nextRole !== 'admin' || !nextActive);
    if (removesAdmin && !data.users.some((item) => item.id !== user.id && item.role === 'admin' && item.active)) {
      throw new TRPCError({ code: 'CONFLICT', message: '不能停用或降级最后一个有效管理员' });
    }
    const removesGeneralManager = user.role === 'general_manager' && user.active && (nextRole !== 'general_manager' || !nextActive);
    if (removesGeneralManager && !data.users.some((item) => item.id !== user.id && item.role === 'general_manager' && item.active)) {
      throw new TRPCError({ code: 'CONFLICT', message: '不能停用或降级最后一个有效总经理' });
    }
    if (input.name !== undefined) user.name = input.name;
    if (input.role !== undefined) user.role = input.role;
    if (input.active !== undefined) user.active = input.active;
    if (input.password) user.passwordHash = hashPassword(input.password);
    user.updatedAt = new Date().toISOString();
    if (input.password || input.role !== undefined || input.active === false) {
      data.sessions = data.sessions.filter((session) => session.userId !== user.id);
    }
    const { passwordHash: _, ...safeUser } = user;
    return safeUser;
  })),
  remove: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => ctx.store.mutate((data) => {
    if (input.id === ctx.user.id) throw new TRPCError({ code: 'CONFLICT', message: '不能删除当前登录账户' });
    const index = data.users.findIndex((user) => user.id === input.id);
    if (index < 0) throw new TRPCError({ code: 'NOT_FOUND', message: '账户不存在' });
    const target = data.users[index];
    if (target.role === 'general_manager' && target.active && !data.users.some((user) => user.id !== target.id && user.role === 'general_manager' && user.active)) {
      throw new TRPCError({ code: 'CONFLICT', message: '不能删除最后一个有效总经理' });
    }
    data.users.splice(index, 1);
    data.sessions = data.sessions.filter((session) => session.userId !== target.id);
    return { success: true, id: target.id, username: target.username };
  })),
});
