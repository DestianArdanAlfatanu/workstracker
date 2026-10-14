import type { Request, Response } from 'express';
import { currentUserId } from '../middlewares/auth';
import * as stats from '../services/stats.service';

export async function summary(req: Request, res: Response) {
  res.json({ data: await stats.summary(currentUserId(req)) });
}
