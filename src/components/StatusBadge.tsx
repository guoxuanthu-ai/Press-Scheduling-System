import { cn } from '../lib/utils';
import { moldStatusLabels, pressStatusLabels, priorityLabels, stepStatusLabels, taskStatusLabels, type MoldStatus, type PressStatus, type Priority, type StepStatus, type TaskStatus } from '../../contracts/enums';

const styles = {
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-600/10',
  red: 'bg-red-50 text-red-700 ring-red-600/10',
  yellow: 'bg-amber-50 text-amber-700 ring-amber-600/10',
  blue: 'bg-blue-50 text-blue-700 ring-blue-600/10',
  slate: 'bg-slate-100 text-slate-600 ring-slate-500/10',
  purple: 'bg-violet-50 text-violet-700 ring-violet-600/10',
};

export function Badge({ children, color = 'slate', className }: { children: React.ReactNode; color?: keyof typeof styles; className?: string }) {
  return <span className={cn('inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset', styles[color], className)}>{children}</span>;
}

export function PriorityBadge({ value }: { value: Priority }) {
  const color = value === 'P0' ? 'red' : value === 'P1' ? 'yellow' : value === 'P2' ? 'blue' : 'slate';
  return <Badge color={color}>{priorityLabels[value]}</Badge>;
}
export function PressStatusBadge({ value }: { value: PressStatus }) {
  return <Badge color={value === 'available' ? 'green' : value === 'maintenance' ? 'yellow' : 'slate'}>{pressStatusLabels[value]}</Badge>;
}
export function MoldStatusBadge({ value }: { value: MoldStatus }) {
  return <Badge color={value === 'available' ? 'green' : value === 'production' ? 'blue' : 'yellow'}>{moldStatusLabels[value]}</Badge>;
}
export function TaskStatusBadge({ value }: { value: TaskStatus }) {
  return <Badge color={value === 'completed' ? 'green' : value === 'cancelled' ? 'slate' : value === 'in_progress' ? 'blue' : 'yellow'}>{taskStatusLabels[value]}</Badge>;
}
export function StepStatusBadge({ value }: { value: StepStatus }) {
  return <Badge color={value === 'completed' ? 'green' : value === 'in_progress' ? 'blue' : 'slate'}>{stepStatusLabels[value]}</Badge>;
}
