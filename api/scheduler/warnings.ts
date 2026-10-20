import type { MoldReminder, ScheduleWarning, TaskPlan } from '../../contracts/schedule';

export function buildWarnings(
  baseDate: string,
  taskPlans: TaskPlan[],
  moldReminders: MoldReminder[],
): ScheduleWarning[] {
  const warnings: ScheduleWarning[] = [];
  for (const reminder of moldReminders) {
    if (!reminder.overdue) continue;
    warnings.push({
      id: `mold-${reminder.moldId}-${reminder.taskId}-${reminder.stepId}`,
      type: 'mold_overdue',
      level: 'red',
      taskId: reminder.taskId,
      moldId: reminder.moldId,
      productName: reminder.productName,
      title: `${reminder.moldCode} 开模已逾期`,
      description: `${reminder.productName} · ${reminder.stepName} 最晚应于 ${reminder.latestOrderDate} 下单，已逾期 ${Math.abs(reminder.remainingDays)} 天。`,
    });
  }

  for (const plan of taskPlans) {
    if (plan.unschedulableReason) {
      warnings.push({
        id: `unschedulable-${plan.taskId}`,
        type: 'unschedulable',
        level: 'red',
        taskId: plan.taskId,
        productName: plan.productName,
        deadline: plan.deadline,
        title: `${plan.productName} 暂不可排`,
        description: plan.unschedulableReason,
        bottleneck: plan.unschedulableReason,
      });
      continue;
    }
    if (!plan.estimatedDelivery) continue;
    if (plan.delayDays > 0) {
      warnings.push({
        id: `delayed-${plan.taskId}`,
        type: 'delayed',
        level: 'red',
        taskId: plan.taskId,
        productName: plan.productName,
        deadline: plan.deadline,
        estimatedDelivery: plan.estimatedDelivery,
        delayDays: plan.delayDays,
        bottleneck: plan.bottleneck,
        title: `${plan.productName} 预计延期 ${plan.delayDays} 天`,
        description: `交期 ${plan.deadline}，预计 ${plan.estimatedDelivery} 交付；瓶颈：${plan.bottleneck}。`,
      });
    } else if (plan.estimatedDelivery === plan.deadline) {
      warnings.push({
        id: `tight-${plan.taskId}`,
        type: 'tight',
        level: 'yellow',
        taskId: plan.taskId,
        productName: plan.productName,
        deadline: plan.deadline,
        estimatedDelivery: plan.estimatedDelivery,
        delayDays: 0,
        title: `${plan.productName} 交付压线`,
        description: `预计交付日与交期同为 ${plan.deadline}，没有缓冲时间。`,
      });
    }
    if (plan.deadline === baseDate || plan.estimatedDelivery === baseDate) {
      warnings.push({
        id: `today-${plan.taskId}`,
        type: 'due_today',
        level: 'yellow',
        taskId: plan.taskId,
        productName: plan.productName,
        deadline: plan.deadline,
        estimatedDelivery: plan.estimatedDelivery,
        title: `${plan.productName} 今日到期`,
        description: `交期 ${plan.deadline}，预计交付 ${plan.estimatedDelivery}，任务尚未完成。`,
      });
    }
  }
  return warnings.sort((a, b) => a.level === b.level ? a.id.localeCompare(b.id) : a.level === 'red' ? -1 : 1);
}
