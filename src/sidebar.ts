/**
 * The side panel: drag its right edge to resize (220–600 px, double-click resets), collapse/expand with the « / » buttons.
 * Both are remembered per browser; `onChange` lets the map refit its canvas.
 */
const KEY = 'kenshi-map:sidebar';
const MIN = 220;
const MAX = 600;
const DEFAULT = 300;

export function installSidebar(onChange: () => void) {
  const panel = document.getElementById('panel')!;
  const resizer = document.getElementById('resizer')!;
  const collapse = document.getElementById('collapse')!;
  const expand = document.getElementById('expand')!;
  const saved = (() => {
    try {
      return JSON.parse(localStorage.getItem(KEY) || '{}') as { width?: number; collapsed?: boolean };
    } catch {
      return {};
    }
  })();
  let width = Math.min(MAX, Math.max(MIN, saved.width ?? DEFAULT));
  let collapsed = !!saved.collapsed;

  const apply = () => {
    document.documentElement.style.setProperty('--panel-w', `${width}px`);
    document.body.classList.toggle('panel-collapsed', collapsed);
    expand.hidden = !collapsed;
    localStorage.setItem(KEY, JSON.stringify({ width, collapsed }));
    onChange();
  };

  collapse.addEventListener('click', () => {
    collapsed = true;
    apply();
  });
  expand.addEventListener('click', () => {
    collapsed = false;
    apply();
  });

  resizer.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    resizer.setPointerCapture(e.pointerId);
    document.body.classList.add('resizing');
    const left = panel.getBoundingClientRect().left;
    const move = (ev: PointerEvent) => {
      width = Math.min(MAX, Math.max(MIN, Math.round(ev.clientX - left)));
      document.documentElement.style.setProperty('--panel-w', `${width}px`);
      onChange();
    };
    const up = () => {
      resizer.removeEventListener('pointermove', move);
      document.body.classList.remove('resizing');
      apply();
    };
    resizer.addEventListener('pointermove', move);
    resizer.addEventListener('pointerup', up, { once: true });
    resizer.addEventListener('pointercancel', up, { once: true });
  });
  resizer.addEventListener('dblclick', () => {
    width = DEFAULT;
    apply();
  });

  apply();
}
