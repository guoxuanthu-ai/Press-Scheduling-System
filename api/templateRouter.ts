import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { PROCESS_NAMES, TECH_ROUTES } from '../contracts/enums';
import { protectedProcedure, router } from './trpc';

const templateSteps = z.array(z.object({
  processName: z.enum(PROCESS_NAMES),
  durationHours: z.number().positive('后工序耗时必须大于 0').max(24 * 60),
})).max(20).refine((steps) => new Set(steps.map((step) => step.processName)).size === steps.length, '同一后工序不能重复');

export const templateRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => (await ctx.store.read()).templates),
  update: protectedProcedure.input(z.object({
    techRoute: z.enum(TECH_ROUTES),
    steps: templateSteps,
  })).mutation(async ({ ctx, input }) =>
    ctx.store.mutate((data) => {
      const template = data.templates.find((item) => item.techRoute === input.techRoute);
      if (!template) throw new TRPCError({ code: 'NOT_FOUND', message: '工艺路线模板不存在' });
      template.steps = input.steps.map((step, index) => ({ ...step, id: data.nextId++, seq: index + 1 }));
      template.updatedAt = new Date().toISOString();
      return template;
    })),
});
