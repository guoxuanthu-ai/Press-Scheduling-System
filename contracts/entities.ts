import type { SessionRecord, UserAccount } from './auth';
import type {
  MoldStatus,
  PressStatus,
  Priority,
  ProcessName,
  StepStatus,
  StepType,
  TaskStatus,
  TechRoute,
} from './enums';

export interface Press {
  id: number;
  name: string;
  model: string;
  status: PressStatus;
  dailyHours: number;
  remark: string;
  createdAt: string;
}

export interface Mold {
  id: number;
  code: string;
  name: string;
  status: MoldStatus;
  leadTimeDays: number;
  pressIds: number[];
  orderDate: string | null;
  remark: string;
  createdAt: string;
}

export interface TemplateStep {
  id: number;
  seq: number;
  processName: ProcessName;
  durationHours: number;
}

export interface RouteTemplate {
  id: number;
  techRoute: TechRoute;
  steps: TemplateStep[];
  updatedAt: string;
}

export interface PressingStep {
  id: number;
  stepType: StepType;
  name: string;
  moldId: number;
  requiredHours: number;
  completedHours: number;
  status: StepStatus;
  seq: number;
  assignedPressId: number | null;
}

export interface PostStep {
  id: number;
  seq: number;
  processName: ProcessName;
  durationHours: number;
  status: StepStatus;
}

export interface SampleTask {
  id: number;
  productName: string;
  techRoute: TechRoute;
  deadline: string;
  priority: Priority;
  quantity: number | null;
  status: TaskStatus;
  remark: string;
  pressingSteps: PressingStep[];
  postSteps: PostStep[];
  createdAt: string;
  updatedAt: string;
}

export interface StoreData {
  version: 1;
  revision: number;
  nextId: number;
  users: UserAccount[];
  sessions: SessionRecord[];
  presses: Press[];
  molds: Mold[];
  templates: RouteTemplate[];
  tasks: SampleTask[];
  workCalendar: Record<string, boolean>;
  scheduleRuns: Array<{
    id: number;
    createdAt: string;
    createdBy: string;
    result: import('./schedule').ScheduleResult;
  }>;
}
