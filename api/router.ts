import { moldRouter } from './moldRouter';
import { pressRouter } from './pressRouter';
import { scheduleRouter } from './scheduleRouter';
import { taskRouter } from './taskRouter';
import { templateRouter } from './templateRouter';
import { router } from './trpc';
import { userRouter } from './userRouter';

export const appRouter = router({
  press: pressRouter,
  mold: moldRouter,
  template: templateRouter,
  task: taskRouter,
  schedule: scheduleRouter,
  user: userRouter,
});

export type AppRouter = typeof appRouter;
