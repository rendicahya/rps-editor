// Mesin tata letak: mengubah dokumen RPS menjadi daftar halaman berisi primitif gambar
// (rect, poly, text, image). Hasil yang sama dirender ke SVG (pratinjau) dan ke jsPDF (ekspor),
// sehingga pratinjau identik dengan PDF. Semua satuan dalam mm. Halaman boleh potret atau lanskap
// (sampul dan Lembar Kerja potret, identitas dan tabel pertemuan lanskap).
import { jsPDF } from 'jspdf';
import { pdfFont, registerFonts, fontRevision } from './fonts.js';
import { formatTanggal, formatAngka } from './model.js';
import { hasList, hasMarkup, parseRich, plainText, setMarkerMeasure, wrapRuns } from './richtext.js';
import logoSrc from '../assets/logo-ub.png?inline';

const LOGO = { src: logoSrc, width: 418, height: 420 };

export const A4 = { short: 210, long: 297 };
export const PT = 25.4 / 72;
const LH = 1.2;

const INK = '#000000';
const BLUE = '#cfe7f6'; // kepala tabel dan label (identitas, matriks, tabel pertemuan)
const YELLOW = '#fff2cc'; // baris praktikum di tabel pertemuan
const GRAY = '#d9d9d9'; // label Lembar Kerja
const BORDER = 0.25;
const PAD = 1.2;
const S = 9; // ukuran huruf isi identitas dan matriks
const TS = 8.5; // ukuran huruf tabel pertemuan

let measurer = null;
let measuredWith = -1;

export const lineHeight = (size) => size * PT * LH;
/** Posisi baseline baris ke-i dari item teks (dipakai kedua renderer). */
export const baseline = (item, i) => item.y + i * lineHeight(item.size) + item.size * PT * 0.86;

function measurerFor(size, bold) {
  if (measuredWith !== fontRevision()) {
    measurer = new jsPDF({ unit: 'mm', format: 'a4' });
    registerFonts(measurer);
    measuredWith = fontRevision();
  }
  measurer.setFont(pdfFont(), bold ? 'bold' : 'normal');
  measurer.setFontSize(size);
  return measurer;
}

function wrap(text, size, bold, width) {
  const t = String(text ?? '').replace(/\r/g, '');
  if (!t.trim()) return [];
  return measurerFor(size, bold).splitTextToSize(t, Math.max(width, 2));
}

/** Lebar penanda daftar ("• ", "1. ") dalam mm; baris lanjutan butir menjorok sejauh ini. */
export const markerWidth = (marker, size) => measurerFor(size, false).getTextWidth(marker);
// Isian di pratinjau memakai indentasi yang sama, dalam em (1 em = ukuran font).
setMarkerMeasure((m) => markerWidth(m, 10) / (10 * PT));

/** Seperti wrap, untuk teks berformat: baris tanpa tag tetap string, baris bertag menjadi array runs. */
function wrapRich(text, size, width) {
  if (!hasMarkup(text) && !hasList(text)) return wrap(text, size, false, width);
  if (!plainText(text).trim()) return [];
  return wrapRuns(parseRich(text), width, (s, bold) => measurerFor(size, bold).getTextWidth(s));
}

function fit(img, maxW, maxH) {
  const s = Math.min(maxW / img.width, maxH / img.height);
  return { w: img.width * s, h: img.height * s };
}

const rect = (x, y, w, h, extra = {}) => ({ t: 'rect', x, y, w, h, stroke: INK, lw: BORDER, ...extra });
const text = (x, y, lines, size, extra = {}) => ({ t: 'text', x, y, lines, size, bold: false, align: 'left', color: INK, ...extra });

/** "a", "a dan b", "a, b, dan c". */
const joinDan = (list) => (list.length < 3 ? list.join(' dan ') : `${list.slice(0, -1).join(', ')}, dan ${list.at(-1)}`);
const numbered = (list) => list.map((t, i) => `${i + 1}. ${t}`).join('\n');
const upper = (s) => plainText(s).toUpperCase();

// ---------------------------------------------------------------------------
// Aliran halaman dan tabel
// ---------------------------------------------------------------------------

