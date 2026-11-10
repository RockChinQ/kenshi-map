import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './style.css';
import type { Dataset, MapMeta, Place } from './types';
import { CATEGORIES, categoryOf } from './categories';
import { store } from './store';

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

async function main() {
  const data = await loadData();
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

  // ---- markers ----
  const layers = new Map<string, L.LayerGroup>();
  const markers = new Map<string, L.CircleMarker>();
  for (const c of CATEGORIES) layers.set(c.key, L.layerGroup());

  for (const p of data.places) {
    const cat = categoryOf(p.type);
    if (!cat) continue;
    const m = L.circleMarker(toLatLng(p.x, p.z), {
      radius: p.type === 2 ? 7 : 5,
      color: '#111',
      weight: 1,
      fillColor: cat.color,
      fillOpacity: store.isExplored(p.id) ? 0.45 : 0.95,
    });
    m.bindTooltip(zh(p.name), { direction: 'top', offset: [0, -6], className: 'place-label', permanent: p.type === 2 });
    m.on('click', () => select(p));
    m.addTo(layers.get(cat.key)!);
    markers.set(p.id, m);
  }

  // ---- filters ----
  const filters = $('#filters');
  const hidden = store.hiddenCategories();
  for (const c of CATEGORIES) {
    const count = data.places.filter((p) => c.types.includes(p.type)).length;
    if (!count) continue;
    const label = document.createElement('label');
    label.className = 'filter';
    label.innerHTML = `<input type="checkbox" ${hidden.has(c.key) ? '' : 'checked'} /><i style="background:${c.color}"></i><span>${c.label}</span><em>${count}</em>`;
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
      b.innerHTML = `<i style="background:${categoryOf(p.type)?.color}"></i>${zh(p.name)}<small>${p.name.zh ? esc(p.name.en) : ''}</small>`;
      b.onclick = () => select(p, true);
      results.appendChild(b);
    }
    if (!hits.length) results.innerHTML = '<p class="empty">没有匹配的地点</p>';
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
      <p class="tags"><span style="border-color:${cat?.color}">${cat?.label ?? '未知'}</span>${p.faction ? `<span>${zh(p.faction)}</span>` : ''}</p>
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
    detail.querySelector<HTMLButtonElement>('.explore')!.onclick = () => {
      store.setExplored(p.id, !store.isExplored(p.id));
      markers.get(p.id)?.setStyle({ fillOpacity: store.isExplored(p.id) ? 0.45 : 0.95 });
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

  // ---- footer ----
  $('#meta').innerHTML = `${data.places.length} 个地点${data.gameVersion ? ` · 游戏版本 ${data.gameVersion}` : ''} · 右键地图添加个人标记<br/>非官方粉丝站，游戏内容 © Lo-Fi Games`;

  // ---- deep link ----
  const m = location.hash.match(/^#p=(.+)$/);
  if (m) {
    const p = data.places.find((x) => x.id === decodeURIComponent(m[1]));
    if (p) select(p, true);
  }
}

main();
