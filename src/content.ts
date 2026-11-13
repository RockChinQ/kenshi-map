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
  extras?: Extras;
}

// ---------------------------------------------------------------- unique characters and Meitou weapons

export interface ExtraLocation {
  kind: string;
  /** 常驻 / 酒吧 / 建筑内 / 关押 / 奴隶 / 势力战役 */
  label: string;
  /** Set member of a non-conditional template; false = random recruit pool or world-state conditional. */
  fixed: boolean;
  place?: string;
  x?: number;
  z?: number;
  campaign?: I18n;
}

export interface UniqueChar {
  id: string;
  name: I18n;
  animal: boolean;
  races: I18n[];
  factions: I18n[];
  locations: ExtraLocation[];
  recruitable?: boolean;
  replacement?: I18n[];
  meitou?: string[];
  wiki?: string;
  /** Short hand-written profile (scripts/char_bios.json). */
  bio?: string;
}

export interface MeitouWeapon {
  id: string;
  weapon: I18n;
  kind: string;
  character?: string;
  locations: ExtraLocation[];
  wiki?: string;
}

export interface Extras {
  grade: I18n;
  manufacturer: I18n;
  characters: UniqueChar[];
  meitou: MeitouWeapon[];
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
export const charPath = (c: UniqueChar) => `/c/${slugOf(c.id)}/`;
export const meitouPath = (m: MeitouWeapon) => `/m/${slugOf(m.id)}/`;
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
      ${p.bio ? `<h3>地点简介</h3><p class="desc bio">${esc(p.bio)}</p>` : ''}
      <p class="coord">坐标 X ${Math.round(p.x)} · Z ${Math.round(p.z)}</p>
      <div class="actions">
        <button class="explore">${explored ? '✓ 已探索' : '标记为已探索'}</button>
        <button class="share">复制链接</button>
      </div>
      ${placeExtrasHtml(p, ctx)}
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
      <h2 class="dir">区域（${regions.length}）</h2>${regions.map((r) => regionLink(r)).join('')}${extrasDirectory(ctx)}`;
}

function extrasDirectory(ctx: ContentCtx) {
  const x = ctx.extras;
  if (!x) return '';
  const chars = [...x.characters].filter((c) => !c.animal).sort((a, b) => plain(a.name).localeCompare(plain(b.name), 'zh'));
  const weapons = [...x.meitou].sort((a, b) => plain(a.weapon).localeCompare(plain(b.weapon), 'zh'));
  return `
      <details><summary class="dir">主要角色（${chars.length}）</summary>${chars.map((c) => charLink(c)).join('')}</details>
      <details><summary class="dir">铭物武器（${weapons.length}）</summary>${weapons.map((m) => meitouLink(m, ctx)).join('')}</details>`;
}


const charLink = (c: UniqueChar, extra = '') =>
  `<a class="hit" href="${charPath(c)}" data-c="${esc(c.id)}"><b class="sw-char"></b>${zh(c.name)}<small>${extra || (c.recruitable ? '可招募' : '主要角色')}</small></a>`;
const meitouLink = (m: MeitouWeapon, ctx: ContentCtx) => {
  const owner = ctx.extras?.characters.find((c) => c.id === m.character);
  return `<a class="hit" href="${meitouPath(m)}" data-m="${esc(m.id)}"><b class="sw-meitou"></b>${zh(m.weapon)}<small>${owner ? esc(plain(owner.name)) : '铭物'}</small></a>`;
};

/** Where a location points on the map: its own building position, else its place's. */
export function locationPoint(l: ExtraLocation, places: Place[]) {
  if (l.x !== undefined && l.z !== undefined) return { x: l.x, z: l.z };
  const p = l.place ? places.find((q) => q.id === l.place) : undefined;
  return p ? { x: p.x, z: p.z } : undefined;
}

const locationRow = (l: ExtraLocation, ctx: ContentCtx) => {
  const p = l.place ? ctx.places.find((q) => q.id === l.place) : undefined;
  if (p) return placeLink(p, ctx, l.label);
  if (l.campaign) return `<p class="loc">势力战役：${zh(l.campaign)}</p>`;
  return `<p class="loc">${esc(l.label)}</p>`;
};

/** One row per place: fixed rows first, then the possible ones (recruit pools / conditional) folded away. */
function locationsHtml(locs: ExtraLocation[], ctx: ContentCtx) {
  const uniq = (xs: ExtraLocation[]) => xs.filter((l, i) => xs.findIndex((o) => o.place === l.place && o.kind === l.kind && (o.campaign?.en ?? '') === (l.campaign?.en ?? '')) === i);
  const fixed = uniq(locs.filter((l) => l.fixed && l.kind !== 'placed_template'));
  const campaigns = uniq(locs.filter((l) => l.kind === 'campaign'));
  const possible = uniq(locs.filter((l) => !l.fixed && l.kind !== 'campaign')).filter((l) => !fixed.some((f) => f.place === l.place));
  let html = fixed.length ? `<h3>出现地点</h3><div class="region-places">${fixed.map((l) => locationRow(l, ctx)).join('')}</div>` : '';
  if (campaigns.length) html += `<h3>势力战役</h3>${campaigns.map((l) => locationRow(l, ctx)).join('')}`;
  if (possible.length) {
    html += `<details><summary>可能出现（随机招募池或条件触发，${possible.length} 处）</summary><div class="region-places">${possible.map((l) => locationRow(l, ctx)).join('')}</div></details>`;
  }
  return html || '<p class="loc">数据中没有固定出现地点。</p>';
}

export function charCardHtml(c: UniqueChar, ctx: ContentCtx) {
  const weapons = (c.meitou ?? []).map((id) => ctx.extras?.meitou.find((m) => m.id === id)).filter((m): m is MeitouWeapon => !!m);
  const tags = [
    `<span>${c.animal ? '独特动物' : '主要角色'}</span>`,
    ...c.races.slice(0, 1).map((r) => `<span>${zh(r)}</span>`),
    ...c.factions.slice(0, 2).map((f) => `<span>${zh(f)}</span>`),
    c.recruitable ? '<span class="good">可招募</span>' : '',
  ].join('');
  return `
      <button class="close" aria-label="关闭">×</button>
      <h2>${zh(c.name)}</h2>
      ${c.name.zh ? `<p class="en">${esc(c.name.en)}</p>` : ''}
      <p class="tags">${tags}</p>
      ${wikiLink(c.wiki)}
      ${c.bio ? `<h3>人物简介</h3><p class="desc bio">${esc(c.bio)}</p>` : ''}
      ${weapons.length ? `<h3>携带的铭物武器</h3><div class="region-places">${weapons.map((m) => meitouLink(m, ctx)).join('')}</div>` : ''}
      ${locationsHtml(c.locations, ctx)}
      ${c.replacement?.length ? `<p class="loc">死亡后由 ${c.replacement.map((r) => zh(r)).join('、')} 替补出现</p>` : ''}
      <p class="note">位置为游戏数据中的出现地点，不是存档里的实时位置；角色被杀、招募或抓走后不会在原处。</p>`;
}

export function meitouCardHtml(m: MeitouWeapon, ctx: ContentCtx) {
  const owner = ctx.extras?.characters.find((c) => c.id === m.character);
  const grade = ctx.extras ? `${zh(ctx.extras.grade)}（${esc(ctx.extras.grade.en)}）` : '铭物';
  return `
      <button class="close" aria-label="关闭">×</button>
      <h2>${zh(m.weapon)}</h2>
      ${m.weapon.zh ? `<p class="en">${esc(m.weapon.en)}</p>` : ''}
      <p class="tags"><span class="gold">${grade}</span>${ctx.extras ? `<span>${zh(ctx.extras.manufacturer)}制造</span>` : ''}</p>
      ${wikiLink(m.wiki)}
      ${owner ? `<h3>携带者</h3><div class="region-places">${charLink(owner)}</div>` : ''}
      ${locationsHtml(m.locations, ctx)}
      <p class="note">这把铭物级武器由该角色随身携带，并非固定放在地上；位置为该角色在游戏数据中的出现地点。</p>`;
}

/** The place card's extra rows: characters set to appear here, and the Meitou weapons they carry. */
export function placeExtrasHtml(p: Place, ctx: ContentCtx) {
  const x = ctx.extras;
  if (!x) return '';
  const chars = x.characters.filter((c) => c.locations.some((l) => l.fixed && l.place === p.id));
  const weapons = x.meitou.filter((m) => m.locations.some((l) => l.fixed && l.place === p.id));
  return (
    (chars.length ? `<h3>这里的主要角色（${chars.length}）</h3><div class="region-places">${chars.map((c) => charLink(c, c.locations.find((l) => l.fixed && l.place === p.id)?.label)).join('')}</div>` : '') +
    (weapons.length ? `<h3>铭物武器（${weapons.length}）</h3><div class="region-places">${weapons.map((m) => meitouLink(m, ctx)).join('')}</div>` : '')
  );
}

export function charMeta(c: UniqueChar, ctx: ContentCtx): PageMeta {
  const en = c.name.zh ? `（${c.name.en}）` : '';
  const where = [...new Set(c.locations.filter((l) => l.fixed && l.place).map((l) => plain(ctx.places.find((p) => p.id === l.place)?.name)))].filter(Boolean);
  const desc = `Kenshi 主要角色${plain(c.name)}${en}${c.races[0] ? `，${plain(c.races[0])}` : ''}${c.factions[0] ? `，${plain(c.factions[0])}` : ''}${c.recruitable ? '，可招募' : ''}。${where.length ? `出现在${where.slice(0, 4).join('、')}。` : ''}${c.bio ?? ''}查看位置、携带武器与灰机 wiki 资料。`;
  return { path: charPath(c), title: `${plain(c.name)}${en}在哪 - Kenshi 角色位置 | ${SITE_NAME}`, description: desc };
}

export function meitouMeta(m: MeitouWeapon, ctx: ContentCtx): PageMeta {
  const owner = ctx.extras?.characters.find((c) => c.id === m.character);
  const en = m.weapon.zh ? `（${m.weapon.en}）` : '';
  const where = [...new Set(m.locations.filter((l) => l.fixed && l.place).map((l) => plain(ctx.places.find((p) => p.id === l.place)?.name)))].filter(Boolean);
  const desc = `Kenshi 铭物（Meitou）级${plain(m.weapon)}${en}${owner ? `，由${plain(owner.name)}携带` : ''}${where.length ? `，出现在${where.slice(0, 3).join('、')}` : ''}。查看铭刃获取位置与携带者。`;
  return { path: meitouPath(m), title: `铭物${plain(m.weapon)}${owner ? `（${plain(owner.name)}）` : ''}获取位置 - Kenshi 铭刃 | ${SITE_NAME}`, description: desc };
}

// ---------------------------------------------------------------- page meta

export interface PageMeta {
  path: string;
  title: string;
  description: string;
}

export const HOME_META: PageMeta = {
  path: '/',
  title: 'Kenshi 中文互动地图 - 剑士全地图：城镇、遗迹、哨站、区域划分、角色与铭刃位置',
  description:
    'Kenshi（剑士）中文互动地图：游戏原版世界地图与图标，261 个城镇、村庄、哨站、遗迹、兴趣点，70 个区域划分与酸雨区，官方简中地名，161 个主要角色出现地点与 32 把铭物（铭刃）武器的获取位置，支持中英文搜索、探索标记和灰机 wiki 跳转。',
};

export function placeMeta(p: Place, ctx: ContentCtx): PageMeta {
  const cat = categoryOf(p.type);
  const region = ctx.regions.find((r) => r.id === p.region);
  const en = p.name.zh && p.name.en !== p.name.zh ? `（${p.name.en}）` : '';
  const parts = [
    `${plain(p.name)}${en}是 Kenshi 中的${cat?.label ?? '地点'}`,
    region ? `，位于${regionTitle(region)}` : '',
    p.faction ? `，所属势力${plain(p.faction)}` : '',
    `。${p.bio ?? ''}在 Kenshi 中文互动地图上查看它的位置、坐标、附近地点和灰机 wiki 资料。`,
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
