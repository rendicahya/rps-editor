// Ekspor DOCX (Word) yang bisa diedit. Struktur dan ukurannya mengikuti mesin tata letak (layout.js), tetapi
// tabelnya tabel Word biasa yang mengalir sendiri antarhalaman: baris panjang dibiarkan terbelah oleh Word, dan
// kepala tabel pertemuan diulang di setiap halaman. Akibatnya letak pergantian halaman bisa sedikit berbeda dari PDF.
//
// Bagian (section) Word: sampul (potret) → identitas + matriks A–C (lanskap) → tabel pertemuan (lanskap) →
// Lembar Kerja (potret, satu halaman baru per LK). Data RPS (JSON) ikut disimpan di dalam paket DOCX
// (rps-editor/data.rps) sehingga berkas Word ini bisa dibuka lagi di RPS Editor.
import { zipSync, strToU8 } from 'fflate';
import { DATA_PART, DATA_REL } from './docxData.js';
import { LOGO, markerWidth, A4 } from './layout.js';
import { formatTanggal, formatAngka, officeCoreXml } from './model.js';
import { parseRich, hasList, listMarker, plainText, sliceRich } from './richtext.js';

const TW = 1440 / 25.4; // twip per mm
const EMU = 36000; // EMU per mm
const tw = (mm) => Math.round(mm * TW);
const emu = (mm) => Math.round(mm * EMU);
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const BLUE = 'CFE7F6';
const YELLOW = 'FFF2CC';
const GRAY = 'D9D9D9';
const PAD = 1.2;
const S = 9; // isi identitas dan matriks
const TS = 8.5; // tabel pertemuan

// ---------------------------------------------------------------------------
// Potongan WordprocessingML
// ---------------------------------------------------------------------------

function run(text, { size, bold, italic, underline, color } = {}) {
  const sz = size ? Math.round(size * 2) : 0;
  const pr =
    (bold ? '<w:b/><w:bCs/>' : '') + (italic ? '<w:i/><w:iCs/>' : '') + (color ? `<w:color w:val="${color}"/>` : '') +
    (sz ? `<w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/>` : '') + (underline ? '<w:u w:val="single"/>' : '');
  const parts = String(text ?? '').replace(/\r/g, '').split('\n');
  const body = parts.map((p) => `<w:t xml:space="preserve">${esc(p)}</w:t>`).join('<w:br/>');
  return `<w:r>${pr ? `<w:rPr>${pr}</w:rPr>` : ''}${body}</w:r>`;
}

/** Teks berformat (<b>, <i>, <u>) menjadi beberapa run Word. */
const richRun = (text, opts = {}) =>
  parseRich(text).map((r) => run(r.text, { ...opts, bold: r.b || opts.bold, italic: r.i || opts.italic, underline: r.u })).join('') || '';

/** Paragraf; spasi baris tetap size × 1,2 seperti tata letak (`line` dalam twip, 0 = otomatis). */
function para(content, { size = S, align, before = 0, after = 0, line = size * 24, keepNext, hang, pageBreak } = {}) {
  const pr =
    (keepNext ? '<w:keepNext/>' : '') + (pageBreak ? '<w:pageBreakBefore/>' : '') +
    `<w:spacing w:before="${Math.round(before)}" w:after="${Math.round(after)}" ` +
    (line ? `w:line="${Math.round(line)}" w:lineRule="exact"/>` : 'w:line="240" w:lineRule="auto"/>') +
    (hang ? `<w:ind w:left="${tw(hang)}" w:hanging="${tw(hang)}"/>` : '') +
    (align && align !== 'left' ? `<w:jc w:val="${align === 'center' ? 'center' : align === 'right' ? 'right' : 'both'}"/>` : '') +
    `<w:rPr><w:sz w:val="${Math.round(size * 2)}"/><w:szCs w:val="${Math.round(size * 2)}"/></w:rPr>`;
  return `<w:p><w:pPr>${pr}</w:pPr>${content}</w:p>`;
}

/**
 * Isi sel dari teks berformat. Baris berdaftar ("• ", "1. ") menjadi paragraf dengan indentasi gantung selebar
 * penandanya dan tab setelah penanda, sehingga baris lanjutan rata seperti di PDF. `lead`: run pembuka sebaris.
 */
