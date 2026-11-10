export type I18n = { en: string; zh?: string };

export interface Place {
  id: string;
  type: number;
  name: I18n;
  faction?: I18n;
  x: number;
  z: number;
  desc?: I18n;
}

export interface MapMeta {
  /** Full-resolution image size in pixels (square). */
  size: number;
  /** Highest tile zoom; at this zoom one image pixel is one screen pixel. */
  maxZoom: number;
  tileSize: number;
  /** Half the world width in game units; world (0,0) is the image centre, +X right, +Z down. */
  extent: number;
  tileExt: string;
}

export interface Dataset {
  generated: string;
  gameVersion?: string;
  map: MapMeta | null;
  places: Place[];
}
