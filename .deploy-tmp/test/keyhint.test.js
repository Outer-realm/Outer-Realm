#!/usr/bin/env node
'use strict';
/* =========================================================================
   Unmatched pasted key hint

   A key can be valid but have an unusual shape. The importer must not answer
   with the old generic "No new keys found"; it should set the inline hint and
   point at the label form / manual entry. This runs the real parseKeys and
   importKeys code with a small stub of the connection store.

   Run:  node test/keyhint.test.js
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

const APP = part('js/setup.js', 'const KEY_PATTERNS', '/* ---------- models & testing ---------- */')
  + '\n;globalThis.__keys = { parseKeys, importKeys };';

let pass = 0, fail = 0;
const fails = [];
function is(name, ok, extra) {
  if (ok) { pass++; console.log('PASS  ' + name); }
  else { fail++; fails.push(name); console.log('FAIL  ' + name + (extra != null ? '   [' + extra + ']' : '')); }
}

function open() {
  const toasts = [];
  const S = { settings: { ai: { conns: [], active: '' }, image: {}, drive: {} }, keyPasteHint: '' };
  const PRESETS = { mistral: { label: 'Mistral', baseUrl: 'https://api.mistral.ai/v1' }, openrouter: { label: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1' } };
  const conns = () => S.settings.ai.conns;
  const ctx = {
    console, S, PRESETS, conns,
    isPhone: () => false,
    newConn: (preset, apiKey, opts = {}) => ({ id: 'conn' + conns().length, preset, apiKey, label: PRESETS[preset]?.label || preset, ...opts }),
    toast: msg => toasts.push(msg),
    saveSettings: () => {}, folderIdFrom: () => '', rerender: () => {}, setupConn: () => {},
    Vault: { schedule: () => {} }
  };
  vm.createContext(ctx);
  vm.runInContext(APP, ctx, { filename: 'js/setup.js (under test)' });
  return { keys: ctx.__keys, S, toasts, conns };
}

(async () => {
  {
    const { keys, S, toasts, conns } = open();
    await keys.importKeys('A1'.repeat(10));   /* 20 chars: no provider shape */
    is('an unmatched paste sets the inline hint', S.keyPasteHint === 'No provider matched that key.', S.keyPasteHint);
    is('the hint toast names a label example', /mistral =/.test(toasts[0] || ''), toasts[0]);
    is('an unmatched paste adds no connection', conns().length === 0, conns().length);
  }
  {
    const { keys, S, conns } = open();
    S.keyPasteHint = 'stale';
    await keys.importKeys('A1'.repeat(16));
    is('a bare 32-character key still imports as Mistral', conns().length === 1 && conns()[0].preset === 'mistral');
    is('a successful import clears an older hint', S.keyPasteHint === '');
  }
  {
    const { keys, S, conns } = open();
    await keys.importKeys('mistral = ' + 'z'.repeat(40));
    is('a labelled unusual key takes the manual-compatible path', conns().length === 1 && conns()[0].preset === 'mistral');
    is('a labelled key leaves no failure hint', S.keyPasteHint === '');
  }
  {
    const { keys, S, toasts } = open();
    await keys.importKeys('A1'.repeat(16));
    toasts.length = 0; S.keyPasteHint = 'stale';
    await keys.importKeys('A1'.repeat(16));
    is('a duplicate key is reported as already added', /already added/i.test(toasts[0] || ''), toasts[0]);
    is('a duplicate key clears the failure hint', S.keyPasteHint === '');
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) { console.log('Failed: ' + fails.join(', ')); process.exit(1); }
})();
