'use strict';
/*
 * Licence: one key, one active computer.
 * - Installation ID: random, created once per installation, shown as a barcode.
 * - Hardware fingerprint: hashed Mac/PC hardware ID; survives reformatting, so
 *   the same key re-activates on the same computer.
 * - The server returns a certificate signed with our private key. The app checks
 *   it with the public key below, so a certificate cannot be forged or edited.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');

const SERVER = (process.env.MITAKSHARA_DEV === '1' && process.env.MITAKSHARA_LICENCE_URL) || 'https://fyvplhtpsxpxvvsilzqq.supabase.co/functions/v1/mitakshara-licence';
const PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAZEKWWjkd4gpRrKYTs7Ra6fkc6ahWrSFbge4glTDR3lc=
-----END PUBLIC KEY-----`;
const KEY_ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789#@$%&*+=?';
const ID_ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const REFRESH_AFTER_DAYS = 7;

function run(cmd, args) {
  return new Promise(res => execFile(cmd, args, { timeout: 8000, windowsHide: true }, (e, out) => res(e ? '' : String(out))));
}
async function hardwareId() {
  let id = '';
  if (process.platform === 'darwin') {
    const m = (await run('ioreg', ['-rd1', '-c', 'IOPlatformExpertDevice'])).match(/"IOPlatformUUID"\s*=\s*"([^"]+)"/);
    id = m ? m[1] : '';
  } else if (process.platform === 'win32') {
    id = (await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', '(Get-CimInstance -ClassName Win32_ComputerSystemProduct).UUID'])).trim();
    if (!id || /^(F{8}-|0{8}-)/i.test(id)) {
      const m = (await run('reg', ['query', 'HKLM\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid'])).match(/MachineGuid\s+REG_SZ\s+(\S+)/);
      id = m ? 'MG-' + m[1] : '';
    }
  } else {
    try { id = fs.readFileSync('/etc/machine-id', 'utf8').trim(); } catch {}
  }
  if (!id) throw new Error('Could not read this computer\'s hardware ID.');
  return crypto.createHash('sha256').update('mitakshara-hw-v1|' + id.toUpperCase()).digest('hex');
}

/* Same check characters as the server, so typing mistakes show instantly. */
function keyChecksum(body) {
  const h = crypto.createHash('sha256').update(body, 'utf8').digest();
  let r = ''; for (let i = 0; i < 4; i++) r += KEY_ALPHA[h[i] % KEY_ALPHA.length]; return r;
}
function normalizeKey(k) { return String(k || '').replace(/^\s*MTK-/i, '').replace(/[\s-]/g, ''); }
function keyLooksRight(k) {
  const n = normalizeKey(k);
  if (n.length !== 48) return `The key should have 48 characters after "MTK-" (you entered ${n.length}).`;
  for (const ch of n) if (!KEY_ALPHA.includes(ch)) return `"${ch}" is not used in Mitakshara keys. Please check the key.`;
  if (keyChecksum(n.slice(0, 44)) !== n.slice(44)) return 'This key has a typing mistake. Please check it against your email.';
  return '';
}

class Licence {
  constructor(dir, version) {
    this.dir = dir; this.version = version;
    this.instPath = path.join(dir, 'installation.json');
    this.licPath = path.join(dir, 'licence.json');
    fs.mkdirSync(dir, { recursive: true });
    this.hw = null;
  }
  installationId() {
    if (!fs.existsSync(this.instPath)) {
      const b = crypto.randomBytes(16); let s = '';
      for (let i = 0; i < 16; i++) s += ID_ALPHA[b[i] % 32];
      const id = 'MTI-' + s.match(/.{4}/g).join('-');
      fs.writeFileSync(this.instPath, JSON.stringify({ id, created: new Date().toISOString() }), { mode: 0o600 });
    }
    return JSON.parse(fs.readFileSync(this.instPath, 'utf8')).id;
  }
  async hwHash() { if (!this.hw) this.hw = await hardwareId(); return this.hw; }

