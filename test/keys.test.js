#!/usr/bin/env node
'use strict';
/* =========================================================================
   Pasted key detection

   Mistral keys have no documented prefix, so a key copied straight from the
   console is a bare 32-character value. This runs the real parser from
   js/setup.js and checks that bare Mistral keys and labelled Mistral keys are
   both recognised, without turning every short bare string into a key.

   Run:  node test/keys.test.js
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

const APP = part('js/setup.js', 'const KEY_PATTERNS', 'async function importKeys')
  + '\n;globalThis.__parseKeys = parseKeys;';

const ctx = {
  console,
  PRESETS: { mistral: { label: 'Mistral' }, openrouter: { label: 'OpenRouter' } }
};
vm.createContext(ctx);
vm.runInContext(APP, ctx, { filename: 'js/setup.js (under test)' });
const parse = ctx.__parseKeys;

let pass = 0, fail = 0;
const fails = [];
function is(name, ok, extra) {
  if (ok) { pass++; console.log('PASS  ' + name); }
  else { fail++; fails.push(name); console.log('FAIL  ' + name + (extra != null ? '   [' + extra + ']' : '')); }
}

const mistral = 'A1'.repeat(16);   /* 32 letters and digits, Mistral's documented shape */

is('a bare 32-character key is recognised as Mistral', (() => {
  const p = parse(mistral); return p.conns.length === 1 && p.conns[0].preset === 'mistral' && p.conns[0].apiKey === mistral;
})());
is('MISTRAL_API_KEY = ... is recognised', (() => {
  const p = parse(`MISTRAL_API_KEY = ${mistral}`); return p.conns.length === 1 && p.conns[0].preset === 'mistral';
})());
is('mistral = ... is recognised', (() => {
  const p = parse(`mistral = ${mistral}`); return p.conns.length === 1 && p.conns[0].preset === 'mistral';
})());
is('a prefixed mistral- key is recognised', (() => {
  const p = parse('mistral-' + 'a'.repeat(28)); return p.conns.length === 1 && p.conns[0].preset === 'mistral';
})());
is('an OpenRouter key still wins over the bare-key rule', (() => {
  const p = parse('sk-or-v1-' + 'a'.repeat(32)); return p.conns.length === 1 && p.conns[0].preset === 'openrouter';
})());
is('a short bare string is still not treated as a key', (() => {
  const p = parse('A1'.repeat(10)); return p.conns.length === 0;
})());

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) { console.log('Failed: ' + fails.join(', ')); process.exit(1); }
