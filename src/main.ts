import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './style.css';
import type { Dataset, MapMeta, Place } from './types';
import { CATEGORIES, categoryOf } from './categories';
import { store } from './store';
import { loadRegions, regionLayers, regionName, type Region } from './regions';
import { installCursors } from './cursors';

/** Used until the extracted game map is available: the world square at a nominal size, no tiles. */
const FALLBACK_MAP: MapMeta = { size: 4096, maxZoom: 4, tileSize: 256, extent: 147456, tileExt: 'webp' };

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const zh = (s?: { en: string; zh?: string }) => esc(s ? s.zh || s.en : '');

async function loadData(): Promise<Dataset> {
  try {
    const res = await fetch('/data/places.json', { cache: 'no-cache' });
    if (res.ok) return (await res.json()) as Dataset;
  } catch {
    /* fall through */
  }
  return { generated: '', map: null, places: [] };
}

function makeMap(meta: MapMeta, hasTiles: boolean) {
  const map = L.map('map', {
    crs: L.CRS.Simple,
    minZoom: 0,
    maxZoom: meta.maxZoom + 2,
    zoomSnap: 0.25,
    attributionControl: true,
  });
  const toLatLng = (x: number, z: number) => {
    const px = ((x + meta.extent) / (2 * meta.extent)) * meta.size;
    const py = ((z + meta.extent) / (2 * meta.extent)) * meta.size;
    return map.unproject([px, py], meta.maxZoom);
  };
  const toWorld = (ll: L.LatLng) => {
    const p = map.project(ll, meta.maxZoom);
    return {
      x: (p.x / meta.size) * 2 * meta.extent - meta.extent,
      z: (p.y / meta.size) * 2 * meta.extent - meta.extent,
    };
  };
  const bounds = L.latLngBounds(map.unproject([0, meta.size], meta.maxZoom), map.unproject([meta.size, 0], meta.maxZoom));
  map.setMaxBounds(bounds.pad(0.2));

  if (hasTiles) {
    L.tileLayer(`/tiles/{z}/{x}/{y}.${meta.tileExt}`, {
      tileSize: meta.tileSize,
      minZoom: 0,
      maxNativeZoom: meta.maxZoom,
      maxZoom: meta.maxZoom + 2,
      noWrap: true,
      bounds,
      attribution: '地图与游戏数据 © Lo-Fi Games · 非官方粉丝站',
    }).addTo(map);
  } else {
    L.rectangle(bounds, { color: '#5a5040', weight: 1, fillColor: '#2a2620', fillOpacity: 1 }).addTo(map);
  }
  map.fitBounds(bounds);
  return { map, toLatLng, toWorld };
}

/** One marker image cropped from the game's Kenshi_MapMarkers imageset; white artwork the game tints. */
interface MarkerImage {
  file: string;
  w: number;
  h: number;
}

/** The in-game map's "Neutral" marker colour (kenshi_colours.xml MarkerNeutral). */
const MARKER_COLOUR = '#dfdfdf';

let iconSet: Record<string, MarkerImage> | null = null;

async function loadIcons(): Promise<Record<string, MarkerImage> | null> {
  try {
    const res = await fetch('/icons/markers.json', { cache: 'no-cache' });
    if (res.ok) iconSet = (await res.json()) as Record<string, MarkerImage>;
  } catch {
    /* dots fallback */
  }
  return iconSet;
}

const maskStyle = (img: MarkerImage, w: number, h: number, colour: string) =>
  `width:${w}px;height:${h}px;background:${colour};-webkit-mask:url(/icons/${img.file}) center/contain no-repeat;mask:url(/icons/${img.file}) center/contain no-repeat`;

function markerIcon(group: string, img: MarkerImage, scale: number) {
  const w = Math.round(img.w * scale);
  const h = Math.round(img.h * scale);
  return L.divIcon({
    className: `mk mk-${group}`,
    html: `<span style="${maskStyle(img, w, h, MARKER_COLOUR)}"></span>`,
    iconSize: [w, h],
    iconAnchor: [w / 2, h / 2],
  });
}

/** A category's swatch: its marker image when available, else its colour dot. */
function swatch(group: string, colour: string) {
  const img = iconSet?.[group];
  if (!img) return `<i style="background:${colour}"></i>`;
  const h = 16;
  const w = Math.round((img.w / img.h) * h);
  return `<b class="sw" style="${maskStyle(img, w, h, MARKER_COLOUR)}"></b>`;
}

