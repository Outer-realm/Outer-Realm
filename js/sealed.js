'use strict';
/* =========================================================================
   Sealed adventure saves

   The keys already travel sealed (js/vault.js). This seals the saves the same
   way, without a second passphrase: the vault holds one random AES-256 data
   key, itself wrapped inside the vault by the passphrase key. Everything an
   adventure folder holds in Drive — campaign.json, Character Sheet.md,
   Story Log.md — is sealed with that data key under its usual name.

   A device that cannot open the vault cannot read the saves, and (see syncNow
   in js/images.js) never writes over them. Files written by an older version
   are still plain text and still read: they are sealed the next time that
   adventure is saved.

   Story Docs and pictures are left alone: a Google Doc cannot be encrypted
   client-side, and the pictures are separate files.
   ========================================================================= */
const SEAL_KIND = 'ironquill-sealed';
const SEAL_FILES = ['campaign.json', 'Character Sheet.md', 'Story Log.md', 'companions.json', 'companion.json',
  'persona.json', 'Persona.md', 'world.json', 'Setting.md'];

const s64 = buf => { const b = new Uint8Array(buf); let s = ''; for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); return btoa(s); };
const su64 = s => { const bin = atob(String(s || '')); const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; };

async function sealedNewKey() { return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']); }
async function sealedRawKey(key) { return new Uint8Array(await crypto.subtle.exportKey('raw', key)); }
async function sealedImportKey(raw) { return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']); }

/* text -> the same text sealed; the file keeps its name, so every version still finds it */
async function sealedText(text, key) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(String(text)));
  return JSON.stringify({ app: APP, kind: SEAL_KIND, v: 1, iv: s64(iv), data: s64(ct) });
}

async function sealedRead(blob, key) {
  const j = typeof blob === 'string' ? JSON.parse(blob) : blob;
  if (!j || j.kind !== SEAL_KIND || !j.data) throw new Error('That file is not a sealed save.');
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: su64(j.iv) }, key, su64(j.data));
  return new TextDecoder().decode(pt);
}

/* is this the sealed envelope, or a plain file from an older version? */
function sealedIs(text) {
  if (typeof text !== 'string' || text.indexOf(SEAL_KIND) < 0) return false;
  try { const j = JSON.parse(text); return !!j && j.kind === SEAL_KIND && !!j.data; } catch { return false; }
}

/* Pictures are bytes, not JSON. Same AES-GCM key, but a 7-byte header and the raw IV instead of base64,
   which would grow every photo by a third. The Drive file keeps its .jpg name, but holds opaque bytes. */
const SEAL_BLOB_MAGIC = new TextEncoder().encode('IQSEAL1');
async function sealedBlobIs(blob) {
  if (!blob || blob.size < SEAL_BLOB_MAGIC.length + 12) return false;
  const head = new Uint8Array(await blob.slice(0, SEAL_BLOB_MAGIC.length).arrayBuffer());
  return SEAL_BLOB_MAGIC.every((b, i) => head[i] === b);
}
async function sealedBlobWrite(blob, key) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, await blob.arrayBuffer());
  return new Blob([SEAL_BLOB_MAGIC, iv, new Uint8Array(ct)], { type: 'application/octet-stream' });
}
async function sealedBlobRead(blob, key) {
  const buf = new Uint8Array(await blob.arrayBuffer());
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: buf.slice(SEAL_BLOB_MAGIC.length, SEAL_BLOB_MAGIC.length + 12) }, key, buf.slice(SEAL_BLOB_MAGIC.length + 12));
  return new Blob([pt], { type: 'image/jpeg' });
}

const Sealed = {
  key: null,
  ready() { return !!this.key; },
  /* take the data key out of an unlocked vault; null clears it, and the saves are then locked */
  async use(raw) { this.key = raw ? await sealedImportKey(raw) : null; if (this.key) S.savesLocked = false; return this.key; },
  clear() { this.key = null; },
  is: sealedIs,
  newKey: sealedNewKey,
  raw: sealedRawKey,
  seal(text) { if (!this.key) throw new Error('The vault is locked.'); return sealedText(text, this.key); },
  /* read a file that may be sealed, or plain text from an older version */
  async read(text) {
    if (!sealedIs(text)) return text;
    if (!this.key) { const e = new Error('This device has not unlocked the vault that seals it.'); e.locked = true; throw e; }
    return sealedRead(text, this.key);
  },
  /* a card or save file -> { data } (sealed or plain), or { locked } when it is sealed and this device is not */
  async card(text) {
    if (sealedIs(text) && !this.key) return { locked: true };
    try { return { data: JSON.parse(await this.read(text)) }; } catch (e) { if (e.locked) return { locked: true }; throw e; }
  },
  /* what to upload under a save file's name: sealed once this device holds the vault's key */
  file(name, text) { return SEAL_FILES.includes(name) && this.key ? sealedText(text, this.key) : Promise.resolve(text); },
  /* upload bytes: sealed once the vault is unlocked. If a vault exists but is locked, refuse rather than
     put a readable picture next to the sealed ones. No vault at all keeps the old plain behaviour. */
  async blobFor(blob) {
    if (!blob) return blob;
    if (this.key) return sealedBlobWrite(blob, this.key);
    const vaultOn = typeof S !== 'undefined' && S.settings?.drive?.vault !== false;
    if (vaultOn && (S.vaultFound || S.vaultLocked || S.vaultAt)) { const e = new Error('Unlock the vault to save pictures encrypted.'); e.locked = true; throw e; }
    return blob;
  },
  /* bytes from Drive -> a viewable image: plain files from older versions pass through, sealed ones need the key */
  async openBlob(blob) {
    if (!blob || !(await sealedBlobIs(blob))) return blob;
    if (!this.key) return null;
    try { return await sealedBlobRead(blob, this.key); } catch { return null; }
  }
};
