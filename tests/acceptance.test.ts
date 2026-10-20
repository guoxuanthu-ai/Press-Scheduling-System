import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { appRouter } from '../api/router';
import { runScheduling } from '../api/scheduler/engine';
import { addDays } from '../contracts/date';
import type { Mold, Press, SampleTask } from '../contracts/entities';
import { FileStore } from '../db/fileStore';

const BASE = '2026-10-08';
const user = { id: 1, username: 'admin', name: '验收测试', role: 'admin' as const };
type Caller = ReturnType<typeof appRouter.createCaller>;

let directory: string;
let store: FileStore;
let client: Caller;

beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'inductor-acceptance-'));
  store = new FileStore(path.join(directory, 'store.json'));
  client = appRouter.createCaller({ store, user });
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

async function isolateOperations() {
  await store.mutate((data) => {
    data.tasks = [];
    data.molds = [];
    data.scheduleRuns = [];
  });
}

async function createMold(code: string, pressIds: number[], production = false, leadTimeDays = 5) {
  return client.mold.create({ code, name: code, status: production ? 'production' : 'available', leadTimeDays, pressIds, orderDate: null, remark: '' });
}

describe('PRD M1 最小可执行验收', () => {
  it('验收 1：可新增任意压机与模具，并保存模具-压机适配关系', async () => {
    const initial = await client.press.list();
    expect(initial).toHaveLength(10);
    const press = await client.press.create({ name: '11号压机', model: 'TEST-300T', status: 'available', dailyHours: 10, remark: '' });
    const mold = await createMold('M-ACCEPT-01', [press.id, initial[0].id]);
    expect((await client.press.list()).at(-1)?.dailyHours).toBe(10);
    expect(mold.pressIds).toEqual([press.id, initial[0].id]);
    expect((await client.mold.list()).find((item) => item.id === mold.id)?.pressIds).toContain(press.id);
  });

  it('验收 2、3：三条模板可配置，任务自动带出快照且不受后续模板修改影响', async () => {
    expect(await client.template.list()).toHaveLength(3);
    await client.template.update({ techRoute: 'amorphous_180', steps: [{ processName: '热处理', durationHours: 12 }, { processName: '电镀', durationHours: 6 }] });
    const molds = await client.mold.list();
    const task = await client.task.create({
      productName: 'SNAPSHOT-01', techRoute: 'amorphous_180', deadline: addDays(BASE, 20), priority: 'P1', quantity: 5, remark: '',
      pressingSteps: [
        { stepType: 'core', name: 'Core A', moldId: molds[0].id, requiredHours: 4 },
        { stepType: 'final', name: '合压', moldId: molds[2].id, requiredHours: 2 },
      ],
    });
    expect(task.postSteps.map((step) => [step.processName, step.durationHours])).toEqual([['热处理', 12], ['电镀', 6]]);
    await client.template.update({ techRoute: 'amorphous_180', steps: [{ processName: '磨切', durationHours: 99 }] });
    expect((await client.task.get({ id: task.id })).postSteps.map((step) => step.processName)).toEqual(['热处理', '电镀']);
  });

  it('验收 4、5：输出每日×压机工序矩阵，多 Core 并行、合压依赖与后工序接龙正确', async () => {
    await isolateOperations();
    const [coreA, coreB, final] = await Promise.all([createMold('A', [1]), createMold('B', [2]), createMold('F', [3])]);
    const task = await client.task.create({
      productName: 'CHAIN-01', techRoute: 'amorphous_180', deadline: addDays(BASE, 10), priority: 'P0', quantity: 10, remark: '',
      pressingSteps: [
        { stepType: 'core', name: 'Core A', moldId: coreA.id, requiredHours: 8 },
        { stepType: 'core', name: 'Core B', moldId: coreB.id, requiredHours: 8 },
        { stepType: 'final', name: '合压', moldId: final.id, requiredHours: 8 },
      ],
      postSteps: [{ processName: '热处理', durationHours: 24 }, { processName: '磨切', durationHours: 8 }],
    });
    const result = await client.schedule.run({ baseDate: BASE });
    const cores = result.assignments.filter((item) => item.taskId === task.id && item.stepType === 'core');
    expect(cores).toHaveLength(2);
    expect(cores[0].date).toBe(BASE);
    expect(cores[1].date).toBe(BASE);
    expect(cores[0].pressId).not.toBe(cores[1].pressId);
    expect(cores.every((item) => item.moldCode && item.productName && item.hours > 0)).toBe(true);
    const plan = result.taskPlans.find((item) => item.taskId === task.id)!;
    const finalPlan = plan.pressingSteps.find((item) => item.stepType === 'final')!;
    expect(finalPlan.startDate).toBe(addDays(BASE, 1));
    expect(plan.postSteps[0].startDate).toBe(finalPlan.endDate);
    expect(plan.postSteps[1].startDate! >= plan.postSteps[0].endDate!).toBe(true);
    expect(plan.estimatedDelivery).toBeTruthy();
  });

  it('验收 6、7：新开模最晚下单日逾期红标，延期任务含天数与瓶颈', async () => {
    await isolateOperations();
    const core = await createMold('NEW-MOLD', [1], true, 12);
    const final = await createMold('FINAL-MOLD', [2]);
    const task = await client.task.create({
      productName: 'LATE-01', techRoute: 'amorphous_180', deadline: BASE, priority: 'P0', quantity: null, remark: '',
      pressingSteps: [{ stepType: 'core', name: 'Core A', moldId: core.id, requiredHours: 8 }, { stepType: 'final', name: '合压', moldId: final.id, requiredHours: 4 }],
      postSteps: [{ processName: '电镀', durationHours: 24 }],
    });
    const result = await client.schedule.run({ baseDate: BASE });
    const reminder = result.moldReminders.find((item) => item.moldId === core.id && item.taskId === task.id)!;
    expect(reminder.latestOrderDate).toBe(addDays(BASE, -12));
    expect(reminder.overdue).toBe(true);
    expect(result.warnings.some((warning) => warning.type === 'mold_overdue' && warning.level === 'red')).toBe(true);
    const delayed = result.warnings.find((warning) => warning.type === 'delayed' && warning.taskId === task.id);
    expect(delayed?.delayDays).toBeGreaterThan(0);
    expect(delayed?.bottleneck).toBe('开模来不及');
  });

  it('验收 8：录入实际进度后仅排剩余工时，后续链条与交期自动重算', async () => {
    await isolateOperations();
    const core = await createMold('ROLL-CORE', [1]);
    const final = await createMold('ROLL-FINAL', [2]);
    const task = await client.task.create({
      productName: 'ROLL-01', techRoute: 'amorphous_180', deadline: addDays(BASE, 3), priority: 'P0', quantity: null, remark: '',
      pressingSteps: [{ stepType: 'core', name: 'Core A', moldId: core.id, requiredHours: 10 }, { stepType: 'final', name: '合压', moldId: final.id, requiredHours: 2 }],
      postSteps: [{ processName: '磨切', durationHours: 16 }],
    });
    const before = await client.schedule.run({ baseDate: BASE });
    const beforePlan = before.taskPlans.find((item) => item.taskId === task.id)!;
    const coreStep = task.pressingSteps.find((item) => item.stepType === 'core')!;
    await client.task.updateProgress({ taskId: task.id, pressingSteps: [{ id: coreStep.id, completedHours: 4 }], postSteps: [] });
    const nextBase = addDays(BASE, 1);
    const after = await client.schedule.run({ baseDate: nextBase });
    const segments = after.assignments.filter((item) => item.taskId === task.id && item.stepId === coreStep.id);
    expect(segments.reduce((sum, item) => sum + item.hours, 0)).toBe(6);
    expect(segments.every((item) => item.date >= nextBase && item.pressId === 1)).toBe(true);
    const afterPlan = after.taskPlans.find((item) => item.taskId === task.id)!;
    expect(afterPlan.pressingSteps.find((item) => item.stepType === 'final')?.startDate).toBeTruthy();
    expect(afterPlan.estimatedDelivery).toBeTruthy();
    expect(afterPlan.estimatedDelivery).not.toBe(beforePlan.estimatedDelivery);
    expect(after.generatedAt).not.toBe(before.generatedAt);
  });

  it('验收 9：两个客户端连接同一服务仓库，写入与读取数据一致', async () => {
    const anotherDevice = appRouter.createCaller({ store, user: { id: 2, username: 'admin2', name: '另一台设备', role: 'admin' } });
    const created = await client.press.create({ name: '跨端验证压机', model: 'SYNC-01', status: 'available', dailyHours: 8, remark: '' });
    const visible = (await anotherDevice.press.list()).find((press) => press.id === created.id);
    expect(visible).toMatchObject({ name: '跨端验证压机', model: 'SYNC-01' });
    await anotherDevice.mold.create({ code: 'SYNC-MOLD', name: '跨端模具', status: 'available', leadTimeDays: 5, pressIds: [created.id], orderDate: null, remark: '' });
    expect((await client.mold.list()).some((mold) => mold.code === 'SYNC-MOLD')).toBe(true);
  });
});

