#!/usr/bin/env python3
"""Slice the full world map image (e.g. GUI_Map.dds exported to PNG) into Leaflet CRS.Simple tiles.

usage: make_tiles.py <map.png> <out_dir> [--tile 256] [--ext webp]
Writes <out_dir>/{z}/{x}/{y}.<ext>, z=0 is the whole map in one tile, and prints the map meta for places.json.
"""
import argparse, json, math, os
from PIL import Image

Image.MAX_IMAGE_PIXELS = None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('src'); ap.add_argument('out')
    ap.add_argument('--tile', type=int, default=256); ap.add_argument('--ext', default='webp')
    a = ap.parse_args()

    img = Image.open(a.src).convert('RGB')
    size = max(img.size)
    max_zoom = math.ceil(math.log2(size / a.tile))
    full = a.tile * 2 ** max_zoom
    if img.size != (full, full):
        img = img.resize((full, full), Image.LANCZOS)

    for z in range(max_zoom, -1, -1):
        level = img if z == max_zoom else img.resize((a.tile * 2 ** z,) * 2, Image.LANCZOS)
        n = 2 ** z
        for x in range(n):
            os.makedirs(f'{a.out}/{z}/{x}', exist_ok=True)
            for y in range(n):
                t = level.crop((x * a.tile, y * a.tile, (x + 1) * a.tile, (y + 1) * a.tile))
                t.save(f'{a.out}/{z}/{x}/{y}.{a.ext}', quality=82, method=6)
        print(f'zoom {z}: {n * n} tiles', flush=True)

    print(json.dumps({'size': full, 'maxZoom': max_zoom, 'tileSize': a.tile, 'extent': 147456, 'tileExt': a.ext}))


if __name__ == '__main__':
    main()
