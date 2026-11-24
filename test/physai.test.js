'use strict';
/* =========================================================================
   "Fill this section with AI" on the companion's detailed physical panel.

   Runs the real palPhysAI from js/palbuild.js with a stubbed AI and pins:
     - answers the player already wrote are never overwritten
     - only the empty ones are asked for
     - adult-only measurements are left out unless adult content is on
     - long answers are cut to PHYS_MAX, unknown keys are ignored
     - a full panel asks before replacing, and "no" sends no request

     node test/physai.test.js
   ========================================================================= */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'palbuild.js'), 'utf8');
const between = (a, b) => { const i = src.indexOf(a); if (i < 0) throw new Error('missing ' + a); const j = src.indexOf(b, i); return src.slice(i, j < 0 ? undefined : j); };

let pass = 0, fail = 0;
const is = (what, ok, detail) => { if (ok) { pass++; console.log('  ok   ' + what + (detail ? '  (' + detail + ')' : '')); } else { fail++; console.log('  FAIL ' + what + (detail ? '  (' + detail + ')' : '')); } };

/* ---------- harness ---------- */
let calls, reply, confirmAnswer, toasts, confirms, failRender;
const ctx = {
  console,
  PHYS_MAX: 60,
  AGE: { isProtected: d => !!d.protected },
  S: {},
  scrollY: 0,
  scrollTo: () => {},
  renderPalEditor: () => { if (failRender) throw new Error('render failed'); },
  toast: (t) => toasts.push(String(t)),
  confirm: (q) => { confirms.push(String(q)); return confirmAnswer; },
  tryJSON: t => { try { return JSON.parse(t); } catch { return null; } },
  stripThink: t => String(t),
  chat: async (msgs) => {
    calls.push(msgs);
    return typeof reply === 'function' ? reply(msgs) : JSON.stringify(reply);
  }
};
ctx.globalThis = ctx;

const code =
  between('const PHYS_MAX', 'function physHTML') + '\n' +
  between('async function palPhysAI()', 'function renderPalEditor()') + '\n' +
  'globalThis.__p = { palPhysAI, PHYS_FIELDS, PHYS_MAX };';
vm.createContext(ctx);
try { vm.runInContext(code, ctx); } catch (e) { console.error('Could not load palbuild pieces: ' + e.message); process.exit(1); }
const { palPhysAI, PHYS_FIELDS, PHYS_MAX } = ctx.__p;

const reset = (draft, ai, yes = true) => {
  calls = []; toasts = []; confirms = []; reply = ai; confirmAnswer = yes; failRender = false;
  ctx.S.palDraft = draft; ctx.S.palPhysBusy = false;
};
const sysText = () => String(calls[0][0].content);
const userText = () => String(calls[0][1].content);

