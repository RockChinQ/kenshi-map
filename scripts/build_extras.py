#!/usr/bin/env python3
"""Unique characters and Meitou-grade weapons (ROC-10 extraction) -> public/data/extras.json.

usage: build_extras.py raw/uniques.raw.json raw/meitou.raw.json raw/huiji-titles.json
Locations reference places.json ids (ROC-8 towns.raw ids). A location is "fixed" when the character leads or is a set member
of a non-conditional template (town residents, a bar's own squad, a placed building, a prison); "possible" when it only sits in a
random recruit pool (`choosefrom list`) or behind world-state conditions; campaigns have no place.
"""
import json, sys

KIND_ZH = {'residents': '常驻', 'bar squads': '酒吧', 'placed_template': '建筑内', 'prisoners': '关押', 'slaves': '奴隶', 'campaign': '势力战役'}
FIXED_ROLES = {'leader', 'squad', 'squad2'}

uniques = json.load(open(sys.argv[1], encoding='utf-8'))['uniques']
meitou = json.load(open(sys.argv[2], encoding='utf-8'))
titles = set(json.load(open(sys.argv[3], encoding='utf-8')))
places = {p['id']: p for p in json.load(open('public/data/places.json', encoding='utf-8'))['places']}


def i18n(o):
    d = {'en': o.get('name_en') or ''}
    if o.get('name_zh') and o['name_zh'] != d['en']:
        d['zh'] = o['name_zh']
    return d


def wiki(n):
    for k in ('zh', 'en'):
        if n.get(k) and n[k] in titles:
            return n[k]
    return None


def first(items):
    seen, out = set(), []
    for it in items or []:
        if it['id'] not in seen:
            seen.add(it['id'])
            out.append(i18n(it))
    return out


def location(l):
    fixed = not l.get('conditional') and l.get('template_role', 'leader') in FIXED_ROLES and l['kind'] != 'campaign'
    out = {'kind': l['kind'], 'label': KIND_ZH.get(l['kind'], l['kind']), 'fixed': fixed}
    if l.get('town_id') in places:
        out['place'] = l['town_id']
    if 'x' in l and 'z' in l:
        out['x'], out['z'] = round(l['x'], 1), round(l['z'], 1)
    if l['kind'] == 'campaign' and l.get('campaign'):
        c = l['campaign']
        out['campaign'] = i18n(c) if isinstance(c, dict) else {'en': str(c)}
    return out


def dedupe(locs):
    seen, out = {}, []
    for l in locs:
        key = (l['kind'], l.get('place'), l.get('x'), l.get('z'), (l.get('campaign') or {}).get('en'))
        if key in seen:
            seen[key]['fixed'] |= l['fixed']
            continue
        seen[key] = l
        out.append(l)
    return out


chars = []
for u in uniques:
    name = i18n(u)
    c = {'id': u['id'], 'name': name, 'animal': u['record_type'] != 'Character',
         'races': first(u.get('races')), 'factions': first(u.get('factions')),
         'locations': dedupe([location(l) for l in u.get('locations') or []])}
    if u.get('recruitable'):
        c['recruitable'] = True
    if u.get('unique_replacement_spawn'):
        r = u['unique_replacement_spawn']
        r = r if isinstance(r, list) else [r]
        c['replacement'] = [i18n(x) for x in r if isinstance(x, dict)]
    w = wiki(name)
    if w:
        c['wiki'] = w
    chars.append(c)
by_char = {c['id']: c for c in chars}

weapons = []
for s in meitou['sources']:
    w = {'id': s['id'], 'weapon': i18n(s['weapon']), 'kind': s['kind']}
    if s.get('character'):
        w['character'] = s['character']['id']
        ch = by_char.get(s['character']['id'])
        if ch is not None:
            ch.setdefault('meitou', []).append(s['id'])
    w['locations'] = dedupe([location(l) for l in s.get('locations') or []])
    ww = wiki(w['weapon'])
    if ww:
        w['wiki'] = ww
    weapons.append(w)

out = {'grade': i18n(meitou['grade']), 'manufacturer': i18n(meitou['manufacturer']), 'characters': chars, 'meitou': weapons}
json.dump(out, open('public/data/extras.json', 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
fixed = sum(any(l['fixed'] and ('place' in l or 'x' in l) for l in c['locations']) for c in chars)
print(f"{len(chars)} characters ({fixed} with a fixed place, {sum('wiki' in c for c in chars)} wiki), "
      f"{len(weapons)} meitou ({sum(any('place' in l for l in w['locations']) for w in weapons)} placed, {sum('wiki' in w for w in weapons)} wiki)")
