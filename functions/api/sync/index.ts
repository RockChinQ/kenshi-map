/**
 * Used by .github/workflows/feedback-sync.yml, which files one GitHub issue per feedback.
 * GET  /api/sync            feedback without an issue yet, with the issue title/body to file
 * POST /api/sync {id, issue_number, issue_url}   record the issue that was filed
 */
import { authorized, issueFor, json, type Ctx, type Row } from '../../_lib.ts';

export async function onRequestGet({ request, env }: Ctx) {
  if (!(await authorized(request, env.SYNC_TOKEN, env.ADMIN_TOKEN))) return json({ error: 'unauthorized' }, 401);
  const { results } = await env.DB.prepare('SELECT * FROM feedback WHERE issue_number IS NULL ORDER BY created_at LIMIT 20').all();
  return json({ items: (results as Row[]).map((r) => ({ id: r.id, ...issueFor(request, r) })) });
}

export async function onRequestPost({ request, env }: Ctx) {
  if (!(await authorized(request, env.SYNC_TOKEN, env.ADMIN_TOKEN))) return json({ error: 'unauthorized' }, 401);
  const b = (await request.json().catch(() => ({}))) as { id?: string; issue_number?: number; issue_url?: string };
  if (!b.id || !Number.isInteger(b.issue_number) || !/^https:\/\/github\.com\//.test(b.issue_url || '')) return json({ error: 'bad request' }, 400);
  const r = await env.DB.prepare('UPDATE feedback SET issue_number = ?, issue_url = ?, synced_at = ? WHERE id = ?')
    .bind(b.issue_number, b.issue_url, Date.now(), b.id).run();
  return r.meta.changes ? json({ ok: true }) : json({ error: 'not found' }, 404);
}
