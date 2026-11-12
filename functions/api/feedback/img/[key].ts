/** GET /api/feedback/img/<key> — a feedback image. Keys are random UUIDs, so only someone given the link can load it. */
import type { Ctx } from '../../../_lib.ts';

export async function onRequestGet({ env, params }: Ctx) {
  if (!/^[0-9a-f-]{36}\.(png|jpg|gif|webp)$/.test(params.key)) return new Response('Not found', { status: 404 });
  const obj = await env.IMAGES.get(params.key);
  if (!obj) return new Response('Not found', { status: 404 });
  return new Response(obj.body, {
    headers: {
      'content-type': obj.httpMetadata?.contentType || 'application/octet-stream',
      'cache-control': 'public, max-age=3600',
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'none'",
      'x-robots-tag': 'noindex',
    },
  });
}
