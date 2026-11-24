'use strict';
/* Ollama transport test — no Ollama, no network. Loads the real chatOne/auth code out of js/ai.js
   into a VM with a stub fetch, and checks what would actually be put on the wire.

     node test/ollama.test.js
*/
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
function part(file, from, to) {
  const s = read(file); const a = s.indexOf(from); const b = s.indexOf(to, a);
  if (a < 0 || b < 0) throw new Error(`slice not found in ${file}: ${from}`);
  return s.slice(a, b);
}

const APP = [
  part('js/ai.js', 'const estTokens', 'function stripThink(s) {'),
  ';globalThis.__ai = { chatOne, aiContext, ollamaModelFor, ollamaCtxFor, OLLAMA_ROLES };'
].join('\n');

let pass = 0, fail = 0;
const fails = [];
function is(name, ok, extra) {
  if (ok) { pass++; console.log('PASS  ' + name); }
  else { fail++; fails.push(name); console.log('FAIL  ' + name + (extra != null ? '   [' + extra + ']' : '')); }
}

/* ---------- a stub fetch that records the request and answers like Ollama ---------- */
function load({ content = 'ok', stream = null, installed = [], status = 200, pullStatus = 200 } = {}) {
  const calls = [];
  const handler = async (url, init) => {
    const body = init && init.body ? JSON.parse(init.body) : null;
    calls.push({ url: String(url), body, method: (init && init.method) || 'GET' });
    if (String(url).endsWith('/api/tags')) {
      return { ok: true, status: 200, json: async () => ({ models: installed.map(name => ({ name })) }) };
    }
    if (String(url).endsWith('/api/pull') && pullStatus !== 200) return { ok: false, status: pullStatus, json: async () => ({ error: 'no space' }), text: async () => 'no space' };
    if (status !== 200) return { ok: false, status, json: async () => ({ error: 'nope' }), text: async () => 'nope' };
    if (stream) {
      const chunks = stream.slice();
      return { ok: true, status: 200, body: { getReader: () => ({
        read: async () => chunks.length ? { value: new TextEncoder().encode(chunks.shift()), done: false } : { done: true }
      }) } };
    }
    return { ok: true, status: 200, json: async () => ({ message: { role: 'assistant', content } }) };
  };
  const ctx = vm.createContext({
    console, setTimeout, clearTimeout, AbortController, DOMException, TextDecoder, URL,
    S: { settings: { text: { maxTokens: 400, temperature: 0.85 } }, aiScope: 'game', aiNsfw: false },
    PRESETS: { ollama: { ctx: 12288 } },
    APP: 'Outer Realm',
    location: { origin: 'http://localhost' },
    toast: () => {},
    num: n => Number(n) || 0,
    fetch: (u, i) => handler(u, i)
  });
  vm.runInContext(APP, ctx, { filename: 'ai.js' });
  return { ctx, calls, ai: ctx.__ai };
}
const ollama = (model = 'gemma3:4b') => ({ id: 'o1', preset: 'ollama', label: 'Ollama', baseUrl: 'http://localhost:11434/v1', model, apiKey: '' });
const chatCall = calls => calls.filter(c => c.url.endsWith('/api/chat'));
const ask = (h, model, opts = {}) => h.ai.chatOne(ollama(model), [{ role: 'user', content: 'hi' }], opts);

