'use strict';
/* ---------- builder page ---------- */
function budgetHTML(b) {
  return `<span class="bpill ${b.points > b.cap ? 'over' : b.points === b.cap ? 'ok' : ''}">Stats ${b.points}/${b.cap}</span>
    <span class="bpill ${b.left < 0 ? 'over' : 'ok'}">TP left ${b.left}</span>
    <span class="bpill">Traits −${b.pos} · Negatives +${b.neg}${b.gear ? ` · Gear −${b.gear}` : ''}${b.sig ? ` · Signatures −${b.sig}` : ''}${b.conv ? ` · To EP −${b.conv}` : ''}</span>`;
}
function updateBudgets() { const el = $('#budgetbar'); if (el && S.draft) el.innerHTML = budgetHTML(draftBudget(S.draft)); }
function traitCardHTML(t, i, path = 'traits', bind = 'dpath') {
  const neg = t.polarity === '-';
  const cost = neg ? `+${NEG_BUILD[t.tier]} TP` : `−${POS_COST[t.tier]} TP`;
  return `<div class="tcard ${neg ? 'neg' : ''}">
    <div class="top">
      <select data-${bind}="${path}.${i}.polarity" aria-label="Positive or negative"><option value="+" ${!neg ? 'selected' : ''}>+</option><option value="-" ${neg ? 'selected' : ''}>−</option></select>
      <input type="text" data-${bind}="${path}.${i}.name" value="${esc(t.name === 'Unnamed trait' ? '' : t.name)}" placeholder="${neg ? 'Severe Limp' : 'Potion Craft'}">
      <select data-${bind}="${path}.${i}.tier" aria-label="Tier">${TIERS.map(x => `<option ${t.tier === x ? 'selected' : ''}>${x}</option>`).join('')}</select>
      <button class="iconbtn sm" data-act="ddel" data-list="${path}" data-i="${i}" aria-label="Remove">${icon('x')}</button>
    </div>
    <div class="row" style="margin-top:6px"><span class="tb ${t.tier}">${t.tier} ${neg ? '−' : '+'}${TV[t.tier]}</span><span class="cost">${cost}</span><span class="hint" style="margin:0">· ${effectSlots(t.tier)} story effect${effectSlots(t.tier) > 1 ? 's' : ''}</span></div>
    <label class="f"><span>Applies to (trigger)</span><input type="text" data-${bind}="${path}.${i}.trigger" value="${esc(t.trigger)}" placeholder="${neg ? 'running, climbing, stairs' : 'brewing potions'}"></label>
    <label class="f"><span>Story effects — one per line</span><textarea rows="2" data-${bind}="${path}.${i}.effects" data-list="1" placeholder="${neg ? 'Can\'t sprint' : 'Brews in 2 days instead of 3'}">${esc(t.effects.join('\n'))}</textarea></label>
  </div>`;
}
function renderNew(keepScroll) {
  musicScene(null);
  S.view = 'new';
  if (!S.draft) S.draft = newDraft();
  const D = S.draft; const b = draftBudget(D);
  const sc = keepScroll ? ($('.page')?.scrollTop || 0) : 0;
  const f = (k, label, ph = '', type = 'text') => `<label class="f"><span>${label}</span><input type="${type}" data-dpath="${k}" ${type === 'number' ? 'data-num="1"' : ''} value="${esc(getPath(D, k))}" placeholder="${esc(ph)}"></label>`;
  const ta = (k, label, ph = '', rows = 3) => `<label class="f"><span>${label}</span><textarea rows="${rows}" data-dpath="${k}" placeholder="${esc(ph)}">${esc(getPath(D, k))}</textarea></label>`;
  const pos = D.traits.map((t, i) => [t, i]).filter(([t]) => t.polarity === '+');
  const neg = D.traits.map((t, i) => [t, i]).filter(([t]) => t.polarity === '-');
  const isComp = D.mode === 'companion'; const adding = S.addingPlayer && S.campaigns[S.addingPlayer]; const mp = D.mode === 'mp';
  app().innerHTML = `<div class="pagebar"><button class="iconbtn" data-act="${adding ? 'addcancel' : 'new'}">${icon('back')}</button><h2>${adding ? 'Add a player' : isComp ? 'New companion story' : mp ? 'New multiplayer adventure' : 'New adventure'}</h2><button class="iconbtn" data-act="guide" aria-label="Rules">${icon('help')}</button></div>
  <div class="page">
    ${isComp ? '' : `<div class="budgetbar" id="budgetbar">${budgetHTML(b)}</div>`}
    ${adding ? `<p class="hint" style="font-size:15px;color:var(--ink);margin-top:14px">Build the new player's character. They join <b>${esc(adding.title)}</b> where the story stands.</p>` : `
    <div class="sect">${isComp ? 'The world' : 'The story'}</div>
    ${researchBoxHTML(D)}
    <div class="card" style="margin-top:10px;border-color:#5b4519">
      ${ta('worldPrompt', 'Describe the world you want', 'Harry Potter world, first year at Hogwarts, house rivalries… · Game of Thrones, a minor house in the North… · a pirate archipelago with sea witches…', 2)}
      <button class="btn gold wide" data-act="aiworld" style="margin-top:10px" ${S.worlding ? 'disabled' : ''}>${S.worlding ? '<span class="spin sm"></span> Building your world… <span class="buildsecs"></span>' : icon('spark') + ' Build my world with AI'}</button>
      <button class="btn wide" data-act="bibleopen" data-for="draft" style="margin-top:8px">${icon('scroll')} Import a story bible (from ChatGPT, Claude or a Google Doc)</button>
      <p class="hint">Fills in everything below: title, premise, tone, art style, magic, world notes and hidden GM secrets. Or pick a ready-made story:</p>
      <div class="chips" style="margin-top:8px">${SCENARIOS.map(s => `<button class="chip ${D.scenario === s.id ? 'on' : ''}" data-act="scenario" data-id="${s.id}">${esc(s.name)}</button>`).join('')}</div>
    </div>
    ${f('title', 'Title', 'The Lantern Road')}
    ${f('genre', 'Genre / setting', 'High fantasy, cyberpunk, post-apocalyptic…')}
    ${ta('premise', 'Premise', 'What\'s happening when the story begins?', 5)}
    ${f('tone', 'Tone', 'Grim, cozy, funny, epic…')}
    <div class="kv"><label class="f"><span>Content rating</span><select data-dpath="rating">${RATINGS.map(r => `<option value="${r}" ${normRating(D.rating) === r ? 'selected' : ''}>${RATING_LABEL[r]}</option>`).join('')}</select><span class="hint" style="margin-top:4px">${esc(RATING_BLURB[normRating(D.rating)])}</span></label>
    <label class="f" ${isComp ? 'style="display:none"' : ''}><span>Magic cost</span><select data-dpath="magicCost">${Object.entries(MAGIC_LABEL).map(([k, v]) => `<option value="${k}" ${D.magicCost === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label></div>
    <div class="kv"><label class="f"><span>${isComp ? 'Narrator personality' : 'Game Master personality'}</span><select data-dpath="gmPreset">${Object.entries(GM_PRESETS).map(([k, v]) => `<option value="${k}" ${D.gmPreset === k ? 'selected' : ''}>${v.label}</option>`).join('')}</select></label>${f('gmName', 'GM name', 'The Narrator')}</div>
    ${D.gmPreset === 'custom' ? ta('gmStyle', 'Describe your GM', 'A gravel-voiced old mercenary who narrates like he was there…', 2) : `<p class="hint">${esc(GM_PRESETS[D.gmPreset]?.style || '')}</p>`}
    ${f('art', 'Art style for images', 'painterly fantasy illustration, cinematic lighting')}
    ${ta('world', 'World notes (places, factions, characters)', '- Places…\n- Factions…\n- Notable characters…', 5)}
    <details style="margin-top:12px"><summary class="hint" style="cursor:pointer">GM secrets, roadmap &amp; key people (spoilers)${D.secrets ? ' · ' + D.secrets.split('\n').filter(Boolean).length + ' secrets' : ''}${D.roadmap ? ' · ' + parseRoadmap(D.roadmap).length + ' acts' : ''}</summary>
      ${ta('secrets', 'GM secrets', 'Hidden truths the GM reveals only through play', 4)}${ta('plan', 'Hidden campaign plan', 'Twists and where the story is heading', 3)}${ta('roadmap', 'Plot roadmap (acts the GM steers toward)', 'Act 1: Title | goal\n- beat\n- beat\nAct 2: …', 8)}<p class="hint">One line per act ("Act 1: Title | goal"), then its beats on lines starting with "-". The GM steers toward the current act and ticks beats off as they happen.</p>${arr(D.people).length ? `<p class="hint"><b>Key people:</b> ${D.people.map(p => esc(p.name)).join(', ')}</p>` : ''}${D.threats?.length ? `<p class="hint">${D.threats.length} hidden threats and ${D.factions?.length || 0} factions ready.</p>` : ''}</details>
    ${ta('gmNotes', isComp ? 'Standing requests for the narrator (optional)' : 'Standing requests for the GM (optional)', isComp ? 'Slow-burn, cozy, lots of banter, keep replies short…' : 'More puzzles, less combat, keep scenes short…', 2)}
    `}

    <div class="sect">${isComp ? 'You' : adding ? 'The new player' : mp ? 'Player 1' : 'Your character'}</div>
    ${mp && !adding ? '<p class="hint">Build the first player here. After you start, tap <b>+ Add player</b> above the text box to add everyone else.</p>' : ''}
    <div class="card" style="margin-top:10px;border-color:#5b4519">
      ${ta('concept', 'Describe your character', 'A brilliant but arrogant potion brewer with a stutter and a bad leg from a lab explosion…', 3)}
      <button class="btn gold wide" data-act="aidraft" style="margin-top:10px" ${S.drafting ? 'disabled' : ''}>${S.drafting ? '<span class="spin sm"></span> Drafting your build… <span class="buildsecs"></span>' : icon('spark') + ' Draft my build with AI'}</button>
      <button class="btn wide" data-act="aiconvert" style="margin-top:8px" ${S.drafting ? 'disabled' : ''}>${icon('upload')} I pasted a finished character: sort it into my sheet</button>
      <button class="btn wide" data-act="charprompt" style="margin-top:8px">${icon('scroll')} Copy a ready-made prompt for ChatGPT / Claude</button>
      <p class="hint">Copy the prompt, paste it into ChatGPT or Claude with your idea, then paste what it writes into the box above: the sheet fills in straight away. A character in any other format still works with the button above it (the AI sorts it).</p>
      <p class="hint">The AI fills in everything below — stats, traits, gear and backstory. Then tweak it. Or skip this and build by hand.</p>
    </div>
    <div class="sect">1 · Identity &amp; ancestry</div>
    <div class="kv">${f('name', 'Name', 'Rowan')}<label class="f"><span>Gender</span><select data-dpath="sex"><option value="">Choose…</option><option value="male" ${D.sex === 'male' ? 'selected' : ''}>Male</option><option value="female" ${D.sex === 'female' ? 'selected' : ''}>Female</option></select></label></div>
    ${f('storyRole', isComp ? 'Who you are here' : 'Story role', isComp ? 'New bartender at the Gilded Stag, a ranger passing through…' : 'Third-year of House Ember, guild apprentice…')}
    ${profSectionHTML(D, 'identity', { host: 'draft' })}
    <p class="hint">Required: name, age, ancestry, a basic look, a background and a core personality. Everything else is optional — fill it in later, or let the interview ask you.</p>
    <div class="row wrap"><button class="btn" data-act="ivyopen" data-host="draft">${icon('spark')} Interview me, one question at a time</button></div>

    <div class="sect">2 · Physical appearance &amp; visual profile</div>
    <p class="hint">The visual profile: every portrait, scene picture and AI-written picture prompt is built from these fields.</p>
    ${profSectionHTML(D, 'appearance', { host: 'draft' })}

    <div class="sect">3 · Personality, likes, dislikes &amp; hobbies</div>
    ${profSectionHTML(D, 'personality', { host: 'draft' })}

    <div class="sect">4 · Beliefs, values, motivations &amp; fears</div>
    ${profSectionHTML(D, 'beliefs', { host: 'draft' })}
    <div class="sect">5 · Background, history &amp; relationships</div>
    ${ta('backstory', isComp ? 'About you (required)' : 'Background &amp; life story (required)', isComp ? 'Anything you want the story and the cast to know about you.' : 'Where they come from, what they want, what haunts them.', 4)}
    ${profSectionHTML(D, 'history', { host: 'draft' })}
    ${isComp ? `<div class="sect">Your cast</div>
    <label class="f"><span>Style</span><select data-dpath="compStyle">${Object.entries(COMP_STYLES).map(([k, v]) => `<option value="${k}" ${(D.compStyle || 'chat') === k ? 'selected' : ''}>${v.label}</option>`).join('')}</select></label>
    <p class="hint" style="color:var(--ink)">Who do you want in your story? Describe each character on its own line. The AI builds each one with a personality, a voice, goals and a past. Add more any time from Cast.</p>
    ${ta('castText', 'Characters (one per line)', 'Mara, a sharp-tongued sellsword who secretly writes poetry\nOld Brannoc, the gruff innkeeper who knows everyone\'s business', 4)}
    <p class="hint">Everyone in your cast is an adult (16+).</p>` : `

    <div class="sect">6 · Class, attributes &amp; skills <small>${draftBudget(D).cap} points${draftBudget(D).extra ? ` (${STAT_BUDGET} + ${draftBudget(D).extra} bought with TP)` : ''} · 8 to 20</small></div>
    ${profSectionHTML(D, 'craft', { host: 'draft' })}
    <p class="hint">Each stat gives a bonus (in gold) that's added to your d20 when you roll with it: 10 is average (+0), 14 is +2, 18 is +4.</p>
    ${STATS.map(k => `<div class="statrow"><div class="sn"><b>${SN(k)}</b><small>${STAT_DESC[k]}</small></div>
      <button class="iconbtn sm" data-act="dstat" data-k="${k}" data-d="-1" ${D.stats[k] <= 8 ? 'disabled' : ''}>${icon('minus')}</button>
      <span class="sc">${D.stats[k]}</span>
      <button class="iconbtn sm" data-act="dstat" data-k="${k}" data-d="1" ${D.stats[k] >= 20 ? 'disabled' : ''}>${icon('plus')}</button>
      <span class="row" style="justify-content:space-between"><span class="md">${fmt(mod(D.stats[k]))}</span><span class="pc">${POINT_COST[D.stats[k]]} pts${D.stats[k] < 20 ? ` · next +${POINT_COST[D.stats[k] + 1] - POINT_COST[D.stats[k]]}` : ''}</span></span></div>`).join('')}

    <div class="sect">Positive traits <small>skills · invoked by you</small></div>
    ${pos.map(([t, i]) => traitCardHTML(t, i)).join('') || '<p class="hint">None yet.</p>'}
    <button class="btn sm" data-act="dadd" data-list="traits" data-pol="+" style="margin-top:10px">${icon('plus')} Add positive trait</button>
    <p class="hint">Costs: D 2 · C 4 · B 6 · A 8 · S 10 TP.</p>

    <div class="sect">Negative traits <small>weaknesses · always enforced</small></div>
    ${neg.map(([t, i]) => traitCardHTML(t, i)).join('') || '<p class="hint">None yet — optional, but each one buys more traits.</p>'}
    <button class="btn sm" data-act="dadd" data-list="traits" data-pol="-" style="margin-top:10px">${icon('plus')} Add negative trait</button>
    <p class="hint">Gives back at build: D 1 · C 3 · B 5 · A 7 · S 9 TP.</p>

    <div class="sect">7 · Abilities, equipment &amp; resources <small>gear · signatures · gold</small></div>
    ${D.gear.map((g, i) => `<div class="gearrow"><input type="text" data-dpath="gear.${i}.name" value="${esc(g.name)}" placeholder="Item">
      <select data-dpath="gear.${i}.tier" style="width:auto"><option value="" ${!g.tier ? 'selected' : ''}>Basic (free)</option>${TIERS.map(x => `<option value="${x}" ${g.tier === x ? 'selected' : ''}>Special ${x} (−${GEAR_COST[x]} TP)</option>`).join('')}</select>
      <button class="iconbtn sm" data-act="ddel" data-list="gear" data-i="${i}">${icon('x')}</button>
      <textarea rows="1" data-dpath="gear.${i}.desc" placeholder="What it is and what it does">${esc(g.desc)}</textarea></div>`).join('')}
    <button class="btn sm" data-act="dadd" data-list="gear" style="margin-top:10px">${icon('plus')} Add gear</button>

    <div class="sect">Signatures <small>rare · 8–15 TP · GM approval</small></div>
    ${D.signatures.map((s, i) => `<div class="gearrow"><input type="text" data-dpath="signatures.${i}.name" value="${esc(s.name)}" placeholder="Well-connected family">
      <input type="number" min="8" max="15" data-dpath="signatures.${i}.cost" data-num="1" value="${esc(s.cost)}" style="width:80px" aria-label="TP cost">
      <button class="iconbtn sm" data-act="ddel" data-list="signatures" data-i="${i}">${icon('x')}</button>
      <textarea rows="1" data-dpath="signatures.${i}.desc" placeholder="What it gives you in play">${esc(s.desc)}</textarea></div>`).join('') || '<p class="hint">Usually found in play. Buying one now is expensive.</p>'}
    <button class="btn sm" data-act="dadd" data-list="signatures" style="margin-top:10px">${icon('plus')} Add signature</button>

    <div class="sect">Bank & convert</div>
    <p class="hint" style="color:var(--ink)">Leftover TP (for example from negative traits) can raise your stats <b>right now</b>: every 2 TP buys 1 extra stat point, so your Stats budget goes above ${STAT_BUDGET}. Anything you don't spend is banked for later upgrades.${draftBudget(D).left > 1 ? ` You have <b>${draftBudget(D).left} TP</b> left: enough for ${Math.floor(draftBudget(D).left / 2)} more stat point${Math.floor(draftBudget(D).left / 2) > 1 ? 's' : ''}.` : ''}</p>
    <div class="kv">${f('tpToStats', 'Extra stat points to buy now (2 TP each)', '0', 'number')}${f('tpToEp', 'Or save as EP for your first level-up (2 TP each)', '0', 'number')}</div>
    <div class="kv">${f('gold', 'Starting gold', '15', 'number')}</div>
    `}

    <div class="sect">8 · AI portrait studio</div>
    ${draftPortraitHTML(D)}
    <p class="hint">Painted from the visual profile above${D.art ? `, in this adventure's art style (<b>${esc(D.art)}</b>)` : ''}. Paint again after changing the look.</p>

    <div class="sect">9 · Review &amp; finish</div>
    ${profReviewHTML(D)}
    ${adding ? `<button class="btn gold wide" data-act="begin" style="margin-top:24px;min-height:54px;font-size:17px">${icon('plus')} Add to the adventure</button>` : `
    <button class="btn gold wide" data-act="begins0" style="margin-top:24px;min-height:54px;font-size:17px">${icon('spark')} ${isComp ? 'Talk it through with the narrator first' : 'Session zero first (recommended)'}</button>
    <p class="hint" style="text-align:center">${isComp ? 'Chat with the narrator about the story you want; it shapes the world from your answers.' : 'Chat with your GM about what you want; it builds the world and a hidden plan from your answers.'}</p>
    <button class="btn wide" data-act="begin" style="margin-top:10px;min-height:48px">${isComp ? 'Start the story' : 'Skip straight to the adventure'}</button>`}
    ${!textReady() ? '<p class="hint" style="text-align:center">You\'ll need to finish AI setup in Settings first.</p>' : ''}
  </div>`;
  if (sc) $('.page').scrollTop = sc;
}

/* ---------- game ---------- */
function renderGame() {
  const c = cur(); if (!c) return renderLibrary();
  S.view = 'game'; musicScene(c);
  app().innerHTML = `<div class="game">
    <div class="gbar">
      <button class="exitbtn" data-act="home" aria-label="Exit game">${icon('back')}<span>Exit</span></button>
      <div class="gtitle"><div class="t">${esc(c.title)}</div><div class="s" id="gloc"></div></div>
      ${c.phase === 'session0' ? '' : `<button class="hbtn" data-act="panel" aria-label="Story panel">${icon('panel')}<span>${isCompanion(c) ? 'Story' : 'Panel'}</span></button>
      <button class="hbtn" data-act="party" aria-label="${isCompanion(c) ? 'Cast' : 'Party'}">${icon('users')}<span>${isCompanion(c) ? 'Cast' : 'Party'}${activeParty(c).length ? ' ' + activeParty(c).length : ''}</span></button>
      <button class="hbtn wideonly" data-act="journal" aria-label="Journal">${icon('book')}<span>Journal</span></button>`}
      <button class="hbtn" data-act="gamesettings" aria-label="Game Settings">${icon('gear')}<span>Game</span></button>
      <button class="hbtn" data-act="menu" aria-label="Menu">${icon('dots')}<span>More</span></button>
    </div>
    <div class="hudwrap" id="hud"></div>
    <div class="log" id="log"></div>
    <div class="dock" id="dock"></div></div>`;
  renderHUD(); renderLog(true); renderDock(); renderPanel(); renderEnc();
}
function renderHUD() {
  const c = cur(); const el = $('#hud'); if (!c || !el) return;
  const ch = c.character;
  if (isCompanion(c)) { el.innerHTML = ''; const loc = $('#gloc'); if (loc) loc.innerHTML = esc(playLocText(c)) + ' ' + ratingChip(c); return; } const pct = ch.maxHp ? Math.round(ch.hp / ch.maxHp * 100) : 0;
  el.innerHTML = `<button class="hud" data-act="sheet" aria-label="Character sheet">
      <span class="hudhp"><span class="n">${isMP(c) ? esc(ch.name) + ' · ' : ''}${ch.hp}/${ch.maxHp} HP</span><span class="hpbar ${pct > 50 ? 'ok' : ''}"><i style="width:${pct}%"></i></span></span>
      <span class="hs">Lv <b>${ch.level}</b></span><span class="hs">EP <b>${ch.ep}</b></span><span class="hs">TP <b>${ch.tp}</b></span>
      ${c.combat ? `<span class="hs">Momentum ${[0,1,2].map(i => `<i class="pip ${i < ch.momentum ? 'on' : ''}"></i>`).join('')}</span>` : ''}
      ${ch.strain ? `<span class="hs bad">Strain ${ch.strain}</span>` : ''}
      ${ch.injuries.length ? `<span class="hs bad">${ch.injuries.length} injur${ch.injuries.length > 1 ? 'ies' : 'y'}</span>` : ''}
      <span class="hs gold">${ch.gold} gold</span></button>
    ${c.levelPending ? '<button class="lvlbtn" data-act="levelup">Level up!</button>' : ''}`;
  const loc = $('#gloc'); if (loc) loc.innerHTML = esc(playLocText(c)) + ' ' + ratingChip(c);
}

function msgHTML(m, c, isLastGM) {
  if (m.hidden) return '';
  const notesHTML = n => (n || []).length ? `<div class="notes">${n.map(x => `<span class="note ${x.k || ''}">${esc(x.t)}</span>`).join('')}</div>` : '';
  if (m.role === 'gm' && m.rollAsk) {
    const card = c.pendingRoll && c.pendingRoll.msgId === m.id && !S.busy ? rollCardHTML(c) : '';
    const chk = m.checking ? `<div class="notes"><span class="note"><span class="spin sm" style="display:inline-block;vertical-align:-3px;margin-right:6px"></span>${esc(m.checking)}</span></div>` : '';
    return card || chk ? `<div class="msg gm rollask" data-id="${m.id}">${chk}${card}${card && isLastGM ? `<div class="msgacts"><button data-act="undo">${icon('undo')} Undo turn</button></div>` : ''}</div>` : '';
  }
  if (m.role === 'gm') {
    const spk = TTS && S.settings.ui.voice !== 'off' ? `<button data-act="speak" data-mid="${m.id}">${icon('speaker')} Read</button>` : '';
    const acts = m.streaming || S.busy || m.checking ? '' : isLastGM ? `<div class="msgacts">${spk}<button data-act="regen">${icon('redo')} Retry</button><button data-act="undo">${icon('undo')} Undo turn</button><button data-act="editmsg" data-mid="${m.id}">${icon('book')} Edit</button>${m.interrupted ? `<button data-act="gmcont" data-id="${m.id}">▶ Continue</button>` : ''}<button data-act="fixopen">${icon('spark')} Fix story</button>${m.original ? `<button data-act="uncut" data-mid="${m.id}">${icon('undo')} Put cut lines back</button>` : ''}${!m.image && S.settings.image.mode !== 'off' ? `<button data-act="illustrate" data-mid="${m.id}">${icon('image')} Illustrate</button>` : ''}</div>` : `<div class="msgacts">${spk}<button data-act="editmsg" data-mid="${m.id}">${icon('book')} Edit</button></div>`;
    if (S.editing === m.id) return `<div class="msg gm" data-id="${m.id}">${sceneHTML(m, c)}<div class="editbox"><textarea id="editText">${esc(m.text)}</textarea><div class="row" style="margin-top:8px"><button class="btn sm gold" data-act="editsave" data-mid="${m.id}">Save</button><button class="btn sm ghost" data-act="editcancel">Cancel</button></div></div></div>`;
    const checking = m.checking ? `<div class="notes"><span class="note"><span class="spin sm" style="display:inline-block;vertical-align:-3px;margin-right:6px"></span>${typeof m.checking === 'string' ? esc(m.checking) : 'Checking the scene…'}</span></div>` : '';
    const card = isLastGM && c.pendingRoll && c.pendingRoll.msgId === m.id && !S.busy ? rollCardHTML(c) : '';
    return `<div class="msg gm ${m.streaming ? 'streaming' : ''}" data-id="${m.id}">${sceneHTML(m, c)}<div class="narr">${m.streaming ? (md(liveNarration(m.text)) || `<p style="color:var(--muted)"><em>${esc(m.phase || 'The Game Master considers…')}</em></p>`) : md(m.text)}</div>${checking}${compRollsHTML(m)}${isCompanion(c) ? notesHTML(m.notes) : shiftHTML(m.notes)}${m.handoutId ? (h => h ? handoutHTML(h) : '')(arr(c.handouts).find(x => x.id === m.handoutId)) : ''}${encLogHTML(m)}${isLastGM ? encOfferHTML(m, c) : ''}${card}${acts}</div>`;
  }
  if (m.role === 'player') return `<div class="msg player" data-id="${m.id}">${m.who ? `<div class="who">${esc(m.who)}</div>` : ''}<div class="b ${m.ooc ? 'ooc' : ''}">${m.ooc ? esc(m.text.replace(/^\(\(\s*|\s*\)\)$/g, '')) : m.mode ? turnHTML(m.text, m.mode) : esc(m.text)}</div></div>`;
  if (m.role === 'roll') {
    const r = m.rollData || {};
    return `<div class="msg roll"><div class="rollres"><div class="d20 ${r.d === 20 ? 'crit' : r.d === 1 ? 'fumble' : ''}">${r.d ?? '?'}</div>
      <div class="t">${esc(r.label || '')}${r.how ? `<br><i class="rhow">“${esc(r.how)}”</i>` : ''}<br>${S.settings.ui.diceMath !== false ? `<span class="bd">${(r.mods || []).map(x => `${esc(x.l)} ${fmt(x.v)}`).join(' · ')}</span><br>
      ${r.d} ${fmt(r.total - r.d)} = <b>${r.total}</b> vs ${r.dc}` : `<b>${r.total}</b>`} <span class="o ${r.success ? 'success' : 'failure'}">${esc(r.outcome || '')}</span>
      ${(r.extras || []).map(x => `<br>${esc(x)}`).join('')}</div></div>${notesHTML(m.notes)}</div>`;
  }
  if (m.role === 'sys' && m.narr) return `<div class="msg gm narr2"><div class="narr">${md(m.text)}</div></div>`;
  if (m.role === 'sys') return `<div class="msg sys">${esc(m.text)}</div>`;
  if (m.role === 'comp') return compMsgHTML(m, c);
  if (m.role === 'err') { const act = activeConn(); const others = conns().filter(x => connReady(x) && x !== act);
    return `<div class="msg err"><div class="card"><b>Something went wrong.</b><div style="margin:6px 0 10px">${esc(m.text)}</div><div class="row"><button class="btn sm" data-act="retry">${icon('redo')} Retry</button>
      ${others.map(x => `<button class="btn sm" data-act="connretry" data-id="${x.id}">Retry with ${esc(x.label)}</button>`).join('')}
      <button class="btn sm ghost" data-act="settings">${icon('gear')} AI settings</button></div>
      ${!others.length ? '<p class="hint">Tip: add a second free key (Setup) so the app can switch automatically when one is busy.</p>' : ''}</div></div>`; }
  return '';
}

function rollCardHTML(c) {
  const r = c.pendingRoll; const ch = c.character;
  const res = S.rollResult && S.rollResult.msgId === r.msgId ? S.rollResult : null;
  const momAvail = (ch.momentum || 0) - (r.momentumPlus ? 1 : 0);
  const cap1 = s => s ? s[0].toUpperCase() + s.slice(1) : s;
  const title = r.kind === 'attack' ? `Attack roll: ${r.reason}` : r.kind === 'defense' ? `Incoming: ${r.reason}` : `Roll to ${r.reason}`;
  const sub = r.kind === 'attack' ? `${SN(r.stat)} · you need ${effDC(r)} or more to hit (their Defense)` : r.kind === 'defense' ? `Defense roll · DC ${effDC(r)}${r.enemy_damage ? ` · a hit does ${r.enemy_damage}` : ''}` : `${SN(r.stat)} ${r.passive ? 'roll' : 'check'} · DC ${effDC(r)}`;
  const statKey = r.kind === 'defense' ? null : r.stat;
  const mods = res ? res.mods : rollMods(c, r, statKey);
  const modList = S.settings.ui.diceMath === false && !res ? '' : `<div class="mods">${mods.map(x => `<div class="${x.v > 0 ? 'pos' : x.v < 0 ? 'neg' : ''}"><span>${esc(x.l)}${x.why ? `<small>${esc(x.why)}</small>` : ''}</span><span>${fmt(x.v)}</span></div>`).join('')}
    ${r.dcAdj ? `<div class="pos"><span>Good argument — DC lowered</span><span>DC ${fmt(r.dcAdj)}</span></div>` : ''}
    ${r.kind !== 'defense' || res ? `<div class="tot"><span>Total modifier</span><span>${fmt(sumMods(mods))}</span></div>` : ''}</div>`;
  const pos = ch.traits.filter(t => t.polarity === '+');
  let invoke = '';
  if (!res && pos.length) {
    if (S.ruling) invoke = `<div class="invoke row"><span class="spin sm"></span> The GM is ruling on your traits…</div>`;
    else if (S.invokeOpen) invoke = `<div class="invoke"><div class="hint" style="margin:0 0 8px">Which traits, and how exactly do they help?</div>
      <div class="chips">${pos.map(t => `<button class="chip ${S.invokeSel.includes(t.id) ? 'on' : ''}" data-act="invsel" data-id="${t.id}">${esc(t.name)} <span class="tb ${t.tier}">${t.tier}</span></button>`).join('')}</div>
      <textarea id="invokeText" rows="2" style="margin-top:8px" placeholder="I listen for each pin clicking into place…">${esc(S.invokeArg || r.argument || r.how || '')}</textarea>
      <div class="row" style="margin-top:8px"><button class="btn sm gold" data-act="ruling">Ask the GM</button><button class="link" data-act="invclose">Cancel</button></div></div>`;
    else invoke = `<button class="btn sm wide" data-act="invopen" style="margin-top:6px">${icon('spark')} Invoke a trait${r.invokes?.length ? ' again' : ''}</button>`;
  }
  const momBtn = !res && c.combat && momAvail >= 1 && !r.momentumPlus ? `<button class="btn sm wide" data-act="momplus" style="margin-top:6px">Spend 1 Momentum: +3</button>` : '';
  let actions;
  if (res) {
    const canReroll = c.combat && momAvail >= 1 && !res.rerolled && !res.success;
    actions = `<div class="resline">${res.d} ${fmt(res.total - res.d)} = <b>${res.total}</b> vs ${res.dc} · <span class="o ${res.success ? 'success' : 'failure'}">${esc(res.outcome)}</span></div>
      ${canReroll ? `<div class="row"><button class="btn gold grow" data-act="reroll">Reroll (1 Momentum)</button><button class="btn grow" data-act="rollok">Keep it</button></div>` : '<div class="hint" style="text-align:center">…</div>'}`;
  } else if (r.kind === 'defense') {
    const tot = mode => fmt(sumMods(rollMods(c, r, defenseStat(ch, mode))));
    actions = `<div class="defbtns"><button class="btn gold" data-act="roll" data-mode="dodge">Dodge<small>Dexterity ${tot('dodge')}</small></button>
      <button class="btn gold" data-act="roll" data-mode="block">Block<small>Strength ${tot('block')}</small></button>
      <button class="btn gold" data-act="roll" data-mode="counter">Counter<small>${SN(defenseStat(ch, 'counter'))} ${tot('counter')} · DC+3</small></button></div>`;
  } else actions = `<button class="btn gold wide" data-act="roll">🎲 Roll ${r.passive ? 'for it' : 'the d20'}</button>`;
  /* action rolls show what you wrote; an incoming attack asks what you do; a straight check just rolls */
  const prompt = res ? (r.how ? `<p class="rollsaid">“${esc(r.how)}”</p>` : '')
    : r.kind === 'defense' ? `<label class="rollhow"><span>What do you do?</span><textarea id="rollHow" rows="2" placeholder="e.g. I duck under the swing and shove him back">${esc(r.how || '')}</textarea></label>`
    : r.passive ? '<p class="rollwhy">A straight check: nothing to decide, just roll and the story continues.</p>'
    : r.said ? `<p class="rollsaid">Your action: “${esc(r.said)}”</p>` : '';
  return `<div class="rollcard"><div class="h">${esc(cap1(title))}</div><div class="r">${esc(sub)}</div>
    ${prompt}
    ${modList}${invoke}${momBtn}
    <div class="d20 bigdie ${res?.d === 20 ? 'crit' : res?.d === 1 ? 'fumble' : ''}" id="bigdie">${res ? res.d : 'd20'}</div>
    ${actions}
    ${!res && !r.passive ? '<button class="link" data-act="skiproll" style="display:block;margin:6px auto 0">Skip — I\'ll do something else</button>' : ''}</div>`;
}
function renderLog(scroll) {
  const c = cur(); const log = $('#log'); if (!c || !log) return;
  if (c.phase === 'session0') { log.innerHTML = session0LogHTML(c); renderHUD(); requestAnimationFrame(() => { log.scrollTop = log.scrollHeight; }); return; }
  const nearBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 160;
  const lg = lastIndex(c, 'gm');
  const lastGmIsLast = lg >= 0 && c.messages.slice(lg + 1).every(m => m.role === 'err' || m.role === 'sys' || m.role === 'comp');
  log.innerHTML = c.messages.map((m, i) => msgHTML(m, c, i === lg && lastGmIsLast)).join('') + (turnSettled(c) ? choiceCardsHTML(c, turnSettled(c)) : '') + (S.compThinking ? `<div class="msg comp"><div class="port sm ph2">${esc(S.compThinking[0])}</div><div class="cb"><div class="cn">${esc(S.compThinking)}</div><span class="spin sm"></span></div></div>` : '') + recapHTML(c);
  renderHUD(); if (S.panel) renderPanel();
  if (scroll || nearBottom) requestAnimationFrame(() => { log.style.scrollBehavior = 'auto'; log.scrollTop = log.scrollHeight; log.style.scrollBehavior = ''; });
}
let paintQueued = false;
function streamPaint(msg, full) {
  msg.text = full; if (paintQueued) return; paintQueued = true;
  requestAnimationFrame(() => {
    paintQueued = false; if (!msg.streaming) return;
    const el = document.querySelector(`.msg[data-id="${msg.id}"] .narr`); if (!el) return;
    const log = $('#log'); const near = log && log.scrollHeight - log.scrollTop - log.clientHeight < 200;
    const t = liveNarration(msg.text); el.innerHTML = t ? md(t) : '<p style="color:var(--muted)"><em>The Game Master considers…</em></p>';
    if (near) log.scrollTop = log.scrollHeight;
  });
}
function renderDock() {
  const c = cur(); const dock = $('#dock'); if (!c || !dock) return;
  if (c.phase === 'session0') { dock.innerHTML = session0DockHTML(c); autoGrow($('#input')); return; }
  const keep = $('#input')?.value || '';
  const lg = lastIndex(c, 'gm'); const last = c.messages[lg];
  if (c.deathPending && !S.busy) { dock.innerHTML = deathDockHTML(c); return; }
  if (c.ended && !S.busy) { dock.innerHTML = endedDockHTML(c); return; }
  if (c.enc && !S.busy) { dock.innerHTML = encDockHTML(c); return; }
  const settled = !S.busy && last && !c.pendingRoll && lg >= 0 && c.messages.slice(lg + 1).every(m => m.role === 'sys' || m.role === 'comp');
  const showChips = false;
  dock.innerHTML = `${showChips ? `<div class="chips">${last.choices.map((ch, i) => `<button class="chip" data-act="choice" data-i="${i}">${esc(ch)}</button>`).join('')}</div>` : ''}${settled && S.settings.ui.quick !== false ? (isCompanion(c) ? companionQuickHTML(c) : quickHTML(c)) : ''}${actorBarHTML(c)}${talkBarHTML(c)}
    ${S.busy ? '' : fmtBarHTML(c)}<div class="composer"><button class="ooctoggle" data-act="askgm" title="Ask the GM out of character">ASK<br>GM</button>
      <textarea id="input" rows="1" placeholder="${c.pendingRoll ? 'Roll above, or describe something else…' : typeMode() === 'say' ? (isMP(c) ? `What does ${esc(c.character.name)} say? ✋ Action for what they do` : 'Say something… tap ✋ Action for what you do') : isCompanion(c) ? 'Say or do something…' : isMP(c) ? `What does ${esc(c.character.name)} do?` : 'What do you do?'}" ${S.busy ? 'disabled' : ''}>${esc(keep)}</textarea>
      ${SR && !S.busy ? `<button class="micbtn ${S.mic ? 'on' : ''}" data-act="mic" aria-label="Speak your action">${icon('mic')}</button>` : ''}
      ${S.busy ? `<button class="sendbtn stop" data-act="stop" aria-label="Stop">${icon('stop')}</button>` : `<button class="sendbtn" data-act="send" aria-label="Send">${icon('send')}</button>`}</div>`;
  autoGrow($('#input'));
}
function autoGrow(el) { if (!el) return; el.style.height = 'auto'; el.style.height = Math.min(150, el.scrollHeight) + 'px'; }
function sendInput() {
  const inp = $('#input'); if (!inp) return; const t = inp.value.trim(); if (!t) return; inp.value = ''; S.drawer = null;
  if (cur()?.phase === 'session0') { session0Say(t); return; }
  if (S.ooc) { S.ooc = false; playerAct(`(( ${t} ))`, 'player', { ooc: true }); return; }
  const c = cur(); const mode = typeMode();
  playerAct(t, 'player', { mode, gm: turnForGM(c, t, mode), ...(turnAllOOC(t, mode) ? { ooc: true } : {}) });
}

/* ---------- modals ---------- */
function openModal(kind, tab) { S.modal = kind; S.modalTab = tab || null; S.models = null; renderModal(); }
function closeModal() { if (S.modal === 'levelup') S.lu = null; S.modal = null; $('#modalRoot').innerHTML = ''; if (S.view === 'game') { renderHUD(); renderLog(); renderDock(); } else if (S.view === 'library') renderLibrary(); else if (S.view === 'palchat') palRedraw(); else if (S.view === 'paledit') { const y = scrollY; renderPalEditor(); scrollTo(0, y); } }
function renderModal() {
  const root = $('#modalRoot'); if (!S.modal) { root.innerHTML = ''; return; }
  const scroll = $('#modalBody')?.scrollTop || 0;
  let title = '', tabs = '', body = '';
  if (S.modal === 'settings') { title = 'Settings'; [tabs, body] = settingsHTML(); }
  else if (S.modal === 'bible') { title = 'Story Bible'; body = bibleHTML(); }
  else if (S.modal === 'search') { [title, body] = searchModalHTML(); }
  else if (String(S.modal).startsWith('pal')) { [title, body] = palModalHTML(S.modal); }
  else if (S.modal === 'game') { title = 'Game Settings'; [tabs, body] = gameSettingsHTML(); }
  else if (S.modal === 'sheet') { title = 'Character'; [tabs, body] = sheetHTML(); }
  else if (S.modal === 'journal') { title = 'Journal'; [tabs, body] = journalBookHTML(); }
  else if (S.modal === 'tools') { title = 'Campaign tools'; [tabs, body] = journalHTML(); }
  else if (S.modal === 'party') { title = 'Your party'; body = partyHTML(); }
  else if (S.modal === 'lookup') { title = 'Look it up'; body = lookupHTML(); }
  else if (S.modal === 'people') { title = 'People you\'ve met'; body = peopleHTML(); }
  else if (S.modal === 'menu') { title = 'More'; body = menuHTML(); }
  else if (S.modal === 'guide') { title = 'Rules & guide'; [tabs, body] = guideHTML(); }
  else if (S.modal === 'levelup') { title = 'Level up'; body = levelUpHTML(); }
  else if (S.modal === 'askgm') { title = 'Ask ' + gmOf(cur()).name; body = askGMHTML(); }
  else if (S.modal === 'fix') { title = 'Fix the story'; body = fixHTML(); }
  else if (S.modal === 'interview') { title = 'Character interview'; body = interviewHTML(); }
  const again = !!root.querySelector('.modal');   /* re-drawing an open window: don't replay the open animation */
  root.innerHTML = `<div class="modal ${again ? 'still' : ''}" data-act="modalbg"><div class="sheet" role="dialog" aria-label="${title}">
    <div class="hd"><h2>${title}</h2><button class="iconbtn" data-act="close" aria-label="Close">${icon('x')}</button></div>
    ${tabs ? `<div class="tabs">${tabs}</div>` : ''}<div class="bd" id="modalBody">${body}</div></div></div>`;
  const b = $('#modalBody'); if (b) b.scrollTop = scroll;
}
const tabBtn = (id, label, active) => `<button class="chip ${active === id ? 'on' : ''}" data-act="tab" data-id="${id}">${label}</button>`;
const bindInput = (path, label, { type = 'text', ph = '', hint = '' } = {}) => `<label class="f"><span>${label}</span><input type="${type}" data-bind="${path}" value="${esc(getPath(S.settings, path) ?? '')}" placeholder="${esc(ph)}" ${type === 'password' ? 'autocomplete="off"' : ''}></label>${hint ? `<p class="hint">${hint}</p>` : ''}`;
const bindArea = (path, label, { ph = '', hint = '', rows = 3 } = {}) => `<label class="f"><span>${label}</span><textarea rows="${rows}" data-bind="${path}" placeholder="${esc(ph)}">${esc(getPath(S.settings, path) ?? '')}</textarea></label>${hint ? `<p class="hint">${hint}</p>` : ''}`;
const bindCheck = (path, label) => `<label class="check"><input type="checkbox" data-bind="${path}" ${getPath(S.settings, path) ? 'checked' : ''}><span>${label}</span></label>`;

function settingsHTML() {
  const tab = ['ai','images','drive','data'].includes(S.modalTab) ? S.modalTab : 'ai';
  const tabs = tabBtn('ai','Story AI',tab) + tabBtn('images','Images',tab) + tabBtn('drive','Google Drive',tab) + tabBtn('data','Display & data',tab);
  const im = S.settings.image;
  let body = '';
  if (tab === 'ai') {
    body = `${connsHTML()}
      <div class="sect" style="font-size:20px">Add keys</div>
      ${importHTML()}
      <div class="sect" style="font-size:20px">Story settings</div>
      <label class="f"><span>Turn quality</span><select data-bind="ai.profile">${Object.entries(AI_PROFILES).map(([k, v]) => `<option value="${k}" ${(S.settings.ai.profile || 'balanced') === k ? 'selected' : ''}>${v.label}</option>`).join('')}</select></label>
      <p class="hint">Every turn: the GM writes the scene, then a bookkeeper step updates HP, items, quests, people and choices. The quality setting adds checks on top.</p>
      ${(S.settings.ai.profile || 'balanced') === 'custom' ? `${bindCheck('ai.referee', 'Dice referee: decides whether your action needs a roll, so the GM can\'t skip the dice')}
      ${bindCheck('ai.agency', 'Agency guard: cuts any line where the GM speaks, acts, thinks or feels for your character')}
      ${bindCheck('ai.deliberate', 'Planning: the GM plans privately before writing')}
      ${bindCheck('ai.verify', 'Continuity check: rewrites contradictions (slow on small models)')}` : ''}
      <div class="kv">${bindInput('text.temperature', 'Creativity (0–1.5)', { type:'number' })}${helperSelectHTML()}</div>
      <p class="hint">The helper model runs the rule steps (referee, guard, bookkeeper). Leave it empty to use your story model for everything. Example: story model <code>Wayfarer</code>, helper <code>dolphin3</code>. On an 8 GB card two models swap in and out, which adds a few seconds per turn.</p>
      ${bindCheck('text.stream', 'Stream text as it\'s written (story turns and companion replies)')}
      <div class="sect" style="font-size:20px">World &amp; character builder</div>
      <label class="f"><span>AI for building worlds, characters and story setup</span><select data-bind="ai.builder">
        <option value="auto" ${(S.settings.ai.builder ?? 'auto') === 'auto' ? 'selected' : ''}>Automatic: a stronger online AI if you've added one</option>
        <option value="same" ${S.settings.ai.builder === 'same' ? 'selected' : ''}>Same as the story AI</option>
        ${conns().filter(connReady).map(x => `<option value="${esc(x.id)}" ${S.settings.ai.builder === x.id ? 'selected' : ''}>${esc(x.label)}${x.model ? ' · ' + esc(x.model.split('/').pop()) : ''}</option>`).join('')}</select></label>
      <p class="hint">Building only takes a handful of requests, so a big free online AI (OpenRouter or Gemini) fits easily in its daily limit and writes richer worlds, secrets and characters. Play itself always stays on your own AI: no filters, no limits. If the online AI refuses or is out of free uses, your story AI builds it instead.</p>
      <div class="sect" style="font-size:20px">Internet research</div>
      ${bindCheck('net.on', 'Let the app research online (the Research button when building a world, and Look something up)')}
      ${bindCheck('net.auto', 'Let the AI look things up online by itself during play, whenever it needs real facts (real places, people, history, or an existing book, show or game world)')}
      <div class="row"><button class="btn sm" data-act="netcheck">${icon('search')} Check research</button></div>
      ${S.netStatus ? `<p class="hint" style="color:var(--ink)">${esc(S.netStatus)}</p>` : '<p class="hint">Best with the picture helper running on your PC (searches the whole web, with no limits when SearXNG is installed). Without it, research uses Wikipedia.</p>'}
      <p class="hint">Dice, scene length and how the game flows are in <button class="link" data-act="gamesettings">Game Settings</button>.</p>`;
  } else if (tab === 'images') {
    body = `<label class="f"><span>Scene images</span><select data-bind="image.mode">
        <option value="pollinations" ${im.mode === 'pollinations' ? 'selected' : ''}>Pollinations (free, open models like Flux)</option>
        <option value="local" ${im.mode === 'local' ? 'selected' : ''}>Stable Diffusion on my PC (most realistic, no limits)</option>
        <option value="template" ${im.mode === 'template' ? 'selected' : ''}>Custom image URL</option>
        <option value="off" ${im.mode === 'off' ? 'selected' : ''}>Off</option></select></label>
      ${im.mode === 'pollinations' ? bindInput('image.polliKey', 'Pollinations key (optional)', { type:'password', ph:'pk_…', hint:'Works with no key (rate-limited, may show a small watermark). A free key from <a href="https://enter.pollinations.ai" target="_blank" rel="noopener">enter.pollinations.ai</a> raises the limit.' }) + bindInput('image.polliModel', 'Image model', { ph:'flux' }) : ''}
      ${im.mode === 'local' ? forgeSettingsHTML() : ''}
      ${im.mode === 'template' ? bindInput('image.template', 'Image URL template', { ph:'https://my-server/img?prompt={prompt}&seed={seed}', hint:'Placeholders: {prompt} {seed} {width} {height}.' }) : ''}
      <label class="f"><span>Image shape</span><select data-bind="image.size">${Object.keys(SIZES).map(k => `<option value="${k}" ${im.size === k ? 'selected' : ''}>${k[0].toUpperCase() + k.slice(1)}${im.mode === 'local' ? '' : ` (${SIZES[k].join('×')})`}</option>`).join('')}</select></label>
      ${im.mode === 'local' ? `<label class="f"><span>Picture size on your PC</span><select data-bind="image.forgeRes"><option value="fast" ${(im.forgeRes || 'full') === 'fast' ? 'selected' : ''}>Fast: three-quarter size (about twice as quick)</option><option value="full" ${(im.forgeRes || 'full') === 'full' ? 'selected' : ''}>Full detail: the SDXL-native size above (896×1152 portrait)</option></select></label>` : ''}
      ${im.mode !== 'off' ? bindCheck('image.scenes', 'Paint scene pictures automatically (new places, important moments). Off: only portraits, photos you ask for and Illustrate.') : ''}
      ${im.mode !== 'off' ? bindCheck('image.autoPortraits', 'Paint a portrait automatically for every new companion and named character the GM brings in') : ''}
      ${bindInput('image.style', 'Default art style', { ph:'painterly fantasy illustration, cinematic lighting', hint:'Each adventure can override this in its Journal.' })}
      ${im.mode !== 'off' ? `<div class="row" style="margin-top:14px"><button class="btn" data-act="testimg">Test image</button></div><div class="preview" id="imgPrev"></div>` : ''}`;
  } else if (tab === 'drive') {
    const fid = folderIdFrom(S.settings.drive.folder);
    body = `<p class="hint" style="color:var(--ink)">Each adventure gets its own subfolder in your Drive folder, holding <b>campaign.json</b> (the save), <b>Character Sheet.md</b> and <b>Story Log.md</b>. Your settings live in <b>${INDEX_FILE}</b>.</p>
      ${bindInput('drive.folder', 'Drive folder link', { ph:'https://drive.google.com/drive/folders/…', hint: fid ? `Folder ID: <code>${esc(fid)}</code>` : '<span style="color:var(--red)">Paste a Google Drive folder link.</span>' })}
      ${bindInput('drive.clientId', 'Google OAuth Client ID', { ph:'xxxxxxxx.apps.googleusercontent.com', hint: /^GOCSPX/i.test(S.settings.drive.clientId || '') ? '<span style="color:var(--red)">That\'s the client <b>secret</b>, not the Client ID. The Client ID ends in .apps.googleusercontent.com.</span> <button class="link" data-act="cidreset">Use the built-in one</button>' : '' })}
      <p class="hint">One-time setup in Google Cloud Console — see the README. Add this exact address as an <b>Authorized JavaScript origin</b>: <code>${esc(/^https?:/.test(location.protocol) ? location.origin : '(host the app first — Drive can\'t work from a local file)')}</code>. Because the app writes into a folder you made, it asks for full Drive access; Google will show an "unverified app" screen — choose Advanced → Continue.</p>
      ${bindCheck('drive.autoSync', 'Sync automatically: after changes, when the app opens or comes back to the front, and after the quiet time below')}
      <label class="f"><span>Also sync after this long with no activity</span><select data-bind="drive.idleSync">${[[0, 'Off'], [5, 'Every 5 minutes'], [20, 'Every 20 minutes'], [60, 'Every hour']].map(([v, l]) => `<option value="${v}" ${num(S.settings.drive.idleSync) === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <div class="sect" style="font-size:20px">Encrypted key vault <small>${esc(Vault.status())}</small></div>
      <p class="hint" style="color:var(--ink)">Your AI keys are sealed with <b>AES-256-GCM</b> in this browser, using a key stretched from your passphrase, before anything is uploaded. Drive only ever holds the ciphertext (<b>${VAULT_FILE}</b>), so the file is useless to anyone who opens the folder, Google included. <b>There is no recovery:</b> forget the passphrase and the vault is gone.</p>
      <label class="f"><span>Vault passphrase</span><input type="password" id="vaultPass" data-vault="pass" autocomplete="new-password" value="${esc(S.vaultDraft || '')}" placeholder="${Vault.stored() ? 'Saved on this device — type to replace it' : `At least ${VAULT_MIN} characters`}"></label>
      ${bindCheck('drive.vaultRemember', 'Remember the passphrase on this device, so start-up unlocks the vault by itself')}
      ${bindCheck('drive.vault', 'Keep my keys in Drive: load them at every sync, and re-save the vault a few seconds after a key changes')}
      <div class="row" style="margin-top:10px"><button class="btn gold" data-act="vaultsave">${icon('cloud')} Save keys to the vault</button><button class="btn" data-act="vaultload">Unlock &amp; load keys</button></div>
      <div class="row" style="margin-top:8px">${Vault.stored() ? '<button class="btn sm ghost" data-act="vaultforget">Forget passphrase here</button>' : ''}<button class="btn sm ghost" data-act="vaultplain">Delete the old unencrypted keys file</button></div>
      <div class="sect" style="font-size:20px">Pictures in Drive</div>
      <p class="hint">Scene images, game Photos, companion portraits and chat photos are sealed with your vault key before upload. Pictures written by an older version stay readable until they are opened or sealed here. Every picture is re-created under a new file id and the old copy is moved to Drive's bin, because Google's preview cache belongs to the file id and cannot be cleared in place. The bin keeps the old copies for about 30 days.</p>
      <div class="row"><button class="btn" data-act="picseal" ${Drive.valid() ? '' : 'disabled'}>${icon('shield')} Encrypt pictures already in Drive</button></div>
      <p class="hint" id="picSealStatus">${esc(S.picSealStatus || '')}</p>
      <div class="row" style="margin-top:16px"><button class="btn gold" data-act="sync">${icon('cloud')} ${Drive.valid() ? 'Sync now' : 'Connect & sync'}</button>${Drive.valid() || LS.get('iq.driveok', false) ? `<button class="btn ghost" data-act="drivedisc">Disconnect</button>` : ''}</div>
      <p class="hint" id="driveStatus">${esc(S.syncStatus || (Drive.valid() ? 'Connected.' : 'Not connected.'))}</p>
      ${Drive.valid() && S.driveAs ? `<p class="hint">Signed in as <b>${esc(S.driveAs)}</b>.</p>` : ''}`;
  } else {
    body = `<label class="f"><span>Text size (stories and companion chats)</span><input type="range" min="14" max="24" step="1" data-bind="ui.narr" value="${S.settings.ui.narr}" style="width:100%;accent-color:var(--gold)"></label>
      <label class="f"><span>Empty bar at the bottom of the screen (keeps the Netlify banner off the Send button)</span><select data-bind="ui.bottomGap"><option value="phone" ${(S.settings.ui.bottomGap || 'phone') === 'phone' ? 'selected' : ''}>On phones only</option><option value="always" ${S.settings.ui.bottomGap === 'always' ? 'selected' : ''}>Always</option><option value="off" ${S.settings.ui.bottomGap === 'off' ? 'selected' : ''}>Off</option></select></label>
      ${bindInput('ui.bottomGapPx', 'Bar height (pixels)', { type:'number', hint:'Raise it if the banner still covers anything; lower it to get the space back.' })}
      <div class="sect" style="font-size:20px">Dice, voice, music &amp; game flow</div>
      <p class="hint">These live in <b>Game Settings</b>, which you can also open from the ⚙ button while you play.</p>
      <button class="btn" data-act="gamesettings">${icon('gear')} Open Game Settings</button>
      <div class="sect" style="font-size:20px">Backups</div>
      <p class="hint">A backup file holds every adventure and your settings (keys excluded).</p>
      <div class="row" style="margin-top:10px"><button class="btn" data-act="export">${icon('download')} Back up everything</button><button class="btn" data-act="import">${icon('upload')} Restore backup</button></div>
      <div class="sect" style="font-size:20px">Content rules</div>
      <p class="hint">A fixed set of checks for the age and protection rules every story prompt uses: ages, protection, and which pictures are allowed.</p>
      <button class="btn" data-act="npccheckrules">Check content rules</button>
      <div class="sect" style="font-size:20px">This build</div>
      <p class="hint">Build <b>${esc((document.querySelector('meta[name=build]') || {}).content || 'dev')}</b>. The page asks for every script and stylesheet by its contents, so a deploy is either fully live or visibly not — no half-updated files. <code>node scripts/verify-live.js</code> compares this build with the published site.</p>
      <div class="sect" style="font-size:20px">Danger zone</div>
      <button class="btn danger" data-act="wipe">Erase everything on this device</button>`;
  }
  return [tabs, body];
}

/* ---------- connection & import components (Settings + Setup) ---------- */
const GET_KEYS = [
  ['openrouter', 'OpenRouter', 'Best all-round. Sign up free → Create key.'],
  ['gemini', 'Google Gemini', 'Sign in with Google → Create API key.'],
  ['mistral', 'Mistral', 'Free plan, no card → Create API key.']
];
function getKeysHTML() {
  return `<div class="keylinks">${GET_KEYS.map(([p, name, how]) => { const have = conns().some(c => c.preset === p);
    return `<a class="keylink ${have ? 'have' : ''}" href="${PRESETS[p].keyUrl}" target="_blank" rel="noopener"><b>${name}${have ? ' ✓' : ''}</b><span>${how}</span></a>`; }).join('')}</div>
    <p class="hint">Each opens in a new tab. Copy the key, come back, and paste it below. Groq and Cerebras keys won't work — they block apps that run in a browser. ${isPhone() ? 'Using Ollama on your PC? Tap <b>More</b> below, choose Ollama, and enter your Tailscale address + <b>/v1</b>.' : 'Running Ollama on this computer? Use <b>Find Ollama</b> below.'}</p>`;
  /* Pollinations text is paid since Nov 2026, so it's offered only under "Add manually". */
}
function importHTML() {
  return `<textarea id="keyPaste" rows="3" placeholder="Paste one or more keys here — any format. The app figures out which is which (e.g. mistral = ...)."></textarea>
    ${S.keyPasteHint ? `<div class="row wrap" style="margin-top:8px;align-items:center;gap:8px"><span class="hint" style="margin:0;flex:1">${esc(S.keyPasteHint)} Try <code>mistral = YOUR_KEY</code>.</span><button class="btn sm" data-act="keysmanual">Add manually</button></div>` : ''}
    <div class="row" style="margin-top:8px"><button class="btn gold sm" data-act="keypaste">${icon('plus')} Add pasted keys</button>
      ${!isPhone() ? `<button class="btn sm" data-act="findollama">${icon('spark')} Find Ollama</button>` : ''}
      <button class="btn sm" data-act="keyfile">${icon('upload')} Import keys file</button>
      <button class="btn sm ghost" data-act="keytemplate">${icon('download')} Blank key file</button></div>
    <details id="keyMore" style="margin-top:10px"><summary class="hint" style="cursor:pointer">Add manually, export keys, Ollama…</summary>
      <div class="row" style="margin-top:8px"><button class="btn sm" data-act="keyexport">${icon('download')} Export my keys</button>
        <button class="btn sm" data-act="keydrive" ${Drive.valid() ? '' : 'disabled'}>${icon('cloud')} Save keys to the vault</button></div>
      <p class="hint">Export saves a plain keys file for your other devices — keep it private and delete it afterwards. Save to the vault seals your keys with your passphrase and puts only the ciphertext in your Drive folder, so every device that connects unlocks them automatically.</p>
      <div class="row" style="margin-top:10px"><select id="manPreset" style="width:auto">${Object.entries(PRESETS).map(([k, v]) => `<option value="${k}">${esc(v.label)}</option>`).join('')}</select>
        <input class="grow" type="text" id="manAddr" placeholder="Address (Ollama/custom), e.g. http://localhost:11434/v1"></div>
      <div class="row" style="margin-top:8px"><input class="grow" type="password" id="manKey" placeholder="Key (if needed)" autocomplete="off"><button class="btn sm" data-act="keymanual">Add</button></div>
    </details>`;
}
/* the model picker: a real drop-down with every model this key can use, recommended ones first.
   (A typed box with suggestions hides the list until you clear it, and phones don't show it at all.) */
const MODELS_LOADED = new Set();
/* the model picker: our own list instead of a native drop-down, so it looks the same on every phone and
   desktop (phones ignore colours inside native drop-downs). Recommended models are green and on top. */
function modelGroups(c) {
  const ids = arr(c.models); const info = arr(c.modelInfo);
  const story = c.preset === 'ollama' ? ids.filter(id => STORY_ONLY.test(id)) : [];
  /* Ollama gets the same ★ top picks: the order the app would auto-pick in */
  const rec = modelCandidates(c, ids.map(id => ({ id }))).slice(0, 4).filter(id => ids.includes(id) && !story.includes(id));
  const rest = ids.filter(id => !rec.includes(id) && !story.includes(id));
  const free = id => info.find(m => m.id === id)?.free && !/:free$/.test(id);
  return { rec, story, rest, free };
}
/* What each local model is best at, shown next to it so the roster reads as roles, not file names.
   First match wins; a model nobody knows gets no tags rather than a wrong one. */
const OLLAMA_TAGS = [
  [/qwen3\.5-abliterated|qwen3-abliterated/i, ['NSFW', 'D&D']],
  [/gemma3-abliterated/i, ['NSFW', 'Companion']],
  [/^dolphin/i, ['NSFW', 'Roleplay']],
  [/wayfarer/i, ['Story', 'Uncensored']],
  [/coder|code[-_]?qwen|starcoder/i, ['Helper', 'Code']],
  [/gemma4:e2b|gemma4:e4b/i, ['SFW', 'Story']],
  [/gemma3:4b/i, ['SFW', 'Companion']],
  [/qwen3\.5:4b/i, ['SFW', 'D&D']],
  [/qwen3\.5:9b|qwen3:8b|qwen3:14b/i, ['Story', 'SFW']],
  [/hermes/i, ['Story', 'Uncensored']],
  [/^gemma/i, ['Story', 'SFW']],
  [/llama|mistral|nemo|phi/i, ['Story']]
];
const modelTags = id => (OLLAMA_TAGS.find(([re]) => re.test(String(id || ''))) || [null, []])[1];
/* One line per known local model: what it actually gives the chat, and whether it will write adult scenes.
   Same first-match rule as the tags, so a model the app does not know simply gets no line. */
const MODEL_NOTES = [
  [/wayfarer/i, 'Best scene writer here: second-person adventure prose, uncensored. Slower on 8 GB.'],
  [/qwen3\.5-abliterated|qwen3-abliterated/i, 'Uncensored all-rounder: strong NSFW, follows the rules well, quicker than Wayfarer.'],
  [/gemma3-abliterated/i, 'Uncensored Gemma: warm, natural companion chat and adult scenes.'],
  [/^dolphin/i, 'Quick and uncensored; the most reliable at dice, records and JSON. Fine roleplay.'],
  [/coder|code[-_]?qwen|starcoder/i, 'Coding model: use it as the helper, not for story or chat.'],
  [/gemma4:e2b|gemma4:e4b/i, 'Small Gemma 4: warm SFW narration and chat, still quick on a 6 GB card.'],
  [/gemma4/i, 'Modern Gemma: polished SFW prose and good rule-following; may refuse explicit scenes.'],
  [/gemma3:4b/i, 'Tiny and quick: friendly SFW chat, simple prose.'],
  [/^gemma3/i, 'Older Gemma: dependable SFW narration, less vivid than Gemma 4.'],
  [/qwen3\.5:4b/i, 'Fastest replies: crisp SFW chat; simpler prose, forgets side characters sooner.'],
  [/qwen3\.5:9b|qwen3:8b|qwen3:14b/i, 'Strong general SFW model: good rules and prose, but refuses explicit scenes.'],
  [/qwen3\.5/i, 'Large SFW storyteller: richer prose, needs more graphics memory.'],
  [/hermes/i, 'Uncensored instruct model: steady roleplay, fewer refusals.'],
  [/mistral-nemo|nemo/i, 'Long-context SFW storyteller: good continuity, plain prose.'],
  [/llama/i, 'General SFW model: dependable, less atmospheric.'],
  [/phi/i, 'Small and fast; factual answers, thin story prose.']
];
const modelNote = id => (MODEL_NOTES.find(([re]) => re.test(String(id || ''))) || [null, ''])[1];
function modelListHTML(c) {
  const q = String(S.modelQ || '').toLowerCase().trim(); const g = modelGroups(c);
  const f = list => list.filter(id => !q || id.toLowerCase().includes(q));
  const tags = id => c.preset === 'ollama' ? modelTags(id) : [];
  const note = id => c.preset === 'ollama' ? modelNote(id) : '';
  const row = (id, good) => `<button class="mrow ${good ? 'good' : ''} ${id === c.model ? 'cur' : ''}" data-act="modelset" data-id="${c.id}" data-m="${esc(id)}">${good ? '★ ' : ''}${esc(id)}${tags(id).length ? `<span class="mtags">${tags(id).map(t => `<i class="mtag">${esc(t)}</i>`).join('')}</span>` : ''}${g.free(id) ? '<small>free</small>' : ''}${id === c.model ? '<small>in use</small>' : ''}${note(id) ? `<span class="mdesc">${esc(note(id))}</span>` : ''}</button>`;
  const sec = (label, list, good) => f(list).length ? `<div class="mgrp">${label}</div>${f(list).map(id => row(id, good)).join('')}` : '';
  const all = [...g.rec, ...g.story, ...g.rest];
  const body = (c.modelsLoading && !all.length ? '<p class="hint">Loading models…</p>' : '')
    + sec('★ Recommended', g.rec, true) + sec('★ Story models (best for writing scenes)', g.story, true)
    + sec(g.rec.length || g.story.length ? 'Other models' : 'Models', g.rest, false)
    + (q && !all.some(id => id.toLowerCase() === q) ? `<button class="mrow" data-act="modelset" data-id="${c.id}" data-m="${esc(S.modelQ.trim())}">✎ Use “${esc(S.modelQ.trim())}”</button>` : '')
    + (!all.length && !c.modelsLoading && !q ? '<p class="hint">No models found for this key. <button class="link" data-act="modelsearch">Type a model name</button></p>' : '');
  return body;
}
function modelSelectHTML(c) {
  if (!MODELS_LOADED.has(c.id) && !c.modelsLoading && c.baseUrl) { MODELS_LOADED.add(c.id); loadConnModels(c); }   /* fresh list once per visit */
  const open = S.modelPick === c.id; const good = modelGroups(c);
  const isGood = c.model && (good.rec.includes(c.model) || good.story.includes(c.model));
  /* the list is the picker: opening it shows every model this key can use straight away. Searching is
     opt-in, so nothing has to be typed or cleared before the other models appear. */
  const head = `<div class="mhead"><span class="hint">${arr(c.models).length ? `${arr(c.models).length} models` : 'Models'}</span><span class="mact" id="mact">${S.modelQOpen ? (S.modelQ ? '<button class="link" data-act="modelclear">Show all</button>' : '') : '<button class="link" data-act="modelsearch">Search…</button>'}</span></div>`;
  const search = S.modelQOpen ? `<input id="modelQ" data-cid="${c.id}" placeholder="Filter by name, or type one this key allows…" value="${esc(S.modelQ || '')}" autocomplete="off">` : '';
  return `<button class="mpick grow ${isGood ? 'good' : ''}" data-act="modelpick" data-id="${c.id}">${c.model ? `${isGood ? '★ ' : ''}${esc(c.model)}` : 'Choose a model…'}<span class="mchev">${open ? '▲' : '▼'}</span></button>`
    + (open ? `</div><div class="mpanel">${head}${search}${c.preset === 'ollama' ? `<p class="hint mlegend"><b>Story</b> prose &amp; pacing · <b>D&amp;D</b> rules and dice · <b>Companion</b> everyday chat · <b>NSFW</b> uncensored · <b>SFW</b> may refuse explicit scenes</p>` : ''}<div class="mlist" id="mlist">${modelListHTML(c)}</div></div><div class="row" style="margin-top:6px">` : '');
}
async function loadConnModels(c, force = false) {
  /* the last good list is kept, so opening the picker is instant and still works when the provider
     is throttled, offline, or refuses the key for a moment */
  const fresh = arr(c.models).length && Date.now() - (c.modelsAt || 0) < 6 * 3600e3;
  if (!force && fresh) { refreshConnUI(); return c.models; }
  c.modelsLoading = true;
  try {
    const list = await listModels(c);
    c.modelInfo = list.slice(0, 400).map(m => ({ id: m.id, free: !!m.free })); c.models = list.slice(0, 400).map(m => m.id);
    c.modelsAt = Date.now(); c.modelsErr = '';
    saveSettings(false);
  } catch (e) {
    c.models = c.models || []; c.modelsErr = String(e && e.message || e);
  }
  c.modelsLoading = false; refreshConnUI();
  return c.models;
}
function helperSelectHTML() {
  const a = activeConn(); const ids = arr(a?.models); const h = S.settings.ai.helperModel || '';
  return `<label class="f"><span>Helper model (optional)</span><select data-bind="ai.helperModel"><option value="" ${!h ? 'selected' : ''}>Same as story model (fastest on one graphics card)</option>${h && !ids.includes(h) ? `<option selected>${esc(h)}</option>` : ''}${ids.filter(id => a && id !== a.model).map(id => `<option ${id === h ? 'selected' : ''}>${esc(id)}</option>`).join('')}</select></label>`;
}
function connsHTML() {
  const list = conns(); const act = activeConn();
  if (!list.length) return `<p class="hint" style="color:var(--ink)">No AI connected yet. Add a free key below.</p>`;
  return `<label class="check" style="margin-top:4px"><input type="checkbox" data-bind="ai.fallback" ${S.settings.ai.fallback ? 'checked' : ''}><span>Auto-switch to my next connection when one is busy or out of free requests</span></label>
    ${list.map(c => { const on = act && act.id === c.id; const st = c.status === 'working' ? `<span class="spin sm"></span> ${esc(c.note)}` : c.status === 'ok' ? '<span style="color:var(--green)">● Ready</span>' : c.status === 'error' ? `<span style="color:var(--red)">● ${esc(c.note)}</span>` : c.note ? esc(c.note) : connReady(c) ? '● Not tested' : '● Needs a model';
      return `<div class="conn ${on ? 'on' : ''}">
        <div class="row"><b class="grow">${esc(c.label)}${on ? ' <span class="note gold" style="margin-left:4px">In use</span>' : ''}</b>
          ${!on && connReady(c) ? `<button class="btn sm" data-act="connuse" data-id="${c.id}">Use</button>` : ''}
          <button class="iconbtn sm" data-act="conndel" data-id="${c.id}" aria-label="Remove">${icon('trash')}</button></div>
        <div class="hint" style="margin:2px 0 6px">${esc(maskKey(c.apiKey))} · ${st}${coolLeft(c) ? ` <span class="note">· cooling ${coolLabel(coolLeft(c))}</span>` : ''}</div>
        <div class="row">${modelSelectHTML(c)}
          <button class="btn sm" data-act="conntest" data-id="${c.id}" ${c.status === 'working' ? 'disabled' : ''}>Test</button>
          <button class="btn sm ghost" data-act="connverify" data-id="${c.id}" ${c.status === 'working' ? 'disabled' : ''}>Key check</button>
          <button class="btn sm ghost" data-act="connpick" data-id="${c.id}" ${c.status === 'working' ? 'disabled' : ''}>Auto-pick</button></div>
        ${c.preset === 'ollama' || c.preset === 'custom' ? `<label class="f" style="margin-top:8px"><span>AI memory (context length)</span><input type="number" step="1024" min="2048" data-conn="${c.id}" data-field="ctx" value="${esc(c.ctx || PRESETS[c.preset]?.ctx || '')}" placeholder="12288"></label><p class="hint">Must match OLLAMA_CONTEXT_LENGTH on the PC. Bigger remembers more but runs slower.</p>` : ''}</div>`; }).join('')}
    <p class="hint">Pick a model from the list. <b style="color:var(--green)">★ Recommended</b> ones are listed first. ${act && act.preset === 'ollama' ? 'On your own PC: Wayfarer 12B or an uncensored Qwen3.5 9B writes best, and dolphin3 runs the dice and records.' : 'Bigger models (DeepSeek, Llama 70B, Qwen large, Gemini Flash) follow the rules best.'}</p>`;
}


/* moved here so Game Settings can show them */
const voiceSettingsHTML = () => `${TTS || VOICE.pc ? `${slider('ui.voiceVol', 'Voice volume', 0, 1, 0.01, pct)}<label class="f"><span>Narration</span><select data-bind="ui.voice"><option value="off" ${S.settings.ui.voice === 'off' ? 'selected' : ''}>Off</option><option value="tap" ${S.settings.ui.voice === 'tap' ? 'selected' : ''}>Tap "Read" to hear a scene</option><option value="auto" ${S.settings.ui.voice === 'auto' ? 'selected' : ''}>Read every scene aloud automatically</option></select></label>
      <label class="f"><span>Voices from</span><select data-bind="ui.voiceEngine"><option value="auto" ${(S.settings.ui.voiceEngine || 'auto') === 'auto' ? 'selected' : ''}>Automatic: natural PC voices when the helper has them</option><option value="pc" ${S.settings.ui.voiceEngine === 'pc' ? 'selected' : ''}>My PC (natural voices)</option><option value="device" ${S.settings.ui.voiceEngine === 'device' ? 'selected' : ''}>This device's built-in voices</option></select></label>
      <p class="hint">${VOICE.pc ? '<b style="color:var(--green)">✓ Natural PC voices found.</b> 27 voices, male and female, US and UK.' : 'Natural PC voices: not found. On the PC run <b>Install voices.bat</b> once (in the same folder as the picture helper), then restart the helper.'} <button class="link" data-act="voicecheck">Check again</button></p>
      ${engine() === 'pc' ? `<label class="f"><span>Narrator voice</span><select data-bind="ui.voicePC">${[...PC_VOICES.m, ...PC_VOICES.f].map(([id, l]) => `<option value="${id}" ${(S.settings.ui.voicePC || PC_NARRATOR) === id ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`
        : `<label class="f"><span>Narrator voice</span><select data-bind="ui.voiceName"><option value="">Device default</option>${ttsVoices().map(v => `<option ${S.settings.ui.voiceName === v.name ? 'selected' : ''}>${esc(v.name)}</option>`).join('')}</select></label>`}
      ${bindCheck('ui.charVoices', 'Give every character their own voice: a male or female voice picked automatically and kept for the whole story')}
      <label class="f"><span>Speed (${S.settings.ui.voiceRate || 1}×)</span><input type="range" min="0.6" max="1.6" step="0.1" data-bind="ui.voiceRate" value="${S.settings.ui.voiceRate || 1}" style="width:100%;accent-color:var(--gold)"></label>
      <button class="btn sm" data-act="voicetest" style="margin-top:8px">${icon('speaker')} Test voice</button>
      <p class="hint">The narrator reads the story; lines in quotes are spoken by whoever says them. Change any companion's voice in the Party screen. On iPhone, more built-in voices are under Settings → Accessibility → Spoken Content → Voices.</p>` : '<p class="hint">This browser has no built-in voices.</p>'}`;
const typingSettingsHTML = () => `      <label class="f"><span>When I type plain text, it means</span><select data-bind="ui.typeMode"><option value="say" ${typeMode() === 'say' ? 'selected' : ''}>What my character says (✋ Action button for what they do)</option><option value="act" ${typeMode() === 'act' ? 'selected' : ''}>What my character does (💬 Say button for what they say)</option></select></label>
      <p class="hint">The buttons above the text box add the marks for you: ✋ Action puts *asterisks* around what you do, 💬 Say puts "quotes" around what you say, 💭 Thought wraps what you think in [[double brackets]] so the GM knows it was never said aloud, and (( )) Talk to GM is for questions or requests outside the story. Select some text first to wrap it.</p>
      ${SR ? '<p class="hint">Tap the microphone next to the text box to speak your action.</p>' : ''}`;
