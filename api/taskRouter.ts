import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { dateToMs } from '../contracts/date';
import { PRIORITIES, PROCESS_NAMES, TECH_ROUTES } from '../contracts/enums';
import { protectedProcedure, router } from './trpc';

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式应为 YYYY-MM-DD').refine((value) => {
  try { dateToMs(value); return true; } catch { return false; }
}, '无效日期');

const pressingStepShape = {
  stepType: z.enum(['core', 'final']),
  name: z.string().trim().min(1, '请输入工序名称').max(80),
  moldId: z.number().int().positive(),
  requiredHours: z.number().positive('所需工时必须大于 0').max(1000),
};
const postStepShape = {
  processName: z.enum(PROCESS_NAMES),
  durationHours: z.number().positive('后工序耗时必须大于 0').max(24 * 60),
};

function pressingArray<T extends z.ZodTypeAny>(schema: T) {
  return z.array(schema).min(1, '至少需要一个合压工序').superRefine((steps, context) => {
    const finals = steps.filter((step) => step.stepType === 'final').length;
    if (finals !== 1) context.addIssue({ code: 'custom', message: '必须且只能有一个合压工序' });
  });
}

const pressingCreateStep = z.object(pressingStepShape);
const pressingUpdateStep = z.object({ ...pressingStepShape, id: z.number().int().positive().optional() });
const postCreateStep = z.object(postStepShape);
const postUpdateStep = z.object({ ...postStepShape, id: z.number().int().positive().optional() });
const taskFields = {
  productName: z.string().trim().min(1, '请输入产品名称/型号').max(100),
  techRoute: z.enum(TECH_ROUTES),
  deadline: dateSchema,
  priority: z.enum(PRIORITIES),
  quantity: z.number().int().positive().max(1_000_000).nullable().default(null),
  remark: z.string().max(1000).default(''),
};
const createTaskInput = z.object({
  ...taskFields,
  pressingSteps: pressingArray(pressingCreateStep),
  postSteps: z.array(postCreateStep).max(20).optional(),
});
const updateTaskInput = z.object({
  ...taskFields,
  id: z.number().int().positive(),
  pressingSteps: pressingArray(pressingUpdateStep),
  postSteps: z.array(postUpdateStep).max(20),
});

function assertMoldsExist(data: { molds: Array<{ id: number }> }, moldIds: number[]): void {
  const existing = new Set(data.molds.map((mold) => mold.id));
  if (moldIds.some((id) => !existing.has(id))) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: '所选模具不存在，请刷新后重试' });
  }
}

