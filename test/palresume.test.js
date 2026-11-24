#!/usr/bin/env node
'use strict';
/* =========================================================================
   Device-local Resume markers

   A companion reply can be interrupted by a reload or a suspended tab. The
   partial bubble is kept in localStorage so the chat can offer Resume, but
   that marker must not travel to another device: after Drive syncs a chat
   interrupted on the phone, the PC must not offer to resume it and start a
   duplicate request.

   This runs the real pending-reply code out of js/pals.js in throwaway VMs
   sharing one simulated browser storage. It covers repeated local reloads,
   Resume, Discard, a phone-interrupted bubble arriving on the PC, a marker
   copied from another device, and an older marker with no device id.

   Run:  node test/palresume.test.js
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

/* the real marker code, plus the resume/discard actions; no page listeners */
const APP = [
  part('js/pals.js', 'const PAL_PENDING_KEY', "addEventListener('pagehide'"),
  part('js/pals.js', 'function palResume', '/* redraw the chat'),
  ';globalThis.__pending = { palPendingStart, palPendingUpdate, palPendingClear, palPendingFlush, palPendingRestore, palFindInterrupted, palResume, palDiscardPending, PAL_PENDING_KEY, PAL_DEVICE, getPending: () => palPending };'
].join('\n');

let pass = 0, fail = 0;
const fails = [];
function is(name, ok, extra) {
  if (ok) { pass++; console.log('PASS  ' + name); }
  else { fail++; fails.push(name); console.log('FAIL  ' + name + (extra != null ? '   [' + extra + ']' : '')); }
}
const clone = v => JSON.parse(JSON.stringify(v));

/* one browser/device: its own localStorage, never shared with another one */
function newDevice(messages = []) {
  const store = new Map();
  return {
    store,
    messages: clone(messages),
    get(k, dflt) { try { const v = store.get(k); return v == null ? dflt : JSON.parse(v); } catch { return dflt; } },
    set(k, v) { store.set(k, JSON.stringify(v)); return true; },
    del(k) { store.delete(k); },
    key() { return this.get('iq.palPending', null); }
  };
}

/* one page load in that device; storage survives between open() calls */
function open(device) {
  const PALS = { chats: { c1: { id: 'c1', channel: 'text', messages: clone(device.messages) } } };
  const ch = PALS.chats.c1;
  const calls = [];
  const persist = () => { device.messages = clone(ch.messages); };
  const ctx = {
    console,
    LS: device,
    PALS_KEY: 'iq.pals',
    PALS,
    arr: v => Array.isArray(v) ? v : (v == null || v === '' ? [] : [v]),
    S: { palBusy: null },
    localStorage: { removeItem: k => device.del(k) },
    palTouch: () => {},
    savePals: persist,
    palRedraw: () => {},
    palReply: (chat, opts) => calls.push({ chat, opts })
  };
  vm.createContext(ctx);
  vm.runInContext(APP, ctx, { filename: 'js/pals.js (under test)' });
  const pending = ctx.__pending;
  return {
    ctx, PALS, ch, calls, persist,
    key: () => device.key(),
    get pending() { return pending.getPending(); },
    get PAL_DEVICE() { return pending.PAL_DEVICE; },
    start: pending.palPendingStart,
    update: pending.palPendingUpdate,
    flush: pending.palPendingFlush,
    restore: pending.palPendingRestore,
    find: pending.palFindInterrupted,
    resume: pending.palResume,
    discard: pending.palDiscardPending
  };
}

function streamingMsg() {
  return { id: 'm1', role: 'pal', who: 'p1', text: '', mode: 'text', t: 10, streaming: true };
}
function interruptedMsg(by, text) {
  const m = { ...streamingMsg(), streaming: false, text, interrupted: true };
  if (by) m.interruptedBy = by;
  return m;
}

/* ---------- 1. repeated local reloads, then Resume and Discard ---------- */
console.log('\n1. Repeated local reloads');
{
  const pc = newDevice([streamingMsg()]);
  let app = open(pc);
  const msg = app.ch.messages[0];
  app.start(app.ch, msg);
  app.update(app.ch, msg, 'Half a reply');
  app.flush();
  app.persist();
  const pcId = app.PAL_DEVICE;
  is('a local marker carries this device id', !!pcId && pc.key().dev === pcId, JSON.stringify(pc.key()));

  /* reload 1: the marker is restored and kept */
  app = open(pc);
  app.restore();
  app.persist();
  is('the first reload restores the marker', !!app.key() && app.key().msg === 'm1');
  is('the first reload keeps the interrupted text', app.ch.messages[0].text === 'Half a reply', app.ch.messages[0].text);
  is('the first reload tags the bubble as this device’s', app.ch.messages[0].interrupted === true && app.ch.messages[0].interruptedBy === pcId);

  /* reload 2, without acting: Resume must still be there */
  app = open(pc);
  app.restore();
  app.persist();
  is('a second reload still has the marker', !!app.key() && app.key().msg === 'm1');
  is('a second reload still has the text', app.ch.messages[0].text === 'Half a reply', app.ch.messages[0].text);
  is('a second reload still tags the bubble for rebuilds', app.ch.messages[0].interruptedBy === pcId);

  /* Resume continues the same bubble; the stub stands in for the network reply */
  app.calls.length = 0;
  app.resume(app.ch);
  is('Resume passes the same bubble for continuation', app.calls.length === 1 && app.calls[0].opts.continueMsg === app.ch.messages[0]);
  is('Resume keeps the partial text', app.ch.messages[0].text === 'Half a reply', app.ch.messages[0].text);
  is('Resume keeps the marker until the reply lands', !!app.key() && app.key().dev === pcId);
  is('Resume keeps the device tag', app.ch.messages[0].interruptedBy === pcId);

  /* Discard removes the bubble and the marker */
  app.discard(app.ch);
  is('Discard removes the interrupted bubble', !app.ch.messages.some(m => m.id === 'm1'));
  is('Discard clears the marker', !app.key() && !app.pending);

  /* one more reload is clean */
  app = open(pc);
  app.restore();
  is('a reload after Discard offers nothing', !app.key() && !app.pending && !app.ch.messages.some(m => m.id === 'm1'));
}