function richParas(v, { size = S, bold, align, lead = '' } = {}) {
  const o = { size, bold };
  if (!hasList(v)) return para(lead + richRun(v, o), { size, align });
  let at = 0;
  return plainText(v)
    .split('\n')
    .map((l, i) => {
      const m = listMarker(l);
      const body = richRun(sliceRich(v, at + m.length, at + l.length), o);
      const pre = i === 0 ? lead : '';
      at += l.length + 1;
      if (!m) return para(pre + body, { size, align });
      return para(pre + run(m.trimEnd(), o) + '<w:r><w:tab/></w:r>' + body, { size, hang: markerWidth(m, size) });
    })
    .join('');
}

/** Butir berpenanda (nomor pustaka, daftar dosen): satu paragraf per butir dengan indentasi gantung. */
function itemParas(items, { size = S } = {}) {
  if (!items.length) return para('', { size });
  return items
    .map(({ prefix, text }) =>
      prefix
        ? para(run(prefix.trimEnd(), { size }) + '<w:r><w:tab/></w:r>' + richRun(text, { size }), { size, hang: markerWidth(prefix, size) })
        : para(richRun(text, { size }), { size })
    )
    .join('');
}

// ---------------------------------------------------------------------------
// Tabel: setiap baris menentukan lebar selnya sendiri; grid kolom = gabungan semua batas sel.
// ---------------------------------------------------------------------------

/**
 * Sel: { w, body (paragraf), fill, vMerge ('restart' | 'continue'), valign ('top'|'middle'|'bottom'), noLeft, noRight }.
 * Baris: { cells, h (tinggi minimal, termasuk jarak dalam), exact, header }.
 */
function table(rows, { pad = PAD, borders = true, center = false } = {}) {
  const key = (x) => Math.round(x * 100);
  const edges = new Set([0]);
  for (const r of rows) {
    let x = 0;
    for (const c of r.cells) edges.add(key((x += c.w)));
  }
  const grid = [...edges].sort((a, b) => a - b);
  const widths = grid.slice(1).map((e, i) => (e - grid[i]) / 100);

  const b = (s) => `<w:${s} w:val="${borders ? 'single' : 'nil'}" w:sz="4" w:space="0" w:color="000000"/>`;
  const out = rows.map((r) => {
    let x = 0;
    const cells = r.cells.map((c) => {
      const from = grid.indexOf(key(x));
      x += c.w;
      const span = grid.indexOf(key(x)) - from;
      const nil = (s) => `<w:${s} w:val="nil"/>`;
      const bd = c.noLeft || c.noRight ? `<w:tcBorders>${c.noLeft ? nil('left') : ''}${c.noRight ? nil('right') : ''}</w:tcBorders>` : '';
      const pr =
        `<w:tcW w:w="${tw(c.w)}" w:type="dxa"/>` + (span > 1 ? `<w:gridSpan w:val="${span}"/>` : '') +
        (c.vMerge ? `<w:vMerge${c.vMerge === 'restart' ? ' w:val="restart"' : ''}/>` : '') + bd +
        (c.fill ? `<w:shd w:val="clear" w:color="auto" w:fill="${c.fill}"/>` : '') +
        (c.valign && c.valign !== 'top' ? `<w:vAlign w:val="${c.valign === 'middle' ? 'center' : 'bottom'}"/>` : '');
      return `<w:tc><w:tcPr>${pr}</w:tcPr>${c.body || para('', { size: c.size ?? S })}</w:tc>`;
    });
    // Tinggi `atLeast` di Word belum termasuk jarak dalam atas/bawah sel, `exact` sudah.
    const h = r.h ? (r.exact ? r.h : Math.max(0, r.h - 2 * pad)) : 0;
    const trPr =
      (r.header || r.exact ? '<w:cantSplit/>' : '') + (h ? `<w:trHeight w:val="${tw(h)}" w:hRule="${r.exact ? 'exact' : 'atLeast'}"/>` : '') +
      (r.header ? '<w:tblHeader/>' : '');
    return `<w:tr>${trPr ? `<w:trPr>${trPr}</w:trPr>` : ''}${cells.join('')}</w:tr>`;
  });
  const total = widths.reduce((a, v) => a + tw(v), 0);
  return (
    `<w:tbl><w:tblPr><w:tblW w:w="${total}" w:type="dxa"/>${center ? '<w:jc w:val="center"/>' : ''}<w:tblInd w:w="0" w:type="dxa"/>` +
    `<w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(b).join('')}</w:tblBorders>` +
    `<w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="${tw(pad)}" w:type="dxa"/><w:left w:w="${tw(pad)}" w:type="dxa"/>` +
    `<w:bottom w:w="${tw(pad)}" w:type="dxa"/><w:right w:w="${tw(pad)}" w:type="dxa"/></w:tblCellMar>` +
    `<w:tblLook w:val="0000" w:firstRow="0" w:lastRow="0" w:firstColumn="0" w:lastColumn="0" w:noHBand="1" w:noVBand="1"/></w:tblPr>` +
    `<w:tblGrid>${widths.map((w) => `<w:gridCol w:w="${tw(w)}"/>`).join('')}</w:tblGrid>${out.join('')}</w:tbl>`
  );
}

