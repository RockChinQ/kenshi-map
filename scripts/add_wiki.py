#!/usr/bin/env python3
"""Tag places and regions with their 灰机 wiki (kenshi.huijiwiki.com) page title, when one exists.

usage: add_wiki.py raw/huiji-titles.json
The title list comes from tools/huiji/dump-titles.mjs (the wiki sits behind a Cloudflare challenge, so it is
fetched through a real browser). Matches the official zh name first, then the English one.
"""
import json, sys

titles = set(json.load(open(sys.argv[1], encoding='utf-8')))


def tag(item):
    for k in ('zh', 'en'):
        n = item['name'].get(k)
        if n and n in titles:
            item['wiki'] = n
            return 1
    item.pop('wiki', None)
    return 0


for path, key in (('public/data/places.json', 'places'), ('public/data/regions.json', 'regions')):
    data = json.load(open(path, encoding='utf-8'))
    hits = sum(tag(x) for x in data[key])
    json.dump(data, open(path, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    print(f'{key}: {hits}/{len(data[key])} with a wiki page')
