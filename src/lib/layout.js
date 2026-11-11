// Mesin tata letak: mengubah dokumen RPS menjadi daftar halaman berisi primitif gambar
// (rect, poly, text, image). Hasil yang sama dirender ke SVG (pratinjau) dan ke jsPDF (ekspor),
// sehingga pratinjau identik dengan PDF. Semua satuan dalam mm. Halaman boleh potret atau lanskap
// (sampul dan Lembar Kerja potret, identitas dan tabel pertemuan lanskap).
//
// Selain primitif, setiap halaman membawa `fields`: area edit langsung di pratinjau (tidak dicetak).
// Isian teks menunjuk ke data lewat `path`, mis. ['pertemuan', '#w1', 'indikator'] ('#' = cari menurut id).
import { jsPDF } from 'jspdf';
import { pdfFont, registerFonts, fontRevision } from './fonts.js';
import { formatTanggal, formatAngka, SEMESTER, SIFAT } from './model.js';
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

/** Lebar teks (boleh berformat) dalam mm. */
function textWidth(rich, size, bold = false) {
  return parseRich(rich).reduce((a, r) => a + measurerFor(size, bold || r.b).getTextWidth(r.text), 0);
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
    this.page = newPageObj(this.pages, this.w, this.h);
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

function newPageObj(pages, w, h) {
  const p = { w, h, items: [], fields: [] };
  pages.push(p);
  return p;
}

/**
 * Sel tabel: { w, text | items, size, bold, align, valign, fill, pad, field, pick }.
 * `items`: butir isi sel, masing-masing { text, lead, prefix, gap, keep, field }:
 *   lead   — teks pembuka sebaris (mis. "<b>Kriteria</b>: "), tidak ikut diedit;
 *   prefix — penanda butir ("1. ", "• ") dengan indentasi gantung;
 *   gap    — jumlah baris kosong sebelum butir;
 *   keep   — butir kosong tetap setinggi satu baris (butir daftar);
 *   field  — isian edit langsung untuk teks butir ({ id, path, rich, multiline, label, placeholder, list }).
 * Hasilnya baris-baris { line, item, k, indent } (k = urutan baris di dalam butirnya).
 */
function cellLines(c, w) {
  const items = c.items ?? [{ text: c.text, field: c.field }];
  const out = [];
  items.forEach((it, i) => {
    if (it.gap && out.length) for (let g = 0; g < it.gap; g++) out.push({ line: '', item: -1, k: 0, indent: 0 });
    const indent = it.prefix ? textWidth(it.prefix, c.size, c.bold) : 0;
    const inner = w - 2 * c.pad - indent;
    const t = (it.lead ?? '') + (it.text ?? '');
    let lines = c.bold ? wrap(plainText(t), c.size, true, inner) : wrapRich(t, c.size, inner);
    if (!lines.length && (it.keep || it.lead)) lines = [it.lead ? (wrapRich(it.lead, c.size, inner)[0] ?? '') : ''];
    lines.forEach((line, k) => out.push({ line, item: i, k, indent }));
  });
  return out;
}

const cellOf = (c) => {
  const o = { size: S, pad: PAD, align: 'left', valign: 'top', ...c };
  o.items = c.items ?? [{ text: c.text ?? '', field: c.field }];
  o.lines = cellLines(o, o.w);
  // Butir yang isiannya sudah dibuat di bagian sel sebelumnya (sel terbelah): bagian berikutnya diberi id lain.
  o.placed = new Set();
  return o;
};

/**
 * Satu baris tabel di posisi aliran. Baris yang tidak muat dipecah per baris teks ke halaman berikutnya
 * (kepala tabel diulang oleh `flow.header`); sisa ruang kurang dari `minSplit` mm membuat seluruh baris pindah.
 * `tools` ({ list, id, index, count, path }): alat baris (tambah/geser/hapus) dan menu klik kanan.
 */
function row(flow, cells, { minH = 0, keepNext = 0, minSplit = 14, tools = null } = {}) {
  const prep = cells.map(cellOf);
  const need = (c, n) => (n ? n * lineHeight(c.size) + 2 * c.pad : 0);
  const fullH = Math.max(minH, ...prep.map((c) => need(c, c.lines.length)));
  // Kepala bagian/tabel tidak ditinggal sendirian di dasar halaman.
  if (keepNext) flow.ensure(fullH + keepNext);
  // `tag` membedakan baris yang sama di tabel lain (asesmen di matriks B dan C).
  const hot = tools ? `r:${tools.list}:${tools.id ?? tools.index}${tools.tag ? ':' + tools.tag : ''}` : null;
  let seg = 0;
  for (;;) {
    const h = seg === 0 ? fullH : Math.max(...prep.map((c) => need(c, c.lines.length)), 4);
    const room = flow.room();
    if (h <= room + 0.01) {
      drawRow(flow, prep, h, seg, tools, hot);
      flow.y += h;
      return;
    }
    const atTop = flow.y <= flow.bodyTop + 0.01;
    if (room < minSplit && !atTop) {
      flow.newPage();
      continue;
    }
    // Pecah: setiap sel menampilkan baris yang muat, sisanya berlanjut di halaman berikutnya.
    const parts = prep.map((c) => {
      const n = Math.max(1, Math.floor((room - 2 * c.pad + 0.01) / lineHeight(c.size)));
      return { ...c, lines: c.lines.slice(0, n), rest: c.lines.slice(n) };
    });
    if (parts.every((s) => !s.rest.length)) {
      // Teksnya muat, hanya tinggi minimal baris yang tidak: pindah utuh, atau dipotong bila sudah di awal halaman.
      if (!atTop) {
        flow.newPage();
        continue;
      }
      drawRow(flow, parts, room, seg, tools, hot);
      flow.y += room;
      return;
    }
    drawRow(flow, parts, room, seg, tools, hot);
    parts.forEach((s, i) => (prep[i].lines = s.rest));
    flow.y += room;
    flow.newPage();
    seg++;
  }
}

function drawRow(flow, cells, h, seg, tools, hot) {
  let x = flow.x;
  const y = flow.y;
  for (const c of cells) {
    drawCell(flow.page, x, y, c.w, h, c, seg, hot);
    x += c.w;
  }
  if (tools) flow.page.fields.push({ kind: 'row-tools', hot, ...tools, id: `${hot}@${seg}`, x: flow.x, y, w: x - flow.x, h });
}

function drawCell(page, x, y, w, h, c, seg = 0, hot = null) {
  page.items.push(rect(x, y, w, h, c.fill ? { fill: c.fill } : {}));
  const lh = lineHeight(c.size);
  const th = c.lines.length * lh;
  const ty = c.valign === 'middle' ? y + (h - th) / 2 : c.valign === 'bottom' ? y + h - c.pad - th : y + c.pad;
  const tx = c.align === 'center' ? x + w / 2 : c.align === 'right' ? x + w - c.pad : x + c.pad;

  // Teks: baris berurutan dari butir yang sama menjadi satu item teks; penanda butir di baris pertamanya.
  let j = 0;
  while (j < c.lines.length) {
    const e = c.lines[j];
    let n = 1;
    while (j + n < c.lines.length && c.lines[j + n].item === e.item) n++;
    const lines = c.lines.slice(j, j + n);
    const it = c.items[e.item];
    if (it?.prefix && lines[0].k === 0) page.items.push(text(tx, ty + j * lh, [it.prefix], c.size, { bold: !!c.bold }));
    if (lines.some((l) => (typeof l.line === 'string' ? l.line : l.line.length))) {
      page.items.push(text(tx + e.indent, ty + j * lh, lines.map((l) => l.line), c.size, { bold: !!c.bold, align: c.align }));
    }
    j += n;
  }

  // Isian edit langsung untuk butir yang punya `field`, setinggi baris-barisnya di bagian sel ini.
  const single = c.items.length === 1;
  c.items.forEach((it, i) => {
    const f = it.field;
    if (!f) return;
    const at = c.lines.findIndex((l) => l.item === i);
    const count = c.lines.filter((l) => l.item === i).length;
    if (at < 0 && (seg > 0 || !single)) return;
    const indent = at >= 0 ? c.lines[at].indent : 0;
    let fy = at >= 0 ? ty + at * lh : c.valign === 'middle' ? y + (h - lh) / 2 : c.valign === 'bottom' ? y + h - c.pad - lh : y + c.pad;
    let fh = Math.max(1, count) * lh;
    // Sel berisi satu isian rata atas: seluruh sel bisa diklik.
    if (single && c.valign === 'top') fh = Math.max(fh, y + h - c.pad - fy);
    const left = c.align === 'left' ? x + c.pad + indent : x + c.pad;
    const again = c.placed?.has(i);
    c.placed?.add(i);
    page.fields.push({
      kind: 'text', size: c.size, bold: !!c.bold, align: c.align, hot, ...f,
      id: f.id + (again ? `@${seg}` : ''),
      x: left, y: fy, w: x + w - c.pad - left, h: fh,
      skip: at >= 0 ? c.lines[at].k : 0,
      lead: it.lead ? textWidth(it.lead, c.size, c.bold) : 0
    });
  });
  if (c.pick && seg === 0) page.fields.push({ kind: 'pick', hot, ...c.pick, x, y, w, h });
}

/**
 * Kolom label yang membentang di samping beberapa baris (rowspan), termasuk melintasi halaman:
 * di setiap halaman yang dilalui, kolom label digambar setinggi bagian yang ada di halaman itu;
 * teks label hanya di bagian pertama.
 */
function group(flow, label, w, body, { fill = BLUE, align = 'left', size = S, minH = 0, add = null } = {}) {
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
    const lines = s === firstText ? labelLines.map((line, k) => ({ line, item: 0, k, indent: 0 })) : [];
    drawCell(s.page, flow.x, s.y0, w, s.y1 - s.y0, { fill, bold: true, size, pad: PAD, align, valign: 'top', items: [{}], lines });
  }
  if (add) firstText.page.fields.push({ id: `add:${add.list}:${add.key ?? ''}`, kind: 'add', ...add, x: flow.x, y: firstText.y1 - 6, w, h: 6 });
}

