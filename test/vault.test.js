#!/usr/bin/env node
'use strict';
/* =========================================================================
   The encrypted key vault, end to end, without a Google login.

   This runs the app's real code in a throwaway VM "browser": js/vault.js, the
   real Drive client from js/images.js, and the real keysFileContent / parseKeys
   / importKeys from js/setup.js. Only the network and Google's sign-in popup
   are faked — a small in-memory Drive answers the same REST calls the client
   makes. So the keys are really sealed by WebCrypto, really uploaded, and
   really listed, downloaded and decrypted again on a later page load.

   Real here: js/vault.js, the Drive client, keysFileContent, parseKeys,
   importKeys, WebCrypto, and localStorage across the simulated reload.
   Faked here: fetch (a miniature Drive REST API), Google's sign-in popup,
   and the toast/confirm/DOM helpers.

   It checks: a first save, a reload that unlocks from the remembered
   passphrase, a wrong passphrase (and that nothing is overwritten), a missing
   vault file, and then a save sync whose campaign.json in Drive cannot be read
   (truncated JSON, then a Drive error): the sync must leave that file alone and
   say so instead of reporting a clean sync.

   Run:  node test/vault.test.js
   ========================================================================= */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { webcrypto } = require('crypto');

const ROOT = path.join(__dirname, '..');
const file = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

/* pull just the parts of the app under test out of the real files, so the test
   can never drift from the shipped code in those places */
function part(f, from, to) {
  const s = file(f); const a = s.indexOf(from); const b = s.indexOf(to, a + 1);
  if (a < 0 || b < 0) throw new Error(`test needs updating: could not find "${from}" … "${to}" in ${f}`);
  return s.slice(a, b);
}

const APP = [
  part('js/core.js', 'const PRESETS = {', '/* Providers that refuse direct browser connections'),
  part('js/core.js', 'function folderIdFrom', 'const $ ='),
  part('js/ai.js', 'function newConn(', 'function activeConn()'),   /* newConn, connReady, conns */
  part('js/images.js', 'const qs = ', 'function newDraft('),   /* the Drive client, the keys file, syncNow */
  part('js/setup.js', 'const KEY_PATTERNS', '/* Reads anything:'),
  part('js/setup.js', 'function parseKeys(text)', '/* ---------- models & testing ----------'),
  part('js/setup.js', 'function keysFileContent()', 'function download('),
  file('js/sealed.js'),
  file('js/vault.js'),
  ';globalThis.__app = { S, Vault, Sealed, Drive, keysFileContent, parseKeys, importKeys, syncNow, PRESETS };'
].join('\n');

const FOLDER = 'https://drive.google.com/drive/folders/1H7jtaAPFoch12ejohaDg60VA-kb55xDF';
const OTHER_FOLDER = 'https://drive.google.com/drive/folders/1AAAAAAAAAAAAAAAAAAAAA';
const CLIENT_ID = '18344580134-e8jbjhhmrieegn4tj57d8is6f7uspq1m.apps.googleusercontent.com';
const PASS = 'correct horse battery staple';
const KEY = 'sk-or-v1-0123456789abcdef0123456789abcdef0123456789abcdef';

