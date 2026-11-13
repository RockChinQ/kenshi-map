#!/usr/bin/env python3
"""Attach the hand-written zh bios in scripts/place_bios.json to places.json (`bio`).

usage: add_bios.py   (run after build_data.py; the game data has no description text for places)
Keys are a place id, or its English name: places sharing a name (Lost Library x10, ...) share the text.
"""
import json

bios = json.load(open('scripts/place_bios.json', encoding='utf-8'))
path = 'public/data/places.json'
data = json.load(open(path, encoding='utf-8'))
hits = 0
for p in data['places']:
    text = bios.get(p['id']) or bios.get(p['name']['en'])
    if text:
        p['bio'] = text
        hits += 1
    else:
        p.pop('bio', None)
json.dump(data, open(path, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print(f"places: {hits}/{len(data['places'])} with a bio")
