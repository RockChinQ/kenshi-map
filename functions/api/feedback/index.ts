/** POST /api/feedback — multipart form: message, contact?, page?, images* (and a honeypot field `website`). */
import { json, sha256, type Ctx } from '../../_lib.ts';

const MAX_MESSAGE = 4000;
const MAX_IMAGES = 4;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const PER_IP_HOUR = 5;
const GLOBAL_DAY = 200;

/** Image type from the file's magic bytes; the client-declared type is not trusted. */
function sniff(b: Uint8Array): { type: string; ext: string } | null {
  const starts = (...sig: number[]) => sig.every((v, i) => b[i] === v);
  if (starts(0x89, 0x50, 0x4e, 0x47)) return { type: 'image/png', ext: 'png' };
  if (starts(0xff, 0xd8, 0xff)) return { type: 'image/jpeg', ext: 'jpg' };
  if (starts(0x47, 0x49, 0x46, 0x38)) return { type: 'image/gif', ext: 'gif' };
  if (starts(0x52, 0x49, 0x46, 0x46) && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return { type: 'image/webp', ext: 'webp' };
  return null;
}

export async function onRequestPost({ request, env }: Ctx) {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) return json({ error: '非法来源' }, 403);
  if (Number(request.headers.get('content-length') || 0) > MAX_IMAGES * MAX_IMAGE_BYTES + 65536) return json({ error: '内容过大' }, 413);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json({ error: '请求格式错误' }, 400);
  }
  if (form.get('website')) return json({ ok: true }); // honeypot: bots fill every field

  const text = (k: string, max: number) => String(form.get(k) ?? '').replace(/\r\n/g, '\n').trim().slice(0, max);
  const message = text('message', MAX_MESSAGE + 1);
  const contact = text('contact', 200);
  let page = text('page', 300);
  if (!/^\/[\w\-./%?=&#~]*$/.test(page)) page = '';
  const files = form.getAll('images').filter((f): f is File => typeof f !== 'string' && f.size > 0);

  if (!message && !files.length) return json({ error: '请填写反馈内容或附上图片' }, 400);
  if (message.length > MAX_MESSAGE) return json({ error: `内容请控制在 ${MAX_MESSAGE} 字以内` }, 400);
  if (files.length > MAX_IMAGES) return json({ error: `最多 ${MAX_IMAGES} 张图片` }, 400);
  if (files.some((f) => f.size > MAX_IMAGE_BYTES)) return json({ error: '单张图片不能超过 5 MB' }, 400);

  const now = Date.now();
  const ipHash = (await sha256(`${request.headers.get('cf-connecting-ip') || ''}|${env.SYNC_TOKEN || ''}`)).slice(0, 32);
  const recent = await env.DB.prepare(
    'SELECT (SELECT COUNT(*) FROM feedback WHERE ip_hash = ?1 AND created_at > ?2) AS mine, (SELECT COUNT(*) FROM feedback WHERE created_at > ?3) AS everyone',
  ).bind(ipHash, now - 3600e3, now - 86400e3).first();
  if (recent.mine >= PER_IP_HOUR || recent.everyone >= GLOBAL_DAY) return json({ error: '提交太频繁了，请稍后再试' }, 429);

  const images: { key: string; type: string; size: number }[] = [];
  for (const f of files) {
    const bytes = new Uint8Array(await f.arrayBuffer());
    const kind = sniff(bytes);
    if (!kind) return json({ error: '只支持 PNG / JPG / GIF / WebP 图片' }, 400);
    images.push({ key: `${crypto.randomUUID()}.${kind.ext}`, type: kind.type, size: bytes.length });
    await env.IMAGES.put(images[images.length - 1].key, bytes, { httpMetadata: { contentType: kind.type } });
  }

  const id = crypto.randomUUID();
  await env.DB.prepare('INSERT INTO feedback (id, created_at, message, contact, page, ua, ip_hash, images) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(id, now, message, contact, page, (request.headers.get('user-agent') || '').slice(0, 300), ipHash, JSON.stringify(images))
    .run();
  return json({ ok: true, id });
}
