#!/usr/bin/env python3
"""Vectorise the game's region map (areasmap, one flat colour per BIOME_GROUP) into region polygons.

usage: build_regions.py <areasmap.png> [--names raw/regions.raw.json] [--out public/data/regions.json]

areasmap: square image covering world X/Z -147456..147456, row 0 = lowest Z, +X right, no flip
(MeitouClient docs/formats/weather.md, Verified against town positions). Black is no region.
regions.raw.json (optional): [{"id": "<BIOME_GROUP string id>", "colour": "#rrggbb", "name_en": "...", "name_zh": "..."}]
Needs numpy + opencv (scripts venv: .venv/bin/python).
"""
import argparse, json
import cv2
import numpy as np
from PIL import Image

EXTENT = 147456
UPSCALE = 8          # work at 8x so smoothed borders follow the land, not the 1152-unit pixels
BLUR = 13            # gaussian kernel at the upscaled size; a shared argmax keeps neighbours seamless
SIMPLIFY = 1.2       # Douglas-Peucker tolerance, upscaled pixels
MIN_AREA = 40        # drop specks (upscaled pixels^2)


def load_names(path):
    if not path:
        return {}
    out = {}
    for r in json.load(open(path, encoding='utf-8')):
        c = r['colour']
        key = int(c.lstrip('#'), 16) if isinstance(c, str) else int(c)
        out[key] = r
    return out


def label_image(rgb):
    packed = (rgb[..., 0].astype(np.int32) << 16) | (rgb[..., 1].astype(np.int32) << 8) | rgb[..., 2]
    colours = [int(c) for c in np.unique(packed) if c != 0]
    n = packed.shape[0] * UPSCALE
    best = np.full((n, n), -1.0, np.float32)
    label = np.zeros((n, n), np.int32)        # 0 = none
    for i, c in enumerate([0] + colours):
        mask = cv2.resize((packed == c).astype(np.float32), (n, n), interpolation=cv2.INTER_NEAREST)
        mask = cv2.GaussianBlur(mask, (BLUR, BLUR), 0)
        better = mask > best
        best[better] = mask[better]
        label[better] = i
    return label, colours


def to_world(pt, n):
    x, y = pt
    return [round(x / n * 2 * EXTENT - EXTENT), round(y / n * 2 * EXTENT - EXTENT)]


def region_polys(mask, n):
    contours, hier = cv2.findContours(mask, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
    polys = []
    if hier is None:
        return polys
    for i, c in enumerate(contours):
        if hier[0][i][3] != -1 or cv2.contourArea(c) < MIN_AREA:
            continue
        rings = [c]
        child = hier[0][i][2]
        while child != -1:
            if cv2.contourArea(contours[child]) >= MIN_AREA:
                rings.append(contours[child])
            child = hier[0][child][0]
        polys.append([[to_world(p[0], n) for p in cv2.approxPolyDP(r, SIMPLIFY, True)] for r in rings])
    return polys


def label_point(mask, n):
    """The interior point farthest from the border (pole of inaccessibility), on the largest piece."""
    dist = cv2.distanceTransform(np.pad(mask, 1), cv2.DIST_L2, 5)[1:-1, 1:-1]
    y, x = np.unravel_index(int(np.argmax(dist)), dist.shape)
    return to_world((x + 0.5, y + 0.5), n)


def tag_places(path, rgb, ids):
    """Region of each place by the game's own lookup: zone cell floor(c/4608)+32, read at pixel (4cx+2, 4cz+2) (weather.md)."""
    data = json.load(open(path, encoding='utf-8'))
    scale = rgb.shape[0] // 64
    for p in data['places']:
        cx = min(63, max(0, int(np.floor(p['x'] / 4608)) + 32))
        cz = min(63, max(0, int(np.floor(p['z'] / 4608)) + 32))
        r, g, b = (int(v) for v in rgb[cz * scale + scale // 2, cx * scale + scale // 2])
        rid = ids.get(f'#{(r << 16) | (g << 8) | b:06x}')
        if rid:
            p['region'] = rid
        else:
            p.pop('region', None)
    json.dump(data, open(path, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('areasmap'); ap.add_argument('--names'); ap.add_argument('--out', default='public/data/regions.json')
    ap.add_argument('--places', default='public/data/places.json', help='tagged in place with each place\'s region id')
    a = ap.parse_args()
    rgb = np.array(Image.open(a.areasmap).convert('RGB'))
    names = load_names(a.names)
    label, colours = label_image(rgb)
    n = label.shape[0]

    regions = []
    for i, c in enumerate(colours, start=1):
        mask = (label == i).astype(np.uint8)
        if not mask.any():
            continue
        meta = names.get(c, {})
        regions.append({
            'id': meta.get('id', f'#{c:06x}'),
            'colour': f'#{c:06x}',
            'name': {'en': meta.get('name_en') or '', **({'zh': meta['name_zh']} if meta.get('name_zh') else {})},
            'label': label_point(mask, n),
            'polygons': region_polys(mask, n),
        })
    json.dump({'regions': regions}, open(a.out, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    tag_places(a.places, rgb, {r['colour']: r['id'] for r in regions})
    print(f'{len(regions)} regions, {sum(len(r["polygons"]) for r in regions)} polygons -> {a.out}')


if __name__ == '__main__':
    main()
