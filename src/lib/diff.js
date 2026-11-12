// Perbandingan dua isi RPS (mis. dua versi di Riwayat). Hasilnya berupa daftar perubahan yang siap ditampilkan;
// teks yang diubah dibandingkan per kata.
import { plainText } from './richtext.js';
import { META_FIELDS, formatTanggal, formatAngka } from './model.js';

const txt = (v) => plainText(String(v ?? '')).replace(/\s+/g, ' ').trim();
const key = (v) => txt(v).toLowerCase();

/**
 * Urutan operasi LCS antara `a` dan `b`: { op: 'same' | 'del' | 'add', a?, b? } (a/b = indeks).
 * `eq(i, j)` menentukan apakah a[i] dan b[j] dianggap sama.
 */
export function lcs(a, b, eq) {
  const n = a.length;
  const m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) dp[i][j] = eq(i, j) ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  }
  const out = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (eq(i, j)) out.push({ op: 'same', a: i++, b: j++ });
    else if (dp[i + 1][j] >= dp[i][j + 1]) out.push({ op: 'del', a: i++ });
    else out.push({ op: 'add', b: j++ });
  }
  while (i < n) out.push({ op: 'del', a: i++ });
  while (j < m) out.push({ op: 'add', b: j++ });
  return out;
}

const MAX_WORD_CELLS = 250000;

/** Perbedaan per kata: [{ op: 'same' | 'del' | 'add', text }]. */
export function wordDiff(oldText, newText) {
  const a = txt(oldText).match(/\S+|\s+/g) ?? [];
  const b = txt(newText).match(/\S+|\s+/g) ?? [];
  if (a.length * b.length > MAX_WORD_CELLS) {
    return [...(a.length ? [{ op: 'del', text: a.join('') }] : []), ...(b.length ? [{ op: 'add', text: ' ' + b.join('') }] : [])];
  }
  const segs = [];
  for (const o of lcs(a, b, (i, j) => a[i] === b[j])) {
    const text = o.op === 'add' ? b[o.b] : a[o.a];
    const last = segs.at(-1);
    if (last?.op === o.op) last.text += text;
    else segs.push({ op: o.op, text });
  }
  return segs;
}

// Identitas: [kunci, label, jenis] — jenis 'date' (tanggal), 'list' (daftar nama), selain itu teks.
const IDENTITAS = [
  ['universitas', 'Universitas'],
  ['fakultas', 'Fakultas'],
  ['departemen', 'Departemen'],
  ['prodi', 'Program studi'],
  ['mataKuliah', 'Mata kuliah'],
  ['kode', 'Kode'],
  ['rmk', 'Rumpun mata kuliah'],
  ['sksTeori', 'SKS teori'],
  ['sksPraktikum', 'SKS praktikum'],
  ['semester', 'Semester'],
  ['tahunAkademik', 'Tahun akademik'],
  ['sifat', 'Sifat'],
  ['tglPenyusunan', 'Tanggal penyusunan', 'date'],
  ['tahun', 'Tahun'],
  ['dosenPengelola', 'Dosen pengelola', 'list'],
  ['koordinator', 'Koordinator'],
  ['kaprodi', 'Ketua program studi'],
  ['deskripsi', 'Deskripsi singkat'],
  ['materi', 'Materi pembelajaran'],
  ['mediaLunak', 'Media perangkat lunak'],
  ['mediaKeras', 'Media perangkat keras'],
  ['pengalamanBelajar', 'Pengalaman belajar'],
  ['timDosen', 'Tim dosen', 'list'],
  ['prasyarat', 'Prasyarat']
];

const num = (v) => (v === null || v === undefined || v === '' ? '' : formatAngka(v));
const codeOf = (doc, list, id, what) => {
  const i = doc[list].findIndex((x) => x.id === id);
  return i < 0 ? '' : txt(doc[list][i].kode) || `${what} ${i + 1}`;
};
const codes = (doc, list, ids, what) => ids.map((id) => codeOf(doc, list, id, what)).filter(Boolean).join(', ');

/**
 * Daftar yang dibandingkan. label(x, doc, i): judul butir; match: kunci cadangan bila id tidak cocok;
 * fields: [label, nilai(x, doc), jenis] — jenis 'swap' ditampilkan lama → baru, selain itu per kata.
 */
