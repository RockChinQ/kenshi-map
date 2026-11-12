/** Shared helpers for the feedback API (Cloudflare Pages Functions; D1 for records, R2 for images). */
export interface Env {
  DB: any;
  IMAGES: any;
  ADMIN_TOKEN?: string;
  SYNC_TOKEN?: string;
}

export interface Ctx {
  request: Request;
  env: Env;
  params: Record<string, string>;
}

export interface Row {
  id: string;
  created_at: number;
  message: string;
  contact: string;
  page: string;
  ua: string;
  images: string;
  status: string;
  issue_number: number | null;
  issue_url: string | null;
  synced_at: number | null;
}

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

export const sha256 = async (s: string) =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

/** Bearer-token check; comparing digests keeps the comparison constant-time. */
export async function authorized(request: Request, ...tokens: (string | undefined)[]) {
  const given = /^Bearer (.+)$/.exec(request.headers.get('authorization') || '')?.[1];
  if (!given) return false;
  const digest = await sha256(given);
  let ok = false;
  for (const t of tokens) if (t && (await sha256(t)) === digest) ok = true;
  return ok;
}

export const imageUrl = (request: Request, key: string) => `${new URL(request.url).origin}/api/feedback/img/${key}`;

/** Row as the admin page and the sync job see it. */
export function present(request: Request, r: Row) {
  const images = (JSON.parse(r.images) as { key: string }[]).map((i) => imageUrl(request, i.key));
  const { ip_hash: _ip, ...rest } = r as Row & { ip_hash?: string };
  return { ...rest, images };
}

/** The GitHub issue for one feedback. The repo is public: no contact, user agent or IP goes in. */
export function issueFor(request: Request, r: Row) {
  const origin = new URL(request.url).origin;
  const first = r.message.trim().split('\n')[0].trim() || '图片反馈';
  const title = `[反馈] ${first.length > 60 ? first.slice(0, 60) + '…' : first}`;
  // The text goes in a code fence longer than any backtick run inside it, so it cannot mention users or inject markdown.
  const fence = '`'.repeat(Math.max(3, ...[...r.message.matchAll(/`+/g)].map((m) => m[0].length + 1)));
  const time = new Date(r.created_at + 8 * 3600e3).toISOString().slice(0, 16).replace('T', ' ');
  const images = (JSON.parse(r.images) as { key: string }[]).map((i, n) => `![图片 ${n + 1}](${imageUrl(request, i.key)})`);
  const body = [
    `来自站点反馈 · ${time} (UTC+8)${r.page ? ` · 页面 ${origin}${r.page}` : ''}`,
    r.message.trim() ? `${fence}text\n${r.message.trim()}\n${fence}` : '',
    images.join('\n\n'),
    `<!-- feedback:${r.id} -->`,
  ].filter(Boolean).join('\n\n');
  return { title, body };
}
