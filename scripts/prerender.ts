/**
 * Static pages for search engines: one HTML file per place (/p/<slug>/) and region (/r/<slug>/), each with its own
 * title, description, canonical, Open Graph tags, JSON-LD and the same card/directory content the app renders, plus
 * sitemap.xml and robots.txt. Runs after `vite build`:  node --experimental-strip-types scripts/prerender.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import type { Dataset } from '../src/types.ts';
import type { Category } from '../src/categories.ts';
import {
  SITE, SITE_NAME, HOME_META, directoryHtml, esc, placeCardHtml, placeMeta, plain, regionCardHtml, regionMeta, regionTitle,
  charCardHtml, charMeta, meitouCardHtml, meitouMeta,
  type ContentCtx, type Extras, type PageMeta, type RegionInfo,
} from '../src/content.ts';

const DIST = 'dist';
const read = (f: string) => JSON.parse(fs.readFileSync(f, 'utf8'));
const data: Dataset = read(`${DIST}/data/places.json`);
const regions: RegionInfo[] = read(`${DIST}/data/regions.json`).regions;
const icons: Record<string, { file: string }> = fs.existsSync(`${DIST}/icons/markers.json`) ? read(`${DIST}/icons/markers.json`) : {};
const template = fs.readFileSync(`${DIST}/index.html`, 'utf8');
const today = new Date().toISOString().slice(0, 10);

/** Same tinted swatch as the app's (main.ts swatch). */
const swatch = (c: Category) => {
  const img = icons[c.group];
  if (!img) return `<i style="background:${c.color}"></i>`;
  const url = `url(/icons/${img.file}) center/contain no-repeat`;
  return `<b class="sw" style="background:${url},#dfdfdf;background-blend-mode:multiply;-webkit-mask:${url};mask:${url}"></b>`;
};
const extras: Extras | undefined = fs.existsSync(`${DIST}/data/extras.json`) ? read(`${DIST}/data/extras.json`) : undefined;
const ctx: ContentCtx = { places: data.places, regions, swatch, extras };
const directory = directoryHtml(ctx);

function head(m: PageMeta, jsonLd: object[]) {
  const url = SITE + m.path;
  return [
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${SITE_NAME}" />`,
    `<meta property="og:locale" content="zh_CN" />`,
    `<meta property="og:title" content="${esc(m.title)}" />`,
    `<meta property="og:description" content="${esc(m.description)}" />`,
    `<meta property="og:url" content="${url}" />`,
    `<meta property="og:image" content="${SITE}/og.jpg" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:creator" content="@RockChinCN" />`,
    ...jsonLd.map((j) => `<script type="application/ld+json">${JSON.stringify(j).replace(/</g, '\\u003c')}</script>`),
  ].join('\n  ');
}

const breadcrumb = (items: [string, string][]) => ({
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: items.map(([name, p], i) => ({ '@type': 'ListItem', position: i + 1, name, item: SITE + p })),
});

function page(m: PageMeta, card: string | null, jsonLd: object[]) {
  let html = template
    .replace(/<title>[^<]*<\/title>/, `<title>${esc(m.title)}</title>`)
    .replace(/<meta name="description" content="[^"]*" \/>/, `<meta name="description" content="${esc(m.description)}" />`)
    .replace(/<link rel="canonical" href="[^"]*" \/>/, `<link rel="canonical" href="${SITE + m.path}" />`)
    .replace('<!--seo-->', head(m, jsonLd))
    .replace('<section id="results"></section>', `<section id="results">${directory}</section>`);
  if (card) html = html.replace('<div id="detail" hidden></div>', `<div id="detail">${card}</div>`);
  const file = path.join(DIST, m.path, 'index.html');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, html);
  return m.path;
}

const paths: string[] = [];
paths.push(page(HOME_META, null, [
  {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_NAME,
    alternateName: ['剑士中文互动地图', 'Kenshi Interactive Map (Chinese)'],
    url: `${SITE}/`,
    inLanguage: 'zh-CN',
    author: { '@type': 'Person', name: 'Rock Chin', url: 'https://x.com/RockChinCN' },
  },
]));

