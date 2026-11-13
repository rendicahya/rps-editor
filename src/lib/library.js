// Pustaka dokumen di IndexedDB browser ini. Isi entri hanya berubah saat pengguna menyimpan.
// Entri: { id, title, nomor, fileName, created, updated, json, tags, folder, deleted?, fromPath? }; `nomor` berisi kode mata kuliah.
// Entri lama belum punya folder (= Utama).
// `tags` (label) dan `folder` hanya ada di pustaka, tidak ikut tersimpan di berkas .rps.
// `deleted` (waktu dihapus) menandai entri di "Baru dihapus"; setelah BIN_DAYS hari entri itu dihapus permanen.
// Dokumen tab memakai id tab sebagai id entri, jadi menyimpan tab memperbarui entrinya sendiri.
// Folder: { id, name, parent } di simpanan terpisah; parent null = Utama.

import { plainText } from './richtext.js';
import { docTitle } from './model.js';

export const BIN_DAYS = 30;
export const KEEP_VERSIONS = 20;
const DAY = 86400000;

const PERTEMUAN_FIELDS = [
  ['materi', 'materi'],
  ['indikator', 'indikator'],
  ['kriteria', 'kriteria'],
  ['bentuk', 'bentuk']
];

/**
 * Bagian teks RPS yang bisa dicari, masing-masing dengan tempatnya: [{ where, text, meta }]. `meta` menandai mata
 * kuliah, kode, berkas, dan label yang sudah tampil di baris pustaka (tidak perlu dicuplik).
 */
export function searchParts(e) {
  const out = [];
  const put = (where, text, meta = false) => {
    if (typeof text === 'string' && text.trim()) out.push({ where, text, meta });
  };
  put('Mata kuliah', e.title, true);
  put('Kode', e.nomor, true);
  put('Berkas', e.fileName, true);
  for (const t of e.tags ?? []) put('Label', t, true);
  try {
    const d = JSON.parse(e.json);
    const id = d.identitas ?? {};
    put('Prodi', id.prodi);
    put('Departemen', id.departemen);
    put('Koordinator', id.koordinator);
    for (const x of id.dosenPengelola ?? []) put('Dosen pengelola', x);
    for (const x of id.timDosen ?? []) put('Tim dosen', x);
    put('Deskripsi', plainText(id.deskripsi ?? ''));
    put('Bahan kajian', plainText(id.materi ?? ''));
    for (const [list, label] of [['cpl', 'CPL'], ['cpmk', 'CPMK'], ['subCpmk', 'Sub-CPMK']])
      for (const x of d[list] ?? []) {
        put(label, x.kode);
        put(x.kode ? `${label} ${x.kode}` : label, plainText(x.teks ?? ''));
      }
    (d.pertemuan ?? []).forEach((p) => {
      for (const [k, label] of PERTEMUAN_FIELDS) put(`Pekan ${p.pekan} · ${label}`, plainText(p[k] ?? ''));
    });
    for (const p of d.pustaka ?? []) put('Pustaka', plainText(p.teks ?? ''));
    for (const l of d.lembarKerja ?? []) put('Lembar Kerja', plainText(l.judul ?? ''));
  } catch {}
  return out;
}
/** Teks pencarian dalam huruf kecil (gabungan searchParts). */
export const haystack = (e) => searchParts(e).map((p) => p.text).join('\n').toLowerCase();

/**
 * Cuplikan isi tempat kata pencarian ditemukan, untuk ditampilkan di bawah hasil: { where, pieces: [{ text, hit }] }
 * atau null bila semua kata sudah cocok di nama, nomor, berkas, atau label.
 */