/* ---------- a fake Google Drive, just the endpoints the app uses ---------- */
function fakeDrive() {
  const files = new Map();
  const log = [];
  const failMedia = new Set();   /* file ids whose download should fail, for the save-guard test */
  let seq = 0;

  const res = (body, status = 200, type = 'text/plain') => ({
    ok: status >= 200 && status < 300, status,
    headers: { get: () => type },
    text: async () => body,
    json: async () => JSON.parse(body)
  });

  const matches = (q, f) => {
    const parent = /'([^']+)' in parents/.exec(q);
    if (parent && !(f.parents || []).includes(parent[1])) return false;
    const name = /name\s*=\s*'([^']*)'/.exec(q);
    if (name && f.name !== name[1]) return false;
    const has = /name\s+contains\s+'([^']*)'/.exec(q);
    if (has && !f.name.includes(has[1])) return false;
    const mime = /mimeType\s*=\s*'([^']*)'/.exec(q);
    if (mime && f.mimeType !== mime[1]) return false;
    if (/trashed\s*=\s*false/.test(q) && f.trashed) return false;
    return true;
  };

  /* the client uploads a create as multipart/related: JSON metadata, then content */
  const multipart = (body, contentType) => {
    const boundary = /boundary=([^;]+)/.exec(contentType)[1];
    const parts = body.split('--' + boundary).map(p => p.replace(/^\r\n/, ''));
    const cut = p => { const i = p.indexOf('\r\n\r\n'); return p.slice(i + 4).replace(/\r\n$/, ''); };
    return { meta: JSON.parse(cut(parts[1])), content: cut(parts[2]) };
  };

  async function fetchImpl(url, opts = {}) {
    const u = new URL(String(url));
    const method = String(opts.method || 'GET').toUpperCase();
    log.push(`${method} ${u.hostname}${u.pathname}${u.search}`);
    if (!/^Bearer .+/.test(String(opts.headers?.Authorization || ''))) return res(JSON.stringify({ error: { message: 'unauthorized' } }), 401);
    if (u.hostname === 'oauth2.googleapis.com') return res(JSON.stringify({ email: 'tester@example.com' }), 200, 'application/json');
    if (u.hostname !== 'www.googleapis.com') return res(JSON.stringify({ error: { message: 'no such host' } }), 404);

    if (u.pathname === '/upload/drive/v3/files' || /^\/upload\/drive\/v3\/files\/[^/]+$/.test(u.pathname)) {
      const id = /^\/upload\/drive\/v3\/files\/([^/]+)$/.exec(u.pathname)?.[1];
      if (method === 'POST' && u.searchParams.get('uploadType') === 'multipart') {
        const { meta, content } = multipart(String(opts.body), String(opts.headers['Content-Type']));
        const nid = 'file' + (++seq);
        files.set(nid, { id: nid, name: meta.name, mimeType: meta.mimeType || 'text/plain', parents: meta.parents || [], content, modifiedTime: new Date().toISOString(), trashed: false });
        return res(JSON.stringify({ id: nid }), 200, 'application/json');
      }
      if (method === 'PATCH' && u.searchParams.get('uploadType') === 'media') {
        const f = files.get(id);
        if (!f) return res(JSON.stringify({ error: { message: 'File not found' } }), 404);
        f.content = String(opts.body); f.modifiedTime = new Date().toISOString();
        return res(JSON.stringify({ id: f.id }), 200, 'application/json');
      }
    }

    if (u.pathname === '/drive/v3/files' && method === 'GET') {
      const q = u.searchParams.get('q') || '';
      const list = [...files.values()].filter(f => matches(q, f)).map(f => ({
        id: f.id, name: f.name, mimeType: f.mimeType, parents: f.parents, modifiedTime: f.modifiedTime, appProperties: f.appProperties || null
      }));
      return res(JSON.stringify({ files: list }), 200, 'application/json');
    }

    /* folders are created with metadata only (Drive.createFolder) */
    if (u.pathname === '/drive/v3/files' && method === 'POST') {
      const meta = JSON.parse(String(opts.body || '{}'));
      const nid = 'file' + (++seq);
      files.set(nid, { id: nid, name: meta.name, mimeType: meta.mimeType || 'text/plain', parents: meta.parents || [], content: '', appProperties: meta.appProperties || null, modifiedTime: new Date().toISOString(), trashed: false });
      return res(JSON.stringify({ id: nid }), 200, 'application/json');
    }

    const one = /^\/drive\/v3\/files\/([^/]+)$/.exec(u.pathname);
    if (one) {
      const f = files.get(one[1]);
      if (!f) return res(JSON.stringify({ error: { message: 'File not found' } }), 404);
      if (method === 'GET' && u.searchParams.get('alt') === 'media') {
        if (failMedia.has(f.id)) return res(JSON.stringify({ error: { message: 'Internal Error' } }), 500, 'application/json');
        return res(f.content);
      }
      if (method === 'PATCH') {
        if (u.searchParams.get('addParents')) f.parents = [u.searchParams.get('addParents')];
        Object.assign(f, JSON.parse(String(opts.body || '{}')));
        return res(JSON.stringify({ id: f.id }), 200, 'application/json');
      }
    }
    return res(JSON.stringify({ error: { message: 'unhandled ' + method + ' ' + u.pathname } }), 400);
  }

  return {
    files, log, failMedia, fetch: fetchImpl,
    all: name => [...files.values()].filter(f => f.name === name && !f.trashed),
    inFolder: (name, folderId) => [...files.values()].filter(f => f.name === name && !f.trashed && (f.parents || []).includes(folderId))
  };
}

