/** Per-browser state kept in localStorage. */
const KEY = 'kenshi-map:v1';

interface CustomMarker {
  id: string;
  x: number;
  z: number;
  label: string;
}

interface State {
  explored: string[];
  hidden: string[];
  custom: CustomMarker[];
}

function read(): State {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || '{}');
    return { explored: s.explored ?? [], hidden: s.hidden ?? [], custom: s.custom ?? [] };
  } catch {
    return { explored: [], hidden: [], custom: [] };
  }
}

const state = read();
const save = () => localStorage.setItem(KEY, JSON.stringify(state));

export const store = {
  isExplored: (id: string) => state.explored.includes(id),
  setExplored(id: string, on: boolean) {
    state.explored = state.explored.filter((x) => x !== id);
    if (on) state.explored.push(id);
    save();
  },
  hiddenCategories: () => new Set(state.hidden),
  setCategoryHidden(key: string, hidden: boolean) {
    state.hidden = state.hidden.filter((x) => x !== key);
    if (hidden) state.hidden.push(key);
    save();
  },
  customMarkers: () => state.custom,
  addCustomMarker(m: Omit<CustomMarker, 'id'>) {
    state.custom.push({ ...m, id: Math.random().toString(36).slice(2) });
    save();
  },
  removeCustomMarker(id: string) {
    state.custom = state.custom.filter((m) => m.id !== id);
    save();
  },
};
