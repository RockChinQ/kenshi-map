/** TOWN record `type` values (see MeitouClient TownType) grouped the way the in-game map does. */
export interface Category {
  key: string;
  label: string;
  types: number[];
  color: string;
}

export const CATEGORIES: Category[] = [
  { key: 'town', label: '城镇', types: [2], color: '#e0b84f' },
  { key: 'village', label: '村庄', types: [3], color: '#9fcf6a' },
  { key: 'outpost', label: '前哨 / 军营 / 监狱', types: [1, 6, 7], color: '#e6703f' },
  { key: 'workcamp', label: '奴隶营', types: [5], color: '#c0504d' },
  { key: 'ruin', label: '遗迹', types: [4], color: '#8fa9c9' },
  { key: 'poi', label: '兴趣点', types: [9], color: '#c9a0dc' },
  { key: 'nest', label: '巢穴 / 营地', types: [0], color: '#888888' },
];

export function categoryOf(type: number): Category | undefined {
  return CATEGORIES.find((c) => c.types.includes(type));
}