/* ---------- 2. a local interrupted bubble whose marker is missing ---------- */
console.log('\n2. A local bubble with no marker');
{
  const pc = newDevice([streamingMsg()]);
  let app = open(pc);
  const pcId = app.PAL_DEVICE;
  /* the marker was lost, but this device interrupted the bubble, so it may be rebuilt */
  pc.messages = [interruptedMsg(pcId, 'Half a reply')];
  pc.del('iq.palPending');
  is('the case starts with no marker', !pc.key());

  app = open(pc);
  app.restore();
  app.persist();
  is('a missing local marker is rebuilt', !!pc.key() && pc.key().msg === 'm1' && pc.key().dev === pcId, JSON.stringify(pc.key()));
  is('the rebuilt marker keeps the partial text', pc.key().text === 'Half a reply', pc.key().text);
  is('the local bubble is ready to resume', app.ch.messages[0].interrupted === true && app.ch.messages[0].text === 'Half a reply');

  app.calls.length = 0;
  app.resume(app.ch);
  is('Resume targets the same rebuilt bubble', app.calls.length === 1 && app.calls[0].opts.continueMsg === app.ch.messages[0]);
  is('Resume keeps the rebuilt marker and text', !!pc.key() && pc.key().msg === 'm1' && app.ch.messages[0].text === 'Half a reply');
}

/* ---------- 3. a phone-interrupted bubble syncing to the PC ---------- */
console.log('\n3. A phone interruption synced to the PC');
{
  const phone = newDevice([streamingMsg()]);
  const phoneApp = open(phone);
  const phoneMsg = phoneApp.ch.messages[0];
  phoneApp.start(phoneApp.ch, phoneMsg);
  phoneApp.update(phoneApp.ch, phoneMsg, 'Phone half reply');
  phoneApp.flush();
  const phoneId = phoneApp.PAL_DEVICE;
  /* what the phone saves when the request dies: a partial bubble tagged with its device */
  phoneMsg.streaming = false;
  phoneMsg.text = 'Phone half reply';
  phoneMsg.interrupted = true;
  phoneMsg.interruptedBy = phoneId;
  phoneApp.persist();
  is('the phone keeps its own marker', !!phone.key() && phone.key().dev === phoneId);

  /* Drive delivers the chat, but not localStorage; the PC gets a fresh page load */
  const pc = newDevice(phone.messages);
  let pcApp = open(pc);
  pcApp.restore();
  pcApp.persist();
  is('the synced bubble is still marked interrupted', pcApp.ch.messages[0].interrupted === true);
  is('the PC gets no marker from the phone bubble', !pc.key() && !pcApp.pending);
  pcApp.calls.length = 0;
  pcApp.resume(pcApp.ch);
  is('the PC has no Resume to act on', pcApp.calls.length === 0);

  /* even a second PC reload must not rebuild it */
  pcApp = open(pc);
  pcApp.restore();
  is('a PC reload still has no marker', !pc.key() && !pcApp.pending);
  is('the phone still has its own marker', !!phone.key() && phone.key().dev === phoneId);
}

/* ---------- 4. a marker copied from another device ---------- */
console.log('\n4. A foreign marker');
{
  const pc = newDevice([interruptedMsg('dev-phone', 'Phone half reply')]);
  pc.set('iq.palPending', { chat: 'c1', msg: 'm1', text: 'Phone half reply', dev: 'dev-phone', at: 1 });
  const app = open(pc);
  app.restore();
  is('a marker from another device is removed', !pc.key() && !app.pending);
}

/* ---------- 5. an older local marker with no device id ---------- */
console.log('\n5. An older local marker');
{
  const pc = newDevice([interruptedMsg('', 'Old half reply')]);
  pc.set('iq.palPending', { chat: 'c1', msg: 'm1', text: 'Old half reply', at: 1 });
  const app = open(pc);
  app.restore();
  const pcId = app.PAL_DEVICE;
  is('an old local marker is adopted', !!pc.key() && pc.key().dev === pcId, JSON.stringify(pc.key()));
  is('its bubble is tagged for future rebuilds', app.ch.messages[0].interruptedBy === pcId);
}

console.log(`\n${pass}/${pass + fail} checks passed`);
if (fail) { console.log('FAILED:\n' + fails.map(f => '  - ' + f).join('\n')); process.exit(1); }
process.exit(0);
