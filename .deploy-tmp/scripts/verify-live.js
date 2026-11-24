#!/usr/bin/env node
/* =========================================================================
   Is the live site actually the build on disk?

   Fetches the published index.html, finds every js/ and css/ file it asks
   for, and compares each live file's bytes with the local one. Also shows
   the build stamp in the page so "did my deploy go out?" is a fact.

     node scripts/verify-live.js                      # outer-realm.netlify.app
     node scripts/verify-live.js https://example.com  # any other host
   ========================================================================= */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.resolve(__dirname, '..');
const host = (process.argv[2] || 'https://outer-realm.netlify.app').replace(/\/+$/, '');
const md5 = b => crypto.createHash('md5').update(b).digest('hex');
const buildOf = html => (String(html).match(/<meta name="build" content="([^"]*)"/) || [])[1] || '(no build stamp)';

(async () => {
  console.log('Live:  ' + host);
  let liveHtml, liveRes;
  try {
    liveRes = await fetch(host + '/index.html?_check=' + Date.now(), { redirect: 'follow' });
    liveHtml = await liveRes.text();
  } catch (e) {
    console.error('Could not reach the site: ' + (e.message || e));
    process.exit(2);
  }
  const localHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  console.log('  index.html  HTTP ' + liveRes.status + '  live build: ' + buildOf(liveHtml) + '  local build: ' + buildOf(localHtml));
  if (liveRes.status !== 200) { console.error('The site answered with HTTP ' + liveRes.status + '.'); process.exit(1); }

  const files = [...new Set([...liveHtml.matchAll(/(?:href|src)="((?:css|js)\/[^"?#]+)/g)].map(m => m[1]))];
  if (!files.length) { console.error('No css/js files found in the live index.html — is that the right site?'); process.exit(1); }

  let stale = 0, same = 0, gone = 0;
  for (const file of files) {
    const abs = path.join(root, file);
    if (!fs.existsSync(abs)) { console.log('  ?           ' + file + '  (not on disk)'); gone++; continue; }
    let res, body;
    try { res = await fetch(host + '/' + file, { cache: 'no-store' }); body = Buffer.from(await res.arrayBuffer()); }
    catch (e) { console.log('  !           ' + file + '  ' + (e.message || e)); stale++; continue; }
    const local = fs.readFileSync(abs);
    const ok = res.status === 200 && md5(body) === md5(local);
    if (ok) same++; else stale++;
    console.log(i2(ok ? 'live' : 'STALE') + '  ' + file + (res.status !== 200 ? '  HTTP ' + res.status : ''));
  }
  console.log(`\n${same} live, ${stale} stale${gone ? `, ${gone} missing locally` : ''}.`);
  if (stale) { console.log('Push/deploy again (or run node scripts/bust.js first).'); process.exit(1); }
})().catch(e => { console.error(e); process.exit(2); });

function i2(s) { return (s + '          ').slice(0, 9); }
