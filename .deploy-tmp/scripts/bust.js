#!/usr/bin/env node
/* =========================================================================
   Stamp index.html with content hashes.

   Every js/ and css/ reference gets ?v=<sha1 of its contents>, so a browser
   can never keep serving an old file after a change, and nobody has to bump
   the strings by hand. Also writes the current git commit into the build
   meta tag so the live site can say which build it is running.

     node scripts/bust.js
   ========================================================================= */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cp = require('child_process');

const root = path.resolve(__dirname, '..');
const indexPath = path.join(root, 'index.html');
if (!fs.existsSync(indexPath)) {
  console.error('index.html not found next to the scripts folder.');
  process.exit(1);
}

let html = fs.readFileSync(indexPath, 'utf8');
let stamped = 0;
const missing = [];

html = html.replace(/((?:href|src)=")((?:css|js)\/[^"?#]+)(?:\?v=[^"]*)?(")/g, (all, open, file, close) => {
  const abs = path.join(root, file);
  if (!fs.existsSync(abs)) { missing.push(file); return all; }
  const hash = crypto.createHash('sha1').update(fs.readFileSync(abs)).digest('hex').slice(0, 8);
  stamped++;
  return open + file + '?v=' + hash + close;
});

let sha = 'dev';
try { sha = cp.execSync('git rev-parse --short HEAD', { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || 'dev'; } catch { /* not a git checkout: keep dev */ }
const date = new Date().toISOString().slice(0, 10);
const build = sha + ' · ' + date;
if (/<meta name="build" content="[^"]*">/.test(html)) html = html.replace(/<meta name="build" content="[^"]*">/, `<meta name="build" content="${build}">`);
else html = html.replace('</head>', `<meta name="build" content="${build}">\n</head>`);

fs.writeFileSync(indexPath, html);
console.log(`Stamped ${stamped} file${stamped === 1 ? '' : 's'} with content hashes. Build ${build}.`);
if (missing.length) {
  console.error('These files are referenced but missing:\n  ' + missing.join('\n  '));
  process.exitCode = 1;
}
