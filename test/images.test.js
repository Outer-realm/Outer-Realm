'use strict';
/* Forge tuning test — no Forge, no network. Loads the real preset and forgeTune code out of
   js/images.js and checks the numbers that go to /sdapi/v1/txt2img.

     node test/images.test.js
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
  part('js/images.js', 'const FORGE_PRESETS', 'const FORGE_SIZES'),
  part('js/images.js', 'const FORGE_SIZES', 'const FORGE_NEG'),
  part('js/images.js', 'const SPEED_LORA', '/* the standing additions'),
  part('js/images.js', 'function forgeTune', 'function pickForgeModel('),
  part('js/images.js', 'const picCheckpoint =', 'function autoAssignModels'),
  part('js/images.js', 'function pickForgeModel(', '/* "Auto" reads the model'),
  part('js/images.js', 'const sameForgeModel =', 'const LOCAL ='),
  ';globalThis.__img = { forgeTune, FORGE_SIZES, FORGE_PRESETS, SPEED_LORA, sameForgeModel, pickForgeModel };'
].join('\n');

let pass = 0, fail = 0;
const fails = [];
function is(name, ok, extra) {
  if (ok) { pass++; console.log('PASS  ' + name); }
  else { fail++; fails.push(name); console.log('FAIL  ' + name + (extra != null ? '   [' + extra + ']' : '')); }
}

const ctx = vm.createContext({ console, S: { settings: { image: {} } }, AGE: { imageAllowed: () => ({ allowed: true }) }, normRating: r => r });
vm.runInContext(APP, ctx, { filename: 'images.js' });
const { forgeTune, FORGE_SIZES, FORGE_PRESETS, sameForgeModel, pickForgeModel } = ctx.__img;

const REALVIS = 'RealVisXL_V5.0_Lightning_fp16.safetensors [fabcadd933]';
const BIGLOVE = 'BigLovePhoto5.safetensors';
const PORNM = 'PornMaster-Pro-SDXL-V8-VAE.safetensors [31ffa9f94d]';
const tun = (m, base = 'xl', speed = false) => forgeTune(m, base, speed);

console.log('\n1. SDXL-native sizes');
is('portrait is 896×1152', FORGE_SIZES.xl.portrait.join('x') === '896x1152', FORGE_SIZES.xl.portrait.join('x'));
is('square is 1024×1024', FORGE_SIZES.xl.square.join('x') === '1024x1024', FORGE_SIZES.xl.square.join('x'));
is('tall is 832×1216', FORGE_SIZES.xl.tall.join('x') === '832x1216', FORGE_SIZES.xl.tall.join('x'));

console.log('\n2. The Lightning checkpoint (one model for SFW and NSFW)');
{
  const t = tun(REALVIS);
  is('6 steps', t.steps === 6, t.steps);
  is('CFG 1.5', t.cfg === 1.5, t.cfg);
  is('DPM++ SDE', t.sampler === 'DPM++ SDE', t.sampler);
  is('Karras', t.scheduler === 'Karras', t.scheduler);
  is('no speed LoRA added', t.lora === '');
  is('the Lightning preset agrees', FORGE_PRESETS.lightning.steps === 6);
}

console.log('\n3. Big Love XL (4-step LoRA, LCM)');
{
  const t = tun(BIGLOVE, 'xl', false);
  is('the LoRA goes on by itself', /dmd2_sdxl_4step_lora/.test(t.lora), t.lora);
  is('6 steps, CFG 1.5', t.steps === 6 && t.cfg === 1.5, `${t.steps}/${t.cfg}`);
  is('LCM sampler', t.sampler === 'LCM', t.sampler);
  is('Exponential scheduler', t.scheduler === 'Exponential', t.scheduler);
}

console.log('\n4. PornMaster Pro (4-step build, automatic speed LoRA)');
{
  const t = tun(PORNM, 'xl', false);
  is('6 steps, CFG 1.5 even when picked as the adult model', t.steps === 6 && t.cfg === 1.5, `${t.steps}/${t.cfg}`);
  is('DPM++ SDE + Karras', t.sampler === 'DPM++ SDE' && t.scheduler === 'Karras');
  is('DMD2 LoRA in the prompt', /dmd2_sdxl_4step_lora/.test(t.lora), t.lora);
}

console.log('\n5. SD 1.5 keeps its own numbers');
{
  const t = tun('realisticVisionV60B1_v51VAE', '15', true);
  is('25 steps, CFG 6, no SDXL LoRA', t.steps === 25 && t.cfg === 6 && t.lora === '', `${t.steps}/${t.cfg}/${t.lora}`);
}

console.log('\n6. Safe and adult picture models');
{
  ctx.S.settings.image.forgeModelSfw = REALVIS;
  ctx.S.settings.image.forgeModelNsfw = PORNM;
  const pick = (rating, wanted = '') => pickForgeModel({ rating }, 'a portrait', { adult: true, protected: false }, wanted).model;
  is('a safe picture uses the default model', pick('PG-13') === REALVIS, pick('PG-13'));
  is('an 18+ picture uses the adult model', pick('M') === PORNM, pick('M'));
  is('a model picked on the picture still wins', pick('M', BIGLOVE) === BIGLOVE, pick('M', BIGLOVE));
  ctx.AGE.imageAllowed = () => ({ allowed: false });
  is('a protected/minor picture ignores the adult model', pick('M') === REALVIS, pick('M'));
}

console.log('\n7. One checkpoint, one reload decision');
{
  is('a title with [hash] matches the name Forge reports', sameForgeModel('RealVisXL_V5.0_Lightning_fp16.safetensors [fabcadd933]', 'RealVisXL_V5.0_Lightning_fp16.safetensors'));
  is('a different checkpoint does not match', !sameForgeModel('BigLovePhoto5.safetensors', 'RealVisXL_V5.0_Lightning_fp16.safetensors'));
  is('an empty note never matches', !sameForgeModel('BigLovePhoto5.safetensors', ''));
}

console.log(`\n${pass}/${pass + fail} checks passed`);
if (fail) { console.log('FAILED:\n' + fails.map(f => '  - ' + f).join('\n')); process.exit(1); }
process.exit(0);
