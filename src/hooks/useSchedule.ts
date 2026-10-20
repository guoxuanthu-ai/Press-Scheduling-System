import { todayLocal } from '../../contracts/date';
import { trpc } from '../providers/trpc';
import { useToast } from '../components/ui';

export function useSchedule() {
  const utils = trpc.useUtils();
  const { toast } = useToast();
  const latest = trpc.schedule.latest.useQuery();
  const run = trpc.schedule.run.useMutation({
    onSuccess: async () => {
      await Promise.all([utils.schedule.invalidate(), utils.task.invalidate()]);
      toast('排产完成，已更新每日排班与交期预警', 'success');
    },
    onError: (error) => toast(error.message, 'error'),
  });
  return {
    latest,
    run,
    regenerate: (baseDate = todayLocal(), workCalendar?: Record<string, boolean>) => run.mutate({ baseDate, workCalendar }),
  };
}