const LISTS = [
  {
    key: 'cpl',
    title: 'CPL Prodi',
    label: (x, d, i) => txt(x.kode) || `CPL ${i + 1}`,
    match: (x) => key(x.kode) || key(x.teks),
    fields: [
      ['Kode', (x) => txt(x.kode), 'swap'],
      ['Uraian', (x) => txt(x.teks)]
    ]
  },
  {
    key: 'cpmk',
    title: 'CPMK',
    label: (x, d, i) => txt(x.kode) || `CPMK ${i + 1}`,
    match: (x) => key(x.kode) || key(x.teks),
    fields: [
      ['Kode', (x) => txt(x.kode), 'swap'],
      ['Uraian', (x) => txt(x.teks)],
      ['CPL didukung', (x, d) => codes(d, 'cpl', x.cpl, 'CPL'), 'swap']
    ]
  },
  {
    key: 'subCpmk',
    title: 'Sub-CPMK',
    label: (x, d, i) => txt(x.kode) || `Sub-CPMK ${i + 1}`,
    match: (x) => key(x.kode) || key(x.teks),
    fields: [
      ['Kode', (x) => txt(x.kode), 'swap'],
      ['Uraian', (x) => txt(x.teks)],
      ['CPMK induk', (x, d) => (x.cpmk ? codeOf(d, 'cpmk', x.cpmk, 'CPMK') : ''), 'swap']
    ]
  },
  {
    key: 'asesmen',
    title: 'Asesmen (matriks penilaian)',
    label: (x, d, i) => txt(x.kode) || `Asesmen ${i + 1}`,
    match: (x) => key(x.kode),
    fields: [
      ['Kode', (x) => txt(x.kode), 'swap'],
      ['Kategori SIAKAD', (x) => txt(x.siakad)],
      ['Kategori SIM OBE', (x) => txt(x.obe)],
      ['Bobot (%)', (x) => num(x.bobot), 'swap'],
      ['Porsi per Sub-CPMK', (x, d) => d.subCpmk.filter((s) => x.porsi[s.id]).map((s, i) => `${txt(s.kode) || `Sub-CPMK ${i + 1}`}: ${num(x.porsi[s.id])}`).join('; '), 'swap'],
      ['Keterangan', (x) => txt(x.keterangan)]
    ]
  },
  {
    key: 'pertemuan',
    title: 'Rencana pertemuan',
    label: (x) => `Pekan ${x.pekan}${x.jenis === 'praktikum' ? ' (praktikum)' : ''}`,
    match: (x) => `${x.pekan}:${x.jenis}`,
    fields: [
      ['Pekan', (x) => String(x.pekan), 'swap'],
      ['Jenis', (x) => (x.jenis === 'praktikum' ? 'Praktikum' : 'Kuliah'), 'swap'],
      ['Sub-CPMK', (x, d) => codes(d, 'subCpmk', x.subCpmk, 'Sub-CPMK'), 'swap'],
      ['Indikator', (x) => txt(x.indikator)],
      ['Kriteria & teknik', (x) => txt(x.kriteria)],
      ['Bentuk penilaian', (x) => txt(x.bentuk)],
      ['Metode', (x) => x.metode.map(txt).join('; ')],
      ['Waktu', (x) => txt(x.waktu)],
      ['Materi', (x) => txt(x.materi)],
      ['Pustaka', (x, d) => x.pustaka.map((id) => d.pustaka.findIndex((p) => p.id === id) + 1).filter((n) => n > 0).map((n) => `[${n}]`).join(' '), 'swap'],
      ['Bobot (%)', (x) => num(x.bobot), 'swap']
    ]
  },
  {
    key: 'pustaka',
    title: 'Pustaka',
    label: (x, d, i) => `Pustaka ${i + 1}${x.jenis === 'pendukung' ? ' (pendukung)' : ''}`,
    match: (x) => key(x.teks),
    fields: [
      ['Jenis', (x) => (x.jenis === 'pendukung' ? 'Pendukung' : 'Utama'), 'swap'],
      ['Teks', (x) => txt(x.teks)]
    ]
  },
  {
    key: 'lembarKerja',
    title: 'Lembar Kerja',
    label: (x, d, i) => [txt(x.kode) || `Lembar Kerja ${i + 1}`, txt(x.judul)].filter(Boolean).join(' · '),
    match: (x) => key(x.kode) || key(x.judul),
    fields: [
      ['Kode', (x) => txt(x.kode), 'swap'],
      ['Judul', (x) => txt(x.judul)],
      ['Asesmen', (x, d) => (x.asesmen ? codeOf(d, 'asesmen', x.asesmen, 'Asesmen') : ''), 'swap'],
      ['Sub-CPMK', (x, d) => codes(d, 'subCpmk', x.subCpmk, 'Sub-CPMK'), 'swap'],
      ['Bentuk aktivitas', (x) => txt(x.bentukAktivitas)],
      ['Deskripsi', (x) => txt(x.deskripsi)],
      ['Metode', (x) => txt(x.metode)],
      ['Luaran', (x) => txt(x.luaran)],
      ['Indikator', (x) => txt(x.indikator)],
      ['Jadwal', (x) => txt(x.jadwal)],
      ['Lain-lain', (x) => txt(x.lainLain)],
      ['Rujukan', (x) => txt(x.rujukan)]
    ]
  }
];

