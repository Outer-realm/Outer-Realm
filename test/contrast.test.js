'use strict';
/* =========================================================================
   Can people actually read the story?

   Reads the real colour variables out of css/realm.css and checks every text
   colour against the two surfaces it is used on (page background and panel)
   for WCAG AA contrast (4.5:1 for normal text). Also checks that the app
   honours reduced-motion and shows a keyboard focus ring.

     node test/contrast.test.js
   ========================================================================= */
const fs = require('fs');
const path = require('path');

const css = fs.readFileSync(path.join(__dirname, '..', 'css', 'realm.css'), 'utf8');

let pass = 0, fail = 0;
function is(what, ok, detail) {
  if (ok) { pass++; console.log('  ok   ' + what + (detail ? '  (' + detail + ')' : '')); }
  else { fail++; console.log('  FAIL ' + what + (detail ? '  (' + detail + ')' : '')); }
}

/* ---------- colour maths ---------- */
const hex = s => {
  const m = String(s).trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
};
const channel = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
const lum = rgb => 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2]);
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

/* ---------- the palette actually shipped ---------- */
const vars = {};
for (const m of css.matchAll(/--([a-z0-9-]+)\s*:\s*(#[0-9a-f]{3,6})/gi)) vars[m[1]] = m[2];

console.log('Palette found: ' + Object.keys(vars).length + ' colours');
const need = ['bg', 'panel', 'ink', 'green', 'blue', 'red', 'gem'];
for (const name of need) is(`--${name} is defined`, !!vars[name], vars[name]);

const surfaces = [['bg', vars.bg], ['panel', vars.panel]].filter(x => hex(x[1]));
is('two surfaces to check against', surfaces.length === 2, surfaces.map(s => s[0]).join(' + '));

/* text colours a reader has to read easily */
const texts = ['ink', 'muted', 'green', 'blue', 'red', 'gem'].filter(n => vars[n]);
is('at least five text colours checked', texts.length >= 5, texts.join(', '));

for (const t of texts) {
  for (const [sname, shex] of surfaces) {
    const fg = hex(vars[t]), bg = hex(shex);
    if (!fg || !bg) continue;
    const r = ratio(fg, bg);
    is(`${t} on ${sname} is readable`, r >= 4.5, r.toFixed(2) + ':1');
  }
}

/* the narrator's green is set on the message class itself, so check that too */
const narr = css.match(/\.msg\.gm\s+\.narr\s*\{[^}]*color\s*:\s*(#[0-9a-f]{3,6})/i) || css.match(/color\s*:\s*(#b3ddc4)/i);
if (narr) {
  for (const [sname, shex] of surfaces) {
    const r = ratio(hex(narr[1]), hex(shex));
    is(`narration on ${sname} is readable`, r >= 4.5, narr[1] + ' = ' + r.toFixed(2) + ':1');
  }
} else is('the narration colour can be found', false, 'looked for .msg.gm .narr');

/* thoughts must not be the same colour as speech, or the mark is invisible */
if (vars.blue && vars.ink) is('thoughts are a different colour from speech', vars.blue.toLowerCase() !== vars.ink.toLowerCase(), vars.blue + ' vs ' + vars.ink);

/* ---------- motion & keyboard ---------- */
is('reduced-motion is honoured', /@media\s*\(prefers-reduced-motion:\s*reduce\)/.test(css));
is('keyboard focus is visible', /:focus-visible\s*\{[^}]*outline/.test(css));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
