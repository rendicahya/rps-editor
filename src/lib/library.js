// Pustaka dokumen di IndexedDB browser ini. Isi entri hanya berubah saat pengguna menyimpan.
// Entri: { id, title, nomor, fileName, created, updated, json, tags }; `nomor` berisi kode mata kuliah.
// `tags` (label pengelompokan) hanya ada di pustaka, tidak ikut tersimpan di berkas .rps.
// Dokumen tab memakai id tab sebagai id entri, jadi menyimpan tab memperbarui entrinya sendiri.

import { plainText } from './richtext.js';
import { docTitle } from './model.js';

/** Teks yang dicari: mata kuliah, kode, berkas, label, prodi, dosen, CPL/CPMK/Sub-CPMK, dan materi pertemuan. */
export function haystack(e) {
  const parts = [e.title, e.nomor, e.fileName, ...(e.tags ?? [])];
  try {
    const d = JSON.parse(e.json);
    const id = d.identitas;
    parts.push(id.prodi, id.departemen, id.koordinator, ...id.dosenPengelola, ...id.timDosen);
    for (const list of [d.cpl, d.cpmk, d.subCpmk]) for (const x of list) parts.push(x.kode, plainText(x.teks));
    for (const p of d.pertemuan) parts.push(plainText(p.materi), plainText(p.indikator));
  } catch {}
  return parts.filter((p) => typeof p === 'string').join('\n').toLowerCase();
}

const DB = 'rps-editor-library';
const STORE = 'docs';

let dbPromise;
function db() {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function run(mode, fn) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const tx = d.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req?.result);
    tx.onerror = () => reject(tx.error);
  });
}

export const getEntry = (id) => run('readonly', (s) => s.get(id));
export const deleteEntry = (id) => run('readwrite', (s) => s.delete(id));
export const putEntry = (entry) => run('readwrite', (s) => s.put(entry));

/** Mengubah sebagian kolom entri dalam satu transaksi (tidak bertabrakan dengan penyimpanan dokumen). */
export const patchEntry = (id, patch) =>
  run('readwrite', (s) => {
    const req = s.get(id);
    req.onsuccess = () => req.result && s.put({ ...req.result, ...patch });
    return req;
  });

/** Label unik dan rapi: spasi dipangkas, tanpa duplikat (tidak peka huruf besar/kecil), urut abjad. */
export function cleanTags(tags) {
  const seen = new Map();
  for (const t of tags ?? []) {
    const v = String(t).trim().replace(/\s+/g, ' ');
    if (v && !seen.has(v.toLowerCase())) seen.set(v.toLowerCase(), v);
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b, 'id'));
}

/** Semua entri, terbaru di atas (isi `json` ikut dibaca untuk pencarian). */
export async function listEntries() {
  const all = (await run('readonly', (s) => s.getAll())) ?? [];
  return all.sort((a, b) => b.updated - a.updated);
}

/** Dokumen yang belum berisi apa-apa (dokumen baru) tidak perlu masuk pustaka. */
export function isBlank(doc) {
  const id = doc.identitas;
  return (
    !docTitle(doc) && !id.kode.trim() && !plainText(id.deskripsi).trim() &&
    ['pustaka', 'cpl', 'cpmk', 'subCpmk', 'asesmen', 'pertemuan', 'lembarKerja'].every((k) => !doc[k].length)
  );
}

/** Menyimpan dokumen tab `id`; dilewati bila isinya sama dengan yang tersimpan atau dokumen baru masih kosong. */
export async function saveDoc(id, json, fileName = null) {
  const doc = JSON.parse(json);
  // Baca dan tulis dalam satu transaksi agar label yang baru diubah di dialog Pustaka tidak tertimpa.
  await run('readwrite', (s) => {
    const req = s.get(id);
    req.onsuccess = () => {
      const old = req.result;
      if (old && old.json === json && old.fileName === fileName) return;
      if (!old && isBlank(doc)) return;
      const now = Date.now();
      s.put({
        id,
        title: docTitle(doc),
        nomor: doc.identitas.kode,
        fileName,
        created: old?.created ?? now,
        updated: old && old.json === json ? old.updated : now,
        json,
        tags: old?.tags ?? []
      });
    };
    return req;
  });
}
