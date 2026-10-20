import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { dateToMs } from '../contracts/date';
import { MOLD_STATUSES } from '../contracts/enums';
import { protectedProcedure, router } from './trpc';

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式应为 YYYY-MM-DD').refine((value) => {
  try { dateToMs(value); return true; } catch { return false; }
}, '无效日期');

const moldInput = z.object({
  code: z.string().trim().min(1, '请输入模具编号').max(50),
  name: z.string().trim().min(1, '请输入模具名称').max(80),
  status: z.enum(MOLD_STATUSES),
  leadTimeDays: z.number().int().positive('开模周期必须大于 0').max(365),
  pressIds: z.array(z.number().int().positive()).min(1, '请至少勾选一台适配压机'),
  orderDate: dateSchema.nullable().default(null),
  remark: z.string().max(500).default(''),
});

export const moldRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => (await ctx.store.read()).molds),
  create: protectedProcedure.input(moldInput).mutation(async ({ ctx, input }) =>
    ctx.store.mutate((data) => {
      if (data.molds.some((mold) => mold.code === input.code)) {
        throw new TRPCError({ code: 'CONFLICT', message: `模具编号 ${input.code} 已存在` });
      }
      if (input.pressIds.some((id) => !data.presses.some((press) => press.id === id))) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: '适配压机不存在，请刷新后重试' });
      }
      const mold = { ...input, pressIds: [...new Set(input.pressIds)], id: data.nextId++, createdAt: new Date().toISOString() };
      data.molds.push(mold);
      return mold;
    })),
  update: protectedProcedure.input(moldInput.partial().extend({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) =>
    ctx.store.mutate((data) => {
      const mold = data.molds.find((item) => item.id === input.id);
      if (!mold) throw new TRPCError({ code: 'NOT_FOUND', message: '模具不存在' });
      if (input.code && data.molds.some((item) => item.id !== input.id && item.code === input.code)) {
        throw new TRPCError({ code: 'CONFLICT', message: `模具编号 ${input.code} 已存在` });
      }
      Object.assign(mold, input);
      if (input.pressIds) mold.pressIds = [...new Set(input.pressIds)];
      return mold;
    })),
  remove: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) =>
    ctx.store.mutate((data) => {
      const used = data.tasks.reduce((count, task) => count + task.pressingSteps.filter((step) => step.moldId === input.id).length, 0);
      if (used > 0) throw new TRPCError({ code: 'CONFLICT', message: `该模具正被 ${used} 个工序使用，不能删除` });
      const index = data.molds.findIndex((mold) => mold.id === input.id);
      if (index < 0) throw new TRPCError({ code: 'NOT_FOUND', message: '模具不存在' });
      data.molds.splice(index, 1);
      return { success: true };
    })),
});
