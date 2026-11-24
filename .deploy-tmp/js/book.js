'use strict';
/* =========================================================================
   Save a finished (or unfinished) adventure as one readable HTML book.

   One self-contained file — no scripts, no images to fetch — with the same
   colour language as the app: narration in the GM's green, spoken lines in
   white, actions red, directions gold and private thoughts blue. Made to be
   kept, printed, or sent to the people who played it.

     Campaign tools → Story → "Save as a book"
   ========================================================================= */
const bookStamp = () => new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });

function storybookHTML(c) {
  const ch = c.character || {};
  const rows = [];
  for (const m of arr(c.messages)) {
    if (m.hidden || m.failed || m.rollAsk || m.streaming) continue;
    if (!['gm', 'player', 'comp', 'roll'].includes(m.role)) continue;
    if (m.role === 'gm') rows.push(`<section class="gm"><h3>${esc(gmOf(c).name || 'The story')}</h3>${md(m.text || '')}</section>`);
    else if (m.role === 'comp') rows.push(`<section class="line"><h3>${esc(m.name || 'Companion')}</h3><p>${esc(m.text || '')}</p></section>`);
    else if (m.role === 'roll') rows.push(`<p class="dice">${esc(m.text || '')}</p>`);
    else rows.push(`<section class="line me"><h3>${esc(ch.name || 'You')}</h3><p>${turnHTML(m.text || '', m.mode || 'act')}</p></section>`);
  }
  const cast = arr(c.party).map(p => `<li><b>${esc(p.name)}</b>${p.storyRole ? ' — ' + esc(p.storyRole) : ''}</li>`).join('');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(c.title || 'An adventure')}</title>
<style>
  :root { --bg:#0a0b1c; --panel:#151838; --ink:#eceaff; --muted:#a2a4d0; --green:#b3ddc4; --blue:#7cc4ff; --red:#ff6b81; --gem:#f3c96b; }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--ink); font:17px/1.7 Georgia, 'Iowan Old Style', serif; }
  main { max-width:44rem; margin:0 auto; padding:4rem 1.25rem 6rem; }
  header { border-bottom:1px solid #2a2e5e; padding-bottom:2rem; margin-bottom:2.5rem; }
  h1 { font:600 2.4rem/1.15 'Sora', system-ui, sans-serif; margin:0 0 .6rem; }
  h1 + p { color:var(--muted); margin:0 0 1.2rem; font-style:italic; }
  h2 { font:600 1.1rem/1.3 'Sora', system-ui, sans-serif; color:var(--gem); letter-spacing:.08em; text-transform:uppercase; margin:2.5rem 0 1rem; }
  h3 { font:600 .78rem/1.4 'Sora', system-ui, sans-serif; color:var(--muted); letter-spacing:.1em; text-transform:uppercase; margin:2rem 0 .4rem; }
  p { margin:0 0 1rem; }
  .gm p { color:var(--green); }
  .line.me p { color:var(--ink); }
  .think { color:var(--blue); font-style:italic; }
  .act, em.act { color:var(--red); font-style:italic; }
  .tooc { color:var(--gem); }
  .dice { color:var(--muted); font:500 .9rem/1.5 'JetBrains Mono', monospace; border-left:2px solid #2a2e5e; padding-left:.8rem; }
  .who { color:var(--muted); }
  ul { color:var(--muted); padding-left:1.2rem; }
  .meta { color:var(--muted); font-size:.9rem; }
  @media print { body { background:#fff; color:#111; } .gm p { color:#1c3a2c; } .think { color:#1d4f7a; } .act { color:#8a1c2c; } .tooc { color:#6b4a00; } h1, h2 { color:#111; } }
</style></head>
<body><main>
  <header>
    <h1>${esc(c.title || 'An adventure')}</h1>
    ${c.premise ? `<p>${esc(c.premise)}</p>` : ''}
    <p class="meta">${esc(ch.name || 'A traveller')}${ch.storyRole ? `, ${esc(ch.storyRole)}` : ''}${ch.level ? ` · level ${esc(ch.level)}` : ''} · ${esc(gmOf(c).name || 'Game Master')} · saved ${esc(bookStamp())}</p>
  </header>
  ${cast ? `<h2>The cast</h2><ul>${cast}</ul>` : ''}
  ${c.summary ? `<h2>Story so far</h2><p>${esc(c.summary)}</p>` : ''}
  <h2>The story</h2>
  ${rows.join('\n  ') || '<p class="who">Nothing has happened yet.</p>'}
</main></body></html>`;
}

function exportStorybook() {
  const c = cur(); if (!c) return;
  const name = String(c.title || 'Outer Realm').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Outer Realm';
  const blob = new Blob([storybookHTML(c)], { type: 'text/html;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name + ' — storybook.html';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  toast('Storybook saved to your downloads.', 4000);
}