/**
 * Aliran isi pada halaman berorientasi sama. Halaman baru dibuat otomatis saat isi tidak muat;
 * `header` (opsional) digambar ulang di atas setiap halaman baru (kepala tabel berulang).
 */
class Flow {
  constructor(pages, { landscape, mx, top, bottom }) {
    this.pages = pages;
    this.w = landscape ? A4.long : A4.short;
    this.h = landscape ? A4.short : A4.long;
    this.x = mx;
    this.width = this.w - 2 * mx;
    this.top = top;
    this.bottom = this.h - bottom;
    this.header = null;
    this.listeners = [];
    this.newPage();
  }

  newPage() {
    const prev = this.page ? { page: this.page, y: this.y } : null;
    // fields: area yang bisa diedit langsung di pratinjau (tidak ikut dicetak).
    this.page = { w: this.w, h: this.h, items: [], fields: [] };
    this.pages.push(this.page);
    this.y = this.top;
    this.header?.(this);
    this.bodyTop = this.y;
    if (prev) for (const l of [...this.listeners]) l(prev);
  }

  room() {
    return this.bottom - this.y;
  }

  /** Mulai halaman baru bila sisa ruang kurang dari `h` (kecuali halaman ini masih kosong). */
  ensure(h) {
    if (this.room() < h && this.y > this.bodyTop + 0.01) this.newPage();
  }

  push(...items) {
    this.page.items.push(...items);
  }
}

/** Baris isi sel: teks berformat (bawaan) atau teks tebal polos. */
function cellLines(c, w) {
  const inner = w - 2 * c.pad;
  return c.bold ? wrap(plainText(c.text), c.size, true, inner) : wrapRich(c.text, c.size, inner);
}

/**
 * Satu baris tabel di posisi aliran. Sel: { w, text, size, bold, align, valign, fill, pad }.
 * Baris yang tidak muat dipecah per baris teks ke halaman berikutnya (kepala tabel diulang oleh
 * `flow.header`); sisa ruang kurang dari `minSplit` mm membuat seluruh baris pindah halaman.
 */
function row(flow, cells, { minH = 0, keepNext = 0, minSplit = 14 } = {}) {
  const prep = cells.map((c) => {
    const o = { size: S, pad: PAD, align: 'left', valign: 'top', ...c };
    o.lines = c.lines ?? cellLines(o, o.w);
    return o;
  });
  const need = (c, n) => (n ? n * lineHeight(c.size) + 2 * c.pad : 0);
  const fullH = Math.max(minH, ...prep.map((c) => need(c, c.lines.length)));
  // Kepala bagian/tabel tidak ditinggal sendirian di dasar halaman.
  if (keepNext) flow.ensure(fullH + keepNext);
  let first = true;
  for (;;) {
    const h = first ? fullH : Math.max(...prep.map((c) => need(c, c.lines.length)), 4);
    const room = flow.room();
    if (h <= room + 0.01) {
      drawRow(flow, prep, h);
      flow.y += h;
      return;
    }
    const atTop = flow.y <= flow.bodyTop + 0.01;
    if (room < minSplit && !atTop) {
      flow.newPage();
      continue;
    }
    // Pecah: setiap sel menampilkan baris yang muat, sisanya berlanjut di halaman berikutnya.
    const seg = prep.map((c) => {
      const n = Math.max(1, Math.floor((room - 2 * c.pad + 0.01) / lineHeight(c.size)));
      return { ...c, lines: c.lines.slice(0, n), rest: c.lines.slice(n) };
    });
    if (seg.every((s) => !s.rest.length)) {
      // Teksnya muat, hanya tinggi minimal baris yang tidak: pindah utuh, atau dipotong bila sudah di awal halaman.
      if (!atTop) {
        flow.newPage();
        continue;
      }
      drawRow(flow, seg, room);
      flow.y += room;
      return;
    }
    drawRow(flow, seg, room);
    seg.forEach((s, i) => (prep[i].lines = s.rest));
    flow.y += room;
    flow.newPage();
    first = false;
  }
}

