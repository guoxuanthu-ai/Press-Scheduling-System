import { addDays, daysBetween } from '../../contracts/date';
import type { MoldReminder, ScheduleResult, SchedulingInput } from '../../contracts/schedule';

export function buildMoldReminders(
  input: SchedulingInput,
  actual: Pick<ScheduleResult, 'taskPlans'>,
  ideal: Pick<ScheduleResult, 'taskPlans'>,
): MoldReminder[] {
  const reminders: MoldReminder[] = [];
  for (const task of input.tasks) {
    for (const step of task.pressingSteps) {
      const mold = input.molds.find((item) => item.id === step.moldId);
      if (!mold || mold.status !== 'production') continue;
      const idealPlan = ideal.taskPlans.find((item) => item.taskId === task.id)
        ?.pressingSteps.find((item) => item.stepId === step.id);
      const actualPlan = actual.taskPlans.find((item) => item.taskId === task.id)
        ?.pressingSteps.find((item) => item.stepId === step.id);
      const targetStart = idealPlan?.startDate ?? actualPlan?.startDate ?? input.baseDate;
      const latestOrderDate = addDays(targetStart, -mold.leadTimeDays);
      const ordered = Boolean(mold.orderDate);
      reminders.push({
        moldId: mold.id,
        moldCode: mold.code,
        taskId: task.id,
        productName: task.productName,
        stepId: step.id,
        stepName: step.name,
        leadTimeDays: mold.leadTimeDays,
        latestOrderDate,
        remainingDays: daysBetween(input.baseDate, latestOrderDate),
        ordered,
        orderDate: mold.orderDate ?? undefined,
        arrivalDate: addDays(mold.orderDate ?? input.baseDate, mold.leadTimeDays),
        overdue: !ordered && latestOrderDate < input.baseDate,
      });
    }
  }
  return reminders.sort((a, b) => a.latestOrderDate.localeCompare(b.latestOrderDate));
}
