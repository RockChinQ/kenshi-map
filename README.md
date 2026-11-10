# Kenshi 中文互动地图

https://kenshi.rcpd.cc — Vite + OpenLayers static site on Cloudflare Pages (project `kenshi-map`).

## Data pipeline

Game files are never committed (`raw/` is git-ignored). Extraction runs on a machine with Kenshi installed
(Windows Local Dev, using MeitouClient's `Meitou.Data` readers), producing:

- `raw/GUI_Map.png` — the in-game world map `GUI_Map.dds`. Projection (MeitouClient `docs/game/ui-screens.md#map`):
  the image spans world X and Z −147456…147456, (0,0) at the centre, +X right, **+Z down**.
- `raw/towns.raw.json` — every placed TOWN (merged leveldata layers) with type, position, EN names and
  zh_CN names from `locale/zh_CN/zh_CN.translation`. Schema: `scripts/build_data.py` docstring.

Build:

```sh
python3 scripts/make_tiles.py raw/GUI_Map.png public/tiles | tail -1 > raw/map-meta.json
python3 scripts/build_data.py raw/towns.raw.json raw/map-meta.json
# regions (needs the venv: uv venv .venv && uv pip install --python .venv/bin/python opencv-python-headless numpy pillow)
.venv/bin/python scripts/build_regions.py raw/areasmap.png --names raw/regions.raw.json
# 灰机 wiki links: page titles via a real browser (Cloudflare challenge), then tag (run after build_regions)
# xvfb-run node tools/huiji/dump-titles.mjs  (needs playwright + /usr/bin/chromium; writes huiji-titles.json)
python3 scripts/add_wiki.py raw/huiji-titles.json
# icons/pointers from ROC-9: copy markers/* to public/icons/, cursors/* to public/cursors/
npm run deploy   # needs CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID
```

`public/tiles/` is generated and git-ignored.

Map and game content © Lo-Fi Games. Unofficial fan site.
