import { RICH_IDENTITAS } from './model.js';
import { plainText, replaceRich } from './richtext.js';

const IDENTITAS = [
  ['mataKuliah', 'Mata kuliah'],
  ['kode', 'Kode MK'],
  ['rmk', 'Rumpun mata kuliah'],
  ['departemen', 'Departemen'],
  ['prodi', 'Program studi'],
  ['koordinator', 'Koordinator'],
  ['kaprodi', 'Ketua program studi'],
  ['deskripsi', 'Deskripsi singkat'],
  ['materi', 'Materi pembelajaran'],
  ['mediaLunak', 'Perangkat lunak'],
  ['mediaKeras', 'Perangkat keras'],
  ['pengalamanBelajar', 'Pengalaman belajar'],
  ['prasyarat', 'Prasyarat']
];

const PERTEMUAN = [
  ['indikator', 'Indikator'],
  ['kriteria', 'Kriteria'],
  ['bentuk', 'Bentuk penilaian'],
  ['waktu', 'Waktu'],
  ['materi', 'Materi']
];

const LK = [
  ['judul', 'Judul'],
  ['bentukAktivitas', 'Bentuk aktivitas'],
  ['deskripsi', 'Deskripsi aktivitas'],
  ['metode', 'Metode pengerjaan'],
  ['luaran', 'Luaran'],
  ['indikator', 'Indikator'],
  ['jadwal', 'Jadwal'],
  ['lainLain', 'Lain-lain'],
  ['rujukan', 'Rujukan']
];

/**
 * Semua kolom teks dokumen yang bisa dicari: { obj, key, label, ref, rich }.
 * `ref` = data-field isiannya di halaman (dipakai untuk melompat ke isian).
 */
export function textFields(doc) {
  const out = [];
  const id = doc.identitas;
  for (const [key, label] of IDENTITAS) out.push({ obj: id, key, label, ref: 'id:' + key, rich: RICH_IDENTITAS.has(key) });
  id.dosenPengelola.forEach((_, i) => out.push({ obj: id.dosenPengelola, key: i, label: `Dosen pengelola ${i + 1}`, ref: `id:dosenPengelola:${i}` }));
  id.timDosen.forEach((_, i) => out.push({ obj: id.timDosen, key: i, label: `Tim dosen ${i + 1}`, ref: `id:timDosen:${i}` }));
  doc.pustaka.forEach((p, i) => out.push({ obj: p, key: 'teks', label: `Pustaka ${i + 1}`, ref: `pustaka:${p.id}`, rich: true }));
  for (const [list, label] of [['cpl', 'CPL'], ['cpmk', 'CPMK'], ['subCpmk', 'Sub-CPMK']]) {
    for (const x of doc[list]) {
      out.push({ obj: x, key: 'kode', label: `${label} · kode`, ref: `${list}:${x.id}:kode` });
      out.push({ obj: x, key: 'teks', label: `${x.kode || label} · uraian`, ref: `${list}:${x.id}:teks`, rich: true });
    }
  }
  for (const a of doc.asesmen) {
    out.push({ obj: a, key: 'kode', label: 'Asesmen · kode', ref: `asesmen:${a.id}:kode` });
    out.push({ obj: a, key: 'keterangan', label: `${a.kode || 'Asesmen'} · keterangan`, ref: `asesmen:${a.id}:keterangan`, rich: true });
  }
  for (const p of doc.pertemuan) {
    for (const [key, label] of PERTEMUAN) {
      out.push({ obj: p, key, label: `Pekan ${p.pekan} · ${label}`, ref: `pertemuan:${p.id}:${key}`, rich: key !== 'waktu' });
    }
  }
  for (const l of doc.lembarKerja) {
    for (const [key, label] of LK) {
      out.push({ obj: l, key, label: `${l.kode || 'Lembar kerja'} · ${label}`, ref: `lk:${l.id}:${key}`, rich: key !== 'judul' });
    }
  }
  return out.filter((f) => typeof f.obj[f.key] === 'string');
}

export function searchPattern(query, caseSensitive) {
  if (!query) return null;
  return new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), caseSensitive ? 'g' : 'gi');
}

/** Kolom yang cocok beserta potongan teks: [{ field, count, parts: [{ text, hit }] }]. */
export function findMatches(doc, pattern) {
  if (!pattern) return [];
  const results = [];
  for (const field of textFields(doc)) {
    // Isian berformat dicari pada teks polosnya (tanpa tag).
    const value = field.rich ? plainText(field.obj[field.key]) : field.obj[field.key];
    const parts = [];
    let last = 0;
    let count = 0;
    for (const m of value.matchAll(pattern)) {
      parts.push({ text: value.slice(last, m.index), hit: false }, { text: m[0], hit: true });
      last = m.index + m[0].length;
      count++;
    }
    if (!count) continue;
    parts.push({ text: value.slice(last), hit: false });
    results.push({ field, count, parts: clip(parts) });
  }
  return results;
}

// Potong teks panjang di sekitar kecocokan agar daftar hasil tetap ringkas.
function clip(parts, ctx = 40) {
  return parts.map((p, i) => {
    if (p.hit || p.text.length <= ctx * 2) return p;
    const t = p.text.replace(/\s+/g, ' ');
    if (i === 0) return { ...p, text: '…' + t.slice(-ctx) };
    if (i === parts.length - 1) return { ...p, text: t.slice(0, ctx) + '…' };
    return { ...p, text: t.slice(0, ctx) + ' … ' + t.slice(-ctx) };
  });
}

/** Ganti semua kecocokan di satu kolom; mengembalikan jumlah penggantian. */
export function replaceIn(field, pattern, replacement) {
  const value = field.obj[field.key];
  if (field.rich) {
    const r = replaceRich(value, pattern, replacement);
    if (r.n) field.obj[field.key] = r.value;
    return r.n;
  }
  let n = 0;
  const next = value.replace(pattern, () => (n++, replacement));
  if (n) field.obj[field.key] = next;
  return n;
}
