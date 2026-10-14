import type { Request, Response } from 'express';
import { todayISO, type ExportQuery, type ListQuery } from '@wt/shared';
import { parseId } from '../lib/http';
import { serializeApplication, serializeApplicationDetail } from '../lib/serialize';
import { currentUserId } from '../middlewares/auth';
import * as apps from '../services/applications.service';
import * as exporter from '../services/export.service';

export async function list(req: Request, res: Response) {
  const query = req.query as unknown as ListQuery;
  const { items, total } = await apps.list(currentUserId(req), query);
  res.json({
    data: items.map(serializeApplication),
    meta: { page: query.page, limit: query.limit, total },
  });
}

export async function upcoming(req: Request, res: Response) {
  const { limit } = req.query as unknown as { limit: number };
  const items = await apps.upcoming(currentUserId(req), limit);
  res.json({ data: items.map(serializeApplication) });
}

export async function get(req: Request, res: Response) {
  const app = await apps.get(currentUserId(req), parseId(req.params.id));
  res.json({ data: serializeApplicationDetail(app) });
}

export async function create(req: Request, res: Response) {
  const app = await apps.create(currentUserId(req), req.body);
  res.status(201).json({ data: serializeApplication(app) });
}

export async function update(req: Request, res: Response) {
  const app = await apps.update(currentUserId(req), parseId(req.params.id), req.body);
  res.json({ data: serializeApplication(app) });
}

export async function changeStatus(req: Request, res: Response) {
  const app = await apps.changeStatus(currentUserId(req), parseId(req.params.id), req.body.status);
  res.json({ data: serializeApplication(app) });
}

export async function remove(req: Request, res: Response) {
  await apps.softDelete(currentUserId(req), parseId(req.params.id));
  res.status(204).end();
}

export async function restore(req: Request, res: Response) {
  const app = await apps.restore(currentUserId(req), parseId(req.params.id));
  res.json({ data: serializeApplication(app) });
}

export async function bulk(req: Request, res: Response) {
  const count = await apps.bulk(currentUserId(req), req.body);
  res.json({ data: { count } });
}

export async function exportFile(req: Request, res: Response) {
  const { format, ids, ...filters } = req.query as unknown as ExportQuery;
  const rows = await apps.forExport(currentUserId(req), filters, ids);
  const stamp = todayISO();
  if (format === 'csv') {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.attachment(`lamaran-${stamp}.csv`);
    return res.send(exporter.toCsv(rows));
  }
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.attachment(`lamaran-${stamp}.xlsx`);
  res.send(await exporter.toXlsx(rows));
}
