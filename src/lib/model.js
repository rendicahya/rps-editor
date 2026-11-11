// Model dokumen RPS. Format JSON yang disimpan/dibuka (berkas .rps) mengikuti struktur ini.
//
// Relasi antarbagian memakai `id`, bukan kode, sehingga kode (mis. "CPMK-051") bisa diganti tanpa memutus rujukan:
//   cpmk.cpl[] → cpl.id, subCpmk.cpmk → cpmk.id, asesmen.porsi{subCpmk.id: angka},
//   pertemuan.subCpmk[] → subCpmk.id, pertemuan.pustaka[] → pustaka.id,
//   lembarKerja.asesmen → asesmen.id, lembarKerja.subCpmk[] → subCpmk.id.
// Matriks A/B/C di dokumen tidak disimpan; semuanya diturunkan dari data ini (lihat layout.js).
import { normalizeMarkup, plainText } from './richtext.js';

export const FORMAT = 'rps-editor';
export const VERSION = 1;

const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

/** "2025-08-01" → "1 Agustus 2025". Teks lain dicetak apa adanya. */
export function formatTanggal(iso) {
  const m = ISO.exec(iso || '');
  return m ? `${+m[3]} ${BULAN[+m[2] - 1] ?? ''} ${m[1]}` : iso || '';
}

