import L from 'leaflet';
import type { I18n } from './types';

export interface Region {
  id: string;
  colour: string;
  name: I18n;
  /** World [x, z] of the label: the interior point farthest from the border. */
  label: [number, number];
  /** Multipolygon: polygons of rings (outer, then holes) of world [x, z]. */
  polygons: [number, number][][][];
}

export async function loadRegions(): Promise<Region[]> {
  try {
    const res = await fetch('/data/regions.json', { cache: 'no-cache' });
    if (res.ok) return ((await res.json()) as { regions: Region[] }).regions;
  } catch {
    /* no regions */
  }
  return [];
}

export const regionName = (r: Region) => r.name.zh || r.name.en || '未命名区域';

const BASE = { color: '#f1e2bf', weight: 1.2, opacity: 0.55, fillOpacity: 0.1 };

/** The region fills/borders and their name labels, as two groups the caller adds to the map. */
export function regionLayers(
  regions: Region[],
  toLatLng: (x: number, z: number) => L.LatLng,
  esc: (s: string) => string,
  onPick: (r: Region) => void,
  onContext: (e: L.LeafletMouseEvent) => void,
) {
  const shapes = L.layerGroup();
  const labels = L.layerGroup();
  for (const r of regions) {
    const latlngs = r.polygons.map((poly) => poly.map((ring) => ring.map(([x, z]) => toLatLng(x, z))));
    const shape = L.polygon(latlngs, { ...BASE, fillColor: r.colour, bubblingMouseEvents: false, className: 'region' });
    shape.on('mouseover', () => shape.setStyle({ fillOpacity: 0.28, opacity: 0.9 }));
    shape.on('mouseout', () => shape.setStyle({ fillOpacity: BASE.fillOpacity, opacity: BASE.opacity }));
    shape.on('click', () => onPick(r));
    shape.on('contextmenu', onContext);
    shape.addTo(shapes);
    L.marker(toLatLng(...r.label), {
      icon: L.divIcon({ className: 'region-label', html: `<span>${esc(regionName(r))}</span>`, iconSize: [0, 0] }),
      interactive: false,
      keyboard: false,
    }).addTo(labels);
  }
  return { shapes, labels };
}
