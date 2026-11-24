'use strict';
/* =========================================================================
   Encrypted key vault in Google Drive

   Google Drive has no passphrase or folder-encryption feature: it encrypts
   everything at rest, but anyone who can open the folder sees what is in it.
   So this app seals the keys itself, in the browser, before uploading
   anything: AES-GCM 256, with the key stretched from your passphrase by
   PBKDF2-SHA-256. Drive only ever holds the ciphertext
   (ironquill-vault.json); the passphrase never leaves this device.

   Losing the passphrase loses the vault. There is no recovery, by design.
   ========================================================================= */
const VAULT_FILE = 'ironquill-vault.json';
const VAULT_PASS_KEY = 'iq.vaultPass';
const VAULT_ITER = 310000;
const VAULT_MIN = 8;

const b64 = buf => { const b = new Uint8Array(buf); let s = ''; for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); return btoa(s); };
const unb64 = s => { const bin = atob(String(s || '')); const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; };

async function vaultKey(pass, salt, iter) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

/* text -> a small self-describing blob (salt and iv travel with it, in the clear). The save data key,
   when there is one, is wrapped inside it too: that key is what seals campaign.json and the .md files. */
async function vaultSeal(text, pass, dataKey) {
  if (!window.crypto?.subtle) throw new Error('This browser cannot encrypt (it needs https:// or localhost, not a local file).');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await vaultKey(pass, salt, VAULT_ITER);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(String(text)));
  const blob = { app: APP, kind: 'ironquill-vault', v: 1, alg: 'AES-GCM-256', kdf: 'PBKDF2-SHA256', iter: VAULT_ITER, salt: b64(salt), iv: b64(iv), data: b64(ct), savedAt: new Date().toISOString() };
  if (dataKey) {
    const wiv = crypto.getRandomValues(new Uint8Array(12));
    const wct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: wiv }, key, dataKey);
    blob.secret = { iv: b64(wiv), data: b64(wct) };   /* the wrapped save key */
  }
  return blob;
}

/* blob -> { text, key }: the keys file, and the save data key (null in a vault from before sealed saves).
   A wrong passphrase is reported as such, not as a crash. */
async function vaultOpen(blob, pass) {
  let j; try { j = typeof blob === 'string' ? JSON.parse(blob) : blob; } catch { throw new Error('That file is not an Outer Realm vault.'); }
  if (!j || j.kind !== 'ironquill-vault' || !j.data) throw new Error('That file is not an Outer Realm vault.');
  const iter = clamp(num(j.iter) || VAULT_ITER, 10000, 2000000);
  const key = await vaultKey(pass, unb64(j.salt), iter);
  let pt;
  try { pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(j.iv) }, key, unb64(j.data)); }
  catch { throw new Error('That passphrase did not open the vault — either it is not the right one, or the file in Drive was altered.'); }
  let dataKey = null;
  if (j.secret?.data) {
    try { dataKey = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(j.secret.iv) }, key, unb64(j.secret.data))); } catch { dataKey = null; }
  }
  return { text: new TextDecoder().decode(pt), key: dataKey };
}

