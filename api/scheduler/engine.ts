import { buildWorkingDays, isWorkingDate } from '../../contracts/calendar';
import { addCalendarHours, addDays, daysBetween, maxPoint, roundHour, type TimePoint } from '../../contracts/date';
import type { Mold, Press, PressingStep, SampleTask } from '../../contracts/entities';
import type {
  Assignment,
  DailyLoad,
  MoldReminder,
  PressingPlan,
  ScheduleResult,
  ScheduleWarning,
  SchedulingInput,
  TaskPlan,
} from '../../contracts/schedule';
import { buildMoldReminders } from './moldPlan';
import { allocationEnd, allocationStart, isEarlierAllocation, Timeline, type AllocationSegment } from './timeline';
import { buildWarnings } from './warnings';

interface InternalResult {
  assignments: Assignment[];
  taskPlans: TaskPlan[];
  trace: Array<{ taskId: number; stepId?: number; message: string }>;
}

interface Placement {
  plan: PressingPlan;
  end?: TimePoint;
}

const priorityRank = { P0: 0, P1: 1, P2: 2, P3: 3 } as const;

function scheduleInternal(input: SchedulingInput, horizonDays: number, idealMode: boolean): InternalResult {
  const timeline = new Timeline((date) => isWorkingDate(date, input.workCalendar));
  const assignments: Assignment[] = [];
  const taskPlans: TaskPlan[] = [];
  const trace: InternalResult['trace'] = [];
  const presses = input.presses.filter((press) => press.status === 'available');
  const moldMap = new Map(input.molds.map((mold) => [mold.id, mold]));
  const basePoint: TimePoint = { date: input.baseDate, hour: 0 };

  const placeStep = (task: SampleTask, step: PressingStep, earliest: TimePoint): Placement => {
    const mold = moldMap.get(step.moldId);
    const remainingHours = Math.max(0, roundHour(step.requiredHours - step.completedHours));
    const plan: PressingPlan = {
      stepId: step.id,
      stepType: step.stepType,
      name: step.name,
      moldId: step.moldId,
      moldCode: mold?.code ?? '未知模具',
      requiredHours: step.requiredHours,
      remainingHours,
      completedHours: step.completedHours,
      status: step.status,
      decision: '',
    };
    if (step.status === 'completed' || remainingHours <= 0) {
      plan.status = 'completed';
      plan.remainingHours = 0;
      plan.decision = '已完成工序不参与重排。';
      return { plan, end: basePoint };
    }
    if (!mold) {
      plan.unschedulableReason = '工序关联的模具不存在';
      plan.decision = plan.unschedulableReason;
      return { plan };
    }
    if (mold.status === 'maintenance') {
      plan.unschedulableReason = `模具 ${mold.code} 维修中`;
      plan.decision = plan.unschedulableReason;
      return { plan };
    }

    let candidates = presses.filter((press) => mold.pressIds.includes(press.id));
    if (step.completedHours > 0 && step.assignedPressId) {
      candidates = candidates.filter((press) => press.id === step.assignedPressId);
    }
    if (candidates.length === 0) {
      plan.unschedulableReason = step.completedHours > 0 && step.assignedPressId
        ? `原压机不可用，且已开工工序不能转移至其他压机`
        : `模具 ${mold.code} 没有适配的可用压机`;
      plan.decision = plan.unschedulableReason;
      return { plan };
    }

    let effectiveEarliest = earliest;
    let arrivalDate: string | undefined;
    if (mold.status === 'production') {
      arrivalDate = idealMode && !mold.orderDate
        ? input.baseDate
        : addDays(mold.orderDate ?? input.baseDate, mold.leadTimeDays);
      effectiveEarliest = maxPoint(effectiveEarliest, { date: arrivalDate, hour: 0 });
    }

    let best: { press: Press; segments: AllocationSegment[] } | null = null;
    for (const press of candidates) {
      const segments = timeline.findAllocation(
        press.id,
        mold.id,
        press.dailyHours,
        remainingHours,
        effectiveEarliest,
        input.baseDate,
        horizonDays,
      );
      if (!segments) continue;
      if (!best || isEarlierAllocation(segments, best.segments) ||
        (allocationStart(segments).date === allocationStart(best.segments).date &&
          allocationStart(segments).hour === allocationStart(best.segments).hour &&
          allocationEnd(segments).date === allocationEnd(best.segments).date &&
          allocationEnd(segments).hour === allocationEnd(best.segments).hour &&
          press.id < best.press.id)) {
        best = { press, segments };
      }
    }
    if (!best) {
      plan.unschedulableReason = `${horizonDays} 天排产地平线内无连续可用产能`;
      plan.decision = plan.unschedulableReason;
      return { plan };
    }

    timeline.commit(best.press.id, mold.id, best.segments);
    const start = allocationStart(best.segments);
    const end = allocationEnd(best.segments);
    plan.pressId = best.press.id;
    plan.pressName = best.press.name;
    plan.startDate = start.date;
    plan.endDate = end.date;
    plan.startHour = start.hour;
    plan.endHour = end.hour;
    plan.status = step.completedHours > 0 ? 'in_progress' : step.status;
    const dependency = step.stepType === 'final' ? '全部预压 core 就绪后，' : '';
    const moldConstraint = arrivalDate ? `模具预计 ${arrivalDate} 到厂；` : '';
    const progressConstraint = step.completedHours > 0 ? `抵扣已完成 ${step.completedHours}h，仅排剩余 ${remainingHours}h；` : '';
    plan.decision = `${dependency}${moldConstraint}${progressConstraint}${best.press.name} 提供最早可行空档。`;
    trace.push({ taskId: task.id, stepId: step.id, message: `${step.name}：${plan.decision}` });

    for (const segment of best.segments) {
      assignments.push({
        id: `${task.id}-${step.id}-${segment.date}`,
        date: segment.date,
        pressId: best.press.id,
        pressName: best.press.name,
        taskId: task.id,
        productName: task.productName,
        stepId: step.id,
        stepName: step.name,
        stepType: step.stepType,
        moldId: mold.id,
        moldCode: mold.code,
        hours: roundHour(segment.end - segment.start),
        startHour: segment.start,
        endHour: segment.end,
      });
    }
    return { plan, end };
  };

  const sortedTasks = [...input.tasks].sort((a, b) =>
    priorityRank[a.priority] - priorityRank[b.priority] || a.deadline.localeCompare(b.deadline) || a.id - b.id);

  for (const task of sortedTasks) {
    trace.push({ taskId: task.id, message: `${task.productName} 按 ${task.priority}、交期 ${task.deadline} 进入排产。` });
    const taskPlan: TaskPlan = {
      taskId: task.id,
      productName: task.productName,
      techRoute: task.techRoute,
      deadline: task.deadline,
      priority: task.priority,
      status: 'scheduled',
      pressingSteps: [],
      postSteps: task.postSteps.map((step) => ({
        stepId: step.id,
        name: step.processName,
        durationHours: step.durationHours,
        status: step.status,
      })),
      delayDays: 0,
    };
    const cores = task.pressingSteps.filter((step) => step.stepType === 'core').sort((a, b) => a.seq - b.seq);
    const final = task.pressingSteps.find((step) => step.stepType === 'final');
    const coreEnds: TimePoint[] = [];
    let failure: string | undefined;

    for (const core of cores) {
      const placement = placeStep(task, core, basePoint);
      taskPlan.pressingSteps.push(placement.plan);
      if (placement.plan.unschedulableReason) failure ??= placement.plan.unschedulableReason;
      else if (placement.end) coreEnds.push(placement.end);
    }

    let finalEnd: TimePoint | undefined;
    if (final) {
      if (failure) {
        const mold = moldMap.get(final.moldId);
        taskPlan.pressingSteps.push({
          stepId: final.id,
          stepType: 'final',
          name: final.name,
          moldId: final.moldId,
          moldCode: mold?.code ?? '未知模具',
          requiredHours: final.requiredHours,
          remainingHours: Math.max(0, final.requiredHours - final.completedHours),
          completedHours: final.completedHours,
          status: final.status,
          unschedulableReason: '预压 core 未全部就绪，合压无法排产',
          decision: '合压必须等待全部预压 core 完成。',
        });
      } else {
        const readyPoint = coreEnds.reduce((ready, point) => maxPoint(ready, point), basePoint);
        const placement = placeStep(task, final, readyPoint);
        taskPlan.pressingSteps.push(placement.plan);
        if (placement.plan.unschedulableReason) failure = placement.plan.unschedulableReason;
        else finalEnd = placement.end;
      }
    } else {
      failure = '任务缺少合压工序';
    }

    if (!failure && finalEnd) {
      let cursor = finalEnd;
      for (const post of [...task.postSteps].sort((a, b) => a.seq - b.seq)) {
        const plan = taskPlan.postSteps.find((item) => item.stepId === post.id)!;
        if (post.status === 'completed') continue;
        const start = maxPoint(cursor, basePoint);
        const end = addCalendarHours(start, post.durationHours);
        plan.startDate = start.date;
        plan.startHour = start.hour;
        plan.endDate = end.date;
        plan.endHour = end.hour;
        cursor = end;
        trace.push({ taskId: task.id, stepId: post.id, message: `${post.processName} 紧接上一道后工序，计划 ${start.date} 至 ${end.date}。` });
      }
      taskPlan.estimatedDelivery = cursor.date;
      taskPlan.delayDays = Math.max(0, daysBetween(task.deadline, cursor.date));
    }

    if (failure) {
      const hasPlacedWork = taskPlan.pressingSteps.some((step) => step.startDate || step.status === 'completed');
      taskPlan.status = hasPlacedWork ? 'partial' : 'unschedulable';
      taskPlan.unschedulableReason = failure;
      taskPlan.bottleneck = failure;
      trace.push({ taskId: task.id, message: `${task.productName}：${failure}` });
    }
    taskPlans.push(taskPlan);
  }

  assignments.sort((a, b) => a.date.localeCompare(b.date) || a.pressId - b.pressId || a.startHour - b.startHour);
  return { assignments, taskPlans, trace };
}

