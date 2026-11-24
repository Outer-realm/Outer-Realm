#!/usr/bin/env node
'use strict';
/* =========================================================================
   Turn marks and narration marks

   One mixed message, read both ways: the player's turn (parseTurn/turnHTML)
   and the narrator's paragraph (md). Plain text is speech, *...* is an
   action, [[...]] is a private thought, ((...)) is a direction. Each has to
   come back as the right kind and carry the right CSS class, so a later edit
   cannot quietly drop one of the marks.

   Run:  node test/turnmarks.test.js
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

/* the real parseTurn/turnHTML and the real md(), with only their helpers stubbed */
const TURNS = part('js/turnfmt.js', 'const TRAIT_TAG', '/* composer buttons')
  + '\n;globalThis.__turn = { parseTurn, turnHTML };';
const NARR = part('js/ai.js', 'const stripSpeakerTags', 'function md(')
  + part('js/ai.js', 'function md(', '/* ===')
  + '\n;globalThis.__md = md;';

const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const ctx = { console, esc, arr: v => Array.isArray(v) ? v : [], isCompanion: () => false };
vm.createContext(ctx);
vm.runInContext(TURNS, ctx, { filename: 'js/turnfmt.js (under test)' });
vm.runInContext(NARR, ctx, { filename: 'js/ai.js (under test)' });
const { parseTurn, turnHTML } = ctx.__turn;
const md = ctx.__md;

let pass = 0, fail = 0;
const fails = [];
function is(name, ok, extra) {
  if (ok) { pass++; console.log('PASS  ' + name); }
  else { fail++; fails.push(name); console.log('FAIL  ' + name + (extra != null ? '   [' + extra + ']' : '')); }
}

const MIXED = 'I step in. *I raise my hand* [[I hope this works]] ((skip to the docks)) "Hello?"';

console.log('\n1. A player turn is split into the right kinds');
{
  const parts = parseTurn(MIXED, 'say');
  const kinds = parts.map(p => p.k).join(',');
  is('plain text is speech', parts[0].k === 'say' && parts[0].t === 'I step in.', parts[0].k + ' / ' + parts[0].t);
  is('*asterisks* is an action', parts[1].k === 'act' && parts[1].t === 'I raise my hand', parts[1].k + ' / ' + parts[1].t);
  is('[[brackets]] is a thought', parts[2].k === 'think' && parts[2].t === 'I hope this works', parts[2].k + ' / ' + parts[2].t);
  is('((parentheses)) is a direction', parts[3].k === 'ooc' && parts[3].t === 'skip to the docks', parts[3].k + ' / ' + parts[3].t);
  is('quoted speech stays speech', parts[4].k === 'say' && parts[4].t === 'Hello?', parts[4].k + ' / ' + parts[4].t);
  is('the marks arrive in message order', kinds === 'say,act,think,ooc,say', kinds);
  is('the thought is not swallowed by the direction', !parts.some(p => /\[\[|\]\]/.test(p.t)), JSON.stringify(parts.map(p => p.t)));
}

console.log('\n2. The rendered player turn carries the matching classes');
{
  const html = turnHTML(MIXED, 'say');
  is('action gets class tact', html.includes('<em class="tact">I raise my hand</em>'), html);
  is('thought gets class think', html.includes('<em class="think">[[ I hope this works ]]</em>'), html);
  is('direction gets class tooc', html.includes('<span class="tooc">(( skip to the docks ))</span>'), html);
  is('speech gets class tsay', html.includes('<span class="tsay">I step in.</span>'), html);
}

console.log('\n3. The narrator can use the same marks');
{
  const out = md('The lantern gutters. [[Someone is behind the door.]] *Varn lifts her blade.* ((The fog thickens.)) "Say nothing."');
  is('narration thought gets class think', out.includes('<em class="think">Someone is behind the door.</em>'), out);
  is('narration action gets class act', out.includes('<em class="act">Varn lifts her blade.</em>'), out);
  is('narration direction gets class tooc', out.includes('<span class="tooc">(( The fog thickens. ))</span>'), out);
  is('the thought brackets are consumed, not printed', !out.includes('[['), out);
  is('plain narration is left as prose', out.startsWith('<p>The lantern gutters. '), out);
}

console.log('\n4. Edge cases stay harmless');
{
  is('an unclosed [[ is not turned into a thought', !md('A [[broken thought').includes('class="think"'), md('A [[broken thought'));
  is('legacy _underscores_ still read as a thought', md('She pauses. _This is a mistake._').includes('<em class="think">This is a mistake.</em>'), md('She pauses. _This is a mistake._'));
  const allOoc = parseTurn('((only a direction))', 'say');
  is('a direction-only turn is still just a direction', allOoc.length === 1 && allOoc[0].k === 'ooc', JSON.stringify(allOoc));
  const traits = parseTurn('*I move* [✦ Brave] [[careful]]', 'say');
  is('a trait tag does not break the thought beside it', traits.some(p => p.k === 'think' && p.t === 'careful'), JSON.stringify(traits));
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) { console.log('Failed: ' + fails.join(', ')); process.exit(1); }
