import 'ol/ol.css';
import './style.css';
import Feature from 'ol/Feature';
import Point from 'ol/geom/Point';
import Overlay from 'ol/Overlay';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import { boundingExtent } from 'ol/extent';
import { Circle, Fill, Icon, Stroke, Style, Text } from 'ol/style';
import type { Dataset, MapMeta, Place } from './types';
import { CATEGORIES, categoryOf, type Category } from './categories';
import { store } from './store';
import { loadRegions, regionLayers, regionName, type Region } from './regions';
import { installCursors } from './cursors';
import { createMap, mapLevel, toMap, toWorld } from './olmap';
import { directoryHtml, placeCardHtml, placeMeta, regionCardHtml, regionMeta, slugOf, HOME_META, type ContentCtx, type PageMeta } from './content';

const FALLBACK_MAP: MapMeta = { size: 8192, maxZoom: 5, tileSize: 256, extent: 147456, tileExt: 'webp' };

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const plain = (s?: { en: string; zh?: string }) => (s ? s.zh || s.en : '');

const zh = (s?: { en: string; zh?: string }) => esc(plain(s));

async function loadData(): Promise<Dataset> {
  try {
    const res = await fetch('/data/places.json', { cache: 'no-cache' });
    if (res.ok) return (await res.json()) as Dataset;
  } catch {
    /* fall through */
  }
  return { generated: '', map: null, places: [] };
}

// ---------------------------------------------------------------- marker images

/** One marker image from the game's Kenshi_MapMarkers imageset (shaded artwork the game multiplies by a colour). */
interface MarkerImage {
  file: string;
  w: number;
  h: number;
}

/** The in-game map's "Neutral" marker colour (kenshi_colours.xml MarkerNeutral). */
const MARKER_COLOUR = '#dfdfdf';

let iconSet: Record<string, MarkerImage> | null = null;

async function loadIcons() {
  try {
    const res = await fetch('/icons/markers.json', { cache: 'no-cache' });
    if (res.ok) iconSet = (await res.json()) as Record<string, MarkerImage>;
  } catch {
    /* dots fallback */
  }
}

/** A category's swatch for the side panel: its marker image tinted like the game, else its colour dot. */
function swatch(c: Category) {
  const img = iconSet?.[c.group];
  if (!img) return `<i style="background:${c.color}"></i>`;
  const url = `url(/icons/${img.file}) center/contain no-repeat`;
  return `<b class="sw" style="background:${url},${MARKER_COLOUR};background-blend-mode:multiply;-webkit-mask:${url};mask:${url}"></b>`;
}

/**
 * The game's map rules (MeitouClient WorldMap.AddPlace): towns show at every level, outposts/villages/ruins/camps from level 1,
 * points of interest at level 2; size x0.5 at level 0, towns x0.75 / x1 at levels 1 / 2, others x0.85; labels from level 1.
 */
function shownAt(type: number, level: number) {
  if (type === 2) return true;
  if (type === 9) return level >= 2;
  return level >= 1;
}

function markerScale(type: number, level: number) {
  if (level === 0) return 0.5;
  if (type === 2) return level === 1 ? 0.75 : 1;
  return 0.85;
}

const LABEL_FONT = '12px system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';

const STAR = new Style({
  text: new Text({ text: '★', font: '20px sans-serif', fill: new Fill({ color: '#8dcdff' }), stroke: new Stroke({ color: '#000', width: 2 }) }),
});

// ---------------------------------------------------------------- app