function drawRow(flow, cells, h) {
  let x = flow.x;
  const y = flow.y;
  for (const c of cells) {
    drawCell(flow.page, x, y, c.w, h, c);
    x += c.w;
  }
}

function drawCell(page, x, y, w, h, c) {
  page.items.push(rect(x, y, w, h, c.fill ? { fill: c.fill } : {}));
  if (!c.lines.length) return;
  const th = c.lines.length * lineHeight(c.size);
  const ty = c.valign === 'middle' ? y + (h - th) / 2 : c.valign === 'bottom' ? y + h - c.pad - th : y + c.pad;
  const tx = c.align === 'center' ? x + w / 2 : c.align === 'right' ? x + w - c.pad : x + c.pad;
  page.items.push(text(tx, ty, c.lines, c.size, { bold: !!c.bold, align: c.align }));
}

/**
 * Kolom label yang membentang di samping beberapa baris (rowspan), termasuk melintasi halaman:
 * di setiap halaman yang dilalui, kolom label digambar setinggi bagian yang ada di halaman itu;
 * teks label hanya di bagian pertama.
 */
function group(flow, label, w, body, { fill = BLUE, align = 'left', size = S, minH = 0 } = {}) {
  const segs = [];
  let start = { page: flow.page, y: flow.y };
  const onBreak = (prev) => {
    segs.push({ page: prev.page, y0: start.y, y1: prev.y });
    start = { page: flow.page, y: flow.y };
  };
  flow.listeners.push(onBreak);
  const labelLines = wrap(plainText(label), size, true, w - 2 * PAD);
  const labelH = labelLines.length * lineHeight(size) + 2 * PAD;
  flow.ensure(Math.max(labelH, minH));
  start = { page: flow.page, y: flow.y };
  flow.x += w;
  flow.width -= w;
  body();
  flow.x -= w;
  flow.width += w;
  flow.listeners.splice(flow.listeners.indexOf(onBreak), 1);
  segs.push({ page: flow.page, y0: start.y, y1: flow.y });
  const firstText = segs.find((s) => s.y1 - s.y0 > 1) ?? segs[0];
  for (const s of segs) {
    if (s.y1 - s.y0 < 0.01) continue;
    drawCell(s.page, flow.x, s.y0, w, s.y1 - s.y0, {
      fill, bold: true, size, pad: PAD, align, valign: 'top', lines: s === firstText ? labelLines : []
    });
  }
}

/** Judul bagian (mis. "A. MATRIKS …") di atas tabel; ikut pindah halaman bersama awal tabelnya. */
function heading(flow, title, keep = 30) {
  flow.y += 6;
  flow.ensure(keep);
  flow.push(text(flow.x, flow.y, [title], S, { bold: true }));
  flow.y += lineHeight(S) + 0.6;
}

// ---------------------------------------------------------------------------
// Dokumen
// ---------------------------------------------------------------------------

export function layoutDocument(doc) {
  const pages = [];
  const ctx = derive(doc);
  layoutCover(doc, pages);
  layoutIdentitas(doc, ctx, pages);
  layoutPertemuan(doc, ctx, pages);
  for (const lk of doc.lembarKerja) layoutLembarKerja(doc, ctx, lk, pages);
  return pages;
}