async function main() {
  installCursors();
  const [data, regions] = await Promise.all([loadData(), loadRegions()]);
  const regionById = new Map(regions.map((r) => [r.id, r]));
  const meta = data.map ?? FALLBACK_MAP;
  const { map, toLatLng, toWorld } = makeMap(meta, !!data.map);

  if (!data.map || data.places.length === 0) {
    const note = new L.Control({ position: 'topright' });
    note.onAdd = () => {
      const d = L.DomUtil.create('div', 'notice');
      d.textContent = '游戏数据接入中：底图与地点将从 Kenshi 原版文件提取后上线。';
      return d;
    };
    note.addTo(map);
  }

  // ---- regions ----
  const regionLayer = regionLayers(regions, toLatLng, esc, (r) => showRegion(r), (e) => map.fire('contextmenu', e));
  const zoomClass = () => {
    const el = map.getContainer();
    for (const c of [...el.classList]) if (c.startsWith('zl-')) el.classList.remove(c);
    // Like the game's map levels: small markers when zoomed out, region names only while the whole land is in view.
    const z = map.getZoom();
    el.classList.add(z < 2 ? 'zl-0' : z < 3.5 ? 'zl-1' : 'zl-2');
  };
  map.on('zoomend', zoomClass);
  zoomClass();

  // ---- markers ----
  const icons = await loadIcons();
  const layers = new Map<string, L.LayerGroup>();
  const markers = new Map<string, L.Marker | L.CircleMarker>();
  for (const c of CATEGORIES) layers.set(c.key, L.layerGroup());

  const markExplored = (id: string) => {
    const m = markers.get(id);
    const on = store.isExplored(id);
    if (m instanceof L.Marker) m.getElement()?.classList.toggle('explored', on);
    else m?.setStyle({ fillOpacity: on ? 0.45 : 0.95 });
  };

  for (const p of data.places) {
    const cat = categoryOf(p.type);
    if (!cat) continue;
    const icon = icons?.[cat.group];
    const at = toLatLng(p.x, p.z);
    const m = icon
      ? L.marker(at, { icon: markerIcon(cat.group, icon, p.type === 2 ? 1 : 0.85), riseOnHover: true })
      : L.circleMarker(at, { radius: p.type === 2 ? 7 : 5, color: '#111', weight: 1, fillColor: cat.color, fillOpacity: 0.95 });
    const dy = icon ? Math.round((icon.h * (p.type === 2 ? 1 : 0.85)) / 2) + 2 : 6;
    m.bindTooltip(zh(p.name), { direction: 'bottom', offset: [0, dy], className: 'place-label', permanent: p.type === 2 });
    m.on('click', () => select(p));
    m.on('add', () => markExplored(p.id));
    m.addTo(layers.get(cat.key)!);
    markers.set(p.id, m);
  }

  // ---- filters ----
  const filters = $('#filters');
  const hidden = store.hiddenCategories();
  if (regions.length) {
    const label = document.createElement('label');
    label.className = 'filter region-toggle';
    label.innerHTML = `<input type="checkbox" ${hidden.has('regions') ? '' : 'checked'} /><b class="sw-region"></b><span>区域划分</span><em>${regions.length}</em>`;
    const box = label.querySelector('input')!;
    const apply = () => {
      for (const l of [regionLayer.shapes, regionLayer.labels]) box.checked ? l.addTo(map) : l.remove();
      store.setCategoryHidden('regions', !box.checked);
    };
    box.addEventListener('change', apply);
    apply();
    filters.appendChild(label);
  }
  for (const c of CATEGORIES) {
    const count = data.places.filter((p) => c.types.includes(p.type)).length;
    if (!count) continue;
    const label = document.createElement('label');
    label.className = 'filter';
    label.innerHTML = `<input type="checkbox" ${hidden.has(c.key) ? '' : 'checked'} />${swatch(c.group, c.color)}<span>${c.label}</span><em>${count}</em>`;
    const box = label.querySelector('input')!;
    const apply = () => {
      if (box.checked) layers.get(c.key)!.addTo(map);
      else layers.get(c.key)!.remove();
      store.setCategoryHidden(c.key, !box.checked);
    };
    box.addEventListener('change', apply);
    apply();
    filters.appendChild(label);
  }

  // ---- search ----
  const results = $('#results');
  const search = $<HTMLInputElement>('#search');
  const renderResults = () => {
    const q = search.value.trim().toLowerCase();
    results.innerHTML = '';
    if (!q) return;
    const hits = data.places
      .filter((p) => [p.name.en, p.name.zh ?? ''].some((s) => s.toLowerCase().includes(q)))
      .slice(0, 50);
    for (const p of hits) {
      const b = document.createElement('button');
      b.className = 'hit';
      b.innerHTML = `${swatch(categoryOf(p.type)!.group, categoryOf(p.type)!.color)}${zh(p.name)}<small>${p.name.zh ? esc(p.name.en) : ''}</small>`;
      b.onclick = () => select(p, true);
      results.appendChild(b);
    }
    const regionHits = regions.filter((r) => [r.name.en, r.name.zh ?? ''].some((s) => s && s.toLowerCase().includes(q)));
    for (const r of regionHits.slice(0, 10)) {
      const b = document.createElement('button');
      b.className = 'hit';
      b.innerHTML = `<b class="sw-region"></b>${esc(regionName(r))}<small>区域${r.name.zh ? ' · ' + esc(r.name.en) : ''}</small>`;
      b.onclick = () => showRegion(r, true);
      results.prepend(b);
    }
    if (!hits.length && !regionHits.length) results.innerHTML = '<p class="empty">没有匹配的地点</p>';
  };
  search.addEventListener('input', renderResults);

  // ---- detail ----
  const detail = $('#detail');
  function select(p: Place, fly = false) {
    const cat = categoryOf(p.type);
    if (fly) map.flyTo(toLatLng(p.x, p.z), Math.max(map.getZoom(), meta.maxZoom - 1));
    history.replaceState(null, '', `#p=${encodeURIComponent(p.id)}`);
    const explored = store.isExplored(p.id);
    detail.hidden = false;
    detail.innerHTML = `
      <button class="close" aria-label="关闭">×</button>
      <h2>${zh(p.name)}</h2>
      ${p.name.zh ? `<p class="en">${esc(p.name.en)}</p>` : ''}
      <p class="tags"><span style="border-color:${cat?.color}">${cat?.label ?? '未知'}</span>${p.faction ? `<span>${zh(p.faction)}</span>` : ''}${p.region && regionById.get(p.region) ? `<a class="region-link" href="#">${esc(regionName(regionById.get(p.region)!))}</a>` : ''}</p>
      ${p.desc ? `<p class="desc">${zh(p.desc)}</p>` : ''}
      <p class="coord">坐标 X ${Math.round(p.x)} · Z ${Math.round(p.z)}</p>
      <div class="actions">
        <button class="explore">${explored ? '✓ 已探索' : '标记为已探索'}</button>
        <button class="share">复制链接</button>
      </div>`;
    detail.querySelector<HTMLButtonElement>('.close')!.onclick = () => {
      detail.hidden = true;
      history.replaceState(null, '', location.pathname);
    };
    detail.querySelector<HTMLAnchorElement>('.region-link')?.addEventListener('click', (e) => {
      e.preventDefault();
      showRegion(regionById.get(p.region!)!, true);
    });
    detail.querySelector<HTMLButtonElement>('.explore')!.onclick = () => {
      store.setExplored(p.id, !store.isExplored(p.id));
      markExplored(p.id);
      select(p);
    };
    detail.querySelector<HTMLButtonElement>('.share')!.onclick = (e) => {
      navigator.clipboard?.writeText(location.href);
      (e.target as HTMLButtonElement).textContent = '已复制';
    };
  }

  // ---- personal markers (right click / long press) ----
  const mine = L.layerGroup().addTo(map);
  const drawMine = () => {
    mine.clearLayers();
    for (const m of store.customMarkers()) {
      L.marker(toLatLng(m.x, m.z), { icon: L.divIcon({ className: 'mine', html: '★', iconSize: [18, 18] }) })
        .bindTooltip(esc(m.label))
        .on('contextmenu', () => {
          if (confirm(`删除标记「${m.label}」？`)) {
            store.removeCustomMarker(m.id);
            drawMine();
          }
        })
        .addTo(mine);
    }
  };
  map.on('contextmenu', (e: L.LeafletMouseEvent) => {
    const label = prompt('添加个人标记（仅保存在本浏览器）：');
    if (!label) return;
    store.addCustomMarker({ ...toWorld(e.latlng), label });
    drawMine();
  });
  drawMine();

  function showRegion(r: Region, fly = false) {
    if (fly) {
      const pts = r.polygons.flat(2).map(([x, z]) => toLatLng(x, z));
      map.flyToBounds(L.latLngBounds(pts), { padding: [40, 40] });
    }
    history.replaceState(null, '', `#r=${encodeURIComponent(r.id)}`);
    const inside = data.places.filter((p) => p.region === r.id).sort((a, b) => a.type - b.type);
    detail.hidden = false;
    detail.innerHTML = `
      <button class="close" aria-label="关闭">×</button>
      <h2>${esc(regionName(r))}</h2>
      ${r.name.zh && r.name.en ? `<p class="en">${esc(r.name.en)}</p>` : ''}
      <p class="tags"><span>区域</span><span>${inside.length} 个地点</span></p>
      <div class="region-places"></div>`;
    const list = detail.querySelector('.region-places')!;
    for (const p of inside) {
      const cat = categoryOf(p.type)!;
      const b = document.createElement('button');
      b.className = 'hit';
      b.innerHTML = `${swatch(cat.group, cat.color)}${zh(p.name)}<small>${cat.label}</small>`;
      b.onclick = () => select(p, true);
      list.appendChild(b);
    }
    detail.querySelector<HTMLButtonElement>('.close')!.onclick = () => {
      detail.hidden = true;
      history.replaceState(null, '', location.pathname);
    };
  }

  // ---- footer ----
  $('#meta').innerHTML = `${data.places.length} 个地点${data.gameVersion ? ` · 游戏版本 ${data.gameVersion}` : ''} · 右键地图添加个人标记<br/>非官方粉丝站，游戏内容 © Lo-Fi Games`;

  // ---- deep link ----
  const rm = location.hash.match(/^#r=(.+)$/);
  if (rm && regionById.get(decodeURIComponent(rm[1]))) showRegion(regionById.get(decodeURIComponent(rm[1]))!, true);
  const m = location.hash.match(/^#p=(.+)$/);
  if (m) {
    const p = data.places.find((x) => x.id === decodeURIComponent(m[1]));
    if (p) select(p, true);
  }
}

main();