async function main() {
  installCursors();
  const [data, regions] = await Promise.all([loadData(), loadRegions(), loadIcons()]);
  const regionById = new globalThis.Map(regions.map((r) => [r.id, r]));
  const meta = data.map ?? FALLBACK_MAP;
  const { map, view } = createMap('map', meta);
  const level = () => mapLevel(view.getResolution() ?? 1e9, meta);
  const hidden = store.hiddenCategories();

  // ---- regions ----
  let hoveredRegion: string | null = null;
  const { shapeLayer, labelLayer } = regionLayers(regions, () => hoveredRegion, (res) => mapLevel(res, meta) < 2);
  map.addLayer(shapeLayer);
  map.addLayer(labelLayer);

  // ---- places ----
  const placeSource = new VectorSource();
  for (const p of data.places) {
    const cat = categoryOf(p.type);
    if (!cat) continue;
    const f = new Feature({ geometry: new Point(toMap(p.x, p.z)) });
    f.set('place', p);
    f.set('cat', cat);
    placeSource.addFeature(f);
  }

  const iconStyles = new globalThis.Map<string, Style>();
  const iconStyle = (cat: Category, lvl: number, type: number, explored: boolean) => {
    const key = `${cat.group}|${lvl}|${type === 2}|${explored}`;
    let s = iconStyles.get(key);
    if (s) return s;
    const img = iconSet?.[cat.group];
    const image = img
      ? new Icon({ src: `/icons/${img.file}`, color: MARKER_COLOUR, scale: markerScale(type, lvl), opacity: explored ? 0.45 : 1 })
      : new Circle({ radius: type === 2 ? 7 : 5, fill: new Fill({ color: cat.color }), stroke: new Stroke({ color: '#111', width: 1 }) });
    s = new Style({ image });
    iconStyles.set(key, s);
    return s;
  };

  const townLabel = (p: Place, cat: Category, lvl: number) => {
    const img = iconSet?.[cat.group];
    const offsetY = img ? (img.h * markerScale(p.type, lvl)) / 2 + 10 : 14;
    return new Style({
      text: new Text({
        text: plain(p.name),
        font: LABEL_FONT,
        offsetY,
        fill: new Fill({ color: MARKER_COLOUR }),
        backgroundFill: new Fill({ color: 'rgba(20,19,16,0.8)' }),
        padding: [1, 5, 0, 5],
      }),
    });
  };

  const placeLayer = new VectorLayer({
    source: placeSource,
    updateWhileAnimating: true,
    updateWhileInteracting: true,
    style: (f) => {
      const p = f.get('place') as Place;
      const cat = f.get('cat') as Category;
      const lvl = level();
      if (hidden.has(cat.key) || !shownAt(p.type, lvl)) return undefined;
      const icon = iconStyle(cat, lvl, p.type, store.isExplored(p.id));
      return p.type === 2 && lvl >= 1 ? [icon, townLabel(p, cat, lvl)] : icon;
    },
  });
  map.addLayer(placeLayer);

  // ---- personal markers (right click) ----
  const mineSource = new VectorSource();
  const drawMine = () => {
    mineSource.clear();
    for (const m of store.customMarkers()) {
      const f = new Feature({ geometry: new Point(toMap(m.x, m.z)) });
      f.set('mine', m);
      f.setStyle([
        STAR,
        new Style({
          text: new Text({ text: m.label, font: LABEL_FONT, offsetY: 16, fill: new Fill({ color: '#8dcdff' }), stroke: new Stroke({ color: '#000', width: 3 }) }),
        }),
      ]);
      mineSource.addFeature(f);
    }
  };
  map.addLayer(new VectorLayer({ source: mineSource }));
  drawMine();

  map.getViewport()!.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const pixel = map.getEventPixel(e);
    const hit = map.forEachFeatureAtPixel(pixel, (f) => (f.get('mine') ? f : undefined), { hitTolerance: 6 });
    if (hit) {
      const m = hit.get('mine');
      if (confirm(`删除标记「${m.label}」？`)) {
        store.removeCustomMarker(m.id);
        drawMine();
      }
      return;
    }
    const label = prompt('添加个人标记（仅保存在本浏览器）：');
    if (!label) return;
    store.addCustomMarker({ ...toWorld(map.getCoordinateFromPixel(pixel)), label });
    drawMine();
  });

  // ---- hover: name tooltip and region highlight ----
  const tip = document.createElement('div');
  tip.className = 'map-tip';
  const tipOverlay = new Overlay({ element: tip, offset: [0, 14], positioning: 'top-center', stopEvent: false });
  map.addOverlay(tipOverlay);

  const placeAt = (pixel: number[]) =>
    map.forEachFeatureAtPixel(pixel, (f) => (f.get('place') ? (f as Feature) : undefined), {
      layerFilter: (l) => l === placeLayer,
      hitTolerance: 4,
    });
  const regionAt = (pixel: number[]) =>
    shapeLayer.getVisible()
      ? map.forEachFeatureAtPixel(pixel, (f) => (f.get('region') ? (f as Feature) : undefined), { layerFilter: (l) => l === shapeLayer })
      : undefined;

  map.on('pointermove', (e) => {
    if (e.dragging) return;
    const f = placeAt(e.pixel);
    if (f) {
      tip.textContent = plain((f.get('place') as Place).name);
      tipOverlay.setPosition((f.getGeometry() as Point).getCoordinates());
    } else {
      tipOverlay.setPosition(undefined);
    }
    const r = f ? null : ((regionAt(e.pixel)?.getId() as string | undefined) ?? null);
    if (r !== hoveredRegion) {
      hoveredRegion = r;
      shapeLayer.changed();
    }
  });
  map.getViewport()!.addEventListener('pointerleave', () => {
    tipOverlay.setPosition(undefined);
    hoveredRegion = null;
    shapeLayer.changed();
  });
  map.on('click', (e) => {
    const f = placeAt(e.pixel);
    if (f) return select(f.get('place') as Place);
    const r = regionAt(e.pixel);
    if (r) showRegion(r.get('region') as Region);
  });

  // The game's "hand" pointer while the map is being dragged.
  const target = map.getTargetElement()!;
  map.on('pointerdrag', () => target.classList.add('dragging'));
  window.addEventListener('pointerup', () => target.classList.remove('dragging'));

  // ---- filters ----
  const filters = $('#filters');
  const addFilter = (key: string, html: string, onChange: (on: boolean) => void) => {
    const label = document.createElement('label');
    label.className = 'filter';
    label.innerHTML = `<input type="checkbox" ${hidden.has(key) ? '' : 'checked'} />${html}`;
    const box = label.querySelector('input')!;
    box.addEventListener('change', () => {
      store.setCategoryHidden(key, !box.checked);
      if (box.checked) hidden.delete(key);
      else hidden.add(key);
      onChange(box.checked);
    });
    onChange(box.checked);
    filters.appendChild(label);
  };
  if (regions.length) {
    addFilter('regions', `<b class="sw-region"></b><span>区域划分</span><em>${regions.length}</em>`, (on) => {
      shapeLayer.setVisible(on);
      labelLayer.setVisible(on);
    });
  }
  for (const c of CATEGORIES) {
    const count = data.places.filter((p) => c.types.includes(p.type)).length;
    if (!count) continue;
    addFilter(c.key, `${swatch(c)}<span>${c.label}</span><em>${count}</em>`, () => placeLayer.changed());
  }

  // ---- search ----
  const results = $('#results');
  const search = $<HTMLInputElement>('#search');
  const hitButton = (html: string, onClick: () => void) => {
    const b = document.createElement('button');
    b.className = 'hit';
    b.innerHTML = html;
    b.onclick = onClick;
    return b;
  };
  search.addEventListener('input', () => {
    const q = search.value.trim().toLowerCase();
    results.innerHTML = '';
    if (!q) {
      results.innerHTML = directoryHtml(ctx);
      return;
    }
    const matches = (n: { en: string; zh?: string }) => [n.en, n.zh ?? ''].some((s) => s && s.toLowerCase().includes(q));
    const regionHits = regions.filter((r) => matches(r.name)).slice(0, 10);
    const hits = data.places.filter((p) => matches(p.name)).slice(0, 50);
    for (const r of regionHits) {
      const html = `<b class="sw-region"></b>${esc(regionName(r))}<small>区域${r.name.zh ? ' · ' + esc(r.name.en) : ''}</small>`;
      results.appendChild(hitButton(html, () => showRegion(r, true)));
    }
    for (const p of hits) {
      const html = `${swatch(categoryOf(p.type)!)}${zh(p.name)}<small>${p.name.zh ? esc(p.name.en) : ''}</small>`;
      results.appendChild(hitButton(html, () => select(p, true)));
    }
    if (!hits.length && !regionHits.length) results.innerHTML = '<p class="empty">没有匹配的地点</p>';
  });

  // ---- detail card and page URL ----
  const detail = $('#detail');
  const ctx: ContentCtx = { places: data.places, regions, swatch, explored: (id) => store.isExplored(id) };

  /** Keeps the address bar, title and description on the shown place/region, matching the prerendered page. */
  const setPage = (m: PageMeta) => {
    if (location.pathname !== m.path) history.replaceState(null, '', m.path);
    document.title = m.title;
    document.querySelector('meta[name=description]')?.setAttribute('content', m.description);
    document.querySelector('link[rel=canonical]')?.setAttribute('href', `https://kenshi.rcpd.cc${m.path}`);
  };
  const closeDetail = () => {
    detail.hidden = true;
    setPage(HOME_META);
  };

  function select(p: Place, fly = false) {
    if (fly) {
      const close = (2 * meta.extent) / meta.size; // native image resolution
      view.animate({ center: toMap(p.x, p.z), resolution: Math.min(view.getResolution() ?? close, close), duration: 700 });
    }
    setPage(placeMeta(p, ctx));
    detail.hidden = false;
    detail.innerHTML = placeCardHtml(p, ctx);
    detail.querySelector<HTMLButtonElement>('.close')!.onclick = closeDetail;
    detail.querySelector<HTMLButtonElement>('.explore')!.onclick = () => {
      store.setExplored(p.id, !store.isExplored(p.id));
      placeLayer.changed();
      select(p);
    };
    detail.querySelector<HTMLButtonElement>('.share')!.onclick = (e) => {
      navigator.clipboard?.writeText(location.href);
      (e.target as HTMLButtonElement).textContent = '已复制';
    };
  }

  function showRegion(r: Region, fly = false) {
    if (fly) {
      const ext = boundingExtent(r.polygons.flat(2).map(([x, z]) => toMap(x, z)));
      view.fit(ext, { duration: 700, padding: [60, 340, 60, 60] });
    }
    setPage(regionMeta(r, ctx));
    detail.hidden = false;
    detail.innerHTML = regionCardHtml(r, ctx);
    detail.querySelector<HTMLButtonElement>('.close')!.onclick = closeDetail;
  }

  // Links in cards and the directory are real URLs (crawlable); in the app they open in place.
  const placeById = new globalThis.Map(data.places.map((p) => [p.id, p]));
  document.addEventListener('click', (e) => {
    const a = (e.target as HTMLElement).closest<HTMLAnchorElement>('a[data-p], a[data-r]');
    if (!a || e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return;
    const p = a.dataset.p ? placeById.get(a.dataset.p) : undefined;
    const r = a.dataset.r ? regionById.get(a.dataset.r) : undefined;
    if (!p && !r) return;
    e.preventDefault();
    if (p) select(p, true);
    else showRegion(r!, true);
  });

  // ---- footer ----
  $('#meta').innerHTML = `${data.places.length} 个地点${data.gameVersion ? ` · 游戏版本 ${data.gameVersion}` : ''} · 右键地图添加个人标记<br/>非官方粉丝站，游戏内容 © Lo-Fi Games<br/>作者 <a href="https://x.com/RockChinCN" target="_blank" rel="noopener">Rock Chin（X @RockChinCN）</a>`;

  // ---- deep link: /p/<slug>/, /r/<slug>/ (and the older #p= / #r= links) ----
  if (!search.value) results.innerHTML = directoryHtml(ctx);
  const path = location.pathname.match(/^\/([pr])\/([^/]+)\/?$/);
  const hash = location.hash.match(/^#([pr])=(.+)$/);
  if (path?.[1] === 'p' || hash?.[1] === 'p') {
    const p = data.places.find((x) => (path ? slugOf(x.id) === path[2] : x.id === decodeURIComponent(hash![2])));
    if (p) select(p, true);
  } else if (path?.[1] === 'r' || hash?.[1] === 'r') {
    const r = regions.find((x) => (path ? slugOf(x.id) === path[2] : x.id === decodeURIComponent(hash![2])));
    if (r) showRegion(r, true);
  }
}

main();