/** Peta rujukan dan nilai turunan yang dipakai beberapa halaman. */
function derive(doc) {
  const byId = (list) => new Map(list.map((x) => [x.id, x]));
  const pustakaUrut = [...doc.pustaka.filter((p) => p.jenis === 'utama'), ...doc.pustaka.filter((p) => p.jenis !== 'utama')];
  const nomorPustaka = new Map(pustakaUrut.map((p, i) => [p.id, i + 1]));

  // Label pekan: "1.a", "b", … bila ada pekan berisi lebih dari satu baris; selain itu nomor pekan saja.
  const perPekan = new Map();
  for (const p of doc.pertemuan) perPekan.set(p.pekan, (perPekan.get(p.pekan) ?? 0) + 1);
  const bersub = [...perPekan.values()].some((n) => n > 1);
  const labelPekan = new Map();
  let prev = null;
  let k = 0;
  for (const p of doc.pertemuan) {
    k = p.pekan === prev ? k + 1 : 0;
    prev = p.pekan;
    const huruf = String.fromCharCode(97 + (k % 26));
    labelPekan.set(p.id, !bersub ? String(p.pekan) : k === 0 ? `${p.pekan}.${huruf}` : huruf);
  }

  // Lembar Kerja per asesmen, untuk keterangan matriks penilaian: "(LK-1, LK-2)".
  const lkPerAsesmen = new Map();
  for (const l of doc.lembarKerja) {
    if (!l.asesmen || !l.kode) continue;
    lkPerAsesmen.set(l.asesmen, [...(lkPerAsesmen.get(l.asesmen) ?? []), l.kode]);
  }

  return {
    cpl: byId(doc.cpl), cpmk: byId(doc.cpmk), sub: byId(doc.subCpmk), asesmen: byId(doc.asesmen),
    pustakaUrut, nomorPustaka, labelPekan, lkPerAsesmen
  };
}

// ---------------------------------------------------------------------------
// Sampul (potret)
// ---------------------------------------------------------------------------

function layoutCover(doc, pages) {
  const id = doc.identitas;
  const page = { w: A4.short, h: A4.long, items: [], fields: [] };
  pages.push(page);
  const cx = A4.short / 2;
  const size = 14;
  const block = (y, lines) => {
    const wrapped = lines.flatMap((l) => wrap(l, size, true, 150));
    page.items.push(text(cx, y, wrapped, size, { bold: true, align: 'center' }));
  };
  block(32, ['RENCANA PEMBELAJARAN SEMESTER (RPS)', upper(id.prodi)]);
  block(70, [upper(id.mataKuliah), plainText(id.kode)]);
  const f = fit(LOGO, 46, 46);
  page.items.push({ t: 'image', src: LOGO.src, x: cx - f.w / 2, y: 122, w: f.w, h: f.h });
  block(205, [upper(id.universitas), upper(id.fakultas), plainText(id.tahun)]);
}

// ---------------------------------------------------------------------------
// Identitas RPS dan matriks A–C (lanskap)
// ---------------------------------------------------------------------------

