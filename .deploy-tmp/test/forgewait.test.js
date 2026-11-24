'use strict';
/* Forge wait-status test — no browser, no network.
   Loads forgeWaitText() out of js/images.js into a VM and checks what the picture
   placeholder says while Forge is restarting, back up, or merely busy.

     node test/forgewait.test.js
*/
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'js/images.js'), 'utf8');
const a = src.indexOf('function forgeWaitText');
const b = src.indexOf('\n}', a);
if (a < 0 || b < 0) throw new Error('forgeWaitText not found in js/images.js');
const ctx = vm.createContext({ console });
vm.runInContext(src.slice(a, b + 2) + '\n;globalThis.__w = forgeWaitText;', ctx, { filename: 'images.js' });
const waitText = ctx.__w;

let pass = 0, fail = 0;
function is(name, got, want) {
  const ok = got === want;
  if (ok) pass++;
  else { fail++; console.log('FAIL  ' + name + '\n      got: ' + JSON.stringify(got) + '\n      want:' + JSON.stringify(want)); return; }
  console.log('PASS  ' + name);
}

/* no picture, no note */
is('no status, never crashed', waitText(null, false), '');
is('engine up, never crashed', waitText({ state: 'up' }, false), '');
/* a restart in progress */
is('starting says so', waitText({ state: 'starting', forge: false }, false), 'Forge crashed and is restarting…');
is('restarting flag says so', waitText({ state: 'down', restarting: true }, false), 'Forge crashed and is restarting…');
/* after the crash was seen, the replay gets its own line */
is('back up after a crash', waitText({ state: 'up', forge: true }, true), 'Forge is back — finishing your picture…');
is('still down after a crash', waitText(null, true), 'Forge crashed and is restarting…');
/* a busy Forge answering slowly must not be called crashed */
is('busy engine stays quiet', waitText({ state: 'down', forge: false, retrying: false }, false), '');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