function applyBottlenecks(input: SchedulingInput, taskPlans: TaskPlan[], reminders: MoldReminder[]): void {
  for (const plan of taskPlans) {
    if (plan.delayDays <= 0) continue;
    const task = input.tasks.find((item) => item.id === plan.taskId)!;
    const taskReminders = reminders.filter((item) => item.taskId === task.id);
    if (taskReminders.some((item) => item.overdue || item.arrivalDate > input.baseDate)) {
      plan.bottleneck = '开模来不及';
      continue;
    }
    const hasRestrictedMold = task.pressingSteps.some((step) => {
      const mold = input.molds.find((item) => item.id === step.moldId);
      return mold && input.presses.filter((press) => press.status === 'available' && mold.pressIds.includes(press.id)).length <= 1;
    });
    if (hasRestrictedMold && task.pressingSteps.some((step) => {
      const mold = input.molds.find((item) => item.id === step.moldId);
      return mold && mold.pressIds.length === 0;
    })) {
      plan.bottleneck = '模具适配受限';
      continue;
    }
    const postHours = task.postSteps.filter((step) => step.status !== 'completed').reduce((sum, step) => sum + step.durationHours, 0);
    plan.bottleneck = postHours >= 48 ? '后工序耗时长' : hasRestrictedMold ? '模具适配受限' : '压机产能不足';
  }
}