/* ---------- 1. only the blanks are written ---------- */
const draft = { id: 'p1', name: 'Mara', age: 27, sex: 'female', adult: true, phys: { height: '172 cm', eyes: 'grey, heavy-lidded' } };
reset(draft, { height: '180 cm', eyes: 'blue', hair: 'dark auburn, waist-length', nose: 'straight, a little wide', bogus: 'ignored' });
(async () => {
  await palPhysAI();
  is('one request was made', calls.length === 1, String(calls.length));
  is('the written answer is kept', draft.phys.height === '172 cm', draft.phys.height);
  is('the written eyes are kept', draft.phys.eyes === 'grey, heavy-lidded', draft.phys.eyes);
  is('a blank answer was filled', draft.phys.hair === 'dark auburn, waist-length', draft.phys.hair);
  is('another blank answer was filled', !!draft.phys.nose, draft.phys.nose);
  is('unknown keys from the AI are ignored', !('bogus' in draft.phys));
  is('the player’s own answers are sent as facts', /172 cm/.test(userText()) && /grey, heavy-lidded/.test(userText()), (userText().split('ALREADY')[1] || '').slice(0, 90));
  is('the missing answers are named as what to write', /only the missing answers/.test(userText()));
  is('existing answers are not requested from the AI', !/"height"/.test(sysText()) && !/"eyes"/.test(sysText()), sysText().split('\n').pop().slice(0, 80));
  is('a blank answer is requested', /"hair"/.test(sysText()) && /"nose"/.test(sysText()));
  is('it says how many were filled', /Filled 2 answers/.test(toasts.join(' | ')), toasts.join(' | '));
  is('the busy flag is cleared', ctx.S.palPhysBusy === false);

  /* ---------- 2. adult-only fields ---------- */
  const kid = { id: 'p2', name: 'Sam', age: 20, sex: 'female', adult: false, protected: true, phys: {} };
  reset(kid, { height: '165 cm', bust: '34C', waistHips: '60/90' });
  await palPhysAI();
  is('measurements are not requested without adult content', !/"bust"/.test(sysText()) && !/"waistHips"/.test(sysText()));
  is('they are ignored if the AI sends them anyway', kid.phys.bust === undefined && kid.phys.waistHips === undefined, JSON.stringify(kid.phys));
  is('the rest is still filled', kid.phys.height === '165 cm');

  /* ---------- 3. a full panel asks first ---------- */
  const full = { id: 'p3', name: 'Ivy', age: 31, sex: 'female', adult: true, phys: {} };
  for (const k of Object.keys(PHYS_FIELDS)) if (!['bust', 'waistHips'].includes(k)) full.phys[k] = 'x';
  full.phys.bust = 'x'; full.phys.waistHips = 'x';
  reset(full, { hair: 'red' }, false);
  await palPhysAI();
  is('a full panel asks before replacing', confirms.length === 1 && /Replace them all/.test(confirms[0]), confirms[0]);
  is('saying no sends no request', calls.length === 0);
  is('saying no changes nothing', full.phys.hair === 'x');

  /* ---------- 3b. confirming a replace asks for a fresh set ---------- */
  reset(full, { hair: 'copper, jaw-length, straight', height: '170 cm' }, true);
  await palPhysAI();
  is('replacing does send a request', calls.length === 1, String(calls.length));
  is('replacing does not hand the old answers over as rules', !/never contradict/i.test(userText()), userText().slice(-120));
  is('replacing asks for a fresh set', /fresh set of answers/.test(userText()));
  is('replacing tells the model to choose the details', /Choose these details yourself/.test(sysText()));
  is('the new answers are used', full.phys.hair === 'copper, jaw-length, straight', full.phys.hair);

  /* ---------- 4. long answers are cut, empty ones are not counted ---------- */
  const long = { id: 'p4', name: 'Ada', age: 40, sex: 'female', adult: false, phys: {} };
  reset(long, { hair: 'h'.repeat(200), nose: '   ' });
  await palPhysAI();
  is('a long answer is cut to PHYS_MAX', long.phys.hair.length === PHYS_MAX, String(long.phys.hair.length));
  is('a blank answer from the AI is dropped', !String(long.phys.nose || '').trim());
  is('nothing usable is reported honestly', /nothing usable/.test(toasts.join(' | ')) || /Filled \d+ answer/.test(toasts.join(' | ')), toasts.join(' | '));

  /* ---------- 5. a failure does not lock the panel ---------- */
  const bad = { id: 'p5', name: 'Nell', age: 30, sex: 'female', adult: false, phys: {} };
  reset(bad, () => { throw new Error('model offline'); });
  await palPhysAI();
  is('the failure is shown', /Could not fill that in: model offline/.test(toasts.join(' | ')), toasts.join(' | '));
  is('the busy flag is cleared after a failure', ctx.S.palPhysBusy === false);

  /* ---------- 6. a render error cannot leave the button stuck ---------- */
  const res = { id: 'p6', name: 'Rae', age: 29, sex: 'female', adult: false, phys: {} };
  reset(res, { hair: 'dark' });
  failRender = true;
  await palPhysAI();
  is('a render error is reported', /Could not fill that in/.test(toasts.join(' | ')), toasts.join(' | '));
  is('the busy flag is cleared when rendering fails', ctx.S.palPhysBusy === false, String(ctx.S.palPhysBusy));
  is('no request goes out after a render error', calls.length === 0, String(calls.length));

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
