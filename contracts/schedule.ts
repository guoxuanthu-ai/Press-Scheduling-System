import type { Mold, Press, SampleTask } from './entities';
import type { Priority, StepStatus, StepType, TechRoute } from './enums';

export interface SchedulingInput {
  baseDate: string;
  presses: Press[];
  molds: Mold[];
  tasks: SampleTask[];
  horizonDays?: number;
  workCalendar?: Record<string, boolean>;
}

export interface Assignment {
  id: string;
  date: string;
  pressId: number;
  pressName: string;
  taskId: number;
  productName: string;
  stepId: number;
  stepName: string;
  stepType: StepType;
  moldId: number;
  moldCode: string;
  hours: number;
  startHour: number;
  endHour: number;
}

export interface PressingPlan {
  stepId: number;
  stepType: StepType;
  name: string;
  moldId: number;
  moldCode: string;
  requiredHours: number;
  remainingHours: number;
  completedHours: number;
  status: StepStatus;
  pressId?: number;
  pressName?: string;
  startDate?: string;
  endDate?: string;
  startHour?: number;
  endHour?: number;
  unschedulableReason?: string;
  decision: string;
}

export interface PostProcessPlan {
  stepId: number;
  name: string;
  durationHours: number;
  status: StepStatus;
  startDate?: string;
  endDate?: string;
  startHour?: number;
  endHour?: number;
}

export interface TaskPlan {
  taskId: number;
  productName: string;
  techRoute: TechRoute;
  deadline: string;
  priority: Priority;
  status: 'scheduled' | 'partial' | 'unschedulable';
  pressingSteps: PressingPlan[];
  postSteps: PostProcessPlan[];
  estimatedDelivery?: string;
  delayDays: number;
  bottleneck?: string;
  unschedulableReason?: string;
}

export interface MoldReminder {
  moldId: number;
  moldCode: string;
  taskId: number;
  productName: string;
  stepId: number;
  stepName: string;
  leadTimeDays: number;
  latestOrderDate: string;
  remainingDays: number;
  ordered: boolean;
  orderDate?: string;
  arrivalDate: string;
  overdue: boolean;
}

export type WarningType = 'delayed' | 'mold_overdue' | 'due_today' | 'tight' | 'unschedulable';

export interface ScheduleWarning {
  id: string;
  type: WarningType;
  level: 'red' | 'yellow';
  taskId?: number;
  moldId?: number;
  title: string;
  description: string;
  productName?: string;
  deadline?: string;
  estimatedDelivery?: string;
  delayDays?: number;
  bottleneck?: string;
}

export interface DailyLoad {
  date: string;
  pressId: number;
  scheduledHours: number;
  capacityHours: number;
  utilization: number;
}

export interface ScheduleResult {
  baseDate: string;
  generatedAt: string;
  horizonDays: number;
  assignments: Assignment[];
  taskPlans: TaskPlan[];
  moldReminders: MoldReminder[];
  warnings: ScheduleWarning[];
  dailyLoads: DailyLoad[];
  workingDays: Record<string, boolean>;
  metrics: {
    activeTasks: number;
    delayedTasks: number;
    urgentMolds: number;
    todayUtilization: number;
  };
  debug: {
    trace: Array<{ taskId: number; stepId?: number; message: string }>;
  };
}
