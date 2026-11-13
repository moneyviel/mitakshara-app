'use strict';
/*
 * Mitakshara encrypted vault.
 * - All client/case data lives in one AES-256-GCM encrypted file (data.enc).
 * - A random 256-bit master key encrypts the data. The master key itself is
 *   stored only in wrapped (encrypted) form: once under a key derived from the
 *   user's password, once under a key derived from the 24-word Recovery Kit.
 * - Keys are derived with scrypt (memory-hard), so guessing passwords is slow.
 * - The master key never leaves this (main) process; the screen only gets data.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const WORDS = require('./words');

const SCRYPT = { N: 1 << 17, r: 8, p: 1, maxmem: 512 * 1024 * 1024 };
const VERSION = 1;

function kdf(secret, salt) {
  return crypto.scryptSync(Buffer.from(secret.normalize('NFKC'), 'utf8'), salt, 32, SCRYPT);
}
function seal(key, plain, aad) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  if (aad) c.setAAD(Buffer.from(aad));
  const ct = Buffer.concat([c.update(plain), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), ct]);
}
function open(key, blob, aad) {
  const iv = blob.subarray(0, 12), tag = blob.subarray(12, 28), ct = blob.subarray(28);
  const d = crypto.createDecipheriv('aes-256-gcm', key, iv);
  if (aad) d.setAAD(Buffer.from(aad));
  d.setAuthTag(tag);
  return Buffer.concat([d.update(ct), d.final()]);
}

/* 24 words = 256 bits of randomness + 8-bit checksum (BIP-39 scheme) */
function newRecoveryPhrase() {
  const ent = crypto.randomBytes(32);
  const cs = crypto.createHash('sha256').update(ent).digest()[0];
  let bits = [...ent].map(b => b.toString(2).padStart(8, '0')).join('') + cs.toString(2).padStart(8, '0');
  const out = [];
  for (let i = 0; i < 24; i++) out.push(WORDS[parseInt(bits.slice(i * 11, i * 11 + 11), 2)]);
  return out;
}
function normalizePhrase(p) {
  const words = String(p).toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(Boolean);
  if (words.length !== 24) throw new Error('The Recovery Kit has 24 words. Please enter all 24.');
  for (const w of words) if (!WORDS.includes(w)) throw new Error(`"${w}" is not a Recovery Kit word. Please check the spelling.`);
  const bits = words.map(w => WORDS.indexOf(w).toString(2).padStart(11, '0')).join('');
  const ent = Buffer.from(bits.slice(0, 256).match(/.{8}/g).map(b => parseInt(b, 2)));
  const cs = parseInt(bits.slice(256), 2);
  if (crypto.createHash('sha256').update(ent).digest()[0] !== cs) throw new Error('These words do not form a valid Recovery Kit. Please check the order and spelling.');
  return words.join(' ');
}
function passwordProblems(pw) {
  const p = [];
  if (!pw || pw.length < 10) p.push('at least 10 characters');
  if (!/[A-Z]/.test(pw)) p.push('a capital letter');
  if (!/[a-z]/.test(pw)) p.push('a small letter');
  if (!/[0-9]/.test(pw)) p.push('a number');
  if (!/[^A-Za-z0-9]/.test(pw)) p.push('a symbol');
  return p;
}

class Vault {
  constructor(dir) {
    this.dir = dir;
    this.metaPath = path.join(dir, 'vault.json');
    this.dataPath = path.join(dir, 'data.enc');
    this.mk = null;      // master key, only while unlocked
    this.data = null;    // decrypted data, only while unlocked
    fs.mkdirSync(dir, { recursive: true });
  }
  exists() { return fs.existsSync(this.metaPath) && fs.existsSync(this.dataPath); }
  meta() { return JSON.parse(fs.readFileSync(this.metaPath, 'utf8')); }
  writeMeta(m) { const t = this.metaPath + '.tmp'; fs.writeFileSync(t, JSON.stringify(m, null, 1), { mode: 0o600 }); fs.renameSync(t, this.metaPath); }
  isUnlocked() { return !!this.mk; }
  profile() { if (!this.exists()) return null; const m = this.meta(); return { email: m.email, name: m.name, created: m.created }; }

  create({ name, email, password }) {
    if (this.exists()) throw new Error('This computer already has a Mitakshara account.');
    const probs = passwordProblems(password);
    if (probs.length) throw new Error('Password needs ' + probs.join(', ') + '.');
    email = String(email).trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('Please enter a valid email address.');
    const mk = crypto.randomBytes(32);
    const phrase = newRecoveryPhrase();
    const pwSalt = crypto.randomBytes(16), rcSalt = crypto.randomBytes(16);
    const meta = {
      v: VERSION, app: 'Mitakshara', name: String(name).trim(), email, created: new Date().toISOString(),
      kdf: { alg: 'scrypt', N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p },
      pw: { salt: pwSalt.toString('base64'), wrapped: seal(kdf(password, pwSalt), mk, 'pw:' + email).toString('base64') },
      rc: { salt: rcSalt.toString('base64'), wrapped: seal(kdf(phrase.join(' '), rcSalt), mk, 'rc').toString('base64') },
      fails: 0, lockUntil: 0, autoLockMin: 10,
    };
    this.mk = mk;
    this.data = { schema: 1, created: meta.created, clients: [], cases: [], settings: {} };
    this.writeMeta(meta);
    this.save();
    return phrase;
  }

