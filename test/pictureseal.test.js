#!/usr/bin/env node
'use strict';
/* =========================================================================
   Sealed pictures

   Pictures uploaded to Drive are AES-GCM blobs with a tiny IQSEAL1 header.
   This runs the real js/sealed.js in a throwaway VM with WebCrypto and checks:
   a picture becomes opaque bytes, the vault key opens it again, a locked
   device cannot, a wrong key cannot, and a picture from an older version
   still passes through as an ordinary image.

   Run:  node test/pictureseal.test.js
   ========================================================================= */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { webcrypto } = require('crypto');

let pass = 0, fail = 0;
const is = (name, ok, detail) => {
  if (ok) { pass++; console.log('PASS ', name); }
  else { fail++; console.log('FAIL ', name, detail === undefined ? '' : '— ' + detail); }
};

(async () => {
  const ctx = {
    crypto: webcrypto, Blob, TextEncoder, TextDecoder, console,
    S: { settings: { drive: { vault: true } }, vaultFound: true, vaultLocked: false, vaultAt: 1, savesLocked: false }
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'sealed.js'), 'utf8') + '\n;globalThis.Sealed = Sealed;', ctx, { filename: 'sealed.js (under test)' });
  const Sealed = ctx.Sealed;

  const bytes = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01]);
  const picture = new Blob([bytes], { type: 'image/jpeg' });

  const key = await webcrypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  await Sealed.use(new Uint8Array(await webcrypto.subtle.exportKey('raw', key)));

  const sealed = await Sealed.blobFor(picture);
  const sealedBytes = new Uint8Array(await sealed.arrayBuffer());
  is('a picture becomes opaque bytes', sealed !== picture && sealed.type === 'application/octet-stream');
  is('the JPEG header is gone from the upload', !sealedBytes.slice(0, 12).every((b, i) => b === bytes[i]));
  is('the sealed blob carries the IQSEAL1 header', String.fromCharCode(...sealedBytes.slice(0, 7)) === 'IQSEAL1', sealedBytes.slice(0, 7).join(','));

  const opened = await Sealed.openBlob(sealed);
  const openedBytes = new Uint8Array(await opened.arrayBuffer());
  is('the vault key opens the picture again', opened.type === 'image/jpeg' && openedBytes.length === bytes.length && openedBytes.every((b, i) => b === bytes[i]));

  Sealed.clear();
  is('a locked device cannot open it', await Sealed.openBlob(sealed) === null);
  let locked = null; try { await Sealed.blobFor(picture); } catch (e) { locked = e; }
  is('a locked device refuses to upload a readable picture', !!locked && locked.locked === true);

  const other = await webcrypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  await Sealed.use(new Uint8Array(await webcrypto.subtle.exportKey('raw', other)));
  is('a wrong key returns nothing, not garbage', await Sealed.openBlob(sealed) === null);

  /* an older plain picture, and a device with no vault at all */
  ctx.S.vaultFound = false; ctx.S.vaultAt = 0; Sealed.clear();
  const plain = new Blob([bytes], { type: 'image/jpeg' });
  is('a plain picture from an older version still opens', await Sealed.openBlob(plain) === plain);
  is('and stays plain when there is no vault', await Sealed.blobFor(plain) === plain);

  console.log(`\n${pass}/${pass + fail} checks passed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
