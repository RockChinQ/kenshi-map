/**
 * Faction emblems for the region card. Kenshi itself has no faction insignia, so each faction gets a shield in its
 * own colour with a glyph for what kind of group it is. Pure strings: also used by the static prerender.
 */
export interface RegionFaction {
  en: string;
  zh: string;
  kind: string;
  color: string;
  /** Places it holds in the region. */
  places?: number;
  /** Its squads roam the region. */
  roam?: boolean;
}

/** 24x24 line glyphs, drawn with the faction colour. */
const GLYPHS: Record<string, string> = {
  nation: '<path d="M7 15.5h10M7 15.5l-1-6 3.5 2.5L12 7.5l2.5 4.5L18 9.5l-1 6"/>',
  holy: '<circle cx="12" cy="11.5" r="2.5"/><path d="M12 6v1.7M12 15.3V17M6.5 11.5h1.7M15.8 11.5h1.7M8.1 7.6l1.2 1.2M14.7 14.2l1.2 1.2M15.9 7.6l-1.2 1.2M9.3 14.2l-1.2 1.2"/>',
  civil: '<path d="M7 11.5l5-4.5 5 4.5M8.5 10.5v6h7v-6"/>',
  trade: '<circle cx="12" cy="11.5" r="4.8"/><path d="M10.3 9.8h3.4v3.4h-3.4z"/>',
  slaver: '<circle cx="9.4" cy="11.5" r="2.7"/><circle cx="14.6" cy="11.5" r="2.7"/>',
  tech: '<circle cx="12" cy="11.5" r="4.3"/><path d="M12 5.6v3M12 14.4v3M6.1 11.5h3M14.9 11.5h3"/>',
  rebel: '<path d="M8.5 6v11.5M8.5 7h7.5l-2 2.7 2 2.8H8.5"/>',
  ninja: '<path d="M12 5.5l1.6 4.4 4.4 1.6-4.4 1.6L12 17.5l-1.6-4.4L6 11.5l4.4-1.6z"/>',
  hive: '<path d="M12 6.3l4.5 2.6v5.2L12 16.7l-4.5-2.6V8.9z"/><path d="M12 10.2l1.2.7v1.4l-1.2.7-1.2-.7v-1.4z"/>',
  machine: '<circle cx="12" cy="11.5" r="1.8"/><circle cx="12" cy="11.5" r="4.4" stroke-width="2.2" stroke-dasharray="2.3 1.15"/>',
  bandit: '<path d="M7.5 6.8l9 9.4M16.5 6.8l-9 9.4M7 13.6l2.8 2.8M17 13.6l-2.8 2.8"/>',
  merc: '<path d="M12 5.8v8.4M9.3 14.2h5.4M12 14.2v3.3"/>',
  cannibal: '<path d="M7 8.3h10M8 8.3l1.5 6.5 1.5-6.5M13 8.3l1.5 6.5 1.5-6.5"/>',
  cult: '<path d="M14.6 6.6a5.2 5.2 0 1 0 0 9.8 4.3 4.3 0 0 1 0-9.8z"/>',
  beast: '<path d="M8.2 7c0 4 .5 7 2 9.5M12 6.5c0 4 .3 7 1 10M15.8 7c0 4-.3 6.5-1 9"/>',
  nomad: '<path d="M6.5 16.5L12 6.5l5.5 10zM12 16.5v-3.8"/>',
};

export function emblem(f: Pick<RegionFaction, 'kind' | 'color'>, size = 22) {
  const c = /^#[0-9a-f]{6}$/i.test(f.color) ? f.color : '#b4b4b4';
  return (
    `<svg class="emblem" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true">` +
    `<path d="M12 1.8l8.5 3v6.9c0 5-3.6 8.4-8.5 10.5-4.9-2.1-8.5-5.5-8.5-10.5V4.8z" fill="${c}" fill-opacity=".16" stroke="${c}" stroke-width="1.3" stroke-linejoin="round"/>` +
    `<g fill="none" stroke="${c}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${GLYPHS[f.kind] ?? GLYPHS.bandit}</g></svg>`
  );
}
