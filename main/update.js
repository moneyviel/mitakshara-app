'use strict';
/* Updates: asks our update server (only for activated installations), checks the Ed25519 signature
   and the SHA-256 of the download, then installs. No Apple/Microsoft developer certificate needed. */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const { spawn } = require('child_process');
const RELEASE_PUBLIC_KEY = 'MCowBQYDK2VwAyEANYHs0NNTcsYMtN1ceSYzmFk34ktBATtB8XKMrBbQrcc=';
const URL_ = 'https://fyvplhtpsxpxvvsilzqq.supabase.co/functions/v1/mitakshara-update';
const newer = (a, b) => { const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number); for (let i = 0; i < 3; i++) { if ((x[i] || 0) > (y[i] || 0)) return true; if ((x[i] || 0) < (y[i] || 0)) return false; } return false; };
module.exports = function (c) {
  let found = null, downloaded = null;
  const plat = process.platform, arch = process.arch === 'arm64' ? 'arm64' : 'x64';
  return {
    async updateCheck() {
      const base = (c.DEV && process.env.MITAKSHARA_UPDATE_URL) || URL_;
      let j; try { const r = await fetch(`${base}?action=latest&platform=${plat}&arch=${arch}&inst=${encodeURIComponent(c.licence().installationId())}&v=${c.version}`, { signal: AbortSignal.timeout(20000) }); j = await r.json(); }
      catch { return { ok: false, error: 'Could not reach the update server. Please check the internet connection.' }; }
      if (!j.ok) return { ok: false, error: j.error || 'No update information.', code: j.code };
      const msg = `mitakshara|${j.version}|${plat}|${arch}|${j.file}|${j.sha256}|${j.size}`;
      const pub = crypto.createPublicKey({ key: Buffer.from(RELEASE_PUBLIC_KEY, 'base64'), format: 'der', type: 'spki' });
      if (!j.sig || !crypto.verify(null, Buffer.from(msg), pub, Buffer.from(j.sig, 'base64'))) return { ok: false, error: 'The update information could not be verified, so it was ignored.' };
      if (!newer(j.version, c.version)) return { ok: true, upToDate: true, version: c.version };
      found = j; return { ok: true, upToDate: false, version: j.version, notes: j.notes, size: j.size };
    },
    async updateDownload() {
      if (!found) throw new Error('Check for updates first.');
      const r = await fetch(found.url, { signal: AbortSignal.timeout(30 * 60000) }); if (!r.ok) throw new Error('Download failed (' + r.status + ').');
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length !== found.size || crypto.createHash('sha256').update(buf).digest('hex') !== found.sha256) throw new Error('The download was damaged or changed, so it was deleted. Please try again.');
      const dir = path.join(app.getPath('userData'), 'updates'); fs.mkdirSync(dir, { recursive: true });
      const file = path.join(dir, path.basename(found.file)); fs.writeFileSync(file, buf); downloaded = file; return { ready: true, version: found.version };
    },
    async updateInstall() {
      if (!downloaded) throw new Error('Download the update first.');
      if (plat === 'win32') { spawn(downloaded, ['/S', '--force-run'], { detached: true, stdio: 'ignore' }).unref(); setTimeout(() => app.quit(), 500); return true; }
      if (plat === 'darwin') {
        const bundle = path.resolve(process.execPath, '..', '..', '..'); const tmp = path.join(path.dirname(downloaded), 'unpacked');
        const script = `set -e; sleep 2; while kill -0 ${process.pid} 2>/dev/null; do sleep 1; done; rm -rf "${tmp}"; mkdir -p "${tmp}"; /usr/bin/ditto -x -k "${downloaded}" "${tmp}"; NEW=$(ls -d "${tmp}"/*.app | head -1); rm -rf "${bundle}.old"; mv "${bundle}" "${bundle}.old"; mv "$NEW" "${bundle}"; rm -rf "${bundle}.old"; /usr/bin/xattr -dr com.apple.quarantine "${bundle}" || true; open "${bundle}"`;
        spawn('/bin/sh', ['-c', script], { detached: true, stdio: 'ignore' }).unref(); setTimeout(() => app.quit(), 500); return true;
      }
      throw new Error('Automatic install is available on Windows and Mac.');
    },
  };
};
