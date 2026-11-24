#!/usr/bin/env node
'use strict';
/* =========================================================================
   Chat-picture cache

   A picture painted inside a companion chat must stay attached to that
   message. The forge key includes model/style/settings and can change, so the
   real code keeps a second copy under a stable chat/message key. This test
   runs the real picture lookup and sync-blob helpers in a throwaway VM with a
   fake IndexedDB and fake Drive, and checks:

   - a new picture gets a stable message key;
   - a legacy forge-key picture is copied into that key;
   - a cache hit still works after the forge key changes;
   - sync can read the picture and fill the cache;
   - an old picture with no forge key migrates to a stable key;
   - the companion Drive fallback is cached and also stored under the forge key.

   Run:  node test/palpiccache.test.js
   ========================================================================= */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

function part(file, from, to) {
  const s = read(file);
  const a = s.indexOf(from);
  const b = s.indexOf(to, a);
  if (a < 0 || b < 0) throw new Error(`test needs updating: could not find "${from}" … "${to}" in ${file}`);
  return s.slice(a, b);
}

const APP = [
  part('js/pals.js', 'const palPicLoading', '/* ---------- Drive sync'),
  part('js/pals.js', 'async function palChatBlob', 'const personaMD'),
  ';globalThis.__pic = { palPicCacheKey, palHydrate, palChatBlob };'
].join('\n');

let pass = 0, fail = 0;
const fails = [];
function is(name, ok, extra) {
  if (ok) { pass++; console.log('PASS  ' + name); }
  else { fail++; fails.push(name); console.log('FAIL  ' + name + (extra != null ? '   [' + extra + ']' : '')); }
}

/* one page load with a fake IndexedDB and a fake picture folder in Drive */
function open({ driveFile = null } = {}) {
  const idb = new Map();
  const driveLookups = [];
  let redraws = 0;
  const IDB = {
    async get(k) { return idb.get(k) || null; },
    async put(k, v) { idb.set(k, v); }
  };
  const DriveImg = {
    async get(k) { driveLookups.push('key:' + k); return null; },
    async getCompanionFile(palId, name) { driveLookups.push('file:' + palId + ':' + name); return driveFile; }
  };
  const ctx = {
    console,
    IDB,
    DriveImg,
    S: { settings: { image: { refPhotos: true } } },
    PALS: { chats: {} },
    arr: v => Array.isArray(v) ? v : (v == null || v === '' ? [] : [v]),
    palTouch: () => {},
    savePals: () => {},
    palRedraw: () => { redraws++; },
    palCtx: () => ({}),
    localKeyFor: img => img.k || 'legacyK',
    subjChar: () => null,
    subjRef: () => null
  };
  vm.createContext(ctx);
  vm.runInContext(APP, ctx, { filename: 'js/pals.js (under test)' });
  return { ctx, pic: ctx.__pic, idb, driveLookups, redraws: () => redraws };
}

const chat = id => ({ id });
const msg = id => ({ id });

(async () => {
  console.log('\n1. Stable message keys');
  {
    const app = open();
    const c = chat('chat1'), m = msg('msg1'), img = { k: 'forge1', prompt: 'x' };
    const key = app.pic.palPicCacheKey(c, m, img);
    is('a new picture gets a chat/message/forge key', key === 'chatpic:chat1:msg1:forge1', key);
    is('an existing cache key is kept', app.pic.palPicCacheKey(c, m, { ...img, cache: key }) === key);
  }

  console.log('\n2. Migrating a picture already painted under its forge key');
  {
    const app = open();
    const c = chat('chat1'), m = msg('msg1'), img = { k: 'forge1', prompt: 'x' };
    app.idb.set('forge1', 'bytes');
    await app.pic.palHydrate(img, {}, 'forge1', null, m, c);
    is('the bytes are copied into the stable message cache', app.idb.get('chatpic:chat1:msg1:forge1') === 'bytes');
    is('the message keeps the stable cache key', img.cache === 'chatpic:chat1:msg1:forge1', img.cache);
    is('the picture is redrawn from the cache instead of painted', app.redraws() === 1);
  }

  console.log('\n3. A cache hit survives a changed forge key');
  {
    const app = open();
    const c = chat('chat1'), m = msg('msg1');
    const key = 'chatpic:chat1:msg1:forge1';
    const img = { cache: key, k: 'new-key', prompt: 'x' };
    app.idb.set(key, 'cached');
    await app.pic.palHydrate(img, {}, 'new-key', null, m, c);
    is('the cached picture is used even when the forge key changed', img.cache === key && app.idb.get(key) === 'cached');
    is('the changed forge key gets a copy for the painter lookup', app.idb.get('new-key') === 'cached');
  }

  console.log('\n4. Sync reads a chat picture and fills the cache');
  {
    const app = open();
    const c = chat('chat2'), m = msg('msg2'), img = { k: 'forge2', prompt: 'x' };
    app.idb.set('forge2', 'chatbytes');
    const blob = await app.pic.palChatBlob(img, { id: 'pal1' }, c, m);
    is('sync finds the picture by its forge key', blob === 'chatbytes');
    is('sync fills the stable message cache', img.cache === 'chatpic:chat2:msg2:forge2' && app.idb.get(img.cache) === 'chatbytes');
  }

  console.log('\n5. An older picture with no forge key');
  {
    const app = open();
    const c = chat('chat3'), m = msg('msg3'), img = { prompt: 'old' };
    app.idb.set('legacyK', 'oldbytes');
    await app.pic.palHydrate(img, {}, 'legacyK', null, m, c);
    is('the old picture is migrated under a stable key', app.idb.get('chatpic:chat3:msg3:legacy') === 'oldbytes');
    is('the message keeps that stable key', img.cache === 'chatpic:chat3:msg3:legacy', img.cache);
  }

  console.log('\n6. A picture already in the companion Drive folder');
  {
    const app = open({ driveFile: 'drivebytes' });
    const c = chat('chat4'), m = msg('msg4'), img = { k: 'forge4', prompt: 'x' };
    await app.pic.palHydrate(img, {}, 'forge4', { id: 'pal1' }, m, c);
    is('the Drive fallback is copied into the message cache', app.idb.get('chatpic:chat4:msg4:forge4') === 'drivebytes');
    is('the Drive fallback is also stored under the forge key for the redraw', app.idb.get('forge4') === 'drivebytes');
    is('the Drive fallback was found by its stable companion photo name', app.driveLookups.includes('file:pal1:photo-msg4.jpg'), app.driveLookups.join(', '));
    is('the message keeps the stable key', img.cache === 'chatpic:chat4:msg4:forge4', img.cache);
  }

  console.log(`\n${pass}/${pass + fail} checks passed`);
  if (fail) { console.log('FAILED:\n' + fails.map(f => '  - ' + f).join('\n')); process.exit(1); }
  process.exit(0);
})().catch(e => { console.error(e); process.exit(2); });
