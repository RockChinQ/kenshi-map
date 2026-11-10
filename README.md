# Kenshi 中文互动地图 · Kenshi Interactive Map (Chinese)

**https://kenshi.rcpd.cc** — 剑士（Kenshi）原版世界地图：261 个城镇 / 哨站 / 遗迹 / 兴趣点、70 个区域划分、161 个主要角色出现地点和 32 把铭物（铭刃）武器的位置，官方简中地名，灰机 wiki 跳转。

An unofficial, non-commercial fan map of Kenshi with the game's own world map, marker icons, regions and official Simplified Chinese names.
Game data is extracted with the readers of [MeitouClient](https://github.com/VlcekM/MeitouClient).

作者 Rock Chin（[X @RockChinCN](https://x.com/RockChinCN)）· 代码 MIT 许可，游戏内容 © Lo-Fi Games（见 [LICENSE](LICENSE) 与 [NOTICE](NOTICE)）。

## Development

```sh
npm install
npm run dev
```

The map tiles, marker images and pointers are game images and are not in the repo; without them the site falls back to
plain dots on an empty map. See the pipeline below to generate them from your own copy of Kenshi.

## Stack

Vite + OpenLayers static site on Cloudflare Pages (project `kenshi-map`).

## Data pipeline

Game files are never committed (`raw/` is git-ignored). Extraction runs on a machine with Kenshi installed
(a Windows machine with Kenshi, using MeitouClient's `Meitou.Data` readers), producing:

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
# unique characters + Meitou carriers (raw/uniques.raw.json + raw/meitou.raw.json from the extractor; needs raw/huiji-titles.json)
python3 scripts/build_extras.py raw/uniques.raw.json raw/meitou.raw.json raw/huiji-titles.json
# 灰机 wiki links: page titles via a real browser (Cloudflare challenge), then tag (run after build_regions)
# xvfb-run node tools/huiji/dump-titles.mjs  (needs playwright + /usr/bin/chromium; writes huiji-titles.json)
python3 scripts/add_wiki.py raw/huiji-titles.json
# marker images and pointers exported from the game UI atlases: copy markers/* to public/icons/, cursors/* to public/cursors/
# build also prerenders /p/<slug>/ and /r/<slug>/ pages, sitemap.xml, robots.txt, 404.html (scripts/prerender.ts)
# og.jpg: 1200x630 screenshot of the home page (git-ignored, regenerate with Playwright if the look changes)
npm run deploy   # build + Pages deploy + IndexNow ping; needs CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID
```

`public/tiles/` is generated and git-ignored.

Map and game content © Lo-Fi Games. Unofficial fan site.