/* ---------- one page load of the app, in a fresh VM ---------- */
function settingsWith(conns, folder = FOLDER) {
  return {
    ai: { conns: conns || [], active: conns?.[0]?.id || '' },
    image: { polliKey: '' },
    drive: { clientId: CLIENT_ID, folder, vault: true, vaultRemember: true, autoSync: false, idleSync: 0 }
  };
}

function load(drive, device, settings) {
  const toasts = [], confirms = [];
  let signIns = 0, ids = 0;
  const google = { accounts: { oauth2: {
    initTokenClient: cfg => ({ requestAccessToken: () => { signIns++; cfg.callback({ access_token: 'fake-token', expires_in: 3600 }); } }),
    revoke: () => {}
  } } };
  const ctx = {
    console: { log: () => {}, warn: () => {}, error: console.error },
    crypto: webcrypto, window: { crypto: webcrypto, google },
    TextEncoder, TextDecoder, URL, URLSearchParams,
    btoa: s => Buffer.from(s, 'binary').toString('base64'),
    atob: s => Buffer.from(s, 'base64').toString('binary'),
    setTimeout, clearTimeout,
    fetch: drive.fetch,
    location: { protocol: 'https:', origin: 'https://outer-realm.test' },
    APP: 'Outer Realm',
    localStorage: {
      getItem: k => (k in device.store ? device.store[k] : null),
      setItem: (k, v) => { device.store[k] = String(v); },
      removeItem: k => { delete device.store[k]; }
    },
    document: { createElement: () => ({}), head: { appendChild() {} } },
    isPhone: () => false,
    toast: m => toasts.push(m),
    confirm: m => { confirms.push(m); return ctx.__confirmReply !== false; },
    $: () => null,
    renderModal: () => {},
    rerender: () => {},
    setupConn: () => {},
    saveSettings: () => { device.store['iq.settings'] = JSON.stringify(ctx.S.settings); },
    LS: {
      get(k, dflt) { try { const v = device.store[k]; return v ? JSON.parse(v) : dflt; } catch { return dflt; } },
      set(k, v) { device.store[k] = JSON.stringify(v); },
      del(k) { delete device.store[k]; }
    },
    num: v => { const n = Number(v); return Number.isFinite(n) ? Math.round(n) : 0; },
    clamp: (n, a, b) => Math.max(a, Math.min(b, n)),
    arr: v => Array.isArray(v) ? v : (v == null || v === '' ? [] : [v]),   /* the real one, from js/core.js */
    uid: () => 'id' + (++ids),
    ago: () => 'just now',
    __confirmReply: true,
    google,
    /* the pieces syncNow leans on that belong to other parts of the app */
    INDEX_FILE: '_ironquill-index.json',
    StoryDoc: { listAll: async () => ({}), pullEdits: async () => 0, write: async () => {} },
    syncPals: async () => 0,
    saveCampaigns: () => {},
    migrate: c => c,
    deep: o => JSON.parse(JSON.stringify(o)),
    mergeDefaults: (o, d) => ({ ...(d || {}), ...(o || {}) }),
    openModal: () => {}
  };
  /* a signed-in device from an earlier session: the token is in localStorage, as the app stores it */
  const saved = device.store['iq.settings'];
  ctx.S = {
    settings: saved ? JSON.parse(saved) : (settings || settingsWith([])),
    vaultFound: false, vaultLocked: false, vaultAt: 0, vaultDraft: '', driveAs: '',
    campaigns: {}, deleted: {}, view: 'home', busy: false, syncing: false, resync: false, syncStatus: '', savesLocked: false
  };
  vm.createContext(ctx);
  vm.runInContext(APP, ctx, { filename: 'outer-realm (under test)' });
  /* the two Markdown exports in each folder are not what this test is about: stand-ins keep them out of the way */
  ctx.characterMD = () => '# sheet';
  ctx.storyMD = () => '# log';
  const app = ctx.__app;
  app.Drive.init();
  return {
    ctx, app,
    get S() { return app.S; }, get Vault() { return app.Vault; }, get Drive() { return app.Drive; },
    keysFileContent: app.keysFileContent, importKeys: app.importKeys,
    toasts, confirms,
    signIns: () => signIns,
    /* the tap on "Connect Google Drive" — Google's popup is the fake above */
    async signIn() { await app.Drive.connect(true); return this; },
    stop() { clearTimeout(app.Vault.timer); }
  };
}

