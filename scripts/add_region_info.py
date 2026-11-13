#!/usr/bin/env python3
"""Region bios, factions and fauna -> regions.json (`bio`, `factions`, `animals`).

usage: add_region_info.py   (run after build_regions.py, add_wiki.py and add_bios.py)
- scripts/region_bios.json: hand-written zh text keyed by the region's English name.
- factions: owners of the places inside the region (places.json, `places` = how many they hold) plus the squads
  that roam it (`roam`), taken from the wiki zone pages in scripts/region_wiki.json. Only names listed in
  scripts/factions.json count; it also carries the zh name and the emblem kind/colour the card draws.
  Ruin "owners" (Ancient Ruins, Second Empire, ...) are not listed there on purpose.
"""
import json

table = json.load(open('scripts/factions.json', encoding='utf-8'))
bios = json.load(open('scripts/region_bios.json', encoding='utf-8'))
wiki = json.load(open('scripts/region_wiki.json', encoding='utf-8'))
places = json.load(open('public/data/places.json', encoding='utf-8'))['places']


def index(group):
    out = {}
    for name, v in group.items():
        for k in [name] + v.get('aka', []):
            out[k.lower()] = name
    return out


F, A = index(table['factions']), index(table['animals'])
path = 'public/data/regions.json'
data = json.load(open(path, encoding='utf-8'))
nb = nf = 0
for r in data['regions']:
    en = r['name']['en']
    w = wiki.get(en, {})
    held = {}
    animals = []
    for p in places:
        if p.get('region') != r['id'] or not p.get('faction'):
            continue
        owner = p['faction']['en'].lower()
        if owner in F:
            held[F[owner]] = held.get(F[owner], 0) + 1
        elif owner in A:
            animals.append(A[owner])
    roam = []
    for s in w.get('squads', []):
        k = s.lower()
        if k in F and F[k] not in roam:
            roam.append(F[k])
        elif k in A:
            animals.append(A[k])
    animals = [A[a.lower()] for a in w.get('animals', []) if a.lower() in A] + animals
    names = sorted(held, key=lambda n: -held[n]) + [n for n in roam if n not in held]
    facs = []
    for n in names:
        t = table['factions'][n]
        f = {'en': n, 'zh': t['zh'], 'kind': t['kind'], 'color': t['color']}
        if n in held:
            f['places'] = held[n]
        if n in roam:
            f['roam'] = True
        facs.append(f)
    for k, v in (('bio', bios.get(en)), ('factions', facs), ('animals', [table['animals'][a]['zh'] for a in dict.fromkeys(animals)])):
        if v:
            r[k] = v
        else:
            r.pop(k, None)
    nb += 'bio' in r
    nf += 'factions' in r
json.dump(data, open(path, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print(f"regions: {nb}/{len(data['regions'])} with a bio, {nf} with factions")