const Vault = {
  pass: '', loaded: false, busy: false, timer: null,
  /* the passphrase: kept in memory, and in this browser's storage only when you ask for that */
  get() {
    if (!this.loaded) { this.loaded = true; try { this.pass = localStorage.getItem(VAULT_PASS_KEY) || ''; } catch { this.pass = ''; } }
    return this.pass;
  },
  apply(pass, remember) {
    this.pass = String(pass || ''); this.loaded = true;
    try { if (remember && this.pass) localStorage.setItem(VAULT_PASS_KEY, this.pass); else localStorage.removeItem(VAULT_PASS_KEY); } catch {}
  },
  forget() { this.apply('', false); Sealed.clear(); },
  stored() { try { return !!localStorage.getItem(VAULT_PASS_KEY); } catch { return false; } },
  live() { return S.settings.drive.vault !== false && Drive.configured(); },
  status() {
    if (!Drive.configured()) return 'Drive not set up';
    if (S.vaultLocked && S.vaultFound) return this.get() ? 'locked — this passphrase does not open the vault in Drive' : 'locked';
    if (S.savesLocked) return this.get() ? 'locked — the sealed saves in Drive did not open' : 'locked — the saves in Drive are sealed';
    if (!this.get()) return S.vaultFound ? 'locked' : 'no vault yet';
    return S.vaultAt ? `unlocked · saved ${ago(S.vaultAt)}` : 'unlocked';
  },

  /* ---------- Drive ---------- */
  /* what is already in Drive, and whether this passphrase opens it */
  async peek(pass) {
    const root = Drive.root();
    const files = await Drive.list(`name='${VAULT_FILE}' and '${root}' in parents and trashed=false`);
    S.vaultFound = files.length > 0;
    if (!files.length) return { exists: false, opens: false };
    const file = files[0];
    try { const opened = await vaultOpen(await Drive.getText(file.id), pass); return { exists: true, opens: true, file, text: opened.text, key: opened.key }; }
    catch { return { exists: true, opens: false, file }; }
  },

  /* Seal the keys and upload them. A vault already in Drive may belong to another passphrase:
     replacing that one locks every other device out, so it is only replaced after you say so. */
  async push({ quiet, pass: candidate } = {}) {
    if (!this.live()) { if (!quiet) { toast('Set up Google Drive first (Settings → Google Drive).'); } return false; }
    const pass = String(candidate || this.get() || '');
    if (!pass) { if (!quiet) { toast('Type a passphrase for the vault first — it is the only way back in.'); $('#vaultPass')?.focus(); } return false; }
    if (pass.length < VAULT_MIN) { if (!quiet) toast(`Use at least ${VAULT_MIN} characters.`); return false; }
    if (this.busy) return false;
    if (!Drive.valid()) { if (quiet) return false; await Drive.connect(true); }
    this.busy = true;
    try {
      const there = await this.peek(pass);
      if (there.exists && !there.opens) {
        S.vaultLocked = true;
        if (quiet) { console.warn('Vault not saved: the vault in Drive was sealed with a different passphrase.'); return false; }
        const ok = confirm('The vault already in Drive needs a different passphrase than this one.\n\nSaving now replaces it, and its old contents can no longer be opened with the old passphrase — every other device would need this new passphrase before it could unlock again. Saves already sealed with the old vault key stay locked too.\n\nIf you may still need the old vault, download ' + VAULT_FILE + ' from Drive first.\n\nReplace the vault in Drive?');
        if (!ok) { toast('Nothing was replaced — the vault in Drive still needs its own passphrase.', 6000); return false; }
      }
      /* one data key seals every save, wrapped inside the vault. Reuse the one already there, so a
         re-save never locks a device out of the saves it already wrote. */
      const dataKey = (there.opens && there.key) ? there.key : await sealedRawKey(await sealedNewKey());
      const sealed = await vaultSeal(keysFileContent(), pass, dataKey);
      await Drive.put(Drive.root(), VAULT_FILE, JSON.stringify(sealed, null, 1), 'application/json');
      await Sealed.use(dataKey);
      S.vaultAt = Date.now(); S.vaultFound = true; S.vaultLocked = false; S.savesLocked = false;
      LS.set('iq.vaultAt', S.vaultAt);
      if (!quiet) toast('Keys sealed and saved to Drive. Unlock them on another device with the same passphrase.', 5500);
      return true;
    } catch (e) {
      if (!quiet) toast('Could not save the vault: ' + e.message, 6500); else console.warn('Vault save', e);
      return false;
    } finally { this.busy = false; }
  },

  async pull({ quiet } = {}) {
    if (!this.live()) return 0;
    if (!Drive.valid()) { if (quiet) return 0; await Drive.connect(true); }
    const root = Drive.root();
    const files = await Drive.list(`name='${VAULT_FILE}' and '${root}' in parents and trashed=false`);
    S.vaultFound = false;
    if (!files.length) {
      if (!quiet && this.get()) toast('There is no vault in that Drive folder yet — save one from a device that already has your keys.');
      return 0;
    }
    S.vaultFound = true;
    const f = files[0];
    const pass = this.get();
    if (!pass) {
      S.vaultLocked = true;
      if (!quiet) toast('Your key vault is in Drive. Enter its passphrase in Settings → Google Drive to unlock it.', 6000);
      return 0;
    }
    const text = await Drive.getText(f.id);
    let opened;
    try { opened = await vaultOpen(text, pass); }
    catch (e) { S.vaultLocked = true; if (!quiet) toast(e.message, 6500); return 0; }
    S.vaultLocked = false;
    await Sealed.use(opened.key);   /* the key that seals the saves, or nothing in a vault from before them */
    S.vaultAt = f.modifiedTime ? Date.parse(f.modifiedTime) : Date.now();
    LS.set('iq.vaultAt', S.vaultAt);
    const added = await importKeys(opened.text, { quiet: true });
    if (added.length && !quiet) toast(`Vault unlocked: ${added.length} key${added.length > 1 ? 's' : ''} loaded.`, 4500);
    return added.length;
  },

  /* save the vault a few seconds after the keys change, so nothing has to be re-typed */
  schedule(ms = 4000) {
    if (!this.live() || !this.get() || !Drive.valid()) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => { this.timer = null; this.push({ quiet: true }).catch(() => {}); }, ms);
  },

  /* ---------- settings buttons ---------- */
  typed() { return String(S.vaultDraft || '').trim(); },
  async saveFromUI() {
    const typed = this.typed();
    const pass = typed || this.get();
    if (!pass) { toast('Choose a passphrase first — it is the only way back into the vault.'); $('#vaultPass')?.focus(); return; }
    if (pass.length < VAULT_MIN) { toast(`Use at least ${VAULT_MIN} characters.`); $('#vaultPass')?.focus(); return; }
    /* the passphrase is adopted only once the save really happened, so cancelling a replacement
       leaves this device on the passphrase that still opens the vault in Drive */
    const ok = await this.push({ pass });
    if (ok) { this.apply(pass, S.settings.drive.vaultRemember !== false); S.vaultDraft = ''; renderModal(); }
  },
  async openFromUI() {
    const typed = this.typed();
    const pass = typed || this.get();
    if (!pass) { toast('Type the passphrase you used when you saved the vault.'); $('#vaultPass')?.focus(); return; }
    this.apply(pass, S.settings.drive.vaultRemember !== false);
    try {
      const n = await this.pull();
      if (n || !S.vaultLocked) S.vaultDraft = '';
      renderModal();
    } catch (e) { toast(e.message, 6500); }
  }
};

/* the old plaintext keys file: moved out of Drive once the vault is in place */
async function removePlainKeysFromDrive() {
  try {
    if (!Drive.valid()) await Drive.connect(true);
    const root = Drive.root();
    const files = (await Drive.list(`'${root}' in parents and trashed=false and name contains 'ironquill-keys'`)).filter(f => f.mimeType !== FOLDER_MIME);
    if (!files.length) { toast('There is no unencrypted keys file in that folder.'); return; }
    for (const f of files) await Drive.patch(f.id, { trashed: true });
    LS.set('iq.keysSeen', {});
    toast(`Moved ${files.length} unencrypted keys file${files.length > 1 ? 's' : ''} to the Drive bin. Your keys stay in this browser and in the vault.`, 6000);
  } catch (e) { toast(e.message, 6500); }
}