export const taskRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => (await ctx.store.read()).tasks.sort((a, b) => b.id - a.id)),
  get: protectedProcedure.input(z.object({ id: z.number().int().positive() })).query(async ({ ctx, input }) => {
    const task = (await ctx.store.read()).tasks.find((item) => item.id === input.id);
    if (!task) throw new TRPCError({ code: 'NOT_FOUND', message: '打样任务不存在' });
    return task;
  }),
  create: protectedProcedure.input(createTaskInput).mutation(async ({ ctx, input }) => ctx.store.mutate((data) => {
    assertMoldsExist(data, input.pressingSteps.map((step) => step.moldId));
    const template = data.templates.find((item) => item.techRoute === input.techRoute);
    if (!input.postSteps && !template) throw new TRPCError({ code: 'BAD_REQUEST', message: '该技术路线没有可用模板' });
    const timestamp = new Date().toISOString();
    const task = {
      id: data.nextId++,
      productName: input.productName,
      techRoute: input.techRoute,
      deadline: input.deadline,
      priority: input.priority,
      quantity: input.quantity,
      status: 'pending' as const,
      remark: input.remark,
      pressingSteps: input.pressingSteps.map((step, index) => ({
        ...step,
        id: data.nextId++,
        completedHours: 0,
        status: 'pending' as const,
        seq: index + 1,
        assignedPressId: null,
      })),
      postSteps: (input.postSteps ?? template!.steps).map((step, index) => ({
        processName: step.processName,
        durationHours: step.durationHours,
        id: data.nextId++,
        seq: index + 1,
        status: 'pending' as const,
      })),
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    data.tasks.push(task);
    return task;
  })),
  update: protectedProcedure.input(updateTaskInput).mutation(async ({ ctx, input }) => ctx.store.mutate((data) => {
    const task = data.tasks.find((item) => item.id === input.id);
    if (!task) throw new TRPCError({ code: 'NOT_FOUND', message: '打样任务不存在' });
    if (task.status === 'cancelled' || task.status === 'completed') {
      throw new TRPCError({ code: 'CONFLICT', message: '已完成或已取消任务请先重新开启，再进行编辑' });
    }
    assertMoldsExist(data, input.pressingSteps.map((step) => step.moldId));
    const pressingIds = input.pressingSteps.map((step) => step.id).filter((id): id is number => id !== undefined);
    const postIds = input.postSteps.map((step) => step.id).filter((id): id is number => id !== undefined);
    if (new Set(pressingIds).size !== pressingIds.length || new Set(postIds).size !== postIds.length) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: '同一工序不能重复添加' });
    }
    task.productName = input.productName;
    task.techRoute = input.techRoute;
    task.deadline = input.deadline;
    task.priority = input.priority;
    task.quantity = input.quantity;
    task.remark = input.remark;
    task.pressingSteps = input.pressingSteps.map((step, index) => {
      const existing = step.id === undefined ? undefined : task.pressingSteps.find((item) => item.id === step.id);
      if (step.id !== undefined && !existing) throw new TRPCError({ code: 'NOT_FOUND', message: '要编辑的压制工序不存在' });
      if (existing && existing.stepType !== step.stepType) throw new TRPCError({ code: 'BAD_REQUEST', message: '已有工序不能改变 Core / 合压类型' });
      if (existing && step.requiredHours < existing.completedHours) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: `${existing.name} 已完成 ${existing.completedHours}h，所需工能不能小于该数值` });
      }
      return {
        id: existing?.id ?? data.nextId++,
        stepType: step.stepType,
        name: step.name,
        moldId: step.moldId,
        requiredHours: step.requiredHours,
        completedHours: existing?.completedHours ?? 0,
        status: existing?.status ?? 'pending' as const,
        seq: index + 1,
        assignedPressId: existing?.assignedPressId ?? null,
      };
    });
    task.postSteps = input.postSteps.map((step, index) => {
      const existing = step.id === undefined ? undefined : task.postSteps.find((item) => item.id === step.id);
      if (step.id !== undefined && !existing) throw new TRPCError({ code: 'NOT_FOUND', message: '要编辑的后工序不存在' });
      return {
        id: existing?.id ?? data.nextId++,
        processName: step.processName,
        durationHours: step.durationHours,
        status: existing?.status ?? 'pending' as const,
        seq: index + 1,
      };
    });
    task.updatedAt = new Date().toISOString();
    return task;
  })),
  updateProgress: protectedProcedure.input(z.object({
    taskId: z.number().int().positive(),
    pressingSteps: z.array(z.object({ id: z.number().int().positive(), completedHours: z.number().min(0).max(1000) })).default([]),
    postSteps: z.array(z.object({ id: z.number().int().positive(), status: z.enum(['pending', 'in_progress', 'completed']) })).default([]),
  }).refine((input) => input.pressingSteps.length + input.postSteps.length > 0, '请至少更新一道工序')).mutation(async ({ ctx, input }) => ctx.store.mutate((data) => {
    const task = data.tasks.find((item) => item.id === input.taskId);
    if (!task) throw new TRPCError({ code: 'NOT_FOUND', message: '打样任务不存在' });
    if (task.status === 'cancelled') throw new TRPCError({ code: 'CONFLICT', message: '已取消任务不能更新进度' });
    for (const progress of input.pressingSteps) {
      const step = task.pressingSteps.find((item) => item.id === progress.id);
      if (!step) throw new TRPCError({ code: 'NOT_FOUND', message: '压制工序不存在' });
      if (progress.completedHours > step.requiredHours) throw new TRPCError({ code: 'BAD_REQUEST', message: `${step.name} 已完成工时不能超过所需工时` });
      if (progress.completedHours > 0 && !step.assignedPressId) {
        const planned = data.scheduleRuns.at(-1)?.result.taskPlans.find((plan) => plan.taskId === task.id)
          ?.pressingSteps.find((planStep) => planStep.stepId === step.id);
        step.assignedPressId = planned?.pressId ?? null;
      }
      step.completedHours = progress.completedHours;
      step.status = progress.completedHours >= step.requiredHours ? 'completed' : progress.completedHours > 0 ? 'in_progress' : 'pending';
    }
    for (const progress of input.postSteps) {
      const step = task.postSteps.find((item) => item.id === progress.id);
      if (!step) throw new TRPCError({ code: 'NOT_FOUND', message: '后工序不存在' });
      step.status = progress.status;
    }
    const allCompleted = task.pressingSteps.every((step) => step.status === 'completed') && task.postSteps.every((step) => step.status === 'completed');
    task.status = allCompleted ? 'completed' : 'in_progress';
    task.updatedAt = new Date().toISOString();
    return task;
  })),
  setStatus: protectedProcedure.input(z.object({ id: z.number().int().positive(), status: z.enum(['pending', 'in_progress', 'completed', 'cancelled']) })).mutation(async ({ ctx, input }) => ctx.store.mutate((data) => {
    const task = data.tasks.find((item) => item.id === input.id);
    if (!task) throw new TRPCError({ code: 'NOT_FOUND', message: '打样任务不存在' });
    task.status = input.status;
    if (input.status === 'completed') {
      for (const step of task.pressingSteps) {
        step.completedHours = step.requiredHours;
        step.status = 'completed';
      }
      for (const step of task.postSteps) step.status = 'completed';
    }
    task.updatedAt = new Date().toISOString();
    return task;
  })),
  remove: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => ctx.store.mutate((data) => {
    const index = data.tasks.findIndex((item) => item.id === input.id);
    if (index < 0) throw new TRPCError({ code: 'NOT_FOUND', message: '打样任务不存在' });
    const [removed] = data.tasks.splice(index, 1);
    return { success: true, id: removed.id, productName: removed.productName };
  })),
});