/**
 * Membandingkan dokumen `a` (lama) dengan `b` (baru); keduanya sudah dinormalkan.
 * Hasil: { count, header: [{ label, old, new, segs }], sections: [{ title, items, changes }] }, dengan
 * item { op: 'same' | 'add' | 'del' | 'mod', label, n, from?, fields: [{ label, segs, swap }] }.
 */
export function diffDocs(a, b) {
  let count = 0;

  const header = [];
  for (const [k, label, kind] of IDENTITAS) {
    const val = (d) => {
      const v = d.identitas?.[k];
      return kind === 'list' ? (v ?? []).map(txt).filter(Boolean).join('; ') : kind === 'date' ? formatTanggal(txt(v)) : typeof v === 'number' ? num(v) : txt(v);
    };
    const [x, y] = [val(a), val(b)];
    if (x === y) continue;
    count++;
    const swap = kind === 'date' || typeof a.identitas?.[k] === 'number';
    header.push({ label, old: x, new: y, segs: swap ? null : wordDiff(x, y) });
  }
  for (const { key: k, label } of META_FIELDS) {
    const [x, y] = [txt(a.meta?.[k]), txt(b.meta?.[k])];
    if (x === y) continue;
    count++;
    header.push({ label: `Properti dokumen: ${label}`, old: x, new: y, segs: wordDiff(x, y) });
  }

  const sections = [];
  for (const def of LISTS) {
    const [xs, ys] = [a[def.key] ?? [], b[def.key] ?? []];
    const m = matchBy(xs, ys, (x) => x.id, def.match);
    const ops = lcs(xs, ys, (i, j) => m.ab.get(i) === j);
    const items = [];
    for (const o of ops) {
      if (o.op === 'del' && m.ab.has(o.a)) continue; // dipindah: ditampilkan di posisi barunya
      if (o.op === 'del') {
        items.push({ op: 'del', n: o.a + 1, label: def.label(xs[o.a], a, o.a), fields: [] });
        continue;
      }
      const j = o.b;
      const y = ys[j];
      const i = m.ba.get(j);
      if (i === undefined) {
        items.push({ op: 'add', n: j + 1, label: def.label(y, b, j), fields: [] });
        continue;
      }
      const x = xs[i];
      const fields = [];
      for (const [label, get, kind] of def.fields) {
        const [p, q] = [get(x, a), get(y, b)];
        if (p === q) continue;
        const swap = kind === 'swap';
        fields.push({ label, swap, segs: swap ? [{ op: 'del', text: p || '—' }, { op: 'add', text: q || '—' }] : wordDiff(p, q) });
      }
      const from = o.op === 'add' ? i + 1 : null;
      items.push({ op: fields.length || from ? 'mod' : 'same', n: j + 1, from, label: def.label(y, b, j), fields });
    }
    const changes = items.reduce((t, it) => t + (it.op === 'add' || it.op === 'del' ? 1 : it.fields.length + (it.from ? 1 : 0)), 0);
    count += changes;
    sections.push({ title: def.title, items, changes });
  }

  return { count, header, sections };
}

/** Pencocokan satu-satu antara daftar `a` dan `b`: lebih dulu lewat `primary`, sisanya lewat `secondary`. */
function matchBy(a, b, primary, secondary) {
  const ab = new Map();
  const ba = new Map();
  for (const f of [primary, secondary]) {
    const free = new Map();
    b.forEach((y, j) => {
      const k = f(y);
      if (!ba.has(j) && k && !free.has(k)) free.set(k, j);
    });
    a.forEach((x, i) => {
      if (ab.has(i)) return;
      const k = f(x);
      const j = k ? free.get(k) : undefined;
      if (j === undefined || ba.has(j)) return;
      ab.set(i, j);
      ba.set(j, i);
      free.delete(k);
    });
  }
  return { ab, ba };
}
