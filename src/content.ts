/**
 * Card, directory and page-meta HTML shared by the app and the static prerender (scripts/prerender.ts),
 * so a crawler reads the same content a visitor sees. No DOM or map imports here: it also runs under Node.
 */
import type { I18n, Place } from './types.ts';
import { CATEGORIES, categoryOf, type Category } from './categories.ts';

export const SITE = 'https://kenshi.rcpd.cc';
export const SITE_NAME = 'Kenshi 中文互动地图';
const WIKI = 'https://kenshi.huijiwiki.com/wiki/';

/** The parts of a region the text needs (regions.ts holds the full shape). */
export interface RegionInfo {
  id: string;
  name: I18n;
  acid?: ('ground' | 'water')[];
  wiki?: string;
}

export interface ContentCtx {
  places: Place[];
  regions: RegionInfo[];
  /** A category's small icon (the app's tinted marker image, or a dot). */
  swatch: (c: Category) => string;
  explored?: (id: string) => boolean;
}

export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
export const plain = (s?: I18n) => (s ? s.zh || s.en : '');
const zh = (s?: I18n) => esc(plain(s));
export const regionTitle = (r: RegionInfo) => r.name.zh || r.name.en || '未命名区域';

/** URL-safe, stable slug of a record id ("18919-Newwworld.mod" -> "18919-newwworld-mod"). */
export const slugOf = (id: string) =>
  id
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

export const placePath = (p: Place) => `/p/${slugOf(p.id)}/`;
export const regionPath = (r: RegionInfo) => `/r/${slugOf(r.id)}/`;

const placeLink = (p: Place, ctx: ContentCtx, extra = '') => {
  const cat = categoryOf(p.type)!;
  return `<a class="hit" href="${placePath(p)}" data-p="${esc(p.id)}">${ctx.swatch(cat)}${zh(p.name)}<small>${extra || cat.label}</small></a>`;
};
const regionLink = (r: RegionInfo, cls = 'hit') =>
  `<a class="${cls}" href="${regionPath(r)}" data-r="${esc(r.id)}">${cls === 'hit' ? '<b class="sw-region"></b>' : ''}${esc(regionTitle(r))}</a>`;
const wikiLink = (title?: string) =>
  title ? `<a class="wiki" href="${WIKI}${encodeURIComponent(title)}" target="_blank" rel="noopener">灰机 wiki ↗</a>` : '';