function layoutIdentitas(doc, ctx, pages) {
  const id = doc.identitas;
  const flow = new Flow(pages, { landscape: true, mx: 23.5, top: 22, bottom: 14 });
  const W = flow.width;
  const head = (t, w, extra = {}) => ({ w, text: t, bold: true, fill: BLUE, ...extra });
  const val = (t, w, extra = {}) => ({ w, text: t ?? '', ...extra });

  // Kop: logo UB + nama universitas, fakultas, departemen, prodi.
  {
    const h = 32;
    const y = flow.y;
    flow.push(rect(flow.x, y, W, h));
    const f = fit(LOGO, 27, 27);
    flow.push({ t: 'image', src: LOGO.src, x: flow.x + 2, y: y + (h - f.h) / 2, w: f.w, h: f.h });
    const tx = flow.x + 32;
    flow.push(text(tx, y + 3, [upper(id.universitas)], 17, { bold: true }));
    flow.push(text(tx, y + 11, [upper(id.fakultas)], 12));
    flow.push(text(tx, y + 17.5, [`DEPARTEMEN ${upper(id.departemen)}`.trim()], 10.5));
    flow.push(text(tx, y + 23, [`PROGRAM STUDI ${upper(id.prodi)}`.trim()], 10.5));
    flow.y += h;
  }
  row(flow, [val('RENCANA PEMBELAJARAN SEMESTER', W, { bold: true, align: 'center', size: 11 })]);

  const cols = [64.6, 31.4, 49.1, 24.4, 25.8, 28.2];
  cols.push(W - cols.reduce((a, b) => a + b, 0));
  const titles = ['MATA KULIAH', 'KODE', 'RUMPUN MATA KULIAH (RMK)', 'BOBOT (SKS)', 'SEMESTER', 'SIFAT', 'TGL. PENYUSUNAN'];
  row(flow, titles.map((t, i) => head(t, cols[i], { size: 8.5 })));
  const sks = id.sksPraktikum ? `${id.sksTeori}+${id.sksPraktikum}` : String(id.sksTeori ?? '');
  const values = [id.mataKuliah, id.kode, id.rmk, sks, id.semester, id.sifat, formatTanggal(id.tglPenyusunan)];
  row(flow, values.map((v, i) => val(v, cols[i])));

  // Otorisasi: ruang kosong di atas nama untuk tanda tangan pada hasil cetak.
  const oc = [64.6, 61.8, 53.3];
  oc.push(W - oc.reduce((a, b) => a + b, 0));
  row(flow, ['OTORISASI', 'DOSEN PENGELOLA MATA KULIAH', 'KOORDINATOR PENGELOLA/RMK', 'KETUA PROGRAM STUDI'].map((t, i) =>
    head(t, oc[i], { align: i ? 'center' : 'left' })
  ), { keepNext: 25 });
  row(flow, [
    val('', oc[0]),
    val(id.dosenPengelola.filter((d) => d.trim()).join('\n'), oc[1]),
    val(id.koordinator, oc[2], { align: 'center', valign: 'bottom' }),
    val(id.kaprodi, oc[3], { align: 'center', valign: 'bottom' })
  ], { minH: 26 });

  // Capaian pembelajaran: CPL → CPMK → Sub-CPMK.
  const LW = 30; // kolom label kiri
  const IW = W - LW;
  const kodeW = 30;
  const supW = 44;
  group(flow, 'CAPAIAN PEMBELAJARAN', LW, () => {
    row(flow, [head('CPL PRODI', IW)], { keepNext: 8 });
    for (const c of doc.cpl) row(flow, [val(c.kode, kodeW, { align: 'center' }), val(c.teks, IW - kodeW)]);
    if (!doc.cpl.length) row(flow, [val('', kodeW), val('', IW - kodeW)], { minH: 6 });
    row(flow, [head('CPMK', IW - supW), head('Support CP', supW)], { keepNext: 8 });
    for (const c of doc.cpmk) {
      const sup = c.cpl.map((x) => ctx.cpl.get(x)?.kode).filter(Boolean).join(', ');
      row(flow, [val(c.kode, kodeW, { align: 'center' }), val(c.teks, IW - kodeW - supW), val(sup, supW, { align: 'center' })]);
    }
    if (!doc.cpmk.length) row(flow, [val('', kodeW), val('', IW - kodeW - supW), val('', supW)], { minH: 6 });
    row(flow, [head('Sub-CPMK', IW - supW), head('Support CPMK', supW)], { keepNext: 8 });
    for (const s of doc.subCpmk) {
      row(flow, [val(s.kode, kodeW, { align: 'center' }), val(s.teks, IW - kodeW - supW), val(ctx.cpmk.get(s.cpmk)?.kode ?? '', supW, { align: 'center' })]);
    }
    if (!doc.subCpmk.length) row(flow, [val('', kodeW), val('', IW - kodeW - supW), val('', supW)], { minH: 6 });
  }, { align: 'center' });

  const labelled = (label, value, minH = 7) => row(flow, [head(label, LW), val(value, IW)], { minH });
  labelled('DESKRIPSI SINGKAT MK', id.deskripsi);
  labelled('MATERI PEMBELAJARAN/ POKOK BAHASAN', id.materi);

  // Pustaka: utama dulu, lalu pendukung; nomornya bersambung dan dipakai sebagai rujukan [n] di tabel pertemuan.
  const pw = 34.6;
  group(flow, 'PUSTAKA', LW, () => {
    for (const [jenis, judul] of [['utama', 'UTAMA'], ['pendukung', 'PENDUKUNG']]) {
      const list = ctx.pustakaUrut.filter((p) => (p.jenis === 'utama') === (jenis === 'utama'));
      const items = list.map((p) => `${ctx.nomorPustaka.get(p.id)}. ${p.teks}`).join('\n');
      row(flow, [val(judul, pw, { bold: true }), val(items, IW - pw)], { minH: 6 });
    }
  });

  group(flow, 'MEDIA PEMBELAJARAN', LW, () => {
    row(flow, [val('PERANGKAT LUNAK:', IW - supW, { bold: true, fill: BLUE }), val('PERANGKAT KERAS:', supW, { bold: true, fill: BLUE })], { keepNext: 8 });
    row(flow, [val(id.mediaLunak, IW - supW), val(id.mediaKeras, supW)], { minH: 6 });
  });
  labelled('PENGALAMAN BELAJAR (LEARNING EXPERIENCE)', id.pengalamanBelajar);
  labelled('TIM DOSEN PENGAMPU', numbered(id.timDosen.length ? id.timDosen : ['']));
  labelled('PRASYARAT (MATA KULIAH/ SKS)', id.prasyarat);

  layoutMatriks(doc, ctx, flow);
}