  unlock(email, password) {
    const m = this.meta();
    const now = Date.now();
    if (m.lockUntil && now < m.lockUntil) {
      const s = Math.ceil((m.lockUntil - now) / 1000);
      throw new Error(`Too many wrong attempts. Please wait ${s > 60 ? Math.ceil(s / 60) + ' minutes' : s + ' seconds'}.`);
    }
    email = String(email).trim().toLowerCase();
    try {
      if (email !== m.email) throw new Error('x');
      this.mk = open(kdf(password, Buffer.from(m.pw.salt, 'base64')), Buffer.from(m.pw.wrapped, 'base64'), 'pw:' + m.email);
    } catch {
      m.fails = (m.fails || 0) + 1;
      if (m.fails >= 5) m.lockUntil = now + Math.min(60 * 60 * 1000, 30 * 1000 * Math.pow(2, m.fails - 5));
      this.writeMeta(m);
      const left = Math.max(0, 5 - m.fails);
      throw new Error('Email or password is not correct.' + (left && left < 3 ? ` ${left} attempt${left === 1 ? '' : 's'} left before a wait.` : ''));
    }
    this.data = JSON.parse(open(this.mk, fs.readFileSync(this.dataPath), 'data').toString('utf8'));
    m.fails = 0; m.lockUntil = 0; m.lastUnlock = new Date().toISOString();
    this.writeMeta(m);
    return true;
  }

  recover(phrase, newPassword) {
    const m = this.meta();
    const norm = normalizePhrase(phrase);
    const probs = passwordProblems(newPassword);
    if (probs.length) throw new Error('New password needs ' + probs.join(', ') + '.');
    let mk;
    try { mk = open(kdf(norm, Buffer.from(m.rc.salt, 'base64')), Buffer.from(m.rc.wrapped, 'base64'), 'rc'); }
    catch { throw new Error('This Recovery Kit does not belong to this account.'); }
    const pwSalt = crypto.randomBytes(16);
    m.pw = { salt: pwSalt.toString('base64'), wrapped: seal(kdf(newPassword, pwSalt), mk, 'pw:' + m.email).toString('base64') };
    m.fails = 0; m.lockUntil = 0;
    this.writeMeta(m);
    this.mk = mk;
    this.data = JSON.parse(open(mk, fs.readFileSync(this.dataPath), 'data').toString('utf8'));
    return true;
  }

  changePassword(oldPw, newPw) {
    if (!this.mk) throw new Error('Locked');
    const m = this.meta();
    try { open(kdf(oldPw, Buffer.from(m.pw.salt, 'base64')), Buffer.from(m.pw.wrapped, 'base64'), 'pw:' + m.email); }
    catch { throw new Error('Current password is not correct.'); }
    const probs = passwordProblems(newPw);
    if (probs.length) throw new Error('New password needs ' + probs.join(', ') + '.');
    const salt = crypto.randomBytes(16);
    m.pw = { salt: salt.toString('base64'), wrapped: seal(kdf(newPw, salt), this.mk, 'pw:' + m.email).toString('base64') };
    this.writeMeta(m);
  }

  newRecoveryKit(password) {
    if (!this.mk) throw new Error('Locked');
    const m = this.meta();
    try { open(kdf(password, Buffer.from(m.pw.salt, 'base64')), Buffer.from(m.pw.wrapped, 'base64'), 'pw:' + m.email); }
    catch { throw new Error('Password is not correct.'); }
    const phrase = newRecoveryPhrase();
    const salt = crypto.randomBytes(16);
    m.rc = { salt: salt.toString('base64'), wrapped: seal(kdf(phrase.join(' '), salt), this.mk, 'rc').toString('base64') };
    this.writeMeta(m);
    return phrase;
  }

  setAutoLock(min) { const m = this.meta(); m.autoLockMin = Math.max(1, Math.min(120, Number(min) || 10)); this.writeMeta(m); }

  save() {
    if (!this.mk) throw new Error('Locked');
    const blob = seal(this.mk, Buffer.from(JSON.stringify(this.data), 'utf8'), 'data');
    // keep up to 5 previous encrypted copies in case of a crash or mistake
    if (fs.existsSync(this.dataPath)) {
      const bdir = path.join(this.dir, 'versions'); fs.mkdirSync(bdir, { recursive: true });
      const list = fs.readdirSync(bdir).filter(f => f.endsWith('.enc')).sort();
      const last = list[list.length - 1];
      if (!last || Date.now() - fs.statSync(path.join(bdir, last)).mtimeMs > 10 * 60 * 1000) {
        fs.copyFileSync(this.dataPath, path.join(bdir, Date.now() + '.enc'));
        list.slice(0, Math.max(0, list.length - 4)).forEach(f => fs.unlinkSync(path.join(bdir, f)));
      }
    }
    const t = this.dataPath + '.tmp';
    fs.writeFileSync(t, blob, { mode: 0o600 });
    fs.renameSync(t, this.dataPath);
  }

  encryptBlob(buf, aad) { if (!this.mk) throw new Error('Locked'); return seal(this.mk, buf, aad); }
  decryptBlob(blob, aad) { if (!this.mk) throw new Error('Locked'); return open(this.mk, blob, aad); }

  lock() { if (this.mk) this.mk.fill(0); this.mk = null; this.data = null; }
}

module.exports = { Vault, normalizePhrase, newRecoveryPhrase, passwordProblems };