/** The places nearest to <paramref name="p"/> (straight-line, game units). */
export function nearby(p: Place, places: Place[], n = 6) {
  return places
    .filter((q) => q.id !== p.id)
    .map((q) => ({ q, d: Math.hypot(q.x - p.x, q.z - p.z) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, n);
}

export function placeCardHtml(p: Place, ctx: ContentCtx) {
  const cat = categoryOf(p.type);
  const region = ctx.regions.find((r) => r.id === p.region);
  const explored = ctx.explored?.(p.id) ?? false;
  const near = nearby(p, ctx.places)
    .map(({ q, d }) => placeLink(q, ctx, `${(d / 1000).toFixed(1)} km`))
    .join('');
  return `
      <button class="close" aria-label="关闭">×</button>
      <h2>${zh(p.name)}</h2>
      ${p.name.zh ? `<p class="en">${esc(p.name.en)}</p>` : ''}
      <p class="tags"><span style="border-color:${cat?.color}">${cat?.label ?? '未知'}</span>${p.faction ? `<span>${zh(p.faction)}</span>` : ''}${region ? regionLink(region, 'region-link') : ''}</p>
      ${wikiLink(p.wiki)}
      ${p.desc ? `<p class="desc">${zh(p.desc)}</p>` : ''}
      <p class="coord">坐标 X ${Math.round(p.x)} · Z ${Math.round(p.z)}</p>
      <div class="actions">
        <button class="explore">${explored ? '✓ 已探索' : '标记为已探索'}</button>
        <button class="share">复制链接</button>
      </div>
      <h3>附近地点</h3>
      <div class="region-places">${near}</div>`;
}

export function regionCardHtml(r: RegionInfo, ctx: ContentCtx) {
  const inside = ctx.places.filter((p) => p.region === r.id).sort((a, b) => a.type - b.type);
  const acid = `${r.acid?.includes('ground') ? '<span class="acid">酸性地面</span>' : ''}${r.acid?.includes('water') ? '<span class="acid">酸性水域</span>' : ''}`;
  return `
      <button class="close" aria-label="关闭">×</button>
      <h2>${esc(regionTitle(r))}</h2>
      ${r.name.zh && r.name.en ? `<p class="en">${esc(r.name.en)}</p>` : ''}
      <p class="tags"><span>区域</span><span>${inside.length} 个地点</span>${acid}</p>
      ${wikiLink(r.wiki)}
      <div class="region-places">${inside.map((p) => placeLink(p, ctx)).join('')}</div>`;
}

/** The side panel's default list (no search): every region and town, as plain links. */
export function directoryHtml(ctx: ContentCtx) {
  const towns = ctx.places.filter((p) => p.type === 2).sort((a, b) => plain(a.name).localeCompare(plain(b.name), 'zh'));
  const regions = [...ctx.regions].sort((a, b) => regionTitle(a).localeCompare(regionTitle(b), 'zh'));
  return `
      <h2 class="dir">城镇（${towns.length}）</h2>${towns.map((p) => placeLink(p, ctx)).join('')}
      <h2 class="dir">区域（${regions.length}）</h2>${regions.map((r) => regionLink(r)).join('')}`;
}

// ---------------------------------------------------------------- page meta

export interface PageMeta {
  path: string;
  title: string;
  description: string;
}

export const HOME_META: PageMeta = {
  path: '/',
  title: 'Kenshi 中文互动地图 - 剑士全地图：城镇、遗迹、哨站、区域划分',
  description:
    'Kenshi（剑士）中文互动地图：游戏原版世界地图与图标，261 个城镇、村庄、哨站、遗迹、兴趣点，70 个区域划分与酸雨区，官方简中地名，支持中英文搜索、探索标记和灰机 wiki 跳转。',
};

export function placeMeta(p: Place, ctx: ContentCtx): PageMeta {
  const cat = categoryOf(p.type);
  const region = ctx.regions.find((r) => r.id === p.region);
  const en = p.name.zh && p.name.en !== p.name.zh ? `（${p.name.en}）` : '';
  const parts = [
    `${plain(p.name)}${en}是 Kenshi 中的${cat?.label ?? '地点'}`,
    region ? `，位于${regionTitle(region)}` : '',
    p.faction ? `，所属势力${plain(p.faction)}` : '',
    '。在 Kenshi 中文互动地图上查看它的位置、坐标、附近地点和灰机 wiki 资料。',
  ];
  return { path: placePath(p), title: `${plain(p.name)}${en}位置 - Kenshi ${cat?.label ?? '地点'} | ${SITE_NAME}`, description: parts.join('') };
}

export function regionMeta(r: RegionInfo, ctx: ContentCtx): PageMeta {
  const inside = ctx.places.filter((p) => p.region === r.id);
  const towns = inside.filter((p) => p.type === 2).map((p) => plain(p.name));
  const en = r.name.zh && r.name.en ? `（${r.name.en}）` : '';
  const acid = r.acid?.length ? `，有${r.acid.map((a) => (a === 'ground' ? '酸性地面' : '酸性水域')).join('和')}` : '';
  const desc = `${regionTitle(r)}${en}是 Kenshi 的一个区域，共 ${inside.length} 个地点${towns.length ? `，包括${towns.slice(0, 4).join('、')}` : ''}${acid}。查看区域范围与地点分布。`;
  return { path: regionPath(r), title: `${regionTitle(r)}${en} - Kenshi 区域地图 | ${SITE_NAME}`, description: desc };
}

export { CATEGORIES };
