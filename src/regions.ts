import Feature from 'ol/Feature';
import MultiPolygon from 'ol/geom/MultiPolygon';
import Point from 'ol/geom/Point';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import { Fill, Stroke, Style, Text } from 'ol/style';
import { asArray } from 'ol/color';
import type { I18n } from './types';
import { toMap } from './olmap';

export interface Region {
  id: string;
  colour: string;
  name: I18n;
  /** World [x, z] of the label: the interior point farthest from the border. */
  label: [number, number];
  /** Multipolygon: polygons of rings (outer, then holes) of world [x, z]. */
  polygons: [number, number][][][];
  /** Acidic ground / water in this region (BIOME_GROUP acidic ground / acidic water). */
  acid?: ('ground' | 'water')[];
  /** Page title on kenshi.huijiwiki.com, when one exists. */
  wiki?: string;
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

const FONT = '600 13px system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';

function tint(hex: string, alpha: number) {
  const [r, g, b] = asArray(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

/**
 * The region fills and borders (one layer) and their names (another, shown only while zoomed out).
 * `hovered()` names the region under the pointer, drawn stronger.
 */
export function regionLayers(regions: Region[], hovered: () => string | null, showLabels: (resolution: number) => boolean) {
  const shapes = new VectorSource();
  const labels = new VectorSource();
  const styles = new globalThis.Map<string, { base: Style; hot: Style }>();

  for (const r of regions) {
    const geom = new MultiPolygon(r.polygons.map((poly) => poly.map((ring) => ring.map(([x, z]) => toMap(x, z)))));
    const f = new Feature({ geometry: geom });
    f.setId(r.id);
    f.set('region', r);
    shapes.addFeature(f);

    const l = new Feature({ geometry: new Point(toMap(...r.label)) });
    l.set('region', r);
    labels.addFeature(l);

    styles.set(r.id, {
      base: new Style({ fill: new Fill({ color: tint(r.colour, 0.1) }), stroke: new Stroke({ color: 'rgba(241,226,191,0.55)', width: 1.2 }) }),
      hot: new Style({ fill: new Fill({ color: tint(r.colour, 0.28) }), stroke: new Stroke({ color: 'rgba(241,226,191,0.95)', width: 1.6 }) }),
    });
  }

  const shapeLayer = new VectorLayer({
    source: shapes,
    updateWhileAnimating: true,
    updateWhileInteracting: true,
    style: (f) => {
      const s = styles.get(f.getId() as string)!;
      return hovered() === f.getId() ? s.hot : s.base;
    },
  });

  const labelLayer = new VectorLayer({
    source: labels,
    declutter: true,
    updateWhileAnimating: true,
    updateWhileInteracting: true,
    style: (f, resolution) => {
      if (!showLabels(resolution)) return undefined;
      return new Style({
        text: new Text({
          text: regionName(f.get('region') as Region),
          font: FONT,
          fill: new Fill({ color: '#f6ead0' }),
          stroke: new Stroke({ color: 'rgba(0,0,0,0.85)', width: 3 }),
          overflow: true,
        }),
      });
    },
  });

  return { shapeLayer, labelLayer };
}
