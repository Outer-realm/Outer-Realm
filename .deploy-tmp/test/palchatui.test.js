#!/usr/bin/env node
'use strict';
/* =========================================================================
   Companion chat UI: hide a photo, and don't drag the reader down while a
   reply is still being written.

   Runs the real paintPalLog and palPhotoHTML functions in a throwaway VM with
   a tiny fake chat log. It checks the persisted hidden flag's rendering, the
   show/hide controls, and the scroll position while busy vs. at the end.

   Run:  node test/palchatui.test.js
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
  part('js/pals.js', 'function paintPalLog', '/* ---------- memory'),
  part('js/pics.js', 'function palPhotoHTML', '/* ---------- the player, in their own words'),
  ';globalThis.__ui = { paintPalLog, palPhotoHTML };'
].join('\n');

let pass = 0, fail = 0;
const fails = [];
function is(name, ok, extra) {
  if (ok) { pass++; console.log('PASS  ' + name); }
  else { fail++; fails.push(name); console.log('FAIL  ' + name + (extra != null ? '   [' + extra + ']' : '')); }
}

function open() {
  const log = { scrollHeight: 1000, scrollTop: 400, clientHeight: 400, innerHTML: '' };
  const ctx = {
    console,
    S: { view: 'palchat', palBusy: { chat: 'c', msg: 'm' } },
    curChat: () => ({ id: 'c' }),
    $: sel => sel === '#pallog' ? log : null,
    palLogHTML: () => '<div class="pmsg">reply</div>',
    esc: s => String(s),
    palImg: () => 'photo.jpg'
  };
  vm.createContext(ctx);
  vm.runInContext(APP, ctx, { filename: 'js/pals.js + js/pics.js (under test)' });
  return { ui: ctx.__ui, S: ctx.S, log };
}

const ch = { id: 'c' }, p = { name: 'Stacey' };

/* --- hide / show controls ------------------------------------------------- */
{
  const { ui } = open();
  const html = ui.palPhotoHTML(ch, { id: 'm1', image: { prompt: 'x' } }, p);
  is('a normal chat photo renders the image', html.includes('<img class="palphoto"'));
  is('a normal chat photo has a Hide photo button', html.includes('data-act="palhidephoto" data-id="m1"'));
  is('a normal chat photo has no hidden placeholder', !html.includes('Photo hidden'));
}
{
  const { ui } = open();
  const html = ui.palPhotoHTML(ch, { id: 'm1', image: { prompt: 'x', hidden: true } }, p);
  is('a hidden photo does not render the image', !html.includes('<img'));
  is('a hidden photo says it is hidden', html.includes('Photo hidden'));
  is('a hidden photo offers Show photo for that message', html.includes('data-act="palshowphoto" data-id="m1"'));
}

/* --- reading while the reply streams -------------------------------------- */
{
  const { ui, log } = open();
  log.scrollTop = 400;   /* 200px up, still reading */
  ui.paintPalLog();
  is('while busy, the reader keeps their exact scroll position', log.scrollTop === 400, log.scrollTop);
  is('while busy, the new text is still painted', log.innerHTML.includes('reply'));
}
{
  const { ui, log } = open();
  log.scrollTop = 600;   /* exactly at the bottom: 1000 - 600 - 400 = 0 */
  ui.paintPalLog();
  is('while busy, a reader at the bottom follows the reply', log.scrollTop === 1000, log.scrollTop);
}
{
  const { ui, S, log } = open();
  S.palBusy = null; log.scrollTop = 600;
  ui.paintPalLog();
  is('after the reply, a reader at the bottom follows it', log.scrollTop === 1000, log.scrollTop);
}
{
  const { ui, S, log } = open();
  S.palBusy = null; log.scrollTop = 100;
  ui.paintPalLog();
  is('after the reply, a reader further up is not dragged down', log.scrollTop === 100, log.scrollTop);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) { console.log('Failed: ' + fails.join(', ')); process.exit(1); }
