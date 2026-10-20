export const TECH_ROUTES = ['copper_iron', 'amorphous_480', 'amorphous_180'] as const;
export const PRIORITIES = ['P0', 'P1', 'P2', 'P3'] as const;
export const PRESS_STATUSES = ['available', 'maintenance', 'disabled'] as const;
export const MOLD_STATUSES = ['available', 'production', 'maintenance'] as const;
export const PROCESS_NAMES = ['热处理', '含浸', '磨切', '喷涂', '电镀'] as const;
export const TASK_STATUSES = ['pending', 'in_progress', 'completed', 'cancelled'] as const;

export type TechRoute = (typeof TECH_ROUTES)[number];
export type Priority = (typeof PRIORITIES)[number];
export type PressStatus = (typeof PRESS_STATUSES)[number];
export type MoldStatus = (typeof MOLD_STATUSES)[number];
export type ProcessName = (typeof PROCESS_NAMES)[number];
export type TaskStatus = (typeof TASK_STATUSES)[number];
export type StepType = 'core' | 'final';
export type StepStatus = 'pending' | 'in_progress' | 'completed';

export const techRouteLabels: Record<TechRoute, string> = {
  copper_iron: '铜铁共烧',
  amorphous_480: '480℃ 高温热压非晶',
  amorphous_180: '180℃ 热压非晶',
};

export const priorityLabels: Record<Priority, string> = {
  P0: 'P0 特急',
  P1: 'P1 高',
  P2: 'P2 中',
  P3: 'P3 低',
};

export const pressStatusLabels: Record<PressStatus, string> = {
  available: '可用',
  maintenance: '维修中',
  disabled: '停用',
};

export const moldStatusLabels: Record<MoldStatus, string> = {
  available: '已有可用',
  production: '在制中',
  maintenance: '维修中',
};

export const taskStatusLabels: Record<TaskStatus, string> = {
  pending: '待排产',
  in_progress: '进行中',
  completed: '已完成',
  cancelled: '已取消',
};

export const stepStatusLabels: Record<StepStatus, string> = {
  pending: '待排',
  in_progress: '进行中',
  completed: '已完成',
};