  read() { try { return JSON.parse(fs.readFileSync(this.licPath, 'utf8')); } catch { return null; } }
  verify(rec) {
    if (!rec || !rec.payload || !rec.sig) return null;
    const ok = crypto.verify(null, Buffer.from(rec.payload, 'utf8'), crypto.createPublicKey(PUBLIC_KEY), Buffer.from(rec.sig, 'base64'));
    return ok ? JSON.parse(rec.payload) : null;
  }

  /* Offline check: valid signature, this installation, this hardware, not expired, clock not turned back. */
  async status() {
    const rec = this.read();
    const base = { installationId: this.installationId(), valid: false };
    if (!rec) return { ...base, reason: 'none' };
    const cert = this.verify(rec);
    if (!cert) return { ...base, reason: 'tampered' };
    const hw = await this.hwHash();
    if (cert.inst !== base.installationId || cert.hw !== hw) return { ...base, reason: 'other-computer' };
    const now = Date.now();
    if (rec.maxSeen && now < rec.maxSeen - 36 * 3600e3) return { ...base, reason: 'clock', email: cert.email };
    if (now > Date.parse(cert.exp)) return { ...base, reason: 'expired', email: cert.email };
    if (!rec.maxSeen || now > rec.maxSeen) { rec.maxSeen = now; this.write(rec); }
    return { ...base, valid: true, email: cert.email, plan: cert.plan, hint: cert.hint, licenceId: cert.lic, checkedAt: cert.iat, offlineUntil: cert.exp, needsRefresh: now - Date.parse(cert.iat) > REFRESH_AFTER_DAYS * 864e5 };
  }
  write(rec) { const t = this.licPath + '.tmp'; fs.writeFileSync(t, JSON.stringify(rec), { mode: 0o600 }); fs.renameSync(t, this.licPath); }

  async call(body) {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 20000);
    try {
      const r = await fetch(SERVER, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctl.signal });
      return await r.json();
    } catch { return { ok: false, offline: true, error: 'Could not reach the Mitakshara server. Please check the internet connection.' }; }
    finally { clearTimeout(t); }
  }
  base() { return { installation_id: this.installationId(), platform: process.platform + '-' + process.arch, app_version: this.version }; }

  async activate(email, key) {
    const problem = keyLooksRight(key);
    if (problem) return { ok: false, error: problem };
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(email).trim())) return { ok: false, error: 'Please enter the email address the key was sent to.' };
    const r = await this.call({ action: 'activate', email: String(email).trim(), key: String(key).trim(), hw_hash: await this.hwHash(), ...this.base() });
    if (!r.ok) return r;
    if (!this.verify(r)) return { ok: false, error: 'The server reply could not be verified. Please try again.' };
    this.write({ payload: r.payload, sig: r.sig, maxSeen: Date.now() });
    return { ok: true };
  }
  /* Quiet online check; only a definite "revoked/moved" answer removes the licence. */
  async refresh() {
    const s = await this.status();
    if (!s.licenceId) return s;
    const r = await this.call({ action: 'refresh', licence_id: s.licenceId, hw_hash: await this.hwHash(), ...this.base() });
    if (r.ok && this.verify(r)) { const old = this.read() || {}; this.write({ payload: r.payload, sig: r.sig, maxSeen: Math.max(Date.now(), old.maxSeen || 0) }); }
    else if (r.code === 'REVOKED' || r.code === 'MOVED') { fs.renameSync(this.licPath, this.licPath + '.ended'); return { ...(await this.status()), ended: r.error }; }
    return this.status();
  }
  async release() {
    const s = await this.status();
    if (!s.valid) return { ok: false, error: 'This computer does not hold an active licence.' };
    const r = await this.call({ action: 'release', licence_id: s.licenceId, hw_hash: await this.hwHash(), ...this.base() });
    if (r.ok) fs.renameSync(this.licPath, this.licPath + '.moved');
    return r;
  }
}
module.exports = { Licence, keyLooksRight, normalizeKey };