/** Judul bagian (mis. "A. MATRIKS …") di atas tabel; ikut pindah halaman bersama awal tabelnya. */
function heading(flow, title, keep = 30) {
  flow.y += 6;
  flow.ensure(keep);
  flow.push(text(flow.x, flow.y, [title], S, { bold: true }));
  flow.y += lineHeight(S) + 0.6;
}

// Pembuat isian teks.
const F = (path, extra = {}) => ({ id: refOf(path), path, ...extra });
/** data-field isian: sama dengan `ref` di findReplace.js agar Cari dan Periksa bisa melompat ke isiannya. */
function refOf(path) {
  const [a, ...rest] = path;
  const head = { identitas: 'id', lembarKerja: 'lk' }[a] ?? a;
  return [head, ...rest.map((s) => String(s).replace(/^#/, ''))].join(':');
}
const R = (path, extra = {}) => F(path, { rich: true, multiline: true, ...extra });

// ---------------------------------------------------------------------------
// Dokumen
// ---------------------------------------------------------------------------

export function layoutDocument(doc) {
  const pages = [];
  const ctx = derive(doc);
  layoutCover(doc, pages);
  layoutIdentitas(doc, ctx, pages);
  layoutPertemuan(doc, ctx, pages);
  doc.lembarKerja.forEach((lk, i) => layoutLembarKerja(doc, ctx, lk, i, pages));
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
  const page = newPageObj(pages, A4.short, A4.long);
  const cx = A4.short / 2;
  const size = 14;
  const W = 150;
  const lh = lineHeight(size);
  // Setiap baris blok: teks tetap, atau isian (ditulis kapital) bila `key` diberikan.
  const block = (y, lines) => {
    for (const l of lines) {
      const value = l.key ? (l.upper ? upper(id[l.key]) : plainText(id[l.key])) : l.text;
      const wrapped = wrap(value, size, true, W);
      if (wrapped.length) page.items.push(text(cx, y, wrapped, size, { bold: true, align: 'center' }));
      const n = Math.max(1, wrapped.length);
      if (l.key) {
        page.fields.push({
          kind: 'text', ...F(['identitas', l.key]), x: cx - W / 2, y, w: W, h: n * lh, size, bold: true, align: 'center',
          upper: !!l.upper, label: l.label, placeholder: l.label
        });
      }
      y += n * lh;
    }
  };
  block(32, [{ text: 'RENCANA PEMBELAJARAN SEMESTER (RPS)' }, { key: 'prodi', upper: true, label: 'Program studi' }]);
  block(70, [{ key: 'mataKuliah', upper: true, label: 'Nama mata kuliah' }, { key: 'kode', label: 'Kode mata kuliah' }]);
  const f = fit(LOGO, 46, 46);
  page.items.push({ t: 'image', src: LOGO.src, x: cx - f.w / 2, y: 122, w: f.w, h: f.h });
  block(205, [
    { key: 'universitas', upper: true, label: 'Universitas' },
    { key: 'fakultas', upper: true, label: 'Fakultas' },
    { key: 'tahun', label: 'Tahun' }
  ]);
  // Kode isian sampul berbeda dari halaman identitas agar data-field tetap unik.
  for (const fl of page.fields) fl.id = 'cover:' + fl.id;
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
  const I = (key, extra) => F(['identitas', key], extra);

  // Kop: logo UB + nama universitas, fakultas, departemen, prodi.
  {
    const h = 32;
    const y = flow.y;
    flow.push(rect(flow.x, y, W, h));
    const f = fit(LOGO, 27, 27);
    flow.push({ t: 'image', src: LOGO.src, x: flow.x + 2, y: y + (h - f.h) / 2, w: f.w, h: f.h });
    const tx = flow.x + 32;
    const tw = W - 34;
    const kop = (yy, size, bold, prefix, key, label) => {
      flow.push(text(tx, yy, [`${prefix}${upper(id[key])}`.trim()], size, { bold }));
      const off = prefix ? textWidth(prefix, size, bold) : 0;
      flow.page.fields.push({ kind: 'text', ...I(key), x: tx + off, y: yy, w: tw - off, h: lineHeight(size), size, bold, align: 'left', upper: true, label, placeholder: label });
    };
    kop(y + 3, 17, true, '', 'universitas', 'Universitas');
    kop(y + 11, 12, false, '', 'fakultas', 'Fakultas');
    kop(y + 17.5, 10.5, false, 'DEPARTEMEN ', 'departemen', 'Nama departemen');
    kop(y + 23, 10.5, false, 'PROGRAM STUDI ', 'prodi', 'Nama program studi');
    flow.y += h;
  }
  row(flow, [val('RENCANA PEMBELAJARAN SEMESTER', W, { bold: true, align: 'center', size: 11 })]);

  const cols = [64.6, 31.4, 49.1, 24.4, 25.8, 28.2];
  cols.push(W - cols.reduce((a, b) => a + b, 0));
  const titles = ['MATA KULIAH', 'KODE', 'RUMPUN MATA KULIAH (RMK)', 'BOBOT (SKS)', 'SEMESTER', 'SIFAT', 'TGL. PENYUSUNAN'];
  row(flow, titles.map((t, i) => head(t, cols[i], { size: 8.5 })));
  const sks = id.sksPraktikum ? `${id.sksTeori}+${id.sksPraktikum}` : String(id.sksTeori ?? '');
  row(flow, [
    val(id.mataKuliah, cols[0], { field: I('mataKuliah', { label: 'Nama mata kuliah', placeholder: 'Nama mata kuliah' }) }),
    val(id.kode, cols[1], { field: I('kode', { label: 'Kode mata kuliah', placeholder: 'Kode' }) }),
    val(id.rmk, cols[2], { field: I('rmk', { label: 'Rumpun mata kuliah', placeholder: 'Rumpun MK' }) }),
    val(sks, cols[3], { pick: { id: 'pk:sks', type: 'sks', label: 'Bobot SKS' } }),
    val(id.semester, cols[4], { pick: { id: 'pk:semester', type: 'single', path: ['identitas', 'semester'], options: SEMESTER.map((v) => ({ value: v, label: v })), label: 'Semester' } }),
    val(id.sifat, cols[5], { pick: { id: 'pk:sifat', type: 'single', path: ['identitas', 'sifat'], options: SIFAT.map((v) => ({ value: v, label: v })), label: 'Sifat' } }),
    val(formatTanggal(id.tglPenyusunan), cols[6], { pick: { id: 'id:tglPenyusunan', type: 'date', path: ['identitas', 'tglPenyusunan'], label: 'Tanggal penyusunan' } })
  ], { minH: 7 });

  // Otorisasi: ruang kosong di atas nama untuk tanda tangan pada hasil cetak.
  const oc = [64.6, 61.8, 53.3];
  oc.push(W - oc.reduce((a, b) => a + b, 0));
  row(flow, ['OTORISASI', 'DOSEN PENGELOLA MATA KULIAH', 'KOORDINATOR PENGELOLA/RMK', 'KETUA PROGRAM STUDI'].map((t, i) =>
    head(t, oc[i], { align: i ? 'center' : 'left' })
  ), { keepNext: 25 });
  row(flow, [
    val('', oc[0]),
    { w: oc[1], items: listItems(['identitas', 'dosenPengelola'], id.dosenPengelola, { label: 'Dosen pengelola', placeholder: 'Nama dosen' }) },
    val(id.koordinator, oc[2], { align: 'center', valign: 'bottom', field: I('koordinator', { label: 'Koordinator', placeholder: 'Nama koordinator' }) }),
    val(id.kaprodi, oc[3], { align: 'center', valign: 'bottom', field: I('kaprodi', { label: 'Ketua program studi', placeholder: 'Nama ketua program studi' }) })
  ], { minH: 26 });

  // Capaian pembelajaran: CPL → CPMK → Sub-CPMK.
  const LW = 30; // kolom label kiri
  const IW = W - LW;
  const kodeW = 30;
  const supW = 44;
  const tools = (list, x, i) => ({ list, id: x.id, index: i, count: doc[list].length });
  const kodeF = (list, x, ph) => F([list, '#' + x.id, 'kode'], { label: `Kode ${ph}`, placeholder: ph });
  const teksF = (list, x, ph) => R([list, '#' + x.id, 'teks'], { label: `${x.kode || ph} · uraian`, placeholder: `Uraian ${ph}` });
  // Daftar masih kosong: satu baris kosong dengan tombol tambah.
  const emptyRow = (list, label, widths) => row(flow, widths.map((w) => val('', w)), { minH: 6, tools: { list, index: -1, count: 0, empty: label } });
  group(flow, 'CAPAIAN PEMBELAJARAN', LW, () => {
    row(flow, [head('CPL PRODI', IW)], { keepNext: 8 });
    doc.cpl.forEach((c, i) =>
      row(flow, [val(c.kode, kodeW, { align: 'center', field: kodeF('cpl', c, 'CPL') }), val(c.teks, IW - kodeW, { field: teksF('cpl', c, 'CPL') })], { tools: tools('cpl', c, i) })
    );
    if (!doc.cpl.length) emptyRow('cpl', 'CPL', [kodeW, IW - kodeW]);
    row(flow, [head('CPMK', IW - supW), head('Support CP', supW)], { keepNext: 8 });
    doc.cpmk.forEach((c, i) => {
      const sup = c.cpl.map((x) => ctx.cpl.get(x)?.kode).filter(Boolean).join(', ');
      row(flow, [
        val(c.kode, kodeW, { align: 'center', field: kodeF('cpmk', c, 'CPMK') }),
        val(c.teks, IW - kodeW - supW, { field: teksF('cpmk', c, 'CPMK') }),
        val(sup, supW, { align: 'center', pick: { id: `pk:cpmk:${c.id}`, type: 'multi', source: 'cpl', path: ['cpmk', '#' + c.id, 'cpl'], label: `CPL yang didukung ${c.kode || 'CPMK'}` } })
      ], { tools: tools('cpmk', c, i) });
    });
    if (!doc.cpmk.length) emptyRow('cpmk', 'CPMK', [kodeW, IW - kodeW - supW, supW]);
    row(flow, [head('Sub-CPMK', IW - supW), head('Support CPMK', supW)], { keepNext: 8 });
    doc.subCpmk.forEach((s, i) => {
      row(flow, [
        val(s.kode, kodeW, { align: 'center', field: kodeF('subCpmk', s, 'Sub-CPMK') }),
        val(s.teks, IW - kodeW - supW, { field: teksF('subCpmk', s, 'Sub-CPMK') }),
        val(ctx.cpmk.get(s.cpmk)?.kode ?? '', supW, { align: 'center', pick: { id: `pk:sub:${s.id}`, type: 'single', source: 'cpmk', path: ['subCpmk', '#' + s.id, 'cpmk'], label: `CPMK induk ${s.kode || 'Sub-CPMK'}` } })
      ], { tools: tools('subCpmk', s, i) });
    });
    if (!doc.subCpmk.length) emptyRow('subCpmk', 'Sub-CPMK', [kodeW, IW - kodeW - supW, supW]);
  }, { align: 'center' });

  const labelled = (label, key, ph, minH = 7) =>
    row(flow, [head(label, LW), val(id[key], IW, { field: R(['identitas', key], { label, placeholder: ph }) })], { minH });
  labelled('DESKRIPSI SINGKAT MK', 'deskripsi', 'Deskripsi singkat mata kuliah');
  labelled('MATERI PEMBELAJARAN/ POKOK BAHASAN', 'materi', 'Pokok bahasan (Ctrl+Shift+7 untuk daftar bernomor)');

  // Pustaka: utama dulu, lalu pendukung; nomornya bersambung dan dipakai sebagai rujukan [n] di tabel pertemuan.
  const pw = 34.6;
  group(flow, 'PUSTAKA', LW, () => {
    for (const [jenis, judul] of [['utama', 'UTAMA'], ['pendukung', 'PENDUKUNG']]) {
      const list = ctx.pustakaUrut.filter((p) => (p.jenis === 'utama') === (jenis === 'utama'));
      const items = list.map((p) => ({
        prefix: `${ctx.nomorPustaka.get(p.id)}. `, text: p.teks, keep: true,
        field: R(['pustaka', '#' + p.id, 'teks'], { multiline: false, label: `Pustaka ${ctx.nomorPustaka.get(p.id)}`, placeholder: 'Penulis, “Judul”, Penerbit, Tahun', list: { kind: 'pustaka', id: p.id, jenis } })
      }));
      const add = { id: `add:pustaka:${jenis}`, kind: 'add', list: 'pustaka', jenis, label: `Tambah pustaka ${jenis}` };
      row(flow, [val(judul, pw, { bold: true, pick: add }), { w: IW - pw, items: items.length ? items : [{ text: '' }] }], { minH: 6 });
    }
  });

  group(flow, 'MEDIA PEMBELAJARAN', LW, () => {
    row(flow, [val('PERANGKAT LUNAK:', IW - supW, { bold: true, fill: BLUE }), val('PERANGKAT KERAS:', supW, { bold: true, fill: BLUE })], { keepNext: 8 });
    row(flow, [
      val(id.mediaLunak, IW - supW, { field: R(['identitas', 'mediaLunak'], { label: 'Perangkat lunak', placeholder: 'Perangkat lunak' }) }),
      val(id.mediaKeras, supW, { field: R(['identitas', 'mediaKeras'], { label: 'Perangkat keras', placeholder: 'Perangkat keras' }) })
    ], { minH: 6 });
  });
  labelled('PENGALAMAN BELAJAR (LEARNING EXPERIENCE)', 'pengalamanBelajar', 'Pengalaman belajar');
  row(flow, [
    head('TIM DOSEN PENGAMPU', LW),
    { w: IW, items: listItems(['identitas', 'timDosen'], id.timDosen, { numbered: true, label: 'Tim dosen', placeholder: 'Nama dosen' }) }
  ], { minH: 7 });
  labelled('PRASYARAT (MATA KULIAH/ SKS)', 'prasyarat', 'Mata kuliah prasyarat');

  layoutMatriks(doc, ctx, flow);
}

/** Butir daftar teks (dosen): satu isian per nama; Enter menambah, Backspace di awal butir menggabungkan. */
function listItems(path, list, { numbered = false, label, placeholder }) {
  const values = list.length ? list : [''];
  return values.map((t, i) => ({
    prefix: numbered ? `${i + 1}. ` : '',
    text: t,
    keep: true,
    field: F([...path, i], { label: `${label} ${i + 1}`, placeholder, list: { kind: 'strings', path, index: i, virtual: !list.length } })
  }));
}

function layoutMatriks(doc, ctx, flow) {
  const hd = (t, w) => ({ w, text: t, bold: true, fill: BLUE, align: 'center', valign: 'middle' });
  const v = (t, w, extra = {}) => ({ w, text: t ?? '', align: 'center', valign: 'middle', ...extra });

  // A. CPMK (membentang) × Sub-CPMK × CPL. Nilai 1: CPMK induk Sub-CPMK mendukung CPL itu. Dihitung otomatis.
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
  const tools = (a, i) => ({ list: 'asesmen', id: a.id, index: i, count: doc.asesmen.length });
  {
    const aw = 36;
    const kw = 60;
    const sw = Math.min(34, (flow.width - aw - kw) / Math.max(1, doc.subCpmk.length));
    row(flow, [hd('Asesmen', aw), ...doc.subCpmk.map((s) => hd(s.kode, sw)), hd('Keterangan', kw)]);
    doc.asesmen.forEach((a, i) => {
      const lk = ctx.lkPerAsesmen.get(a.id);
      const P = ['asesmen', '#' + a.id];
      row(flow, [
        v(a.kode, aw, { fill: BLUE, field: F([...P, 'kode'], { label: 'Kode asesmen', placeholder: 'Kode' }) }),
        ...doc.subCpmk.map((s) => v(formatAngka(a.porsi[s.id] ?? 0), sw, {
          field: F([...P, 'porsi', s.id], { id: `asesmen:${a.id}:porsi:${s.id}`, num: true, zero: true, label: `Porsi ${a.kode} untuk ${s.kode}` })
        })),
        v('', kw, {
          items: [
            { text: a.keterangan, field: R([...P, 'keterangan'], { label: `${a.kode || 'Asesmen'} · keterangan`, placeholder: 'Keterangan' }) },
            ...(lk ? [{ text: `<b>(${lk.join(', ')})</b>` }] : [])
          ]
        })
      ], { tools: tools(a, i) });
    });
    if (!doc.asesmen.length) row(flow, [v('', aw), ...doc.subCpmk.map(() => v('', sw)), v('', kw)], { minH: 6, tools: { list: 'asesmen', index: -1, count: 0, empty: 'asesmen' } });
  }

  // C. Pemetaan ke SIAKAD dan SIM OBE UB beserta bobotnya.
  heading(flow, 'C. MATRIKS PENILAIAN');
  {
    const c = [36, 30, 34, 25];
    row(flow, [hd('SIAKAD DESKTOP', c[0]), hd('SIM OBE UB', c[1]), hd('VARIABEL/KODE SIM OBE UB', c[2]), hd('Bobot (%)', c[3])]);
    doc.asesmen.forEach((a, i) => {
      const P = ['asesmen', '#' + a.id];
      row(flow, [
        v(a.siakad, c[0], { fill: BLUE, field: F([...P, 'siakad'], { label: 'Kategori SIAKAD', placeholder: 'SIAKAD' }) }),
        v(a.obe, c[1], { field: F([...P, 'obe'], { label: 'Kategori SIM OBE', placeholder: 'SIM OBE' }) }),
        v(a.kode, c[2], { field: F([...P, 'kode'], { id: `asesmen:${a.id}:kode@c`, label: 'Kode asesmen', placeholder: 'Kode' }) }),
        v(formatAngka(a.bobot), c[3], { bold: true, field: F([...P, 'bobot'], { num: true, label: `Bobot ${a.kode} (%)` }) })
      ], { tools: { ...tools(a, i), tag: 'c' } });
    });
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
    const c = cellOf({ size: 8, pad: PAD, bold: true, align: 'center', valign: 'middle', fill: BLUE, text: t, w, ...extra });
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
    row(flow, C.map((w) => ({ w, text: '', size: TS })), { minH: 12, tools: { list: 'pertemuan', index: -1, count: 0, empty: 'pertemuan' } });
  }
  doc.pertemuan.forEach((p, i) => {
    const fill = p.jenis === 'praktikum' ? YELLOW : null;
    const P = ['pertemuan', '#' + p.id];
    const label = `Pekan ${ctx.labelPekan.get(p.id)}`;
    const nomor = p.pustaka.map((x) => ctx.nomorPustaka.get(x)).filter(Boolean);
    const base = { size: TS, fill };
    const metode = p.metode.length ? p.metode : [''];
    row(flow, [
      { ...base, w: C[0], text: ctx.labelPekan.get(p.id), align: 'center', valign: 'middle', pick: { id: `pk:pekan:${p.id}`, type: 'pertemuan', path: P, label } },
      {
        ...base, w: C[1], text: p.subCpmk.map((s) => ctx.sub.get(s)?.kode).filter(Boolean).join('\n'), align: 'center', valign: 'middle',
        pick: { id: `pk:psub:${p.id}`, type: 'multi', source: 'subCpmk', path: [...P, 'subCpmk'], label: `${label} · Sub-CPMK` }
      },
      { ...base, w: C[2], field: R([...P, 'indikator'], { label: `${label} · indikator`, placeholder: 'Indikator' }), text: p.indikator },
      {
        ...base, w: C[3],
        items: [
          { lead: '<b>Kriteria</b>: ', text: p.kriteria, field: R([...P, 'kriteria'], { label: `${label} · kriteria` }) },
          { lead: '<b>Bentuk</b>: ', text: p.bentuk, gap: 1, field: R([...P, 'bentuk'], { label: `${label} · bentuk penilaian` }) }
        ]
      },
      {
        ...base, w: C[4],
        items: metode.map((m, k) => ({
          prefix: p.metode.length > 1 ? '• ' : '', text: m, keep: true,
          field: F([...P, 'metode', k], { label: `${label} · metode ${k + 1}`, placeholder: 'Metode', list: { kind: 'strings', path: [...P, 'metode'], index: k, virtual: !p.metode.length } })
        }))
      },
      { ...base, w: C[5], text: p.waktu, field: F([...P, 'waktu'], { label: `${label} · waktu`, placeholder: 'mis. 2x50 menit' }) },
      {
        ...base, w: C[6],
        items: [
          { text: p.materi, field: R([...P, 'materi'], { label: `${label} · materi`, placeholder: 'Materi / bahan kajian' }) },
          ...(nomor.length ? [{ text: `[${nomor.join(', ')}]` }] : [])
        ]
      },
      { ...base, w: C[7], text: formatAngka(p.bobot), field: F([...P, 'bobot'], { num: true, label: `${label} · bobot` }) }
    ], { minH: 10, tools: { list: 'pertemuan', id: p.id, index: i, count: doc.pertemuan.length } });
  });

  // Lembar Kerja ditambahkan dari sini (atau dari menu asesmen) bila belum ada.
  flow.y += 3;
  flow.ensure(7);
  flow.page.fields.push({ id: 'add:lembarKerja', kind: 'add', list: 'lembarKerja', label: '+ Tambah Lembar Kerja', x: flow.x, y: flow.y, w: 50, h: 6 });
}

// ---------------------------------------------------------------------------
// Lembar Kerja (potret, satu per tugas)
// ---------------------------------------------------------------------------

function layoutLembarKerja(doc, ctx, lk, index, pages) {
  const id = doc.identitas;
  const first = pages.length;
  const flow = new Flow(pages, { landscape: false, mx: 27.5, top: 25, bottom: 20 });
  const W = flow.width;
  const LS = 9.5;
  const LW = 32;
  const P = ['lembarKerja', '#' + lk.id];
  const name = lk.kode || `Lembar Kerja ${index + 1}`;
  // Alat Lembar Kerja (geser/duplikat/hapus) di atas kop.
  flow.page.fields.push({ id: `rt:lembarKerja:${lk.id}`, kind: 'row-tools', hot: `r:lembarKerja:${lk.id}`, list: 'lembarKerja', id: lk.id, index, count: doc.lembarKerja.length, x: flow.x, y: flow.y, w: W, h: 33, top: true });

  {
    const h = 33;
    const y = flow.y;
    flow.push(rect(flow.x, y, LW, h), rect(flow.x + LW, y, W - LW, h));
    const f = fit(LOGO, LW - 6, h - 6);
    flow.push({ t: 'image', src: LOGO.src, x: flow.x + (LW - f.w) / 2, y: y + (h - f.h) / 2, w: f.w, h: f.h });
    // Kop mengikuti identitas RPS (diedit di halaman identitas).
    const kop = [upper(id.universitas), upper(id.fakultas), `DEPARTEMEN ${upper(id.departemen)}`.trim(), `PROGRAM STUDI ${upper(id.prodi)}`.trim()]
      .flatMap((l) => wrap(l, 13, true, W - LW - 4));
    flow.push(text(flow.x + LW + (W - LW) / 2, y + (h - kop.length * lineHeight(13)) / 2, kop, 13, { bold: true, align: 'center' }));
    flow.y += h;
  }
  row(flow, [{ w: W, text: 'LEMBAR KERJA', bold: true, align: 'center', size: 11, pad: 2 }]);

  const hot = `r:lembarKerja:${lk.id}`;
  const label = (t) => ({ w: LW, text: t, bold: true, fill: GRAY, size: 8.5, pad: 1.6 });
  const value = (t, extra = {}) => ({ w: W - LW, text: t ?? '', size: LS, pad: 1.6, ...extra });
  const semester = `${id.semester.charAt(0)}${id.semester.slice(1).toLowerCase()} ${id.tahunAkademik}`.trim();
  // Isian identitas yang muncul lagi di LK diberi id sendiri agar data-field tetap unik.
  const at = `lk${index}:`;
  const idF = (key, extra) => F(['identitas', key], { id: `${at}id:${key}`, ...extra });
  row(flow, [label('MATA KULIAH'), value(id.mataKuliah, { bold: true, field: idF('mataKuliah', { label: 'Nama mata kuliah' }) })], { minH: 7 });
  row(flow, [label('KODE MATA KULIAH'), value(id.kode, { field: idF('kode', { label: 'Kode mata kuliah' }) })], { minH: 7 });
  row(flow, [label('JUDUL LEMBAR KERJA'), value(lk.judul, { field: F([...P, 'judul'], { label: `${name} · judul`, placeholder: 'Judul lembar kerja' }) })], { minH: 7 });
  row(flow, [
    label('KODE LEMBAR KERJA'),
    value(lk.kode, { field: F([...P, 'kode'], { label: `${name} · kode`, placeholder: 'mis. LK-1' }) })
  ], { minH: 7 });
  row(flow, [
    label('SEMESTER'),
    value(semester, { pick: { id: `pk:lksem:${lk.id}`, type: 'semester', label: 'Semester dan tahun akademik' } })
  ], { minH: 7 });
  const dosen = listItems(['identitas', 'timDosen'], id.timDosen, { numbered: true, label: 'Tim dosen', placeholder: 'Nama dosen' });
  for (const d of dosen) d.field.id = at + d.field.id;
  row(flow, [label('DOSEN PENGAMPU'), value('', { items: dosen })], { minH: 7 });

  const subs = lk.subCpmk.map((s) => ctx.sub.get(s)?.kode).filter(Boolean);
  const asesmen = ctx.asesmen.get(lk.asesmen);
  const sections = [
    ['BENTUK AKTIVITAS', 'bentukAktivitas', 'mis. Tugas kelompok di rumah'],
    ['SUB CAPAIAN PEMBELAJARAN MATA KULIAH', null],
    ['DESKRIPSI AKTIVITAS MAHASISWA', 'deskripsi', 'Deskripsi aktivitas'],
    ['METODE PENGERJAAN AKTIVITAS', 'metode', 'Langkah pengerjaan (Ctrl+Shift+7 untuk daftar bernomor)'],
    ['BENTUK DAN FORMAT LUARAN', 'luaran', 'mis. Laporan dan kode program'],
    ['INDIKATOR DAN KRITERIA PENYELESAIAN', 'indikator', 'Indikator dan kriteria'],
    ['JADWAL PELAKSANAAN', 'jadwal', 'Kapan diberikan dan dikumpulkan'],
    ['LAIN-LAIN', 'lainLain', 'mis. rubrik penilaian'],
    ['DAFTAR RUJUKAN', 'rujukan', 'Rujukan']
  ];
  for (const [title, key, ph] of sections) {
    row(flow, [{ w: W, text: title, bold: true, fill: GRAY, size: 8.5, pad: 1.6 }], { minH: 7, keepNext: 8 });
    if (key) {
      row(flow, [{ w: W, text: lk[key], size: LS, pad: 1.6, field: R([...P, key], { label: `${name} · ${title.toLowerCase()}`, placeholder: ph }) }], { minH: 7 });
    } else {
      row(flow, [{
        w: W, text: joinDan(subs), size: LS, pad: 1.6,
        pick: { id: `pk:lksub:${lk.id}`, type: 'lk', path: P, label: `${name} · Sub-CPMK dan asesmen`, asesmen: asesmen?.kode ?? '' }
      }], { minH: 7 });
    }
  }
  // Menyorot bagian mana pun dari Lembar Kerja ini menampilkan alatnya.
  for (const p of pages.slice(first)) for (const f of p.fields) f.hot ??= hot;
}
