// Pemeriksa dokumen RPS: daftar temuan { level: 'error' | 'warn' | 'info', msg, ref }.
// `ref` = data-field isian terkait di halaman (lihat layout.js); 'pk:' = isian pilihan, panelnya dibuka.
import { plainText } from './richtext.js';
import { formatAngka } from './model.js';

const blank = (s) => !plainText(s ?? '').trim();
const round = (n) => Math.round(n * 1000) / 1000;

/** Menit dari isian waktu seperti "2x50 menit", "1 x 170 menit", "100 menit"; null bila tidak terbaca. */
export function minutes(waktu) {
  const t = plainText(waktu ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
  let m = /^(\d+)\s*[x×]\s*(\d+)\s*(menit|mnt)?$/.exec(t);
  if (m) return +m[1] * +m[2];
  m = /^(\d+)\s*(menit|mnt)$/.exec(t);
  return m ? +m[1] : null;
}

export function checkDocument(doc) {
  const out = [];
  const add = (level, msg, ref = null) => out.push({ level, msg, ref });
  const id = doc.identitas;
  const name = (x, what) => x.kode || `${what} tanpa kode`;

  // Identitas
  for (const [key, label] of [
    ['mataKuliah', 'Nama mata kuliah'], ['kode', 'Kode mata kuliah'], ['prodi', 'Program studi'], ['departemen', 'Departemen'],
    ['rmk', 'Rumpun mata kuliah'], ['koordinator', 'Koordinator pengelola/RMK'], ['kaprodi', 'Ketua program studi'], ['deskripsi', 'Deskripsi singkat']
  ]) {
    if (blank(id[key])) add('warn', `${label} belum diisi.`, `id:${key}`);
  }
  if (!id.dosenPengelola.some((d) => d.trim())) add('warn', 'Dosen pengelola mata kuliah belum diisi.', 'id:dosenPengelola:0');
  if (!id.sksTeori && !id.sksPraktikum) add('error', 'Bobot SKS masih 0.', 'pk:sks');

  // Kode ganda di tiap daftar
  for (const [list, what, ref] of [
    ['cpl', 'CPL', (x) => `cpl:${x.id}:kode`], ['cpmk', 'CPMK', (x) => `cpmk:${x.id}:kode`], ['subCpmk', 'Sub-CPMK', (x) => `subCpmk:${x.id}:kode`],
    ['asesmen', 'asesmen', (x) => `asesmen:${x.id}:kode`], ['lembarKerja', 'Lembar Kerja', (x) => `lk:${x.id}:kode`]
  ]) {
    const seen = new Map();
    for (const x of doc[list]) {
      const k = x.kode.trim().toLowerCase();
      if (!k) {
        add('warn', `Ada ${what} tanpa kode.`, ref(x));
        continue;
      }
      if (seen.has(k)) add('error', `Kode ${what} "${x.kode}" dipakai lebih dari sekali.`, ref(x));
      seen.set(k, x);
    }
  }

  // Capaian pembelajaran
  if (!doc.cpl.length) add('error', 'Belum ada CPL prodi.', null);
  if (!doc.cpmk.length) add('error', 'Belum ada CPMK.', null);
  if (!doc.subCpmk.length) add('error', 'Belum ada Sub-CPMK.', null);
  for (const c of doc.cpl) {
    if (blank(c.teks)) add('warn', `Uraian ${name(c, 'CPL')} masih kosong.`, `cpl:${c.id}:teks`);
    if (!doc.cpmk.some((m) => m.cpl.includes(c.id))) add('warn', `${name(c, 'CPL')} tidak didukung CPMK mana pun.`, null);
  }
  for (const m of doc.cpmk) {
    if (blank(m.teks)) add('warn', `Uraian ${name(m, 'CPMK')} masih kosong.`, `cpmk:${m.id}:teks`);
    if (!m.cpl.length) add('error', `${name(m, 'CPMK')} belum mendukung CPL mana pun.`, `pk:cpmk:${m.id}`);
    if (!doc.subCpmk.some((s) => s.cpmk === m.id)) add('warn', `${name(m, 'CPMK')} belum punya Sub-CPMK.`, `cpmk:${m.id}:kode`);
  }
  for (const s of doc.subCpmk) {
    const n = name(s, 'Sub-CPMK');
    if (blank(s.teks)) add('warn', `Uraian ${n} masih kosong.`, `subCpmk:${s.id}:teks`);
    if (!s.cpmk) add('error', `${n} belum punya CPMK induk.`, `pk:sub:${s.id}`);
    if (!doc.asesmen.some((a) => (a.porsi[s.id] ?? 0) > 0)) add('warn', `${n} belum dinilai asesmen mana pun (matriks B).`, null);
    if (!doc.pertemuan.some((p) => p.subCpmk.includes(s.id))) add('warn', `${n} tidak muncul di tabel pertemuan.`, null);
  }

  // Asesmen: bobot total 100% dan porsi tiap asesmen berjumlah 1.
  if (doc.asesmen.length) {
    const total = round(doc.asesmen.reduce((t, a) => t + (a.bobot ?? 0), 0));
    if (total !== 100) add('error', `Total bobot asesmen ${formatAngka(total)}%, seharusnya 100%.`, `asesmen:${doc.asesmen[0].id}:bobot`);
  } else add('error', 'Belum ada asesmen (matriks penilaian).', null);
  for (const a of doc.asesmen) {
    const n = name(a, 'Asesmen');
    if (a.bobot == null) add('warn', `Bobot ${n} belum diisi.`, `asesmen:${a.id}:bobot`);
    const porsi = round(Object.values(a.porsi).reduce((t, v) => t + v, 0));
    const first = doc.subCpmk[0];
    if (porsi !== 1 && first) add('warn', `Porsi ${n} terhadap Sub-CPMK berjumlah ${formatAngka(porsi)}, biasanya 1.`, `asesmen:${a.id}:porsi:${first.id}`);
    if (blank(a.siakad) || blank(a.obe)) add('info', `Kategori SIAKAD/SIM OBE ${n} belum lengkap.`, `asesmen:${a.id}:${blank(a.siakad) ? 'siakad' : 'obe'}`);
  }

  // Pustaka
  if (!doc.pustaka.some((p) => p.jenis === 'utama')) add('warn', 'Belum ada pustaka utama.', null);
  for (const p of doc.pustaka) if (blank(p.teks)) add('warn', 'Ada pustaka yang masih kosong.', `pustaka:${p.id}:teks`);

  // Tabel pertemuan
  if (!doc.pertemuan.length) add('error', 'Tabel rencana pertemuan masih kosong.', null);
  const teori = (id.sksTeori ?? 0) * 50;
  const prak = (id.sksPraktikum ?? 0) * 170;
  let prev = 0;
  for (const p of doc.pertemuan) {
    const label = `Pekan ${p.pekan} (${p.jenis})`;
    if (p.pekan < prev) add('warn', `${label} berada setelah pekan ${prev}; urutan pekan tidak naik.`, `pk:pekan:${p.id}`);
    prev = Math.max(prev, p.pekan);
    if (!p.subCpmk.length) add('warn', `${label} belum punya Sub-CPMK.`, `pk:psub:${p.id}`);
    if (blank(p.indikator)) add('warn', `${label}: indikator kosong.`, `pertemuan:${p.id}:indikator`);
    if (blank(p.materi)) add('warn', `${label}: materi kosong.`, `pertemuan:${p.id}:materi`);
    if (!p.metode.length) add('info', `${label}: metode belum diisi.`, `pertemuan:${p.id}:metode:0`);
    if (blank(p.waktu)) add('warn', `${label}: waktu belum diisi.`, `pertemuan:${p.id}:waktu`);
    else {
      const m = minutes(p.waktu);
      const want = p.jenis === 'praktikum' ? prak : teori;
      if (m === null) add('info', `${label}: waktu "${plainText(p.waktu)}" tidak terbaca (contoh: 2x50 menit).`, `pertemuan:${p.id}:waktu`);
      else if (want && m !== want) add('info', `${label}: waktu ${m} menit, sedangkan ${p.jenis === 'praktikum' ? `${id.sksPraktikum} SKS praktikum = ${want}` : `${id.sksTeori} SKS = ${want}`} menit.`, `pertemuan:${p.id}:waktu`);
    }
    if (p.jenis === 'praktikum' && !id.sksPraktikum) add('warn', `${label} adalah praktikum, padahal SKS praktikum 0.`, `pk:pekan:${p.id}`);
  }
  if (doc.pertemuan.length) {
    const pekan = new Set(doc.pertemuan.map((p) => p.pekan));
    const max = Math.max(...pekan);
    const missing = [];
    for (let k = 1; k <= max; k++) if (!pekan.has(k)) missing.push(k);
    if (missing.length) add('warn', `Pekan ${missing.join(', ')} tidak ada di tabel pertemuan.`, null);
    if (max !== 16) add('info', `Tabel pertemuan berisi ${max} pekan; satu semester biasanya 16 pekan (termasuk UTS dan UAS).`, null);
    const has = (re) => doc.pertemuan.some((p) => re.test(plainText(`${p.bentuk} ${p.materi}`)));
    if (!has(/\bUTS\b/)) add('info', 'Tidak ada pertemuan yang menyebut UTS di bentuk penilaian atau materinya.', null);
    if (!has(/\bUAS\b/)) add('info', 'Tidak ada pertemuan yang menyebut UAS di bentuk penilaian atau materinya.', null);
  }

  // Lembar Kerja
  for (const l of doc.lembarKerja) {
    const n = l.kode || 'Lembar Kerja tanpa kode';
    if (blank(l.judul)) add('warn', `Judul ${n} masih kosong.`, `lk:${l.id}:judul`);
    if (!l.asesmen) add('warn', `${n} belum ditautkan ke asesmen.`, `pk:lksub:${l.id}`);
    if (!l.subCpmk.length) add('warn', `${n} belum punya Sub-CPMK.`, `pk:lksub:${l.id}`);
    if (blank(l.deskripsi)) add('warn', `Deskripsi aktivitas ${n} masih kosong.`, `lk:${l.id}:deskripsi`);
  }

  const order = { error: 0, warn: 1, info: 2 };
  return out.sort((a, b) => order[a.level] - order[b.level]);
}