function buildDailyLoads(input: SchedulingInput, assignments: Assignment[], horizonDays: number): DailyLoad[] {
  const presses = input.presses.filter((press) => press.status === 'available');
  const lastAssignmentOffset = assignments.reduce((max, item) => Math.max(max, daysBetween(input.baseDate, item.date)), 0);
  const days = Math.max(1, Math.min(horizonDays, Math.max(30, lastAssignmentOffset + 1)));
  const loads: DailyLoad[] = [];
  for (let offset = 0; offset < days; offset += 1) {
    const date = addDays(input.baseDate, offset);
    for (const press of presses) {
      const scheduledHours = roundHour(assignments.filter((item) => item.date === date && item.pressId === press.id)
        .reduce((sum, item) => sum + item.hours, 0));
      const working = isWorkingDate(date, input.workCalendar);
      loads.push({
        date,
        pressId: press.id,
        scheduledHours,
        capacityHours: working ? press.dailyHours : 0,
        utilization: working && press.dailyHours > 0 ? Math.min(100, Math.round(scheduledHours / press.dailyHours * 100)) : 0,
      });
    }
  }
  return loads;
}

export function runScheduling(input: SchedulingInput): ScheduleResult {
  const horizonDays = input.horizonDays ?? 180;
  const limitedInput: SchedulingInput = { ...input, tasks: input.tasks.slice(0, 500) };
  const actual = scheduleInternal(limitedInput, horizonDays, false);
  const ideal = scheduleInternal(limitedInput, horizonDays, true);
  const moldReminders = buildMoldReminders(limitedInput, actual, ideal);
  applyBottlenecks(limitedInput, actual.taskPlans, moldReminders);
  const warnings: ScheduleWarning[] = buildWarnings(input.baseDate, actual.taskPlans, moldReminders);
  if (input.tasks.length > 500) {
    warnings.push({
      id: 'task-limit',
      type: 'unschedulable',
      level: 'red',
      title: '任务数量超过本次排产上限',
      description: `共有 ${input.tasks.length} 个未完成任务，本次仅排前 500 个，请分批处理。`,
    });
  }
  const dailyLoads = buildDailyLoads(limitedInput, actual.assignments, horizonDays);
  const todayLoads = dailyLoads.filter((load) => load.date === input.baseDate);
  const todayCapacity = todayLoads.reduce((sum, load) => sum + load.capacityHours, 0);
  const todayScheduled = todayLoads.reduce((sum, load) => sum + load.scheduledHours, 0);
  return {
    baseDate: input.baseDate,
    generatedAt: new Date().toISOString(),
    horizonDays,
    assignments: actual.assignments,
    taskPlans: actual.taskPlans,
    moldReminders,
    warnings,
    dailyLoads,
    workingDays: buildWorkingDays(input.baseDate, horizonDays, input.workCalendar),
    metrics: {
      activeTasks: input.tasks.length,
      delayedTasks: actual.taskPlans.filter((plan) => plan.delayDays > 0 || plan.unschedulableReason).length,
      urgentMolds: moldReminders.filter((item) => !item.ordered && (item.overdue || item.remainingDays <= 1)).length,
      todayUtilization: todayCapacity > 0 ? Math.round(todayScheduled / todayCapacity * 100) : 0,
    },
    debug: { trace: actual.trace },
  };
}