/* ---------- tiny assertion harness ---------- */
const results = [];
function is(name, cond, detail = '') {
  results.push({ name, ok: !!cond, detail });
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail && !cond ? '\n      ' + detail : ''}`);
}
const eq = (name, got, want) => is(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, wanted ${JSON.stringify(want)}`);

const bail = setTimeout(() => { console.error('TIMED OUT — a promise never settled'); process.exit(3); }, 60000);

(async () => {
  const drive = fakeDrive();
  const pc = { store: {} };
  const phone = { store: {} };
  const V = 'ironquill-vault.json';

  /* ============ 1. a first save ============ */
  console.log('\n1. Save the keys to the vault');
  const laptop = load(drive, pc, settingsWith([{
    id: 'c1', preset: 'openrouter', label: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1',
    apiKey: KEY, model: 'deepseek/deepseek-chat-v3:free', status: '', note: ''
  }]));
  await laptop.signIn();
  is('sign-in from the stubbed Google popup works', laptop.Drive.valid() && laptop.signIns() === 1);
  laptop.Vault.apply(PASS, true);          /* "Remember the passphrase on this device" ticked */
  const saved = await laptop.Vault.push();

  const vaultFiles = drive.all(V);
  is('Save writes exactly one ironquill-vault.json', saved === true && vaultFiles.length === 1, `push returned ${saved}, ${vaultFiles.length} file(s); toasts: ${laptop.toasts.join(' | ')}; calls: ${drive.log.join(', ')}`);
  const blob = vaultFiles[0] && JSON.parse(vaultFiles[0].content);
  eq('the file is a versioned AES-GCM-256 / PBKDF2-SHA256 vault', blob && [blob.kind, blob.alg, blob.kdf, blob.iter], ['ironquill-vault', 'AES-GCM-256', 'PBKDF2-SHA256', 310000]);
  is('salt, iv and ciphertext travel with it', /^[A-Za-z0-9+/=]+$/.test(blob?.salt || '') && /^[A-Za-z0-9+/=]+$/.test(blob?.iv || '') && (blob?.data || '').length > 100);
  is('no API key is readable in the uploaded bytes', !vaultFiles[0].content.includes(KEY) && !vaultFiles[0].content.includes('sk-or-'));
  is('no plaintext ironquill-keys file is created', drive.all('ironquill-keys.json').length === 0);
  is('the drive is left unlocked and marked as holding a vault', laptop.S.vaultFound === true && laptop.S.vaultLocked === false);
  is('the passphrase is remembered in the browser, not in settings', pc.store['iq.vaultPass'] === PASS && !JSON.stringify(laptop.S.settings).includes(PASS) && !String(pc.store['iq.settings'] || '').includes(PASS));
  is('no confirmation was needed for a first save', laptop.confirms.length === 0);
  is('the new file was created, not patched onto an existing one', drive.log.filter(l => l.startsWith('POST www.googleapis.com/upload')).length === 1 && drive.log.every(l => !/PATCH www\.googleapis\.com\/upload/.test(l)));
  laptop.stop();

  /* ============ 2. reload, remembered passphrase ============ */
  console.log('\n2. Reload with the remembered passphrase');
  const firstBytes = drive.all(V)[0].content;
  const reloaded = load(drive, pc);        /* same browser storage, brand-new JS state */
  eq('the reload still has the remembered passphrase', reloaded.Vault.get(), PASS);
  is('the reload needs no Google popup (token was kept)', reloaded.signIns() === 0 && reloaded.Drive.valid());
  is('nothing is loaded before a sync', reloaded.S.settings.ai.conns.length === 0 && reloaded.S.vaultFound === false);

  const pulled = await reloaded.Vault.pull();
  eq('Unlock loads the one key from the vault', pulled, 1);
  const conn = reloaded.S.settings.ai.conns[0] || {};
  eq('the key arrives intact with its preset, label and model', [conn.preset, conn.apiKey, conn.label, conn.model], ['openrouter', KEY, 'OpenRouter', 'deepseek/deepseek-chat-v3:free']);
  is('the unlocked connection becomes the active one', reloaded.S.settings.ai.active === conn.id);
  is('the vault is reported unlocked, and was not rewritten', reloaded.S.vaultLocked === false && reloaded.S.vaultFound === true && drive.all(V)[0].content === firstBytes);
  is('the reload is told it loaded a key', /Vault unlocked: 1 key loaded/.test(reloaded.toasts.join(' | ')), reloaded.toasts.join(' | '));
  is('the imported key is saved in the browser settings', JSON.parse(pc.store['iq.settings']).ai.conns[0].apiKey === KEY);
  is('the passphrase is still kept out of settings', !String(pc.store['iq.settings'] || '').includes(PASS));
  reloaded.stop();

  /* a key change re-saves quietly, with no question, because the passphrase opens the vault */
  reloaded.S.settings.ai.conns[0].model = 'qwen/qwen3-235b-a22b:free';
  const reSaved = await reloaded.Vault.push({ quiet: true });
  const secondBytes = drive.all(V)[0].content;
  is('a later automatic re-save replaces the vault quietly', reSaved === true && secondBytes !== firstBytes && reloaded.confirms.length === 0 && drive.all(V).length === 1);
  is('the re-save is still sealed with the same passphrase', await reloaded.Vault.pull({ quiet: true }) === 0 && !secondBytes.includes(KEY));

  /* ============ 3. a wrong passphrase ============ */
  console.log('\n3. A wrong passphrase');
  const other = load(drive, phone, settingsWith([]));
  await other.signIn();
  other.Vault.apply('not the passphrase', true);
  const openedWithWrong = await other.Vault.pull();
  eq('a wrong passphrase loads nothing', openedWithWrong, 0);
  is('the vault is reported locked', other.S.vaultLocked === true && /^locked/.test(other.Vault.status()), other.Vault.status());
  is('the message explains it is the wrong passphrase or a changed file', /did not open the vault/.test(other.toasts.join(' | ')), other.toasts.join(' | '));
  is('no key was imported on the wrong passphrase', other.S.settings.ai.conns.length === 0);
  is('the vault in Drive is untouched', drive.all(V)[0].content === secondBytes);

  other.ctx.__confirmReply = false;        /* the user declines the "replace it?" question */
  const overwritten = await other.Vault.push();
  is('saving with a different passphrase asks before replacing', other.confirms.length === 1 && /different passphrase/.test(other.confirms[0]));
  is('declining leaves Drive exactly as it was', overwritten === false && drive.all(V)[0].content === secondBytes && drive.all(V).length === 1);
  is('declining says nothing was replaced', /Nothing was replaced/.test(other.toasts.join(' | ')));
  other.stop();

  /* ============ 4. no vault file at all ============ */
  console.log('\n4. No vault file in the folder');
  const empty = { store: {} };
  const tablet = load(drive, empty, settingsWith([], OTHER_FOLDER));
  await tablet.signIn();
  eq('an empty folder reports "no vault yet"', tablet.Vault.status(), 'no vault yet');
  const quietBefore = tablet.toasts.length;
  eq('a quiet sync finds nothing and says nothing', await tablet.Vault.pull({ quiet: true }), 0);
  is('a quiet sync with no vault is silent', tablet.toasts.length === quietBefore && tablet.S.vaultFound === false && tablet.S.vaultLocked === false);

  tablet.Vault.apply('a fresh passphrase', true);
  eq('Unlock on an empty folder loads nothing', await tablet.Vault.pull(), 0);
  is('Unlock on an empty folder says so once', tablet.toasts.length === quietBefore + 1 && /no vault in that Drive folder yet/.test(tablet.toasts[tablet.toasts.length - 1]), tablet.toasts.join(' | '));
  is('an empty folder never marks the vault locked', tablet.S.vaultLocked === false);

  tablet.S.settings.ai.conns.push({ id: 'c9', preset: 'gemini', label: 'Gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', apiKey: 'AIzaTESTKEY0123456789012345678901234', model: 'gemini-flash-latest', status: '', note: '' });
  is('a save into an empty folder creates the vault', await tablet.Vault.push() === true && drive.inFolder(V, '1AAAAAAAAAAAAAAAAAAAAA').length === 1);
  is('the original folder’s vault is untouched', drive.all(V).length === 2 && drive.all(V).some(f => f.content === secondBytes));
  await tablet.Vault.pull({ quiet: true });
  is('the new vault opens with its own passphrase', tablet.S.vaultLocked === false && tablet.S.vaultFound === true);
  tablet.stop();

  /* ============ 5. a save in Drive that cannot be read ============ */
  console.log('\n5. A save in Drive that cannot be read');
  const drive2 = fakeDrive();
  const savePc = { store: {} };
  const writer = load(drive2, savePc, settingsWith([]));
  await writer.signIn();
  writer.S.campaigns = { camp1: { id: 'camp1', title: 'The Salt Road', updatedAt: 1000, character: { name: 'Wren' } } };

  await writer.app.syncNow(true);
  const gamesRoot = drive2.all('Games')[0];
  const saveFolder = drive2.all('The Salt Road')[0];
  const campFile = saveFolder && drive2.inFolder('campaign.json', saveFolder.id)[0];
  is('a normal sync writes the adventure into its own folder', !!gamesRoot && !!saveFolder && !!campFile && saveFolder.parents[0] === gamesRoot.id, drive2.log.join(', '));
  is('a normal sync reports that it synced', /^Synced with Google Drive/.test(writer.S.syncStatus), writer.S.syncStatus);
  const goodSave = campFile?.content || '';

  /* a truncated upload: the file is there, but it cannot be read, and it claims to be newer */
  const broken = '{ "id": "camp1", "title": "The Sa';
  campFile.content = broken;
  saveFolder.appProperties = { iqCampaign: 'camp1', iqUpdated: '9000' };
  const localBefore = JSON.stringify(writer.S.campaigns.camp1);
  let marks = writer.toasts.length;
  await writer.app.syncNow(true);
  is('a newer save in Drive that cannot be read is not replaced by the older local copy', campFile.content === broken && JSON.stringify(writer.S.campaigns.camp1) === localBefore);
  is('the sync line says the save could not be read instead of claiming success', /^Not synced — could not read the save for “The Salt Road”/.test(writer.S.syncStatus), writer.S.syncStatus);
  is('the reason is shown to the user', /could not read the save for “The Salt Road”/i.test(writer.toasts.slice(marks).join(' | ')), writer.toasts.slice(marks).join(' | '));

  /* stale metadata: now this device thinks its own copy is the newer one — the push path */
  saveFolder.appProperties = { iqCampaign: 'camp1', iqUpdated: '1' };
  writer.S.campaigns.camp1.updatedAt = 5000;
  writer.S.campaigns.camp1.title = 'The Salt Road — edited';
  marks = writer.toasts.length;
  await writer.app.syncNow(true);
  is('an unreadable save is never written over, even when the local copy looks newer', campFile.content === broken, campFile.content.slice(0, 60));
  is('the folder in Drive is left exactly as it was (no rename, no stray copy)', saveFolder.name === 'The Salt Road' && drive2.all('The Salt Road').length === 1 && drive2.all('The Salt Road — edited').length === 0, saveFolder.name);
  is('that blocked push is reported too', /^Not synced/.test(writer.S.syncStatus) && /could not read the save for/i.test(writer.toasts.slice(marks).join(' | ')), writer.S.syncStatus + ' / ' + writer.toasts.slice(marks).join(' | '));

  /* a read that fails outright, not just bad JSON */
  drive2.failMedia.add(campFile.id);
  writer.S.campaigns.camp1.updatedAt = 6000;
  marks = writer.toasts.length;
  await writer.app.syncNow(true);
  is('a read that fails with a Drive error blocks the push as well', campFile.content === broken && /^Not synced/.test(writer.S.syncStatus), writer.S.syncStatus);
  is('the Drive error itself is named', /Drive error 500/.test(writer.toasts.slice(marks).join(' | ')), writer.toasts.slice(marks).join(' | '));

  /* once the save reads again, syncing resumes normally */
  drive2.failMedia.clear();
  campFile.content = goodSave;
  saveFolder.appProperties = { iqCampaign: 'camp1', iqUpdated: '1' };
  writer.S.campaigns.camp1.updatedAt = 7000;
  await writer.app.syncNow(true);
  const pushed = JSON.parse(campFile.content);
  is('a readable save lets the push through again', pushed.id === 'camp1' && pushed.updatedAt === 7000, campFile.content.slice(0, 80));
  is('the folder is renamed and the sync reports success once more', saveFolder.name === 'The Salt Road — edited' && /^Synced with Google Drive/.test(writer.S.syncStatus), saveFolder.name + ' / ' + writer.S.syncStatus);
  writer.stop();

  /* ============ 6. sealed saves ============ */
  console.log('\n6. Sealed saves');
  const drive3 = fakeDrive();
  const A = load(drive3, { store: {} }, settingsWith([{
    id: 'c1', preset: 'openrouter', label: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1',
    apiKey: KEY, model: 'deepseek/deepseek-chat-v3:free', status: '', note: ''
  }]));
  await A.signIn();
  A.Vault.apply(PASS, true);
  await A.Vault.push();
  const secret = 'A secret the folder must not show';
  A.S.campaigns = { camp1: { id: 'camp1', title: 'The Salt Road', updatedAt: 1000, premise: secret, character: { name: 'Wren' } } };
  await A.app.syncNow(true);

  const folderA = drive3.all('The Salt Road')[0];
  const saveA = folderA && drive3.inFolder('campaign.json', folderA.id)[0];
  const sheetA = folderA && drive3.inFolder('Character Sheet.md', folderA.id)[0];
  const logA = folderA && drive3.inFolder('Story Log.md', folderA.id)[0];
  is('a sync with an unlocked vault writes the save sealed', !!saveA && /"kind":"ironquill-sealed"/.test(saveA.content), saveA && saveA.content.slice(0, 60));
  is('the two .md exports are sealed too, under their usual names', !!sheetA && !!logA && /ironquill-sealed/.test(sheetA.content) && /ironquill-sealed/.test(logA.content));
  is('the story is not readable in any of the three files', ![saveA, sheetA, logA].some(f => (f && f.content || '').includes(secret)));
  const vault3 = JSON.parse(drive3.all('ironquill-vault.json')[0].content);
  is('the vault carries a wrapped save key beside the keys', !!(vault3.secret && vault3.secret.data) && vault3.secret.data.length > 20);
  const sealedBytes = saveA.content;

  /* another device, same passphrase */
  const B = load(drive3, { store: {} }, settingsWith([]));
  await B.signIn();
  B.Vault.apply(PASS, true);
  await B.app.syncNow(true);
  is('another device that knows the passphrase reads the sealed save', B.S.campaigns.camp1 && B.S.campaigns.camp1.premise === secret, B.S.syncStatus);
  is('and leaves it exactly as it is', drive3.files.get(saveA.id).content === sealedBytes);
  is('its sync is reported as clean', /^Synced with Google Drive/.test(B.S.syncStatus) && B.S.savesLocked === false, B.S.syncStatus);

  /* a device with no passphrase, holding a newer local copy of the same adventure */
  const C = load(drive3, { store: {} }, settingsWith([]));
  await C.signIn();
  C.S.campaigns = { camp1: { id: 'camp1', title: 'The Salt Road — local', updatedAt: 9000, premise: 'local edit', character: { name: 'Wren' } } };
  await C.app.syncNow(true);
  is('a locked device reports the saves as locked', C.S.savesLocked === true && /^Locked/.test(C.S.syncStatus), C.S.syncStatus);
  is('and writes nothing over the sealed save', drive3.files.get(saveA.id).content === sealedBytes && folderA.name === 'The Salt Road', folderA.name);
  is('and is told how to unlock', /unlock the vault/i.test(C.toasts.join(' | ')), C.toasts.join(' | '));

  /* a wrong passphrase */
  const D = load(drive3, { store: {} }, settingsWith([]));
  await D.signIn();
  D.Vault.apply('not the passphrase', true);
  await D.app.syncNow(true);
  is('a wrong passphrase also leaves the saves locked and untouched', D.S.savesLocked === true && drive3.files.get(saveA.id).content === sealedBytes, D.S.syncStatus);

  /* a save written by an older version, still plain text */
  const games3 = drive3.all('Games')[0];
  drive3.files.set('filePlain', { id: 'filePlain', name: 'Old Adventure', mimeType: 'application/vnd.google-apps.folder', parents: [games3.id], content: '', appProperties: { iqCampaign: 'campOld', iqUpdated: '4000' }, modifiedTime: new Date().toISOString(), trashed: false });
  drive3.files.set('filePlainSave', { id: 'filePlainSave', name: 'campaign.json', mimeType: 'application/json', parents: ['filePlain'], content: JSON.stringify({ id: 'campOld', title: 'Old Adventure', updatedAt: 4000, character: { name: 'Ash' } }), appProperties: null, modifiedTime: new Date().toISOString(), trashed: false });

  const E = load(drive3, { store: {} }, settingsWith([]));
  await E.signIn();
  E.Vault.apply(PASS, true);
  await E.app.syncNow(true);
  is('a plain-text save from an older version still loads', E.S.campaigns.campOld && E.S.campaigns.campOld.title === 'Old Adventure', E.S.syncStatus);
  is('and is left as it was until that adventure changes', drive3.files.get('filePlainSave').content.includes('Old Adventure'));

  E.S.campaigns.campOld.updatedAt = 5000;
  await E.app.syncNow(true);
  const migrated = drive3.files.get('filePlainSave').content;
  is('once it changes it is sealed under the same name', /ironquill-sealed/.test(migrated) && !migrated.includes('Old Adventure'));

  /* re-saving the vault keeps the save key */
  const beforeReSave = migrated;
  await B.Vault.push({ quiet: true });
  const vaultAfter = JSON.parse(drive3.all('ironquill-vault.json')[0].content);
  is('a vault re-save keeps the wrapped key and the saves as they were', !!vaultAfter.secret && drive3.files.get('filePlainSave').content === beforeReSave);

  const F = load(drive3, { store: {} }, settingsWith([]));
  await F.signIn();
  F.Vault.apply(PASS, true);
  await F.app.syncNow(true);
  is('a fresh device opens every sealed save after that re-save', !!(F.S.campaigns.camp1 && F.S.campaigns.camp1.premise === secret) && !!(F.S.campaigns.campOld && F.S.campaigns.campOld.title === 'Old Adventure'), Object.keys(F.S.campaigns).join(','));

  /* ---------- verdict ---------- */
  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  clearTimeout(bail);
  if (failed.length) { console.log('FAILED:\n' + failed.map(f => '  - ' + f.name).join('\n')); process.exit(1); }
  process.exit(0);
})().catch(e => { console.error(e); process.exit(2); });