describe('排产性能验收', () => {
  it('100 个任务 × 10 台压机在 3 秒内完成', () => {
    const presses: Press[] = Array.from({ length: 10 }, (_, index) => ({ id: index + 1, name: `${index + 1}号`, model: 'T', status: 'available', dailyHours: 8, remark: '', createdAt: BASE }));
    const molds: Mold[] = [];
    const tasks: SampleTask[] = [];
    for (let id = 1; id <= 100; id += 1) {
      const coreMold = id * 2;
      const finalMold = id * 2 + 1;
      molds.push(
        { id: coreMold, code: `C${id}`, name: `C${id}`, status: 'available', leadTimeDays: 5, pressIds: presses.map((press) => press.id), orderDate: null, remark: '', createdAt: BASE },
        { id: finalMold, code: `F${id}`, name: `F${id}`, status: 'available', leadTimeDays: 5, pressIds: presses.map((press) => press.id), orderDate: null, remark: '', createdAt: BASE },
      );
      tasks.push({
        id, productName: `PERF-${id}`, techRoute: 'amorphous_180', deadline: addDays(BASE, 60), priority: 'P1', quantity: null, status: 'pending', remark: '', createdAt: BASE, updatedAt: BASE,
        pressingSteps: [
          { id: id * 10 + 1, stepType: 'core', name: 'Core A', moldId: coreMold, requiredHours: 2, completedHours: 0, status: 'pending', seq: 1, assignedPressId: null },
          { id: id * 10 + 2, stepType: 'final', name: '合压', moldId: finalMold, requiredHours: 2, completedHours: 0, status: 'pending', seq: 2, assignedPressId: null },
        ], postSteps: [],
      });
    }
    const start = performance.now();
    const result = runScheduling({ baseDate: BASE, presses, molds, tasks });
    const elapsed = performance.now() - start;
    expect(result.taskPlans).toHaveLength(100);
    expect(result.assignments.length).toBeGreaterThan(100);
    expect(elapsed).toBeLessThan(3000);
  });
});
