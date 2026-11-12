/** PATCH /api/admin/feedback/<id> {status} — mark handled / reopen.  DELETE — remove the record and its images. */
import { authorized, json, type Ctx } from '../../../_lib.ts';

export async function onRequestPatch({ request, env, params }: Ctx) {
  if (!(await authorized(request, env.ADMIN_TOKEN))) return json({ error: 'unauthorized' }, 401);
  const { status } = (await request.json().catch(() => ({}))) as { status?: string };
  if (status !== 'new' && status !== 'done') return json({ error: 'bad status' }, 400);
  const r = await env.DB.prepare('UPDATE feedback SET status = ? WHERE id = ?').bind(status, params.id).run();
  return r.meta.changes ? json({ ok: true }) : json({ error: 'not found' }, 404);
}

export async function onRequestDelete({ request, env, params }: Ctx) {
  if (!(await authorized(request, env.ADMIN_TOKEN))) return json({ error: 'unauthorized' }, 401);
  const row = await env.DB.prepare('SELECT images FROM feedback WHERE id = ?').bind(params.id).first();
  if (!row) return json({ error: 'not found' }, 404);
  for (const i of JSON.parse(row.images) as { key: string }[]) await env.IMAGES.delete(i.key);
  await env.DB.prepare('DELETE FROM feedback WHERE id = ?').bind(params.id).run();
  return json({ ok: true });
}