for (const p of data.places) {
  const m = placeMeta(p, ctx);
  const region = regions.find((r) => r.id === p.region);
  const crumbs: [string, string][] = [[SITE_NAME, '/']];
  if (region) crumbs.push([regionTitle(region), regionMeta(region, ctx).path]);
  crumbs.push([plain(p.name), m.path]);
  paths.push(page(m, placeCardHtml(p, ctx), [
    {
      '@context': 'https://schema.org',
      '@type': 'Place',
      name: plain(p.name),
      alternateName: p.name.en,
      description: m.description,
      url: SITE + m.path,
      ...(region ? { containedInPlace: { '@type': 'Place', name: regionTitle(region), url: SITE + regionMeta(region, ctx).path } } : {}),
      ...(p.wiki ? { sameAs: `https://kenshi.huijiwiki.com/wiki/${encodeURIComponent(p.wiki)}` } : {}),
    },
    breadcrumb(crumbs),
  ]));
}

for (const r of regions) {
  const m = regionMeta(r, ctx);
  paths.push(page(m, regionCardHtml(r, ctx), [
    {
      '@context': 'https://schema.org',
      '@type': 'Place',
      name: regionTitle(r),
      alternateName: r.name.en,
      description: m.description,
      url: SITE + m.path,
      ...(r.wiki ? { sameAs: `https://kenshi.huijiwiki.com/wiki/${encodeURIComponent(r.wiki)}` } : {}),
    },
    breadcrumb([[SITE_NAME, '/'], [regionTitle(r), m.path]]),
  ]));
}

// Unknown paths get a real 404 (with 404.html present, Pages stops serving index.html for them), still showing the map.
fs.writeFileSync(`${DIST}/404.html`, template
  .replace(/<title>[^<]*<\/title>/, `<title>页面不存在 | ${SITE_NAME}</title>`)
  .replace('<meta name="robots" content="index,follow,max-image-preview:large" />', '<meta name="robots" content="noindex" />')
  .replace('<!--seo-->', '')
  .replace('<section id="results"></section>', `<section id="results">${directory}</section>`));

for (const c of extras?.characters ?? []) {
  const m = charMeta(c, ctx);
  paths.push(page(m, charCardHtml(c, ctx), [
    {
      '@context': 'https://schema.org',
      '@type': 'Person',
      name: plain(c.name),
      alternateName: c.name.en,
      description: m.description,
      url: SITE + m.path,
      ...(c.wiki ? { sameAs: `https://kenshi.huijiwiki.com/wiki/${encodeURIComponent(c.wiki)}` } : {}),
    },
    breadcrumb([[SITE_NAME, '/'], ['主要角色', '/'], [plain(c.name), m.path]]),
  ]));
}

for (const w of extras?.meitou ?? []) {
  const m = meitouMeta(w, ctx);
  paths.push(page(m, meitouCardHtml(w, ctx), [
    {
      '@context': 'https://schema.org',
      '@type': 'Thing',
      name: `铭物${plain(w.weapon)}`,
      alternateName: `Meitou ${w.weapon.en}`,
      description: m.description,
      url: SITE + m.path,
    },
    breadcrumb([[SITE_NAME, '/'], ['铭物武器', '/'], [plain(w.weapon), m.path]]),
  ]));
}

const urls = paths
  .map((p) => `  <url><loc>${SITE}${p}</loc><lastmod>${today}</lastmod><priority>${p === '/' ? '1.0' : p.startsWith('/r/') || p.startsWith('/c/') || p.startsWith('/m/') ? '0.8' : '0.6'}</priority></url>`)
  .join('\n');
fs.writeFileSync(`${DIST}/sitemap.xml`, `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);
fs.writeFileSync(`${DIST}/robots.txt`, `User-agent: *\nAllow: /\nDisallow: /admin/\nDisallow: /api/\n\nSitemap: ${SITE}/sitemap.xml\n`);
console.log(`prerendered ${paths.length} pages + sitemap.xml + robots.txt`);
