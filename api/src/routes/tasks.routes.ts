import { Router } from 'express';
import { taskCreateSchema, taskListQuerySchema, taskUpdateSchema, type TaskListQuery } from '@wt/shared';
import { asyncHandler, parseId } from '../lib/http';
import { serializeTask } from '../lib/serialize';
import { currentUserId, requireAuth, requireFeature } from '../middlewares/auth';
import { validate } from '../middlewares/validate';
import * as tasks from '../services/tasks.service';

export function taskRoutes() {
  const router = Router();
  router.use('/tasks', requireAuth, requireFeature('tasks'));

  router.get(
    '/tasks',
    validate(taskListQuerySchema, 'query'),
    asyncHandler(async (req, res) => {
      const items = await tasks.list(currentUserId(req), req.query as unknown as TaskListQuery);
      res.json({ data: items.map(serializeTask) });
    }),
  );

  router.post(
    '/tasks',
    validate(taskCreateSchema),
    asyncHandler(async (req, res) => {
      res.status(201).json({ data: serializeTask(await tasks.create(currentUserId(req), req.body)) });
    }),
  );

  router.patch(
    '/tasks/:id',
    validate(taskUpdateSchema),
    asyncHandler(async (req, res) => {
      res.json({ data: serializeTask(await tasks.update(currentUserId(req), parseId(req.params.id), req.body)) });
    }),
  );

  router.delete(
    '/tasks/:id',
    asyncHandler(async (req, res) => {
      await tasks.remove(currentUserId(req), parseId(req.params.id));
      res.status(204).end();
    }),
  );

  return router;
}