export function matchSnippet(parts, words, width = 110) {
  if (!words.length || !parts) return null;
  const low = (p) => p.text.toLowerCase();
  if (words.every((w) => parts.some((p) => p.meta && low(p).includes(w)))) return null;
  const body = parts.filter((p) => !p.meta);
  const score = (p) => words.filter((w) => low(p).includes(w)).length;
  let best = null;
  for (const p of body) if (score(p) && (!best || score(p) > score(best))) best = p;
  if (!best) return null;
  const text = best.text.replace(/\s+/g, ' ').trim();
  const lower = text.toLowerCase();
  const first = Math.min(...words.map((w) => lower.indexOf(w)).filter((i) => i >= 0));
  let start = Math.max(0, first - Math.floor(width / 3));
  if (start > 0) start = lower.lastIndexOf(' ', start) + 1 || start;
  const end = Math.min(text.length, start + width);
  const cut = text.slice(start, end);
  const pieces = [];
  const re = new RegExp(words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'gi');
  let last = 0;
  for (const m of cut.matchAll(re)) {
    if (m.index > last) pieces.push({ text: cut.slice(last, m.index), hit: false });
    pieces.push({ text: m[0], hit: true });
    last = m.index + m[0].length;
  }
  if (last < cut.length) pieces.push({ text: cut.slice(last), hit: false });
  if (start > 0) pieces.unshift({ text: '…', hit: false });
  if (end < text.length) pieces.push({ text: '…', hit: false });
  return { where: best.where, pieces };
}

const DB = 'rps-editor-library';
const STORE = 'docs';
const FOLDERS = 'folders';
const VERSIONS = 'versions'; // { key: `${entry}:${at}`, entry, at, title, nomor, json }

let dbPromise;
function db() {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 3);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE, { keyPath: 'id' });
      if (!d.objectStoreNames.contains(FOLDERS)) d.createObjectStore(FOLDERS, { keyPath: 'id' });
      if (!d.objectStoreNames.contains(VERSIONS)) d.createObjectStore(VERSIONS, { keyPath: 'key' }).createIndex('entry', 'entry');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function run(mode, fn, store = STORE) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const tx = d.transaction(store, mode);
    const req = fn(tx.objectStore(store));
    tx.oncomplete = () => resolve(req?.result);
    tx.onerror = () => reject(tx.error);
  });
}