/** Menerima tanggal ISO atau teks "1 Agustus 2025" dan mengembalikan ISO ('' bila tidak terbaca). */
function toIsoDate(v) {
  if (typeof v !== 'string') return '';
  if (ISO.test(v)) return v;
  const m = /^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/.exec(v.trim());
  const mi = m ? BULAN.findIndex((b) => b.toLowerCase() === m[2].toLowerCase()) : -1;
  return mi < 0 ? '' : `${m[3]}-${String(mi + 1).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

export function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Angka gaya Indonesia: 0.5 → "0,5". Kosong untuk null/''. */
export function formatAngka(v) {
  if (v === null || v === undefined || v === '') return '';
  return String(v).replace('.', ',');
}

export function uid() {
  return Math.random().toString(36).slice(2, 10);
}

export const JENIS_PERTEMUAN = [
  { value: 'kuliah', label: 'Kuliah' },
  { value: 'praktikum', label: 'Praktikum' }
];

export const SEMESTER = ['GANJIL', 'GENAP'];
export const SIFAT = ['WAJIB', 'PILIHAN'];

/** Judul dokumen untuk tab, pustaka, dan nama berkas. */
export function docTitle(doc) {
  return plainText(doc?.identitas?.mataKuliah ?? '').trim();
}

export function newPertemuan(pekan = 1, jenis = 'kuliah') {
  return {
    id: uid(), pekan, jenis, subCpmk: [], indikator: '', kriteria: '', bentuk: '',
    metode: [], waktu: '', materi: '', pustaka: [], bobot: null
  };
}

export function newAsesmen() {
  return { id: uid(), kode: '', siakad: '', obe: '', bobot: null, porsi: {}, keterangan: '' };
}

export function newLembarKerja() {
  return {
    id: uid(), kode: '', judul: '', asesmen: null, subCpmk: [], bentukAktivitas: '', deskripsi: '', metode: '',
    luaran: '', indikator: '', jadwal: '', lainLain: '', rujukan: ''
  };
}

/** Item baru untuk daftar dokumen `list` (lihat LISTS). */
export function newItem(list, extra = {}) {
  switch (list) {
    case 'pustaka':
      return { id: uid(), jenis: 'utama', teks: '', ...extra };
    case 'cpl':
      return { id: uid(), kode: '', teks: '', ...extra };
    case 'cpmk':
      return { id: uid(), kode: '', teks: '', cpl: [], ...extra };
    case 'subCpmk':
      return { id: uid(), kode: '', teks: '', cpmk: null, ...extra };
    case 'asesmen':
      return { ...newAsesmen(), ...extra };
    case 'pertemuan':
      return { ...newPertemuan(), ...extra };
    case 'lembarKerja':
      return { ...newLembarKerja(), ...extra };
  }
  throw new Error('Daftar tidak dikenal: ' + list);
}

/** Nama tampilan daftar dokumen (untuk menu dan tooltip). */
export const LISTS = {
  pustaka: 'pustaka',
  cpl: 'CPL',
  cpmk: 'CPMK',
  subCpmk: 'Sub-CPMK',
  asesmen: 'asesmen',
  pertemuan: 'pertemuan',
  lembarKerja: 'Lembar Kerja'
};

/** Menghapus item `id` dari daftar `list` beserta semua rujukan ke item itu. */
export function removeItem(doc, list, id) {
  const i = doc[list].findIndex((x) => x.id === id);
  if (i < 0) return;
  doc[list].splice(i, 1);
  const drop = (arr) => {
    const k = arr.indexOf(id);
    if (k >= 0) arr.splice(k, 1);
  };
  if (list === 'cpl') for (const c of doc.cpmk) drop(c.cpl);
  if (list === 'cpmk') for (const s of doc.subCpmk) if (s.cpmk === id) s.cpmk = null;
  if (list === 'subCpmk') {
    for (const p of doc.pertemuan) drop(p.subCpmk);
    for (const a of doc.asesmen) delete a.porsi[id];
    for (const l of doc.lembarKerja) drop(l.subCpmk);
  }
  if (list === 'pustaka') for (const p of doc.pertemuan) drop(p.pustaka);
  if (list === 'asesmen') for (const l of doc.lembarKerja) if (l.asesmen === id) l.asesmen = null;
}

/**
 * Menyalin CPL/CPMK terpilih dari katalog prodi `cat` ke dokumen. CPL yang didukung CPMK terpilih ikut disalin.
 * Item yang kodenya sudah ada di dokumen tidak diduplikasi (rujukan CPMK → CPL memakai yang sudah ada).
 * Prodi dan departemen identitas diisi dari katalog bila masih kosong. Hasil: { cpl, cpmk } jumlah yang ditambahkan.
 */
export function importCatalog(doc, cat, { cpl: pickCpl, cpmk: pickCpmk }) {
  const key = (k) => k.trim().toLowerCase();
  const cplOf = new Map(); // id katalog → id dokumen
  const added = { cpl: 0, cpmk: 0 };
  const need = new Set(pickCpl);
  for (const m of cat.cpmk) if (pickCpmk.has(m.id)) for (const c of m.cpl) need.add(c);
  for (const c of cat.cpl) {
    const have = doc.cpl.find((x) => key(x.kode) === key(c.kode) && c.kode.trim());
    if (have) cplOf.set(c.id, have.id);
    else if (need.has(c.id)) {
      const n = newItem('cpl', { kode: c.kode, teks: c.teks });
      doc.cpl.push(n);
      cplOf.set(c.id, n.id);
      added.cpl++;
    }
  }
  for (const m of cat.cpmk) {
    if (!pickCpmk.has(m.id) || doc.cpmk.some((x) => key(x.kode) === key(m.kode) && m.kode.trim())) continue;
    doc.cpmk.push(newItem('cpmk', { kode: m.kode, teks: m.teks, cpl: m.cpl.map((c) => cplOf.get(c)).filter(Boolean) }));
    added.cpmk++;
  }
  if (!doc.identitas.prodi.trim()) doc.identitas.prodi = cat.nama;
  if (!doc.identitas.departemen.trim() && cat.departemen) doc.identitas.departemen = cat.departemen;
  return added;
}

/** Salinan item dengan id baru (rujukan ke item lain tetap). */
export function duplicateItem(item) {
  return { ...JSON.parse(JSON.stringify(item)), id: uid() };
}

export function emptyDocument() {
  const year = new Date().getFullYear();
  return {
    format: FORMAT,
    version: VERSION,
    identitas: {
      universitas: 'UNIVERSITAS BRAWIJAYA',
      fakultas: 'FAKULTAS ILMU KOMPUTER',
      departemen: '',
      prodi: '',
      mataKuliah: '',
      kode: '',
      rmk: '',
      sksTeori: 2,
      sksPraktikum: 0,
      semester: 'GANJIL',
      tahunAkademik: `${year}/${year + 1}`,
      sifat: 'WAJIB',
      tglPenyusunan: todayIso(),
      tahun: String(year),
      dosenPengelola: [],
      koordinator: '',
      kaprodi: '',
      deskripsi: '',
      materi: '',
      mediaLunak: '',
      mediaKeras: '',
      pengalamanBelajar: '',
      timDosen: [],
      prasyarat: ''
    },
    pustaka: [],
    cpl: [],
    cpmk: [],
    subCpmk: [],
    asesmen: [],
    pertemuan: [],
    lembarKerja: []
  };
}

/** Isian identitas yang boleh berformat (tebal/miring/garis bawah, daftar). Isian lain teks polos. */
export const RICH_IDENTITAS = new Set(['deskripsi', 'materi', 'mediaLunak', 'mediaKeras', 'pengalamanBelajar', 'prasyarat']);

/**
 * Membaca teks JSON dokumen. Toleran terhadap jawaban AI yang tersalin bersama pembungkus
 * ```json … ``` atau kalimat pengantar: yang diambil adalah objek JSON terluar.
 */
export function parseDocumentText(text) {
  const t = String(text).trim();
  try {
    return normalizeDocument(JSON.parse(t));
  } catch (e) {
    if (!(e instanceof SyntaxError)) throw e;
  }
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(t);
  const body = fenced ? fenced[1] : t;
  const a = body.indexOf('{');
  const b = body.lastIndexOf('}');
  if (a < 0 || b <= a) throw new SyntaxError('Teks tidak berisi JSON.');
  return normalizeDocument(JSON.parse(body.slice(a, b + 1)));
}

const str = (v) => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '');
const rich = (v) => normalizeMarkup(str(v));
const plain = (v) => plainText(rich(v));
const arr = (v) => (Array.isArray(v) ? v : v == null || v === '' ? [] : [v]);
/** Angka (boleh "0,5") atau null. */
const num = (v) => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const t = str(v).trim().replace(',', '.').replace(/%$/, '');
  return t !== '' && Number.isFinite(+t) ? +t : null;
};

/** Memvalidasi & melengkapi JSON yang dibuka agar aman dipakai editor. */
export function normalizeDocument(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('Berkas bukan JSON dokumen RPS.');
  if (raw.format != null && raw.format !== FORMAT) throw new Error('Berkas JSON ini bukan dokumen RPS Editor.');
  if (!raw.identitas || typeof raw.identitas !== 'object') throw new Error('Struktur dokumen RPS tidak lengkap: bagian "identitas" tidak ditemukan.');

  const base = emptyDocument();
  const src = raw.identitas;
  const identitas = {};
  for (const [k, v] of Object.entries(base.identitas)) {
    if (Array.isArray(v)) identitas[k] = arr(src[k]).map(plain);
    else if (typeof v === 'number') identitas[k] = num(src[k]) ?? v;
    else identitas[k] = RICH_IDENTITAS.has(k) ? rich(src[k]) : plain(src[k] ?? v);
  }
  identitas.tglPenyusunan = toIsoDate(identitas.tglPenyusunan) || identitas.tglPenyusunan.trim();
  identitas.semester = identitas.semester.toUpperCase();
  identitas.sifat = identitas.sifat.toUpperCase();

  // Id unik per daftar; rujukan boleh berisi id atau kode (mis. jawaban AI), keduanya dipetakan ke id.
  const lists = {};
  const makeList = (name, items, build) => {
    const used = new Set();
    const byKey = new Map();
    const out = arr(items).map((x) => {
      const o = build(x && typeof x === 'object' ? x : { teks: x });
      let id = str(x?.id).trim();
      if (!id || used.has(id)) id = uid();
      used.add(id);
      if (x?.id != null) byKey.set(str(x.id).trim(), id);
      return { id, ...o };
    });
    for (const o of out) {
      byKey.set(o.id, o.id);
      if (o.kode) byKey.set(o.kode.trim().toLowerCase(), o.id);
    }
    // Rujukan asli (id di berkas) diutamakan, lalu kode tanpa membedakan huruf besar/kecil.
    lists[name] = (v) => {
      const k = str(v).trim();
      return byKey.get(k) ?? byKey.get(k.toLowerCase()) ?? null;
    };
    return out;
  };
  const refs = (name, v) => [...new Set(arr(v).map(lists[name]).filter(Boolean))];

  const pustaka = makeList('pustaka', raw.pustaka, (x) => ({
    jenis: str(x.jenis).toLowerCase() === 'pendukung' ? 'pendukung' : 'utama',
    teks: rich(x.teks)
  }));
  const cpl = makeList('cpl', raw.cpl, (x) => ({ kode: plain(x.kode), teks: rich(x.teks) }));
  const cpmk = makeList('cpmk', raw.cpmk, (x) => ({ kode: plain(x.kode), teks: rich(x.teks), cpl: arr(x.cpl) }));
  for (const c of cpmk) c.cpl = refs('cpl', c.cpl);
  const subCpmk = makeList('subCpmk', raw.subCpmk, (x) => ({ kode: plain(x.kode), teks: rich(x.teks), cpmk: x.cpmk }));
  for (const s of subCpmk) s.cpmk = lists.cpmk(s.cpmk);

  const asesmen = makeList('asesmen', raw.asesmen, (x) => ({
    kode: plain(x.kode), siakad: plain(x.siakad), obe: plain(x.obe), bobot: num(x.bobot), porsi: x.porsi, keterangan: rich(x.keterangan)
  }));
  for (const a of asesmen) {
    const porsi = {};
    for (const [k, v] of Object.entries(a.porsi && typeof a.porsi === 'object' ? a.porsi : {})) {
      const id = lists.subCpmk(k);
      const n = num(v);
      if (id && n !== null) porsi[id] = n;
    }
    a.porsi = porsi;
  }

  const pertemuan = arr(raw.pertemuan).map((x) => {
    const d = newPertemuan();
    return {
      ...d,
      id: str(x?.id).trim() || d.id,
      pekan: Math.max(1, Math.round(num(x?.pekan) ?? 1)),
      jenis: str(x?.jenis).toLowerCase() === 'praktikum' ? 'praktikum' : 'kuliah',
      subCpmk: refs('subCpmk', x?.subCpmk),
      indikator: rich(x?.indikator),
      kriteria: rich(x?.kriteria),
      bentuk: rich(x?.bentuk),
      metode: arr(x?.metode).map(plain).filter((m) => m.trim()),
      waktu: plain(x?.waktu),
      materi: rich(x?.materi),
      pustaka: refs('pustaka', x?.pustaka),
      bobot: num(x?.bobot)
    };
  });
  // Id pertemuan ganda dibuat ulang.
  const seen = new Set();
  for (const p of pertemuan) {
    if (seen.has(p.id)) p.id = uid();
    seen.add(p.id);
  }

  const lembarKerja = makeList('lembarKerja', raw.lembarKerja, (x) => {
    const d = newLembarKerja();
    const o = {};
    for (const k of Object.keys(d)) if (k !== 'id') o[k] = ['kode', 'judul'].includes(k) ? plain(x[k]) : rich(x[k]);
    o.asesmen = x.asesmen;
    o.subCpmk = x.subCpmk;
    return o;
  });
  for (const l of lembarKerja) {
    l.asesmen = lists.asesmen(l.asesmen);
    l.subCpmk = refs('subCpmk', l.subCpmk);
  }

  return { format: FORMAT, version: VERSION, identitas, pustaka, cpl, cpmk, subCpmk, asesmen, pertemuan, lembarKerja };
}
