// Cadangan Pustaka: RPS dikemas sebagai berkas .rps di dalam ZIP, dengan susunan folder yang sama.
// ZIP ini bisa diunggah kembali lewat "Unggah berkas .rps atau .zip" (lihat bulkImport.js).
import { zipSync, strToU8 } from 'fflate';

/** Teks berkas .rps, sama dengan hasil "Simpan" di editor. */
export const rpsText = (json) => JSON.stringify(typeof json === 'string' ? JSON.parse(json) : json, null, 2);

/** Nama yang aman untuk berkas/folder di Windows, macOS, dan Linux. */
export function safeName(name) {
  const s = String(name ?? '')
    .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '')
    .slice(0, 120)
    .trim();
  if (!s) return 'Tanpa nama';
  return /^(con|prn|aux|nul|com\d|lpt\d)$/i.test(s) ? `_${s}` : s;
}

/**
 * files: [{ dirs: [nama folder], name, json, mtime }] → Blob ZIP.
 * Nama yang bentrok (tanpa membedakan huruf besar) diberi akhiran " (2)", " (3)", dst.
 */
export function rpsZip(files) {
  const out = {};
  const taken = new Set();
  for (const f of files) {
    const dir = f.dirs.map(safeName).join('/');
    const base = (dir ? dir + '/' : '') + safeName(f.name);
    let path = `${base}.rps`;
    for (let n = 2; taken.has(path.toLowerCase()); n++) path = `${base} (${n}).rps`;
    taken.add(path.toLowerCase());
    out[path] = [strToU8(rpsText(f.json)), { mtime: f.mtime ? new Date(f.mtime) : new Date() }];
  }
  return new Blob([zipSync(out, { level: 6 })], { type: 'application/zip' });
}
