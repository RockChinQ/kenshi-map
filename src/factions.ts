/** A faction as listed on a region card (scripts/add_region_info.py). Pure strings: also used by the static prerender. */
export interface RegionFaction {
  en: string;
  zh: string;
  /** Picture in /factions/<img>.webp: the faction's in-game banner, or a screenshot of its members (Kenshi wiki). */
  img?: string;
  /** Places it holds in the region. */
  places?: number;
  /** Its squads roam the region. */
  roam?: boolean;
}

export function factionIcon(f: RegionFaction, size: number) {
  return f.img && /^[a-z0-9-]+$/.test(f.img)
    ? `<img class="fac-icon" src="/factions/${f.img}.webp" width="${size}" height="${size}" alt="" loading="lazy" />`
    : `<i class="fac-icon none" style="width:${size}px;height:${size}px"></i>`;
}