function layoutMatriks(doc, ctx, flow) {
  const hd = (t, w) => ({ w, text: t, bold: true, fill: BLUE, align: 'center', valign: 'middle' });
  const v = (t, w, extra = {}) => ({ w, text: t ?? '', align: 'center', valign: 'middle', ...extra });

  // A. CPMK (membentang) × Sub-CPMK × CPL. Nilai 1: CPMK induk Sub-CPMK mendukung CPL itu.
  heading(flow, 'A. MATRIKS PEMETAAN BOBOT CPMK-CPL');
  {
    const cplW = Math.min(22, (flow.width - 70) / Math.max(1, doc.cpl.length));
    row(flow, [hd('CPMK', 25), hd('Sub-CPMK', 45), ...doc.cpl.map((c) => hd(c.kode, cplW))]);
    const groups = [
      ...doc.cpmk.map((c) => ({ cpmk: c, subs: doc.subCpmk.filter((s) => s.cpmk === c.id) })),
      { cpmk: null, subs: doc.subCpmk.filter((s) => !ctx.cpmk.has(s.cpmk)) }
    ].filter((g) => g.subs.length || g.cpmk);
    for (const g of groups) {
      group(flow, g.cpmk?.kode ?? '–', 25, () => {
        const subs = g.subs.length ? g.subs : [null];
        for (const s of subs) {
          row(flow, [
            v(s?.kode ?? '', 45, { fill: BLUE }),
            ...doc.cpl.map((c) => v(s && g.cpmk?.cpl.includes(c.id) ? '1' : '', cplW))
          ]);
        }
      }, { align: 'center' });
    }
  }

  // B. Asesmen × Sub-CPMK: porsi tiap asesmen per Sub-CPMK, keterangan, dan Lembar Kerja yang terkait.
  heading(flow, 'B. MATRIKS PENILAIAN TERHADAP SUB-CPMK');
  {
    const aw = 36;
    const kw = 60;
    const sw = Math.min(34, (flow.width - aw - kw) / Math.max(1, doc.subCpmk.length));
    row(flow, [hd('Asesmen', aw), ...doc.subCpmk.map((s) => hd(s.kode, sw)), hd('Keterangan', kw)]);
    for (const a of doc.asesmen) {
      const lk = ctx.lkPerAsesmen.get(a.id);
      const ket = [a.keterangan, lk ? `<b>(${lk.join(', ')})</b>` : ''].filter(Boolean).join('\n');
      row(flow, [
        v(a.kode, aw, { fill: BLUE }),
        ...doc.subCpmk.map((s) => v(formatAngka(a.porsi[s.id] ?? 0), sw)),
        v(ket, kw)
      ]);
    }
  }

  // C. Pemetaan ke SIAKAD dan SIM OBE UB beserta bobotnya.
  heading(flow, 'C. MATRIKS PENILAIAN');
  {
    const c = [36, 30, 34, 25];
    row(flow, [hd('SIAKAD DESKTOP', c[0]), hd('SIM OBE UB', c[1]), hd('VARIABEL/KODE SIM OBE UB', c[2]), hd('Bobot (%)', c[3])]);
    for (const a of doc.asesmen) {
      row(flow, [v(a.siakad, c[0], { fill: BLUE }), v(a.obe, c[1]), v(a.kode, c[2]), v(formatAngka(a.bobot), c[3], { bold: true })]);
    }
    const total = doc.asesmen.reduce((s, a) => s + (a.bobot ?? 0), 0);
    row(flow, [v('Total', c[0] + c[1] + c[2], { bold: true, fill: BLUE }), v(formatAngka(Math.round(total * 100) / 100), c[3], { bold: true })]);
  }
}