/** Sel teks berformat. extra: { size, bold, align, valign, fill, lead, ... }. */
const tc = (w, t, extra = {}) => ({ w, ...extra, body: richParas(t ?? '', { size: extra.size ?? S, bold: extra.bold, align: extra.align, lead: extra.lead }) });
/** Sel kepala (biru, tebal). */
const th = (w, t, extra = {}) => tc(w, t, { bold: true, fill: BLUE, ...extra });

/**
 * Kolom label yang membentang di samping beberapa baris (rowspan): label pada baris pertama, sel bergabung
 * (vMerge) di baris-baris berikutnya. `rows`: baris isi di sebelah kanan label.
 */
function grouped(label, w, rows, extra = {}) {
  return rows.map((r, i) => ({
    ...r,
    cells: [i === 0 ? th(w, label, { vMerge: rows.length > 1 ? 'restart' : null, ...extra }) : { w, vMerge: 'continue', fill: extra.fill ?? BLUE }, ...r.cells]
  }));
}

// ---------------------------------------------------------------------------
// Gambar
// ---------------------------------------------------------------------------

class Media {
  constructor() {
    this.files = {};
    this.rels = [];
    this.n = 0;
    this.cache = new Map();
  }
  addDataUrl(src) {
    if (this.cache.has(src)) return this.cache.get(src);
    const [head, data] = src.split(',');
    const bin = atob(data);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const id = 'rIdImg' + ++this.n;
    const name = `image${this.n}.${head.includes('jpeg') ? 'jpeg' : 'png'}`;
    this.files['word/media/' + name] = bytes;
    this.rels.push(`<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${name}"/>`);
    this.cache.set(src, id);
    return id;
  }
}

