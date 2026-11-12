/** GET /api/admin/feedback?status=new|done&before=<created_at>&limit= — newest first, for the admin page. */
import { authorized, json, present, type Ctx, type Row } from '../../../_lib.ts';

export async function onRequestGet({ request, env }: Ctx) {
  if (!(await authorized(request, env.ADMIN_TOKEN))) return json({ error: 'unauthorized' }, 401);
  const q = new URL(request.url).searchParams;
  const status = q.get('status');
  const before = Number(q.get('before')) || Number.MAX_SAFE_INTEGER;
  const limit = Math.min(100, Math.max(1, Number(q.get('limit')) || 30));
  const filter = status === 'new' || status === 'done' ? status : null;
  const { results } = await env.DB.prepare(
    'SELECT * FROM feedback WHERE created_at < ?1 AND (?2 IS NULL OR status = ?2) ORDER BY created_at DESC LIMIT ?3',
  ).bind(before, filter, limit + 1).all();
  const counts = await env.DB.prepare(
    "SELECT COUNT(*) AS total, SUM(status = 'new') AS open, SUM(issue_number IS NULL) AS unsynced FROM feedback",
  ).first();
  return json({
    items: (results as Row[]).slice(0, limit).map((r) => present(request, r)),
    more: results.length > limit,
    counts: { total: counts.total, open: counts.open ?? 0, unsynced: counts.unsynced ?? 0 },
  });
}