// ---------------------------------------------------------------------------
// D. Tabel rencana materi per pertemuan (lanskap, kepala tabel berulang)
// ---------------------------------------------------------------------------

const PERTEMUAN_COLS = [20, 24.5, 40.1, 39.4, 24.8, 27, 55.8, 18.4];

function layoutPertemuan(doc, ctx, pages) {
  const flow = new Flow(pages, { landscape: true, mx: 23.5, top: 22, bottom: 14 });
  const C = PERTEMUAN_COLS;
  const X = [flow.x];
  for (const w of C) X.push(X.at(-1) + w);

  flow.push(text(flow.x, flow.y, ['D. TABEL RENCANA MATERI PER PERTEMUAN'], S, { bold: true }));
  flow.y += lineHeight(S) + 0.6;

  const H1 = 9;
  const H2 = 10;
  const H3 = 5;
  const cell = (page, x, y, w, h, t, extra = {}) => {
    const c = { size: 8, pad: PAD, bold: true, align: 'center', valign: 'middle', fill: BLUE, text: t, ...extra };
    c.lines = cellLines(c, w);
    drawCell(page, x, y, w, h, c);
  };
  const header = (f) => {
    const p = f.page;
    const y = f.y;
    const span = (a, b) => X[b + 1] - X[a];
    cell(p, X[0], y, C[0], H1 + H2, 'PEKAN KE-');
    cell(p, X[1], y, C[1], H1 + H2, 'KODE SUB-CPMK');
    cell(p, X[2], y, span(2, 3), H1, 'PENILAIAN');
    cell(p, X[2], y + H1, C[2], H2, 'INDIKATOR');
    cell(p, X[3], y + H1, C[3], H2, 'KRITERIA & BENTUK PENILAIAN');
    cell(p, X[4], y, span(4, 5), H1, 'DESAIN PEMBELAJARAN');
    cell(p, X[4], y + H1, C[4], H2, 'METODE');
    cell(p, X[5], y + H1, C[5], H2, 'WAKTU (DURASI)');
    cell(p, X[6], y, C[6], H1 + H2, 'MATERI PEMBELAJARAN / BAHAN KAJIAN [PUSTAKA]');
    cell(p, X[7], y, C[7], H1 + H2, 'BOBOT');
    C.forEach((w, i) => cell(p, X[i], y + H1 + H2, w, H3, `(${i + 1})`, { bold: false, fill: null }));
    f.y += H1 + H2 + H3;
  };
  flow.header = header;
  header(flow);
  flow.bodyTop = flow.y;

  if (!doc.pertemuan.length) {
    row(flow, C.map((w) => ({ w, text: '', size: TS })), { minH: 12 });
    return;
  }
  for (const p of doc.pertemuan) {
    const fill = p.jenis === 'praktikum' ? YELLOW : null;
    const kriteria = [p.kriteria && `<b>Kriteria</b>: ${p.kriteria}`, p.bentuk && `<b>Bentuk</b>: ${p.bentuk}`].filter(Boolean).join('\n\n') || '-';
    const metode = p.metode.length > 1 ? p.metode.map((m) => `• ${m}`).join('\n') : p.metode.join('');
    const nomor = p.pustaka.map((x) => ctx.nomorPustaka.get(x)).filter(Boolean);
    const materi = [p.materi, nomor.length ? `[${nomor.join(', ')}]` : ''].filter(Boolean).join('\n');
    const base = { size: TS, fill };
    row(flow, [
      { ...base, w: C[0], text: ctx.labelPekan.get(p.id), align: 'center', valign: 'middle' },
      { ...base, w: C[1], text: p.subCpmk.map((s) => ctx.sub.get(s)?.kode).filter(Boolean).join('\n'), align: 'center', valign: 'middle' },
      { ...base, w: C[2], text: p.indikator },
      { ...base, w: C[3], text: kriteria },
      { ...base, w: C[4], text: metode },
      { ...base, w: C[5], text: p.waktu },
      { ...base, w: C[6], text: materi },
      { ...base, w: C[7], text: formatAngka(p.bobot) }
    ], { minH: 10 });
  }
}

