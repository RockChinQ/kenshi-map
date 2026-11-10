#!/usr/bin/env python3
"""Turn the extractor's raw town dump into public/data/places.json.

usage: build_data.py <towns.raw.json> <map-meta.json> [--out public/data/places.json]

towns.raw.json (from the Windows extraction, see README): {"gameVersion": "...", "towns": [
  {"id": "<record string id>", "type": <TownType int>, "name_en": "...", "name_zh": "...", "faction_en": "...",
   "faction_zh": "...", "x": <float>, "y": <float>, "z": <float>, "desc_en": "...", "desc_zh": "..."}]}
Drops NestMarker (8) and Null (10), as the in-game map does.
"""
import argparse, datetime, json

SKIP_TYPES = {8, 10}


def i18n(en, zh):
    if not en and not zh:
        return None
    d = {'en': en or zh}
    if zh and zh != en:
        d['zh'] = zh
    return d


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('raw'); ap.add_argument('meta')
    ap.add_argument('--out', default='public/data/places.json')
    a = ap.parse_args()
    raw = json.load(open(a.raw, encoding='utf-8'))
    meta = json.load(open(a.meta, encoding='utf-8'))

    places, seen = [], set()
    for t in raw['towns']:
        if t['type'] in SKIP_TYPES or t['id'] in seen:
            continue
        seen.add(t['id'])
        p = {'id': t['id'], 'type': t['type'], 'name': i18n(t.get('name_en'), t.get('name_zh')),
             'x': round(t['x'], 1), 'z': round(t['z'], 1)}
        for k, src in (('faction', 'faction'), ('desc', 'desc')):
            v = i18n(t.get(f'{src}_en'), t.get(f'{src}_zh'))
            if v:
                p[k] = v
        places.append(p)
    places.sort(key=lambda p: (p['type'] != 2, p['name']['en']))

    out = {'generated': datetime.date.today().isoformat(), 'gameVersion': raw.get('gameVersion'), 'map': meta, 'places': places}
    json.dump(out, open(a.out, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    print(f'{len(places)} places -> {a.out}')


if __name__ == '__main__':
    main()
