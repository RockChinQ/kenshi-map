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

const FALLBACK_MAP: MapMeta = { size: 8192, maxZoom: 5, tileSize: 256, extent: 147456, tileExt: 'webp' };

const WIKI = 'https://kenshi.huijiwiki.com/wiki/';

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const plain = (s?: { en: string; zh?: string }) => (s ? s.zh || s.en : '');

const zh = (s?: { en: string; zh?: string }) => esc(plain(s));

const wikiLink = (title?: string) =>
  title ? `<a class="wiki" href="${WIKI}${encodeURIComponent(title)}" target="_blank" rel="noopener">灰机 wiki ↗</a>` : '';

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
    if (!q) return;
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

  // ---- detail card ----
  const detail = $('#detail');
  const closeDetail = () => {
    detail.hidden = true;
    history.replaceState(null, '', location.pathname);
  };

  function select(p: Place, fly = false) {
    const cat = categoryOf(p.type);
    if (fly) {
      const close = (2 * meta.extent) / meta.size; // native image resolution
      view.animate({ center: toMap(p.x, p.z), resolution: Math.min(view.getResolution() ?? close, close), duration: 700 });
    }
    history.replaceState(null, '', `#p=${encodeURIComponent(p.id)}`);
    const region = p.region ? regionById.get(p.region) : undefined;
    detail.hidden = false;
    detail.innerHTML = `
      <button class="close" aria-label="关闭">×</button>
      <h2>${zh(p.name)}</h2>
      ${p.name.zh ? `<p class="en">${esc(p.name.en)}</p>` : ''}
      <p class="tags"><span style="border-color:${cat?.color}">${cat?.label ?? '未知'}</span>${p.faction ? `<span>${zh(p.faction)}</span>` : ''}${region ? `<a class="region-link" href="#">${esc(regionName(region))}</a>` : ''}</p>
      ${wikiLink(p.wiki)}
      ${p.desc ? `<p class="desc">${zh(p.desc)}</p>` : ''}
      <p class="coord">坐标 X ${Math.round(p.x)} · Z ${Math.round(p.z)}</p>
      <div class="actions">
        <button class="explore">${store.isExplored(p.id) ? '✓ 已探索' : '标记为已探索'}</button>
        <button class="share">复制链接</button>
      </div>`;
    detail.querySelector<HTMLButtonElement>('.close')!.onclick = closeDetail;
    detail.querySelector<HTMLAnchorElement>('.region-link')?.addEventListener('click', (e) => {
      e.preventDefault();
      showRegion(region!, true);
    });
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
    history.replaceState(null, '', `#r=${encodeURIComponent(r.id)}`);
    const inside = data.places.filter((p) => p.region === r.id).sort((a, b) => a.type - b.type);
    detail.hidden = false;
    detail.innerHTML = `
      <button class="close" aria-label="关闭">×</button>
      <h2>${esc(regionName(r))}</h2>
      ${r.name.zh && r.name.en ? `<p class="en">${esc(r.name.en)}</p>` : ''}
      <p class="tags"><span>区域</span><span>${inside.length} 个地点</span>${r.acid?.includes('ground') ? '<span class="acid">酸性地面</span>' : ''}${r.acid?.includes('water') ? '<span class="acid">酸性水域</span>' : ''}</p>
      ${wikiLink(r.wiki)}
      <div class="region-places"></div>`;
    const list = detail.querySelector('.region-places')!;
    for (const p of inside) {
      const cat = categoryOf(p.type)!;
      list.appendChild(hitButton(`${swatch(cat)}${zh(p.name)}<small>${cat.label}</small>`, () => select(p, true)));
    }
    detail.querySelector<HTMLButtonElement>('.close')!.onclick = closeDetail;
  }

  // ---- footer ----
  $('#meta').innerHTML = `${data.places.length} 个地点${data.gameVersion ? ` · 游戏版本 ${data.gameVersion}` : ''} · 右键地图添加个人标记<br/>非官方粉丝站，游戏内容 © Lo-Fi Games<br/>作者 <a href="https://x.com/RockChinCN" target="_blank" rel="noopener">Rock Chin（X @RockChinCN）</a>`;

  // ---- deep link ----
  const rm = location.hash.match(/^#r=(.+)$/);
  const linkedRegion = rm ? regionById.get(decodeURIComponent(rm[1])) : undefined;
  if (linkedRegion) showRegion(linkedRegion, true);
  const pm = location.hash.match(/^#p=(.+)$/);
  const linkedPlace = pm ? data.places.find((x) => x.id === decodeURIComponent(pm[1])) : undefined;
  if (linkedPlace) select(linkedPlace, true);
}

main();
