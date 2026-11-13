'use strict';
/* Backups: one file holding the encrypted workspace (data + documents). It stays encrypted;
   only your password or Recovery Kit can open it. Auto backup once a day to a folder you choose
   (a USB drive, or a Google Drive / OneDrive / iCloud folder on this computer). */
const fs = require('fs');
const path = require('path');
const { dialog } = require('electron');
const { zip } = require('./docsout');
const { unzip } = require('./docview');
const EXT = 'mkbackup';
module.exports = function (c) {
  const data = () => c.vault().data;
  const settings = () => data().backup_settings || { keep: 10, auto: true };
  function build() {
    const v = c.vault(); v.save(); const dir = v.dir; const files = {};
    for (const f of ['vault.json', 'data.enc']) files[f] = fs.readFileSync(path.join(dir, f));
    const dd = path.join(dir, 'docs'); if (fs.existsSync(dd)) for (const f of fs.readdirSync(dd)) if (/^[0-9a-f-]{36}\.enc$/.test(f)) files['docs/' + f] = fs.readFileSync(path.join(dd, f));
    files['backup-info.json'] = JSON.stringify({ app: 'Mitakshara', version: c.version, made: new Date().toISOString(), docs: Object.keys(files).length - 2 });
    return zip(files);
  }
  function stamp() { const d = new Date(); const p = x => String(x).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}${p(d.getMinutes())}`; }
  async function backupTo(folder) {
    if (!folder || !fs.existsSync(folder)) throw new Error('The backup folder is not available. Is the drive connected?');
    const file = path.join(folder, `Mitakshara backup ${stamp()}.${EXT}`); const tmp = file + '.part';
    fs.writeFileSync(tmp, build()); fs.renameSync(tmp, file);
    const s = { ...settings(), last: new Date().toISOString(), lastFile: file }; data().backup_settings = s; c.vault().save();
    const keep = Math.max(3, +s.keep || 10);
    const old = fs.readdirSync(folder).filter(f => f.startsWith('Mitakshara backup ') && f.endsWith('.' + EXT)).sort().reverse().slice(keep);
    for (const f of old) try { fs.rmSync(path.join(folder, f)); } catch {}
    return { file, size: fs.statSync(file).size };
  }
  return {
    async backupInfo() { c.needOpen(); return settings(); },
    async backupChooseFolder() { c.needOpen(); const r = c.testOut() ? { canceled: false, filePaths: [c.testOut()] } : await dialog.showOpenDialog(c.win(), { title: 'Choose where backups are kept', properties: ['openDirectory', 'createDirectory'] });
      if (r.canceled) return settings(); data().backup_settings = { ...settings(), folder: r.filePaths[0] }; c.vault().save(); return settings(); },
    async backupSet({ auto, keep }) { c.needOpen(); data().backup_settings = { ...settings(), auto: !!auto, keep: Math.max(3, Math.min(60, +keep || 10)) }; c.vault().save(); return settings(); },
    async backupNow() { c.needOpen(); const s = settings(); if (s.folder) return backupTo(s.folder);
      const r = await dialog.showSaveDialog(c.win(), { title: 'Save backup', defaultPath: `Mitakshara backup ${stamp()}.${EXT}`, filters: [{ name: 'Mitakshara backup', extensions: [EXT] }] });
      if (r.canceled || !r.filePath) return null; fs.writeFileSync(r.filePath, build()); return { file: r.filePath, size: fs.statSync(r.filePath).size }; },
    async backupAutoTick() { // called by the app every 30 minutes while unlocked
      if (!c.vault().isUnlocked()) return null; const s = settings(); if (!s.auto || !s.folder) return null;
      if (s.last && Date.now() - new Date(s.last).getTime() < 23.5 * 3600e3) return null;
      try { return await backupTo(s.folder); } catch { return null; }
    },
    async restoreBackup({ file } = {}) {
      // allowed when signed out: replaces this computer's workspace with the backup (the old one is kept aside)
      let f = file && c.DEV ? file : null;
      if (!f) { const r = await dialog.showOpenDialog(c.win(), { title: 'Choose a Mitakshara backup', properties: ['openFile'], filters: [{ name: 'Mitakshara backup', extensions: [EXT] }] }); if (r.canceled) return null; f = r.filePaths[0]; }
      let z; try { z = unzip(fs.readFileSync(f)); } catch { throw new Error('This is not a Mitakshara backup file.'); }
      if (!z['vault.json'] || !z['data.enc'] || !z['backup-info.json']) throw new Error('This is not a Mitakshara backup file.');
      const meta = JSON.parse(z['vault.json']().toString('utf8')); const info = JSON.parse(z['backup-info.json']().toString('utf8'));
      const v = c.vault(); if (v.isUnlocked()) v.lock();
      const dir = v.dir; if (fs.existsSync(dir)) fs.renameSync(dir, dir + '-replaced-' + Date.now());
      fs.mkdirSync(path.join(dir, 'docs'), { recursive: true });
      for (const [name, get] of Object.entries(z)) { if (name === 'backup-info.json' || name.endsWith('/')) continue; if (!/^(vault\.json|data\.enc|docs\/[0-9a-f-]{36}\.enc)$/.test(name)) continue; fs.writeFileSync(path.join(dir, name), get(), { mode: 0o600 }); }
      return { email: meta.email, made: info.made, docs: info.docs };
    },
  };
};
