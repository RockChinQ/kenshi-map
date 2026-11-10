import Map from 'ol/Map';
import View from 'ol/View';
import TileLayer from 'ol/layer/Tile';
import XYZ from 'ol/source/XYZ';
import TileGrid from 'ol/tilegrid/TileGrid';
import Projection from 'ol/proj/Projection';
import { defaults as defaultInteractions } from 'ol/interaction/defaults';
import MouseWheelZoom from 'ol/interaction/MouseWheelZoom';
import { defaults as defaultControls } from 'ol/control/defaults';
import type { MapMeta } from './types';

/**
 * Map coordinates are game world units: [x, -z] (OpenLayers' y grows up, the game's +Z runs down the map image).
 * The image spans world X/Z -extent..extent with (0,0) at its centre (MeitouClient docs/game/ui-screens.md#map).
 */
export const toMap = (x: number, z: number): [number, number] => [x, -z];
export const toWorld = ([mx, my]: number[]) => ({ x: mx, z: -my });

/** Above this resolution (world units per screen pixel) the game's map level 0 applies, above the next level 1, else 2. */
export function mapLevel(resolution: number, meta: MapMeta) {
  const native = (2 * meta.extent) / meta.size;
  if (resolution > native * 6) return 0;
  if (resolution > native * 3) return 1;
  return 2;
}

export function createMap(target: string, meta: MapMeta) {
  const e = meta.extent;
  const extent = [-e, -e, e, e];
  const projection = new Projection({ code: 'kenshi-world', units: 'pixels', extent });
  const top = (2 * e) / meta.tileSize;
  const resolutions = Array.from({ length: meta.maxZoom + 1 }, (_, z) => top / 2 ** z);

  const tiles = new TileLayer({
    preload: 2,
    source: new XYZ({
      projection,
      tileGrid: new TileGrid({ extent, origin: [-e, e], resolutions, tileSize: meta.tileSize }),
      url: `/tiles/{z}/{x}/{y}.${meta.tileExt}`,
      wrapX: false,
      transition: 200,
      attributions: '地图与游戏数据 © Lo-Fi Games · 非官方粉丝站',
    }),
  });

  const view = new View({
    projection,
    center: [0, 0],
    // Continuous zoom from a little beyond the whole map to 4x the native image.
    maxResolution: top * 1.5,
    minResolution: resolutions[resolutions.length - 1] / 4,
    constrainResolution: false,
    smoothResolutionConstraint: true,
    extent: [-e * 1.2, -e * 1.2, e * 1.2, e * 1.2],
    constrainOnlyCenter: true,
    enableRotation: false,
  });

  const map = new Map({
    target,
    layers: [tiles],
    view,
    controls: defaultControls({ rotate: false, attributionOptions: { collapsible: false } }),
    interactions: defaultInteractions({ mouseWheelZoom: false, altShiftDragRotate: false, pinchRotate: false }).extend([
      new MouseWheelZoom({ duration: 320, timeout: 40, constrainResolution: false }),
    ]),
  });
  view.fit(extent, { size: map.getSize(), padding: [20, 20, 20, 20] });
  return { map, view };
}
