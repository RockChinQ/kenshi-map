#!/bin/sh
# Ping IndexNow (Bing, Yandex, …) with every URL in the built sitemap. Key file: public/9d0cb47407cffcab69d4272ce7e52b83.txt.
set -e
KEY=9d0cb47407cffcab69d4272ce7e52b83
python3 -c "
import json,re
urls=re.findall(r'<loc>(.*?)</loc>',open('dist/sitemap.xml').read())
print(json.dumps({'host':'kenshi.rcpd.cc','key':'$KEY','keyLocation':'https://kenshi.rcpd.cc/$KEY.txt','urlList':urls}))" > dist/.indexnow.json
for ep in https://api.indexnow.org/indexnow https://yandex.com/indexnow; do
  curl -s -o /dev/null -w "indexnow %{http_code} $ep\n" -H 'Content-Type: application/json; charset=utf-8' --data @dist/.indexnow.json $ep || true
done
rm -f dist/.indexnow.json