(async () => {
  console.log('\n1. The request Ollama actually receives');
  {
    const h = load();
    h.ctx.S.aiScope = 'companion';
    const out = await ask(h, 'gemma3:4b');
    const c = chatCall(h.calls)[0];
    is('it goes to /api/chat, not the OpenAI route', !!c && !h.calls.some(x => x.url.includes('/chat/completions')), c && c.url);
    is('the base URL loses its /v1', c.url === 'http://localhost:11434/api/chat', c.url);
    is('the reply text comes back', out === 'ok', JSON.stringify(out));
    is('temperature 0.85', c.body.options.temperature === 0.85, c.body.options.temperature);
    is('repeat_penalty 1.12', c.body.options.repeat_penalty === 1.12, c.body.options.repeat_penalty);
    is('companion mode asks for 4096 context', c.body.options.num_ctx === 4096, c.body.options.num_ctx);
    is('the reply budget is num_predict', c.body.options.num_predict === 400, c.body.options.num_predict);
    is('no OpenAI fields leak in', !('max_tokens' in c.body) && !('response_format' in c.body) && !('reasoning_effort' in c.body));
    is('the model stays loaded between turns', c.body.keep_alive === '10m', c.body.keep_alive);
    is('a reasoning model answers instead of thinking out loud', c.body.think === false, c.body.think);
  }

  console.log('\n2. Context by mode and model');
  {
    const h = load();
    h.ctx.S.aiScope = 'game';
    await ask(h, 'gemma3:4b');
    is('D&D with a 3.4 GB model gets 6144', chatCall(h.calls).pop().body.options.num_ctx === 6144, chatCall(h.calls).pop().body.options.num_ctx);
    await ask(h, 'qwen3.5:4b');
    is('D&D with qwen3.5:4b gets 6144', chatCall(h.calls).pop().body.options.num_ctx === 6144);
    await ask(h, 'gemma4:e2b-it-qat');
    is('gemma4:e2b-it-qat is held to 4096 in D&D too', chatCall(h.calls).pop().body.options.num_ctx === 4096);
    await ask(h, 'dolphin3:latest');
    is('dolphin3:latest is held to 4096 in D&D too', chatCall(h.calls).pop().body.options.num_ctx === 4096);
    h.ctx.S.aiScope = 'companion';
    await ask(h, 'qwen3.5:4b');
    is('companion mode is 4096 whatever the model', chatCall(h.calls).pop().body.options.num_ctx === 4096);
  }

  console.log('\n3. The NSFW switch');
  {
    const h = load({ installed: ['huihui_ai/qwen3.5-abliterated:4b'] });
    h.ctx.S.aiNsfw = false;
    await ask(h, 'gemma3:4b');
    is('SFW keeps the model the player chose', chatCall(h.calls)[0].body.model === 'gemma3:4b');
    h.ctx.S.aiNsfw = true;
    await ask(h, 'gemma3:4b');
    is('NSFW swaps a SFW model for qwen3.5-abliterated', chatCall(h.calls).pop().body.model === 'huihui_ai/qwen3.5-abliterated:4b', chatCall(h.calls).pop().body.model);
    is('the uncensored 4B keeps the full 6144 D&D context', chatCall(h.calls).pop().body.options.num_ctx === 6144, chatCall(h.calls).pop().body.options.num_ctx);
    await ask(h, 'qwen3.5:4b');
    is('a SFW logic pick is swapped too, not only the companion default', chatCall(h.calls).pop().body.model === 'huihui_ai/qwen3.5-abliterated:4b');
    is('it checks whether that model is installed first', h.calls.some(c => c.url.endsWith('/api/tags')));
    is('and does not ask again on the next turn', h.calls.filter(c => c.url.endsWith('/api/tags')).length === 1, h.calls.filter(c => c.url.endsWith('/api/tags')).length);
    await ask(h, 'dolphin3:latest');
    is('a dolphin3 pick is left alone on NSFW', chatCall(h.calls).pop().body.model === 'dolphin3:latest', chatCall(h.calls).pop().body.model);
    const h2 = load();
    h2.ctx.S.aiNsfw = true;
    h2.ctx.S.aiScope = 'companion';
    await ask(h2, 'gemma4:e2b-it-qat');
    is('an adult companion chat swaps in the uncensored model', chatCall(h2.calls).pop().body.model === 'huihui_ai/qwen3.5-abliterated:4b');
    const pull = h2.calls.find(c => c.url.endsWith('/api/pull'));
    is('a model that is not installed is pulled first', !!pull && pull.body.name === 'huihui_ai/qwen3.5-abliterated:4b');
    is('the pull streams so progress can be shown', !!pull && pull.body.stream === true, pull && pull.body.stream);
    is('and the reply still goes out afterwards', chatCall(h2.calls).length === 1 && chatCall(h2.calls)[0].body.model === 'huihui_ai/qwen3.5-abliterated:4b');
    const h3 = load({ pullStatus: 500 });
    h3.ctx.S.aiNsfw = true;
    await ask(h3, 'gemma3:4b');
    is('a failed pull falls back to the model the player picked', chatCall(h3.calls).pop().body.model === 'gemma3:4b', chatCall(h3.calls).pop().body.model);
  }

  console.log('\n4. JSON steps and streaming');
  {
    const h = load();
    await ask(h, 'gemma3:4b', { json: true });
    is('json asks for Ollama format=json', chatCall(h.calls)[0].body.format === 'json', chatCall(h.calls)[0].body.format);
    is('and not for an OpenAI response_format', !('response_format' in chatCall(h.calls)[0].body));

    const s = load({ stream: ['{"message":{"content":"Hel"}}\n', '{"message":{"content":"lo"},"done":false}\n', '{"done":true}\n'] });
    let seen = '';
    const out = await ask(s, 'gemma3:4b', { stream: true, onToken: full => { seen = full; } });
    is('a streamed reply is assembled from JSON lines', out === 'Hello', JSON.stringify(out));
    is('and drawn as it arrives', seen === 'Hello', JSON.stringify(seen));
  }

  console.log('\n5. Other providers are unchanged');
  {
    const h = load();
    const conn = { id: 'c1', preset: 'custom', label: 'Local', baseUrl: 'http://localhost:1234/v1/', model: 'some-model', apiKey: 'k' };
    await h.ai.chatOne(conn, [{ role: 'user', content: 'hi' }], {});
    const c = h.calls[0];
    is('still the OpenAI-compatible route', c.url === 'http://localhost:1234/v1/chat/completions', c.url);
    is('still max_tokens and temperature', c.body.max_tokens === 400 && c.body.temperature === 0.85, JSON.stringify(c.body).slice(0, 80));
    is('no Ollama options object', !('options' in c.body));
  }

  console.log(`\n${pass}/${pass + fail} checks passed`);
  if (fail) { console.log('FAILED:\n' + fails.map(f => '  - ' + f).join('\n')); process.exit(1); }
  process.exit(0);
})().catch(e => { console.error('ERROR', e); process.exit(1); });
