import { describe, expect, it } from 'vitest';
import type { Mold, Press, PressingStep, SampleTask } from '../../contracts/entities';
import { runScheduling } from './engine';

const BASE = '2026-10-08';
const now = '2026-10-08T08:00:00.000Z';

function press(id: number, overrides: Partial<Press> = {}): Press {
  return { id, name: `${id}号压机`, model: 'XX-200T', status: 'available', dailyHours: 8, remark: '', createdAt: now, ...overrides };
}

function mold(id: number, pressIds: number[], overrides: Partial<Mold> = {}): Mold {
  return { id, code: `M${id}`, name: `模具${id}`, status: 'available', leadTimeDays: 10, pressIds, orderDate: null, remark: '', createdAt: now, ...overrides };
}

function step(id: number, moldId: number, overrides: Partial<PressingStep> = {}): PressingStep {
  return { id, stepType: 'core', name: `Core ${id}`, moldId, requiredHours: 8, completedHours: 0, status: 'pending', seq: id, assignedPressId: null, ...overrides };
}

function task(id: number, steps: PressingStep[], overrides: Partial<SampleTask> = {}): SampleTask {
  return {
    id,
    productName: `产品${id}`,
    techRoute: 'amorphous_180',
    deadline: '2026-10-20',
    priority: 'P1',
    quantity: 10,
    status: 'pending',
    remark: '',
    pressingSteps: steps,
    postSteps: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function standardSteps(finalMold = 3) {
  return [
    step(11, 1, { name: 'Core A' }),
    step(12, 2, { name: 'Core B' }),
    step(13, finalMold, { name: '合压', stepType: 'final', seq: 99 }),
  ];
}

const standardPresses = [press(1), press(2), press(3)];
const standardMolds = [mold(1, [1]), mold(2, [2]), mold(3, [3])];

describe('排产引擎核心规则', () => {
  it('多个 core 并行占用不同压机，合压等待全部 core 完成', () => {
    const result = runScheduling({ baseDate: BASE, presses: standardPresses, molds: standardMolds, tasks: [task(1, standardSteps())] });
    const coreA = result.assignments.find((item) => item.stepId === 11)!;
    const coreB = result.assignments.find((item) => item.stepId === 12)!;
    const final = result.taskPlans[0].pressingSteps.find((item) => item.stepId === 13)!;
    expect(coreA.date).toBe(BASE);
    expect(coreB.date).toBe(BASE);
    expect(coreA.pressId).not.toBe(coreB.pressId);
    expect(final.startDate).toBe('2026-10-09');
    expect(result.taskPlans[0].estimatedDelivery).toBe('2026-10-09');
  });

  it('单个工序跨天连续占用同一台压机', () => {
    const steps = [step(11, 1, { requiredHours: 10 }), step(13, 3, { stepType: 'final', name: '合压', requiredHours: 2 })];
    const result = runScheduling({ baseDate: BASE, presses: standardPresses, molds: standardMolds, tasks: [task(1, steps)] });
    const segments = result.assignments.filter((item) => item.stepId === 11);
    expect(segments).toHaveLength(2);
    expect(segments.map((item) => [item.date, item.hours])).toEqual([[BASE, 8], ['2026-10-09', 2]]);
    expect(new Set(segments.map((item) => item.pressId))).toEqual(new Set([1]));
    expect(result.taskPlans[0].pressingSteps.find((item) => item.stepId === 13)?.startDate).toBe('2026-10-09');
  });

  it('进度抵扣后仅排剩余工时，并保留已开工压机', () => {
    const steps = [
      step(11, 1, { requiredHours: 10, completedHours: 4, status: 'in_progress', assignedPressId: 1 }),
      step(13, 3, { stepType: 'final', name: '合压', requiredHours: 2 }),
    ];
    const result = runScheduling({ baseDate: '2026-10-09', presses: standardPresses, molds: standardMolds, tasks: [task(1, steps, { status: 'in_progress' })] });
    const remaining = result.assignments.filter((item) => item.stepId === 11);
    expect(remaining.reduce((sum, item) => sum + item.hours, 0)).toBe(6);
    expect(remaining.every((item) => item.pressId === 1 && item.date >= '2026-10-09')).toBe(true);
    expect(result.taskPlans[0].pressingSteps[0].decision).toContain('抵扣已完成 4h');
  });

  it('在制模具约束实际开工，并按理想开工日倒推最晚下单与逾期', () => {
    const molds = [mold(1, [1]), mold(2, [2], { status: 'production', leadTimeDays: 12 }), mold(3, [3])];
    const result = runScheduling({ baseDate: BASE, presses: standardPresses, molds, tasks: [task(1, standardSteps())] });
    const coreB = result.taskPlans[0].pressingSteps.find((item) => item.stepId === 12)!;
    const reminder = result.moldReminders.find((item) => item.moldId === 2)!;
    expect(coreB.startDate).toBe('2026-10-20');
    expect(reminder.latestOrderDate).toBe('2026-09-26');
    expect(reminder.overdue).toBe(true);
    expect(result.warnings.some((item) => item.type === 'mold_overdue')).toBe(true);
  });

  it('同一副模具在同一时间只能服务一台压机', () => {
    const shared = mold(1, [1, 2]);
    const first = task(1, [step(11, 1, { requiredHours: 4 }), step(13, 3, { stepType: 'final' })], { priority: 'P0' });
    const second = task(2, [step(21, 1, { requiredHours: 4 }), step(23, 3, { stepType: 'final' })], { priority: 'P1' });
    const result = runScheduling({ baseDate: BASE, presses: standardPresses, molds: [shared, mold(3, [3])], tasks: [second, first] });
    const sharedAssignments = result.assignments.filter((item) => item.moldId === 1 && item.date === BASE);
    expect(sharedAssignments).toHaveLength(2);
    const [a, b] = sharedAssignments.sort((left, right) => left.startHour - right.startHour);
    expect(a.endHour).toBeLessThanOrEqual(b.startHour);
  });

  it('后工序按序接龙，并识别延期、压线和今日到期', () => {
    const steps = [step(11, 1), step(13, 3, { stepType: 'final', name: '合压' })];
    const postSteps = [{ id: 21, seq: 1, processName: '热处理' as const, durationHours: 24, status: 'pending' as const }];
    const delayed = runScheduling({ baseDate: BASE, presses: standardPresses, molds: standardMolds, tasks: [task(1, steps, { deadline: '2026-10-09', postSteps })] });
    expect(delayed.taskPlans[0].estimatedDelivery).toBe('2026-10-10');
    expect(delayed.taskPlans[0].delayDays).toBe(1);
    expect(delayed.warnings.find((item) => item.type === 'delayed')?.bottleneck).toBeTruthy();

    const tight = runScheduling({ baseDate: BASE, presses: standardPresses, molds: standardMolds, tasks: [task(1, steps, { deadline: '2026-10-10', postSteps })] });
    expect(tight.warnings.some((item) => item.type === 'tight')).toBe(true);

    const today = runScheduling({ baseDate: BASE, presses: standardPresses, molds: standardMolds, tasks: [task(1, steps, { deadline: BASE })] });
    expect(today.warnings.some((item) => item.type === 'due_today')).toBe(true);
  });

  it('无适配压机时输出结构化原因且不影响其他任务', () => {
    const bad = task(1, standardSteps(), { priority: 'P0' });
    const good = task(2, standardSteps(), { priority: 'P1' });
    const result = runScheduling({
      baseDate: BASE,
      presses: standardPresses,
      molds: standardMolds,
      tasks: [bad, { ...good, pressingSteps: good.pressingSteps.map((item) => ({ ...item, id: item.id + 20 })) }],
      horizonDays: 20,
    });
    expect(result.taskPlans).toHaveLength(2);
    expect(result.taskPlans.every((plan) => plan.estimatedDelivery)).toBe(true);
    const impossible = runScheduling({ baseDate: BASE, presses: standardPresses, molds: [mold(1, []), ...standardMolds.slice(1)], tasks: [bad] });
    expect(impossible.taskPlans[0].unschedulableReason).toContain('没有适配的可用压机');
    expect(impossible.warnings.some((item) => item.type === 'unschedulable')).toBe(true);
  });

  it('停用和维修中的压机不参与排产', () => {
    const presses = [press(1, { status: 'disabled' }), press(2, { status: 'maintenance' }), press(3)];
    const result = runScheduling({ baseDate: BASE, presses, molds: standardMolds, tasks: [task(1, standardSteps())] });
    expect(result.assignments.every((item) => item.pressId === 3 || item.pressId !== 1)).toBe(true);
    expect(result.taskPlans[0].unschedulableReason).toContain('没有适配的可用压机');
  });

  it('周五跨天工序默认跳过整个周末，非工作日产能为零', () => {
    const steps = [step(11, 1, { requiredHours: 10 }), step(13, 3, { stepType: 'final', name: '合压', requiredHours: 2 })];
    const result = runScheduling({ baseDate: '2026-10-09', presses: standardPresses, molds: standardMolds, tasks: [task(1, steps)] });
    const segments = result.assignments.filter((item) => item.stepId === 11);
    expect(segments.map((item) => [item.date, item.hours])).toEqual([['2026-10-09', 8], ['2026-10-12', 2]]);
    expect(result.assignments.some((item) => item.date === '2026-10-10' || item.date === '2026-10-11')).toBe(false);
    expect(result.dailyLoads.filter((item) => item.date === '2026-10-10').every((item) => item.capacityHours === 0)).toBe(true);
    expect(result.workingDays['2026-10-10']).toBe(false);
  });

  it('周末基准日自动顺延，单独勾选周六后可加班但周日仍休息', () => {
    const steps = [step(11, 1, { requiredHours: 10 }), step(13, 3, { stepType: 'final', name: '合压', requiredHours: 2 })];
    const defaultResult = runScheduling({ baseDate: '2026-10-10', presses: standardPresses, molds: standardMolds, tasks: [task(1, steps)] });
    expect(defaultResult.assignments.find((item) => item.stepId === 11)?.date).toBe('2026-10-12');
    const overtime = runScheduling({ baseDate: '2026-10-10', presses: standardPresses, molds: standardMolds, tasks: [task(1, steps)], workCalendar: { '2026-10-10': true } });
    const segments = overtime.assignments.filter((item) => item.stepId === 11);
    expect(segments.map((item) => [item.date, item.hours])).toEqual([['2026-10-10', 8], ['2026-10-12', 2]]);
    expect(overtime.assignments.some((item) => item.date === '2026-10-11')).toBe(false);
    expect(overtime.workingDays['2026-10-10']).toBe(true);
    expect(overtime.workingDays['2026-10-11']).toBe(false);
  });

  it('允许没有预压 Core 的任务直接合压', () => {
    const result = runScheduling({
      baseDate: BASE,
      presses: standardPresses,
      molds: standardMolds,
      tasks: [task(1, [step(13, 3, { stepType: 'final', name: '合压', requiredHours: 4 })])],
    });
    const assignment = result.assignments.find((item) => item.stepId === 13);
    expect(assignment).toMatchObject({ date: BASE, pressId: 3, hours: 4 });
    expect(result.taskPlans[0].estimatedDelivery).toBe(BASE);
  });
});
