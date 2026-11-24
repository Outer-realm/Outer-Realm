'use strict';
/* Texting-mode cleaner test — no browser, no network.
   Loads palTextOnly() out of js/pals.js into a VM and checks two things:
     1. roleplay-shaped replies lose stage directions, *actions* and wrapper quotes;
     2. ordinary messages, especially short ones, come through untouched.

     node test/texting.test.js
*/
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'js/pals.js'), 'utf8');
const a = src.indexOf('const PAL_STAGE_WORDS');
const b = src.indexOf('/* drop a paragraph');
if (a < 0 || b < 0) throw new Error('texting helpers not found in js/pals.js');
const ctx = vm.createContext({ console });
vm.runInContext(src.slice(a, b) + '\n;globalThis.__palTextOnly = palTextOnly;', ctx, { filename: 'pals.js' });
const palTextOnly = ctx.__palTextOnly;

let pass = 0, fail = 0;
function isTrue(name, got, want) {
  const ok = got === want;
  if (ok) pass++;
  else { fail++; console.log('FAIL  ' + name + '\n      got: ' + JSON.stringify(got) + '\n      want:' + JSON.stringify(want)); return; }
  console.log('PASS  ' + name);
}
function is(name, input, want) {
  const got = palTextOnly(input);
  const ok = got === want;
  if (ok) pass++;
  else { fail++; console.log('FAIL  ' + name + '\n      in:  ' + JSON.stringify(input) + '\n      got: ' + JSON.stringify(got) + '\n      want:' + JSON.stringify(want)); return; }
  console.log('PASS  ' + name);
}

/* ---------- ordinary messages must never be rewritten ---------- */
const ordinary = [
  'Looks good.',
  'Looks good',
  'Looks like rain.',
  'Looks like the meeting ran long.',
  'Smiles are free, apparently.',
  'Sounds good. Can you send the address?',
  'lol',
  'ok',
  'See you at 8.',
  "sorry, got held up",
  "I can't sleep. You up?",
  'Turns out he was right.',
  'hey, you up? i can\'t sleep',
  'Nothing much. Just winding down.',
  'looks good',
  'sounds good',
  'looks good in that dress',
  'turns out he was right',
  'takes a while',
  'gives her a call',
  'picks up the phone',
  'looks up the address',
  'holds up',
];
for (const m of ordinary) is('ordinary untouched: ' + JSON.stringify(m), m, m.trim());

/* ---------- ordinary quoted text keeps its words ---------- */
is('quoted ordinary unwraps', '"Looks good."', 'Looks good.');
is('real quotation kept', 'he said "I\'ll be there" and hung up', 'he said "I\'ll be there" and hung up');
is('quoted song title kept', 'my favorite song is "Blackbird"', 'my favorite song is "Blackbird"');

/* ---------- roleplay replies lose the stage directions ---------- */
const sample = `"It's private. It's messy, honestly. My dad calls it 'wasting time' when I'm supposed to be studying, but for me? It's just... releasing all that pressure. The stress from school, the noise from my house, even the weird tension between you and Carol... sometimes everything feels so heavy I just need something to break it."

looks down at her hands, then back up at him with a small, apologetic smile

"Sorry if that sounds blunt. But it's true, Alex. It's the only time I can be completely unguarded without worrying about making a mistake or disappointing anyone else. Even Cooper is different—he just gets cookies and belly rubs, but I have to... do this alone."`;
const cleaned = palTextOnly(sample);
isTrue('sample keeps first speech', /It's private/.test(cleaned), true);
isTrue('sample keeps second speech', /Sorry if that sounds blunt/.test(cleaned), true);
isTrue('sample drops stage direction', /looks down/.test(cleaned), false);
isTrue('sample drops wrapper quotes', /["“”]/.test(cleaned), false);

is('inline narration before quote', 'She looks down at her hands. "It\'s private."', "It's private.");
is('roleplay quote plus normal short line', '"Hey, you\'re late."\n\nLooks good.', "Hey, you're late.\n\nLooks good.");
is('roleplay quote plus another normal line', '"Hey."\n\nTurns out he was right.', 'Hey.\n\nTurns out he was right.');
is('roleplay + lowercase looks good', '"Hey."\n\nlooks good', 'Hey.\n\nlooks good');
is('roleplay + lowercase sounds good', '"Hey."\n\nsounds good', 'Hey.\n\nsounds good');
is('roleplay + lowercase turns out', '"Hey."\n\nturns out he was right', 'Hey.\n\nturns out he was right');
is('roleplay + she looks good', '"Hey."\n\nshe looks good', 'Hey.\n\nshe looks good');
is('capitalised subject narration still drops', 'She smiles.\n\n"Hey."', 'Hey.');
is('lowercase verb-first narration still drops', 'looks down at her hands\n\n"Hey."', 'Hey.');
is('lowercase subject narration drops', 'he looks down\n\n"Hey."', 'Hey.');
is('body part narration drops', 'shakes her head\n\n"Hey."', 'Hey.');
is('direction narration drops', 'leans on the counter\n\n"Hey."', 'Hey.');
is('adverb narration drops', 'smiles softly\n\n"Hey."', 'Hey.');
is('action plus quote', '*smiles* "hey, you\'re late."', "hey, you're late.");
is('action then words stays', '*nods* Looks good.', 'Looks good.');
is('group name prefix kept', '{Mara} *grins* "guess who"', '{Mara} guess who');
is('action-only line vanishes', 'she smiles\n\n"hey there"', 'hey there');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
