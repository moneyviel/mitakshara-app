'use strict';
/* Built-in document viewer. Files are decrypted in memory by the app and never leave it.
   files: [{ fid, filename, size, title }]  */
function openViewer(files, start = 0) {
  files = (files || []).filter(f => f && f.fid);
  if (!files.length) return;
  let i = Math.max(0, Math.min(start, files.length - 1));
  const ov = document.createElement('div'); ov.className = 'viewer'; ov.setAttribute('role', 'dialog');
  ov.innerHTML = `<div class="vhead"><div class="grow vtitle"><b class="vname"></b><div class="small vsub"></div></div>
     <div class="flex"><button class="btn ghost sm vprev" title="Previous file (Left arrow)">&larr; Previous</button><span class="small vcount"></span><button class="btn ghost sm vnext" title="Next file (Right arrow)">Next &rarr;</button>
     <button class="btn ghost sm vsave">Save copy</button><button class="btn ghost sm vext" title="Open with another program on this computer">Open in other app</button><button class="btn sm vclose" title="Close (Esc)">Close</button></div></div>
   <div class="vbody"></div>`;
  document.body.appendChild(ov);
  const q = s => ov.querySelector(s);
  const kind = n => { const e = (String(n).split('.').pop() || '').toLowerCase(); return e === 'pdf' ? 'pdf' : 'page'; };
  const show = () => {
    const f = files[i]; const name = encodeURIComponent(f.filename || 'file');
    q('.vname').textContent = f.title || f.filename; q('.vsub').textContent = (f.title ? f.filename + ' · ' : '') + fsize(f.size || 0);
    q('.vcount').textContent = files.length > 1 ? `${i + 1} of ${files.length}` : '';
    q('.vprev').disabled = i === 0; q('.vnext').disabled = i === files.length - 1;
    q('.vprev').classList.toggle('hidden', files.length < 2); q('.vnext').classList.toggle('hidden', files.length < 2);
    const fr = document.createElement('iframe'); fr.className = 'vframe'; fr.title = f.filename;
    // PDFs open in the bundled PDF reader (needs scripts); every other preview runs with scripts off
    if (kind(f.filename) !== 'pdf') fr.setAttribute('sandbox', '');
    fr.src = `mkfile://view/${f.fid}/${name}`;
    q('.vbody').replaceChildren(fr);
  };
  const close = () => { document.removeEventListener('keydown', key, true); ov.remove(); };
  const key = e => {
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'ArrowLeft' && i > 0 && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { i--; show(); }
    else if (e.key === 'ArrowRight' && i < files.length - 1 && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { i++; show(); }
  };
  document.addEventListener('keydown', key, true);
  q('.vclose').onclick = close;
  q('.vprev').onclick = () => { if (i > 0) { i--; show(); } };
  q('.vnext').onclick = () => { if (i < files.length - 1) { i++; show(); } };
  q('.vsave').onclick = async () => { try { if (await call('exportFile', { fid: files[i].fid, filename: files[i].filename })) toast('Copy saved.'); } catch (e) { toast(e.message); } };
  q('.vext').onclick = async () => { try { await call('openFile', { fid: files[i].fid, filename: files[i].filename }); } catch (e) { toast(e.message); } };
  window.mk.onLocked(close);
  show();
}
