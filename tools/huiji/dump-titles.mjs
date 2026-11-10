import { chromium } from 'playwright';
import fs from 'fs';
const b = await chromium.launch({ headless: false, executablePath: '/usr/bin/chromium', args: ['--disable-blink-features=AutomationControlled'] });
const p = await b.newPage();
await p.goto('https://kenshi.huijiwiki.com/wiki/%E9%A6%96%E9%A1%B5', { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForTimeout(3000);
const out = await p.evaluate(async () => {
  const pages = [];
  let cont = '';
  for (let i = 0; i < 200; i++) {
    const r = await (await fetch(`/api.php?action=query&list=allpages&apnamespace=0&apfilterredir=all&aplimit=500&format=json${cont}`)).json();
    for (const x of r.query.allpages) pages.push(x.title);
    if (!r.continue) break;
    cont = `&apcontinue=${encodeURIComponent(r.continue.apcontinue)}`;
  }
  return pages;
});
fs.writeFileSync('huiji-titles.json', JSON.stringify(out));
console.log(out.length);
await b.close();
