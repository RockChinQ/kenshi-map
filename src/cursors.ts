/** The game's mouse pointers (data/gui/pointer/kenshi_pointers.xml): image, size and hot spot. */
interface Pointer {
  file: string;
  w: number;
  h: number;
  x: number;
  y: number;
}

/** Installs the game's `arrow` pointer everywhere and its `hand` while panning the map, when the export is present. */
export async function installCursors() {
  let set: Record<string, Pointer>;
  try {
    const res = await fetch('/cursors/cursors.json', { cache: 'no-cache' });
    if (!res.ok) return;
    set = await res.json();
  } catch {
    return;
  }
  const css = (name: string, fallback: string) => {
    const p = set[name];
    return p ? `url(/cursors/${p.file}) ${p.x} ${p.y}, ${fallback}` : fallback;
  };
  const style = document.createElement('style');
  style.textContent = `
    html, body, button, label, a, input[type=checkbox], .hit, #map, .ol-viewport, .ol-viewport canvas { cursor: ${css('arrow', 'default')} !important; }
    input[type=search] { cursor: ${css('text', 'text')} !important; }
    #map.dragging, #map.dragging .ol-viewport, #map.dragging canvas { cursor: ${css('hand', 'grabbing')} !important; }
  `;
  document.head.appendChild(style);
}
