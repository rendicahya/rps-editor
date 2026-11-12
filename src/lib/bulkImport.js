// Membaca banyak RPS sekaligus untuk diimpor ke Pustaka Daring: berkas .zip (boleh berisi subfolder),
// .rps/.json, dan PDF hasil ekspor RPS Editor (data .rps tersemat).
import { unzipSync, strFromU8 } from 'fflate';
import { parseDocumentText, docTitle } from './model.js';
import { rpsFromPdf } from './pdf.js';

const RPS_EXT = /\.(rps|json|pdf)$/i;
const MAX_ENTRY = 8 * 1024 * 1024; // per berkas di dalam ZIP (PDF bisa jauh lebih besar dari .rps-nya)
const MAX_TOTAL = 300 * 1024 * 1024; // total isi ZIP setelah diekstrak, pengaman ZIP bom
// Berkas sistem yang ikut terkemas di ZIP buatan macOS/Windows.
const JUNK = /(^|\/)(__MACOSX|\.[^/]*|Thumbs\.db|desktop\.ini)(\/|$)/i;

const baseName = (p) => p.split('/').pop();
const stem = (name) => name.replace(/\.[^.]+$/, '');

/** Satu berkas → dokumen RPS. Melempar Error berisi alasan yang bisa dibaca. */
function readOne(name, bytes) {
  let text;
  if (/\.pdf$/i.test(name)) {
    text = rpsFromPdf(bytes);
    if (!text) throw new Error('PDF ini bukan hasil ekspor RPS Editor');
  } else {
    text = strFromU8(bytes);
  }
  try {
    return parseDocumentText(text);
  } catch (e) {
    throw new Error(e instanceof SyntaxError ? 'bukan dokumen RPS yang valid' : e.message);
  }
}

/**
 * entries: [{ path: 'A/B/x.rps' | 'x.rps', bytes }]. Menghasilkan
 * { items: [{ name, folders: ['A','B'], title, doc }], skipped: [{ name, reason }] }.
 */
export function readEntries(entries) {
  const items = [];
  const skipped = [];
  for (const { path, bytes } of entries) {
    const parts = path.split('/').filter(Boolean);
    const name = parts.pop();
    try {
      const doc = readOne(name, bytes);
      items.push({ name: path, folders: parts.map((p) => p.trim()).filter(Boolean), title: (docTitle(doc) || stem(name)).trim().slice(0, 300), doc });
    } catch (e) {
      skipped.push({ name: path, reason: e.message });
    }
  }
  return { items, skipped };
}

/** Isi ZIP yang relevan sebagai [{ path, bytes }]; berkas lain dilewati (yang terlalu besar dicatat di `skipped`). */
export function unzipEntries(bytes, zipName, skipped = []) {
  let total = 0;
  let files;
  try {
    files = unzipSync(bytes, {
      filter: (f) => {
        if (f.name.endsWith('/') || JUNK.test(f.name) || !RPS_EXT.test(f.name)) return false;
        if (f.originalSize > MAX_ENTRY || (total += f.originalSize) > MAX_TOTAL) {
          skipped.push({ name: `${zipName}/${f.name}`, reason: 'berkas terlalu besar' });
          return false;
        }
        return true;
      }
    });
  } catch {
    throw new Error('bukan berkas ZIP yang valid, atau rusak');
  }
  return Object.entries(files)
    .sort(([a], [b]) => a.localeCompare(b, 'id', { numeric: true }))
    .map(([path, data]) => ({ path: path.replace(/\\/g, '/'), bytes: data }));
}

/** File[] dari seret-lepas atau pemilih berkas → hasil readEntries; berkas di luar ZIP tanpa folder. */
export async function readRpsFiles(files) {
  const skipped = [];
  const entries = [];
  for (const file of files) {
    if (/\.zip$/i.test(file.name) || /zip/.test(file.type)) {
      try {
        entries.push(...unzipEntries(new Uint8Array(await file.arrayBuffer()), file.name, skipped));
      } catch (e) {
        skipped.push({ name: file.name, reason: e.message });
      }
    } else if (RPS_EXT.test(file.name)) {
      entries.push({ path: baseName(file.name), bytes: new Uint8Array(await file.arrayBuffer()) });
    } else {
      skipped.push({ name: file.name, reason: 'bukan berkas .zip, .rps, .json, atau .pdf' });
    }
  }
  const out = readEntries(entries);
  out.skipped.unshift(...skipped);
  return out;
}
