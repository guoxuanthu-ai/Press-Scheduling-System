import { z } from 'zod';
import { dateToMs, todayLocal } from '../contracts/date';
import { runScheduling } from './scheduler/engine';
import { protectedProcedure, router } from './trpc';

const baseDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  try { dateToMs(value); return true; } catch { return false; }
}, '无效排产基准日');
const workCalendarSchema = z.record(baseDateSchema, z.boolean());

export const scheduleRouter = router({
  run: protectedProcedure.input(z.object({
    baseDate: baseDateSchema.optional(),
    workCalendar: workCalendarSchema.optional(),
  }).optional()).mutation(async ({ ctx, input }) => ctx.store.mutate((data) => {
    if (input?.workCalendar) data.workCalendar = { ...input.workCalendar };
    const result = runScheduling({
      baseDate: input?.baseDate ?? todayLocal(),
      presses: data.presses,
      molds: data.molds,
      tasks: data.tasks.filter((task) => task.status !== 'completed' && task.status !== 'cancelled'),
      workCalendar: data.workCalendar ?? {},
    });
    for (const plan of result.taskPlans) {
      const task = data.tasks.find((item) => item.id === plan.taskId);
      if (!task) continue;
      for (const stepPlan of plan.pressingSteps) {
        const step = task.pressingSteps.find((item) => item.id === stepPlan.stepId);
        if (step && stepPlan.pressId) step.assignedPressId = stepPlan.pressId;
      }
    }
    data.scheduleRuns.push({
      id: data.nextId++,
      createdAt: new Date().toISOString(),
      createdBy: ctx.user.name,
      result,
    });
    if (data.scheduleRuns.length > 50) data.scheduleRuns.splice(0, data.scheduleRuns.length - 50);
    return result;
  })),
  latest: protectedProcedure.query(async ({ ctx }) => (await ctx.store.read()).scheduleRuns.at(-1)?.result ?? null),
  calendar: protectedProcedure.query(async ({ ctx }) => (await ctx.store.read()).workCalendar ?? {}),
  warnings: protectedProcedure.query(async ({ ctx }) => (await ctx.store.read()).scheduleRuns.at(-1)?.result.warnings ?? []),
  history: protectedProcedure.query(async ({ ctx }) => (await ctx.store.read()).scheduleRuns.map((run) => ({
    id: run.id,
    createdAt: run.createdAt,
    createdBy: run.createdBy,
    baseDate: run.result.baseDate,
    warningCount: run.result.warnings.length,
  })).slice(-20).reverse()),
});