/** Entri yang aktif (yang ada di "Baru dihapus" dianggap tidak ada). */
export const getEntry = async (id) => {
  const e = await run('readonly', (s) => s.get(id));
  return e && !e.deleted ? e : undefined;
};
/** Hapus permanen, riwayat versinya ikut. */
export async function deleteEntry(id) {
  const d = await db();
  await new Promise((resolve, reject) => {
    const tx = d.transaction([STORE, VERSIONS], 'readwrite');
    tx.objectStore(STORE).delete(id);
    const vs = tx.objectStore(VERSIONS);
    const req = vs.index('entry').getAllKeys(id);
    req.onsuccess = () => req.result.forEach((k) => vs.delete(k));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
export const putEntry = (entry) => run('readwrite', (s) => s.put(entry));

/** Mengubah sebagian kolom entri dalam satu transaksi (tidak bertabrakan dengan penyimpanan dokumen). */
export const patchEntry = (id, patch) =>
  run('readwrite', (s) => {
    const req = s.get(id);
    req.onsuccess = () => {
      if (!req.result) return;
      const next = { ...req.result, ...patch };
      for (const k of Object.keys(patch)) if (patch[k] === undefined) delete next[k];
      s.put(next);
    };
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

/**
 * Semua entri, terbaru di atas (isi `json` ikut dibaca untuk pencarian), termasuk yang ada di "Baru dihapus".
 * Entri yang sudah lebih dari BIN_DAYS hari di sana dihapus permanen di sini.
 */
export async function listEntries() {
  const all = (await run('readonly', (s) => s.getAll())) ?? [];
  const limit = Date.now() - BIN_DAYS * DAY;
  const old = all.filter((e) => e.deleted && e.deleted < limit);
  for (const e of old) await deleteEntry(e.id);
  return all.filter((e) => !old.includes(e)).sort((a, b) => b.updated - a.updated);
}

/** Sisa hari sebelum entri di "Baru dihapus" terhapus permanen. */
export const binDaysLeft = (e) => Math.max(1, Math.ceil((e.deleted + BIN_DAYS * DAY - Date.now()) / DAY));

// ---- Folder ----
export const listFolders = async () => (await run('readonly', (s) => s.getAll(), FOLDERS)) ?? [];
export const putFolder = (f) => run('readwrite', (s) => s.put(f), FOLDERS);
export const deleteFolders = (ids) => run('readwrite', (s) => ids.forEach((id) => s.delete(id)), FOLDERS);

/** Nama folder rapi: spasi dipangkas, tanpa garis miring (dipakai sebagai pemisah jalur ZIP). */
export const cleanFolderName = (name) =>
  String(name ?? '')
    .replace(/[\\/]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 120);

/** Dokumen yang belum berisi apa-apa (dokumen baru) tidak perlu masuk pustaka. */
export function isBlank(doc) {
  const id = doc.identitas;
  return (
    !docTitle(doc) && !id.kode.trim() && !plainText(id.deskripsi).trim() &&
    ['pustaka', 'cpl', 'cpmk', 'subCpmk', 'asesmen', 'pertemuan', 'lembarKerja'].every((k) => !doc[k].length)
  );
}

/**
 * Menyimpan dokumen tab `id`; dilewati bila isinya sama dengan yang tersimpan atau dokumen baru masih kosong.
 * Isi yang tertimpa masuk ke riwayat versi entri itu (KEEP_VERSIONS terbaru disimpan).
 */
export async function saveDoc(id, json, fileName = null) {
  const doc = JSON.parse(json);
  const d = await db();
  // Baca dan tulis dalam satu transaksi agar label/folder yang baru diubah di dialog Pustaka tidak tertimpa.
  await new Promise((resolve, reject) => {
    const tx = d.transaction([STORE, VERSIONS], 'readwrite');
    const s = tx.objectStore(STORE);
    const req = s.get(id);
    req.onsuccess = () => {
      // Entri di "Baru dihapus" yang disimpan lagi dari tabnya kembali menjadi entri biasa.
      const old = req.result;
      if (old && !old.deleted && old.json === json && old.fileName === fileName) return;
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
        tags: old?.tags ?? [],
        folder: old?.folder ?? null
      });
      if (old && old.json !== json) keepVersion(tx.objectStore(VERSIONS), old);
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Mencatat isi `old` di riwayat lalu membuang versi tertua di luar KEEP_VERSIONS (di dalam transaksi pemanggil). */
function keepVersion(vs, old) {
  const at = old.updated ?? Date.now();
  vs.put({ key: `${old.id}:${at}`, entry: old.id, at, title: old.title ?? '', nomor: old.nomor ?? '', json: old.json });
  const req = vs.index('entry').getAll(old.id);
  req.onsuccess = () => {
    const extra = req.result.sort((a, b) => b.at - a.at).slice(KEEP_VERSIONS);
    for (const v of extra) vs.delete(v.key);
  };
}

/** Versi lama entri `id`, terbaru dulu: [{ key, at, title, nomor, json }]. */
export async function listVersions(id) {
  const list = (await run('readonly', (s) => s.index('entry').getAll(id), VERSIONS)) ?? [];
  return list.sort((a, b) => b.at - a.at);
}

/** Menghapus satu versi (`key`) atau semua versi entri dari riwayat. */
export const deleteVersion = (key) => run('readwrite', (s) => s.delete(key), VERSIONS);

/** Isi versi lama menjadi isi terkini entri `id`; isi saat ini masuk riwayat. Nama mata kuliah tidak ikut mundur. */
export async function restoreVersion(id, version) {
  const e = await getEntry(id);
  if (!e) throw new Error('RPS ini sudah tidak ada di Pustaka Lokal.');
  const doc = JSON.parse(version.json);
  doc.identitas.mataKuliah = JSON.parse(e.json).identitas?.mataKuliah ?? doc.identitas.mataKuliah;
  await saveDoc(id, JSON.stringify(doc), e.fileName ?? null);
}
