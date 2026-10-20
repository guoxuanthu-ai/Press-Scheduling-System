import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { PRESS_STATUSES } from '../contracts/enums';
import { protectedProcedure, router } from './trpc';

const pressInput = z.object({
  name: z.string().trim().min(1, '请输入压机名称').max(50),
  model: z.string().trim().min(1, '请输入压机型号').max(50),
  status: z.enum(PRESS_STATUSES),
  dailyHours: z.number().positive('每日工时必须大于 0').max(24),
  remark: z.string().max(500).default(''),
});

export const pressRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => (await ctx.store.read()).presses),
  create: protectedProcedure.input(pressInput).mutation(async ({ ctx, input }) =>
    ctx.store.mutate((data) => {
      if (data.presses.some((press) => press.name === input.name)) {
        throw new TRPCError({ code: 'CONFLICT', message: `压机 ${input.name} 已存在` });
      }
      const press = { ...input, id: data.nextId++, createdAt: new Date().toISOString() };
      data.presses.push(press);
      return press;
    })),
  update: protectedProcedure.input(pressInput.partial().extend({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) =>
    ctx.store.mutate((data) => {
      const press = data.presses.find((item) => item.id === input.id);
      if (!press) throw new TRPCError({ code: 'NOT_FOUND', message: '压机不存在' });
      Object.assign(press, input);
      return press;
    })),
  remove: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) =>
    ctx.store.mutate((data) => {
      if (data.molds.some((mold) => mold.pressIds.includes(input.id))) {
        throw new TRPCError({ code: 'CONFLICT', message: '该压机仍有关联模具适配关系，请先调整模具或停用压机' });
      }
      const index = data.presses.findIndex((press) => press.id === input.id);
      if (index < 0) throw new TRPCError({ code: 'NOT_FOUND', message: '压机不存在' });
      data.presses.splice(index, 1);
      return { success: true };
    })),
});
