'use strict';
/* =========================================================================
   Does the reader treat [[thoughts]] as thoughts?

   Everything is read aloud now; the mark decides *how* it is read. This test
   pulls the real thoughtSplit / messageSegments / queueSegments out of
   js/voice.js and feeds them one mixed message per role, pinning that:
     - brackets never survive into what is spoken
     - a thought keeps the speaker's voice but is flagged as a thought
     - narration stays narrator, quotes keep their own speaker
     - the flag reaches the playback queue, where pitch/rate/volume use it

     node test/voicemarks.test.js
   ========================================================================= */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const voiceSrc = fs.readFileSync(path.join(root, 'js', 'voice.js'), 'utf8');
const turnSrc = fs.readFileSync(path.join(root, 'js', 'turnfmt.js'), 'utf8');

const between = (src, a, b) => { const i = src.indexOf(a); if (i < 0) throw new Error('missing ' + a); const j = src.indexOf(b, i); return src.slice(i, j < 0 ? undefined : j); };

let pass = 0, fail = 0;
const is = (what, ok, detail) => { if (ok) { pass++; console.log('  ok   ' + what + (detail ? '  (' + detail + ')' : '')); } else { fail++; console.log('  FAIL ' + what + (detail ? '  (' + detail + ')' : '')); } };

/* ---------- stubs: only what the two functions touch ---------- */
const ctx = {
  arr: x => Array.isArray(x) ? x : [],
  stripSpeakerTags: t => String(t),
  cleanSpeech: t => String(t).replace(/\s+/g, ' ').trim(),
  TRAIT_TAG: /\[✦\s*([^\]]+?)\s*\]/g,
  sceneSegments: (c, text) => {   /* enough of the real one to check narration vs quotes */
    const out = []; const re = /[“"]([^”"]+)[”"]/g; let i = 0, m;
    while ((m = re.exec(text))) {
      if (m.index > i) out.push({ who: null, text: text.slice(i, m.index).trim() });
      out.push({ who: { name: 'Varn', ent: { name: 'Varn', sex: 'male' } }, text: m[1] });
      i = re.lastIndex;
    }
    if (i < text.length) out.push({ who: null, text: text.slice(i).trim() });
    return out.filter(s => s.text);
  },
  S: { settings: { ui: {} } },
  VOICE: { items: [], playing: true, gen: 0 },
  engine: () => 'device',
  narratorVoice: () => 'Narrator',
  voiceOf: (c, ent, name) => name || 'Unknown',
  voiceOn: () => true,
  stopVoice: () => {},
  runVoice: () => {},
  renderSpeakingState: () => {},
  chunk: t => [t],
  console
};
ctx.globalThis = ctx;

const code =
  between(turnSrc, 'const traitDesc', 'const turnAllOOC') + '\n' +
  between(voiceSrc, '/* [[double brackets]] are inner thoughts', '/* ---------- playback ----------') + '\n' +
  between(voiceSrc, 'function queueSegments(', 'function pcClip(') + '\n' +
  'globalThis.__v = { thoughtSplit, messageSegments, queueSegments };';
vm.createContext(ctx);
try { vm.runInContext(code, ctx); } catch (e) { console.error('Could not load voice.js pieces: ' + e.message); process.exit(1); }
const { thoughtSplit, messageSegments, queueSegments } = ctx.__v;

/* ---------- 1. pulling thoughts out ---------- */
const split = thoughtSplit('The door is locked. [[She is hiding something.]] I step back.');
is('three pieces, one of them a thought', split.length === 3 && split.filter(x => x.think).length === 1, JSON.stringify(split.map(x => x.think)));
is('the thought text has no brackets', split[1].text === 'She is hiding something.', JSON.stringify(split[1].text));
is('plain text stays plain', split[0].think === false && split[2].think === false);
is('an unclosed [[ stays as narration', thoughtSplit('A [[broken mark').every(x => !x.think));

/* ---------- 2. the player's own thought ---------- */
const c = { character: { name: 'Rin' }, party: [], voiceMap: {} };
const player = messageSegments(c, { role: 'player', mode: 'say', text: 'I step in. [[This is a trap.]]' });
is('player speech is still their voice', player[0].who?.name === 'Rin' && player[0].think === false, player[0].who?.name);
is('the player thought is flagged', player[1]?.think === true, JSON.stringify(player[1]));
is('the player thought keeps their voice', player[1]?.who?.name === 'Rin', player[1]?.who?.name);
is('the player thought is bracket-free', player[1]?.text === 'This is a trap.', player[1]?.text);

/* ---------- 3. a companion's thought, with an action beside it ---------- */
c.party = [{ id: 'p1', name: 'Mara' }];
const comp = messageSegments(c, { role: 'comp', compId: 'p1', text: '*She frowns.* [[He is lying.]]' });
const compThink = comp.filter(x => x.think);
is('the companion thought is flagged', compThink.length === 1, String(compThink.length));
is('it is in the companion’s voice', compThink[0]?.who?.name === 'Mara', compThink[0]?.who?.name);
is('her action stays narration', comp.some(x => !x.think && x.who === null));
is('no asterisks survive', !comp.some(x => /\*/.test(x.text)), comp.map(x => x.text).join(' | '));

/* ---------- 4. GM narration: green voice, quotes, one thought ---------- */
const gm = messageSegments(c, { role: 'gm', text: 'The hall is cold. [[So this is the throne room.]] "You are late," says Varn.' });
is('narration is the narrator', gm[0].who === null && gm[0].think === false, gm[0].text);
is('the GM thought is flagged and separate', gm[1]?.think === true && gm[1]?.who === null, JSON.stringify(gm[1]));
is('the quoted line keeps its speaker', gm[2]?.who?.name === 'Varn' && gm[2]?.think === false, gm[2]?.who?.name);
is('the quote keeps its words', gm[2]?.text === 'You are late,', gm[2]?.text);

/* ---------- 5. it reaches the queue ---------- */
ctx.VOICE.items = [];
queueSegments(c, gm);
is('every queued line is there', ctx.VOICE.items.length === gm.length, ctx.VOICE.items.length + ' items');
is('the thought is queued as a thought', ctx.VOICE.items.filter(i => i.think).length === 1, JSON.stringify(ctx.VOICE.items.map(i => !!i.think)));
is('the thought is not bracketed when spoken', !ctx.VOICE.items.some(i => i.think && /\[\[|\]\]/.test(i.text)));
is('the narrator line is queued in the narrator voice', ctx.VOICE.items[0].voice === 'Narrator', ctx.VOICE.items[0].voice);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