let drawingId = 0;
function inlineImage(rid, w, h) {
  const id = ++drawingId;
  return (
    `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${emu(w)}" cy="${emu(h)}"/>` +
    `<wp:effectExtent l="0" t="0" r="0" b="0"/><wp:docPr id="${id}" name="Logo ${id}"/>` +
    `<wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>` +
    `<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic>` +
    `<pic:nvPicPr><pic:cNvPr id="${id}" name="Logo ${id}"/><pic:cNvPicPr/></pic:nvPicPr>` +
    `<pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
    `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${emu(w)}" cy="${emu(h)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>` +
    `</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`
  );
}

function logo(media, maxW, maxH) {
  const s = Math.min(maxW / LOGO.width, maxH / LOGO.height);
  return inlineImage(media.addDataUrl(LOGO.src), LOGO.width * s, LOGO.height * s);
}

// ---------------------------------------------------------------------------
// Bagian dokumen
// ---------------------------------------------------------------------------

const upper = (s) => plainText(s).toUpperCase();
const joinDan = (list) => (list.length < 3 ? list.join(' dan ') : `${list.slice(0, -1).join(', ')}, dan ${list.at(-1)}`);

/** Peta rujukan dan nilai turunan, sama dengan derive() di layout.js. */
function derive(doc) {
  const byId = (list) => new Map(list.map((x) => [x.id, x]));
  const pustakaUrut = [...doc.pustaka.filter((p) => p.jenis === 'utama'), ...doc.pustaka.filter((p) => p.jenis !== 'utama')];
  const nomorPustaka = new Map(pustakaUrut.map((p, i) => [p.id, i + 1]));
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
  const lkPerAsesmen = new Map();
  for (const l of doc.lembarKerja) {
    if (!l.asesmen || !l.kode) continue;
    lkPerAsesmen.set(l.asesmen, [...(lkPerAsesmen.get(l.asesmen) ?? []), l.kode]);
  }
  return { cpl: byId(doc.cpl), cpmk: byId(doc.cpmk), sub: byId(doc.subCpmk), asesmen: byId(doc.asesmen), pustakaUrut, nomorPustaka, labelPekan, lkPerAsesmen };
}

/** Sampul: tabel tanpa garis dengan tinggi baris tetap, sehingga posisi blok sama dengan PDF (y 32, 70, 122, 205 mm). */
function cover(doc, media) {
  const id = doc.identitas;
  const size = 14;
  const W = 150;
  const line = (t) => para(run(t, { bold: true, size }), { size, align: 'center' });
  const lines = (...ts) => ts.filter((t) => t.trim()).map(line).join('') || para('', { size });
  const rows = [
    { h: 38, exact: true, cells: [{ w: W, body: lines('RENCANA PEMBELAJARAN SEMESTER (RPS)', upper(id.prodi)) }] },
    { h: 52, exact: true, cells: [{ w: W, body: lines(upper(id.mataKuliah), plainText(id.kode)) }] },
    { h: 83, exact: true, cells: [{ w: W, body: para(logo(media, 46, 46), { size, align: 'center', line: 0 }) }] },
    { h: 30, exact: true, cells: [{ w: W, body: lines(upper(id.universitas), upper(id.fakultas), plainText(id.tahun)) }] }
  ];
  return table(rows, { pad: 0, borders: false, center: true });
}

function identitas(doc, ctx, media) {
  const id = doc.identitas;
  const W = A4.long - 2 * 23.5;
  const rows = [];

  // Kop: logo + nama universitas, fakultas, departemen, prodi.
  const kop =
    para(run(upper(id.universitas), { bold: true, size: 17 }), { size: 17, before: tw(1.5) }) +
    para(run(upper(id.fakultas), { size: 12 }), { size: 12, before: tw(1) }) +
    para(run(`DEPARTEMEN ${upper(id.departemen)}`.trim(), { size: 10.5 }), { size: 10.5, before: tw(0.8) }) +
    para(run(`PROGRAM STUDI ${upper(id.prodi)}`.trim(), { size: 10.5 }), { size: 10.5, before: tw(0.5) });
  rows.push({
    h: 32, exact: true,
    cells: [
      { w: 31, valign: 'middle', noRight: true, body: para(logo(media, 27, 27), { align: 'center', line: 0 }) },
      { w: W - 31, noLeft: true, body: kop }
    ]
  });
  rows.push({ cells: [tc(W, 'RENCANA PEMBELAJARAN SEMESTER', { bold: true, align: 'center', size: 11 })] });

  const cols = [64.6, 31.4, 49.1, 24.4, 25.8, 28.2];
  cols.push(W - cols.reduce((a, b) => a + b, 0));
  const titles = ['MATA KULIAH', 'KODE', 'RUMPUN MATA KULIAH (RMK)', 'BOBOT (SKS)', 'SEMESTER', 'SIFAT', 'TGL. PENYUSUNAN'];
  rows.push({ header: false, cells: titles.map((t, i) => th(cols[i], t, { size: 8.5 })) });
  const sks = id.sksPraktikum ? `${id.sksTeori}+${id.sksPraktikum}` : String(id.sksTeori ?? '');
  rows.push({
    h: 7,
    cells: [id.mataKuliah, id.kode, id.rmk, sks, id.semester, id.sifat, formatTanggal(id.tglPenyusunan)].map((v, i) => tc(cols[i], v))
  });

  // Otorisasi: ruang kosong di atas nama untuk tanda tangan.
  const oc = [64.6, 61.8, 53.3];
  oc.push(W - oc.reduce((a, b) => a + b, 0));
  rows.push({ cells: ['OTORISASI', 'DOSEN PENGELOLA MATA KULIAH', 'KOORDINATOR PENGELOLA/RMK', 'KETUA PROGRAM STUDI'].map((t, i) => th(oc[i], t, { align: i ? 'center' : 'left' })) });
  rows.push({
    h: 26,
    cells: [
      tc(oc[0], ''),
      { w: oc[1], body: itemParas(id.dosenPengelola.map((t) => ({ text: t }))) },
      tc(oc[2], id.koordinator, { align: 'center', valign: 'bottom' }),
      tc(oc[3], id.kaprodi, { align: 'center', valign: 'bottom' })
    ]
  });

  const LW = 30;
  const IW = W - LW;
  const kodeW = 30;
  const supW = 44;
  const empty = (widths) => ({ h: 6, cells: widths.map((w) => tc(w, '')) });
  const cp = [];
  cp.push({ cells: [th(IW, 'CPL PRODI')] });
  for (const c of doc.cpl) cp.push({ cells: [tc(kodeW, c.kode, { align: 'center' }), tc(IW - kodeW, c.teks)] });
  if (!doc.cpl.length) cp.push(empty([kodeW, IW - kodeW]));
  cp.push({ cells: [th(IW - supW, 'CPMK'), th(supW, 'Support CP')] });
  for (const c of doc.cpmk) {
    const sup = c.cpl.map((x) => ctx.cpl.get(x)?.kode).filter(Boolean).join(', ');
    cp.push({ cells: [tc(kodeW, c.kode, { align: 'center' }), tc(IW - kodeW - supW, c.teks), tc(supW, sup, { align: 'center' })] });
  }
  if (!doc.cpmk.length) cp.push(empty([kodeW, IW - kodeW - supW, supW]));
  cp.push({ cells: [th(IW - supW, 'Sub-CPMK'), th(supW, 'Support CPMK')] });
  for (const s of doc.subCpmk) {
    cp.push({ cells: [tc(kodeW, s.kode, { align: 'center' }), tc(IW - kodeW - supW, s.teks), tc(supW, ctx.cpmk.get(s.cpmk)?.kode ?? '', { align: 'center' })] });
  }
  if (!doc.subCpmk.length) cp.push(empty([kodeW, IW - kodeW - supW, supW]));
  rows.push(...grouped('CAPAIAN PEMBELAJARAN', LW, cp, { align: 'center' }));

  const labelled = (label, key) => ({ h: 7, cells: [th(LW, label), tc(IW, id[key])] });
  rows.push(labelled('DESKRIPSI SINGKAT MK', 'deskripsi'), labelled('MATERI PEMBELAJARAN/ POKOK BAHASAN', 'materi'));

  const pw = 34.6;
  const pustaka = [['utama', 'UTAMA'], ['pendukung', 'PENDUKUNG']].map(([jenis, judul]) => {
    const list = ctx.pustakaUrut.filter((p) => (p.jenis === 'utama') === (jenis === 'utama'));
    return { h: 6, cells: [tc(pw, judul, { bold: true }), { w: IW - pw, body: itemParas(list.map((p) => ({ prefix: `${ctx.nomorPustaka.get(p.id)}. `, text: p.teks }))) }] };
  });
  rows.push(...grouped('PUSTAKA', LW, pustaka));

  rows.push(...grouped('MEDIA PEMBELAJARAN', LW, [
    { cells: [th(IW - supW, 'PERANGKAT LUNAK:'), th(supW, 'PERANGKAT KERAS:')] },
    { h: 6, cells: [tc(IW - supW, id.mediaLunak), tc(supW, id.mediaKeras)] }
  ]));
  rows.push(labelled('PENGALAMAN BELAJAR (LEARNING EXPERIENCE)', 'pengalamanBelajar'));
  rows.push({ h: 7, cells: [th(LW, 'TIM DOSEN PENGAMPU'), { w: IW, body: itemParas(id.timDosen.map((t, i) => ({ prefix: `${i + 1}. `, text: t }))) }] });
  rows.push(labelled('PRASYARAT (MATA KULIAH/ SKS)', 'prasyarat'));
  return table(rows);
}

/** Judul bagian (mis. "A. MATRIKS …") yang tetap bersama awal tabelnya. */
const heading = (title, before = 6) => para(run(title, { bold: true, size: S }), { size: S, before: tw(before), after: tw(0.6), keepNext: true });

function matriks(doc, ctx) {
  const W = A4.long - 2 * 23.5;
  const hd = (t, w) => th(w, t, { align: 'center', valign: 'middle' });
  const v = (t, w, extra = {}) => tc(w, t, { align: 'center', valign: 'middle', ...extra });
  const out = [];

  out.push(heading('A. MATRIKS PEMETAAN BOBOT CPMK-CPL'));
  {
    const cplW = Math.min(22, (W - 70) / Math.max(1, doc.cpl.length));
    const rows = [{ header: true, cells: [hd('CPMK', 25), hd('Sub-CPMK', 45), ...doc.cpl.map((c) => hd(c.kode, cplW))] }];
    const groups = [
      ...doc.cpmk.map((c) => ({ cpmk: c, subs: doc.subCpmk.filter((s) => s.cpmk === c.id) })),
      { cpmk: null, subs: doc.subCpmk.filter((s) => !ctx.cpmk.has(s.cpmk)) }
    ].filter((g) => g.subs.length || g.cpmk);
    for (const g of groups) {
      const subs = g.subs.length ? g.subs : [null];
      rows.push(...grouped(g.cpmk?.kode ?? '–', 25, subs.map((s) => ({
        cells: [v(s?.kode ?? '', 45, { fill: BLUE }), ...doc.cpl.map((c) => v(s && g.cpmk?.cpl.includes(c.id) ? '1' : '', cplW))]
      })), { align: 'center' }));
    }
    out.push(table(rows));
  }

  out.push(heading('B. MATRIKS PENILAIAN TERHADAP SUB-CPMK'));
  {
    const aw = 36;
    const kw = 60;
    const sw = Math.min(34, (W - aw - kw) / Math.max(1, doc.subCpmk.length));
    const rows = [{ header: true, cells: [hd('Asesmen', aw), ...doc.subCpmk.map((s) => hd(s.kode, sw)), hd('Keterangan', kw)] }];
    for (const a of doc.asesmen) {
      const lk = ctx.lkPerAsesmen.get(a.id);
      const ket = richParas(a.keterangan, { align: 'center' }) + (lk ? para(run(`(${lk.join(', ')})`, { bold: true, size: S }), { align: 'center' }) : '');
      rows.push({
        cells: [v(a.kode, aw, { fill: BLUE }), ...doc.subCpmk.map((s) => v(formatAngka(a.porsi[s.id] ?? 0), sw)), { w: kw, valign: 'middle', body: ket }]
      });
    }
    if (!doc.asesmen.length) rows.push({ h: 6, cells: [v('', aw), ...doc.subCpmk.map(() => v('', sw)), v('', kw)] });
    out.push(table(rows));
  }

  out.push(heading('C. MATRIKS PENILAIAN'));
  {
    const c = [36, 30, 34, 25];
    const rows = [{ header: true, cells: [hd('SIAKAD DESKTOP', c[0]), hd('SIM OBE UB', c[1]), hd('VARIABEL/KODE SIM OBE UB', c[2]), hd('Bobot (%)', c[3])] }];
    for (const a of doc.asesmen) {
      rows.push({ cells: [v(a.siakad, c[0], { fill: BLUE }), v(a.obe, c[1]), v(a.kode, c[2]), v(formatAngka(a.bobot), c[3], { bold: true })] });
    }
    const total = doc.asesmen.reduce((s, a) => s + (a.bobot ?? 0), 0);
    rows.push({ cells: [v('Total', c[0] + c[1] + c[2], { bold: true, fill: BLUE }), v(formatAngka(Math.round(total * 100) / 100), c[3], { bold: true })] });
    out.push(table(rows));
  }
  return out.join('');
}

const PERTEMUAN_COLS = [20, 24.5, 40.1, 39.4, 24.8, 27, 55.8, 18.4];

function pertemuan(doc, ctx) {
  const C = PERTEMUAN_COLS;
  const h = (w, t, extra = {}) => tc(w, t, { size: 8, bold: true, align: 'center', valign: 'middle', fill: BLUE, ...extra });
  const cont = (w) => ({ w, vMerge: 'continue', fill: BLUE });
  const rows = [
    {
      header: true, h: 9, exact: true,
      cells: [
        h(C[0], 'PEKAN KE-', { vMerge: 'restart' }), h(C[1], 'KODE SUB-CPMK', { vMerge: 'restart' }),
        h(C[2] + C[3], 'PENILAIAN'), h(C[4] + C[5], 'DESAIN PEMBELAJARAN'),
        h(C[6], 'MATERI PEMBELAJARAN / BAHAN KAJIAN [PUSTAKA]', { vMerge: 'restart' }), h(C[7], 'BOBOT', { vMerge: 'restart' })
      ]
    },
    {
      header: true, h: 10, exact: true,
      cells: [cont(C[0]), cont(C[1]), h(C[2], 'INDIKATOR'), h(C[3], 'KRITERIA & BENTUK PENILAIAN'), h(C[4], 'METODE'), h(C[5], 'WAKTU (DURASI)'), cont(C[6]), cont(C[7])]
    },
    { header: true, h: 5, exact: true, cells: C.map((w, i) => h(w, `(${i + 1})`, { bold: false, fill: null })) }
  ];

  if (!doc.pertemuan.length) rows.push({ h: 12, cells: C.map((w) => tc(w, '', { size: TS })) });
  for (const p of doc.pertemuan) {
    const fill = p.jenis === 'praktikum' ? YELLOW : null;
    const base = { size: TS, fill };
    const nomor = p.pustaka.map((x) => ctx.nomorPustaka.get(x)).filter(Boolean);
    const lead = (t) => run(`${t}: `, { bold: true, size: TS });
    const kriteria = richParas(p.kriteria, { size: TS, lead: lead('Kriteria') }) + para('', { size: TS }) + richParas(p.bentuk, { size: TS, lead: lead('Bentuk') });
    const metode = p.metode.length > 1 ? itemParas(p.metode.map((m) => ({ prefix: '• ', text: m })), { size: TS }) : richParas(p.metode[0] ?? '', { size: TS });
    const materi = richParas(p.materi, { size: TS }) + (nomor.length ? para(run(`[${nomor.join(', ')}]`, { size: TS }), { size: TS }) : '');
    rows.push({
      h: 10,
      cells: [
        tc(C[0], ctx.labelPekan.get(p.id), { ...base, align: 'center', valign: 'middle' }),
        tc(C[1], p.subCpmk.map((s) => ctx.sub.get(s)?.kode).filter(Boolean).join('\n'), { ...base, align: 'center', valign: 'middle' }),
        tc(C[2], p.indikator, base),
        { w: C[3], fill, body: kriteria },
        { w: C[4], fill, body: metode },
        tc(C[5], p.waktu, base),
        { w: C[6], fill, body: materi },
        tc(C[7], formatAngka(p.bobot), base)
      ]
    });
  }
  return para(run('D. TABEL RENCANA MATERI PER PERTEMUAN', { bold: true, size: S }), { size: S, after: tw(0.6), keepNext: true }) + table(rows);
}

function lembarKerja(doc, ctx, lk, media) {
  const id = doc.identitas;
  const W = A4.short - 2 * 27.5;
  const LW = 32;
  const LS = 9.5;
  const P = 1.6;
  const rows = [];
  const kop = [upper(id.universitas), upper(id.fakultas), `DEPARTEMEN ${upper(id.departemen)}`.trim(), `PROGRAM STUDI ${upper(id.prodi)}`.trim()];
  rows.push({
    h: 33, exact: true,
    cells: [
      { w: LW, valign: 'middle', body: para(logo(media, LW - 6, 27), { align: 'center', line: 0 }) },
      { w: W - LW, valign: 'middle', body: kop.map((t) => para(run(t, { bold: true, size: 13 }), { size: 13, align: 'center' })).join('') }
    ]
  });
  rows.push({ cells: [tc(W, 'LEMBAR KERJA', { bold: true, align: 'center', size: 11 })] });
  const label = (t) => tc(LW, t, { bold: true, fill: GRAY, size: 8.5 });
  const value = (t, extra = {}) => tc(W - LW, t, { size: LS, ...extra });
  const semester = `${id.semester.charAt(0)}${id.semester.slice(1).toLowerCase()} ${id.tahunAkademik}`.trim();
  rows.push(
    { h: 7, cells: [label('MATA KULIAH'), value(id.mataKuliah, { bold: true })] },
    { h: 7, cells: [label('KODE MATA KULIAH'), value(id.kode)] },
    { h: 7, cells: [label('JUDUL LEMBAR KERJA'), value(lk.judul)] },
    { h: 7, cells: [label('KODE LEMBAR KERJA'), value(lk.kode)] },
    { h: 7, cells: [label('SEMESTER'), value(semester)] },
    { h: 7, cells: [label('DOSEN PENGAMPU'), { w: W - LW, body: itemParas(id.timDosen.map((t, i) => ({ prefix: `${i + 1}. `, text: t })), { size: LS }) }] }
  );
  const subs = lk.subCpmk.map((s) => ctx.sub.get(s)?.kode).filter(Boolean);
  const sections = [
    ['BENTUK AKTIVITAS', 'bentukAktivitas'],
    ['SUB CAPAIAN PEMBELAJARAN MATA KULIAH', null],
    ['DESKRIPSI AKTIVITAS MAHASISWA', 'deskripsi'],
    ['METODE PENGERJAAN AKTIVITAS', 'metode'],
    ['BENTUK DAN FORMAT LUARAN', 'luaran'],
    ['INDIKATOR DAN KRITERIA PENYELESAIAN', 'indikator'],
    ['JADWAL PELAKSANAAN', 'jadwal'],
    ['LAIN-LAIN', 'lainLain'],
    ['DAFTAR RUJUKAN', 'rujukan']
  ];
  for (const [title, key] of sections) {
    rows.push({ h: 7, cells: [{ ...tc(W, title, { bold: true, fill: GRAY, size: 8.5 }), body: para(run(title, { bold: true, size: 8.5 }), { size: 8.5, keepNext: true }) }] });
    rows.push({ h: 7, cells: [tc(W, key ? lk[key] : joinDan(subs), { size: LS })] });
  }
  return table(rows, { pad: P });
}

// ---------------------------------------------------------------------------
// Paket DOCX
// ---------------------------------------------------------------------------

const NS =
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' +
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
  'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" ' +
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
  'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';
const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

/** Properti bagian: ukuran dan orientasi halaman serta margin (mm), sama dengan Flow di layout.js. */
function sectPr(landscape, { top, bottom, x }) {
  const [w, h] = landscape ? [A4.long, A4.short] : [A4.short, A4.long];
  return (
    `<w:sectPr><w:pgSz w:w="${tw(w)}" w:h="${tw(h)}"${landscape ? ' w:orient="landscape"' : ''}/>` +
    `<w:pgMar w:top="${tw(top)}" w:right="${tw(x)}" w:bottom="${tw(bottom)}" w:left="${tw(x)}" w:header="0" w:footer="0" w:gutter="0"/></w:sectPr>`
  );
}
const COVER = [false, { top: 32, bottom: 20, x: 30 }];
const WIDE = [true, { top: 22, bottom: 14, x: 23.5 }];
const LK = [false, { top: 25, bottom: 20, x: 27.5 }];

// Paragraf sekecil mungkin (1 pt): pemisah antartabel dan pembawa akhir bagian, agar tidak menambah halaman kosong.
const tiny = (sect = '', content = '') =>
  `<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="20" w:lineRule="exact"/><w:rPr><w:sz w:val="2"/></w:rPr>${sect}</w:pPr>${content}</w:p>`;

export async function exportDocx(doc) {
  drawingId = 0;
  const media = new Media();
  const ctx = derive(doc);

  const body = [];
  body.push(cover(doc, media), tiny(sectPr(...COVER)));
  body.push(identitas(doc, ctx, media), matriks(doc, ctx), tiny(sectPr(...WIDE)));
  body.push(pertemuan(doc, ctx));
  let last = WIDE;
  if (doc.lembarKerja.length) {
    body.push(tiny(sectPr(...WIDE)));
    doc.lembarKerja.forEach((lk, i) => {
      if (i) body.push(tiny('', '<w:r><w:br w:type="page"/></w:r>'));
      body.push(lembarKerja(doc, ctx, lk, media));
    });
    last = LK;
  }
  // Bagian terakhir dibawa oleh <w:sectPr> di akhir body; sebelumnya perlu paragraf agar tabel tidak menempel.
  const document = `${XML}<w:document ${NS}><w:body>${body.join('')}${tiny()}${sectPr(...last)}</w:body></w:document>`;

  const styles =
    `${XML}<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults>` +
    `<w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Calibri" w:cs="Calibri"/>` +
    `<w:sz w:val="${S * 2}"/><w:szCs w:val="${S * 2}"/><w:lang w:val="id-ID"/></w:rPr></w:rPrDefault>` +
    `<w:pPrDefault><w:pPr><w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>` +
    `<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>` +
    `<w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/>` +
    `<w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>` +
    `</w:styles>`;
  const settings =
    `${XML}<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:defaultTabStop w:val="720"/>` +
    `<w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat></w:settings>`;

  const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  const files = {
    '[Content_Types].xml': strToU8(
      `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
      `<Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/>` +
      `<Default Extension="jpeg" ContentType="image/jpeg"/><Default Extension="rps" ContentType="application/json"/>` +
      `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
      `<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>` +
      `<Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>` +
      `<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`
    ),
    '_rels/.rels': strToU8(
      `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>` +
      `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>` +
      `<Relationship Id="rId3" Type="${DATA_REL}" Target="${DATA_PART}"/></Relationships>`
    ),
    'docProps/core.xml': strToU8(officeCoreXml(doc, now)),
    'word/_rels/document.xml.rels': strToU8(
      `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
      `<Relationship Id="rIdSettings" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>` +
      `${media.rels.join('')}</Relationships>`
    ),
    'word/document.xml': strToU8(document),
    'word/styles.xml': strToU8(styles),
    'word/settings.xml': strToU8(settings),
    [DATA_PART]: strToU8(JSON.stringify(doc)),
    ...media.files
  };
  const zip = zipSync(files, { level: 6 });
  return new Blob([zip], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}