// ---------------------------------------------------------------------------
// Lembar Kerja (potret, satu per tugas)
// ---------------------------------------------------------------------------

function layoutLembarKerja(doc, ctx, lk, pages) {
  const id = doc.identitas;
  const flow = new Flow(pages, { landscape: false, mx: 27.5, top: 25, bottom: 20 });
  const W = flow.width;
  const LS = 9.5;
  const LW = 32;

  {
    const h = 33;
    const y = flow.y;
    flow.push(rect(flow.x, y, LW, h), rect(flow.x + LW, y, W - LW, h));
    const f = fit(LOGO, LW - 6, h - 6);
    flow.push({ t: 'image', src: LOGO.src, x: flow.x + (LW - f.w) / 2, y: y + (h - f.h) / 2, w: f.w, h: f.h });
    const kop = [upper(id.universitas), upper(id.fakultas), `DEPARTEMEN ${upper(id.departemen)}`.trim(), `PROGRAM STUDI ${upper(id.prodi)}`.trim()]
      .flatMap((l) => wrap(l, 13, true, W - LW - 4));
    flow.push(text(flow.x + LW + (W - LW) / 2, y + (h - kop.length * lineHeight(13)) / 2, kop, 13, { bold: true, align: 'center' }));
    flow.y += h;
  }
  row(flow, [{ w: W, text: 'LEMBAR KERJA', bold: true, align: 'center', size: 11, pad: 2 }]);

  const label = (t) => ({ w: LW, text: t, bold: true, fill: GRAY, size: 8.5, pad: 1.6 });
  const value = (t, extra = {}) => ({ w: W - LW, text: t ?? '', size: LS, pad: 1.6, ...extra });
  const semester = `${id.semester.charAt(0)}${id.semester.slice(1).toLowerCase()} ${id.tahunAkademik}`.trim();
  const dosen = id.timDosen.length ? id.timDosen : [''];
  row(flow, [label('MATA KULIAH'), value(id.mataKuliah, { bold: true })], { minH: 7 });
  row(flow, [label('KODE MATA KULIAH'), value(id.kode)], { minH: 7 });
  row(flow, [label('JUDUL LEMBAR KERJA'), value(lk.judul)], { minH: 7 });
  row(flow, [label('KODE LEMBAR KERJA'), value(lk.kode)], { minH: 7 });
  row(flow, [label('SEMESTER'), value(semester)], { minH: 7 });
  row(flow, [label('DOSEN PENGAMPU'), value(numbered(dosen))], { minH: 7 });

  const subs = lk.subCpmk.map((s) => ctx.sub.get(s)?.kode).filter(Boolean);
  const sections = [
    ['BENTUK AKTIVITAS', lk.bentukAktivitas],
    ['SUB CAPAIAN PEMBELAJARAN MATA KULIAH', joinDan(subs)],
    ['DESKRIPSI AKTIVITAS MAHASISWA', lk.deskripsi],
    ['METODE PENGERJAAN AKTIVITAS', lk.metode],
    ['BENTUK DAN FORMAT LUARAN', lk.luaran],
    ['INDIKATOR DAN KRITERIA PENYELESAIAN', lk.indikator],
    ['JADWAL PELAKSANAAN', lk.jadwal],
    ['LAIN-LAIN', lk.lainLain],
    ['DAFTAR RUJUKAN', lk.rujukan]
  ];
  for (const [title, body] of sections) {
    row(flow, [{ w: W, text: title, bold: true, fill: GRAY, size: 8.5, pad: 1.6 }], { minH: 7, keepNext: 8 });
    row(flow, [{ w: W, text: body ?? '', size: LS, pad: 1.6 }], { minH: 7 });
  }
}
