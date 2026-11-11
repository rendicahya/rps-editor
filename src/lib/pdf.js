import { jsPDF } from 'jspdf';
import { layoutDocument, baseline, PT } from './layout.js';
import { pdfFont, registerFonts } from './fonts.js';
import { zlibSync, unzlibSync, strToU8, strFromU8 } from 'fflate';
import { slug } from './files.js';
import { docTitle } from './model.js';

const orientation = (page) => (page.w > page.h ? 'landscape' : 'portrait');

export function exportPdf(doc) {
  const pages = layoutDocument(doc);
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: orientation(pages[0]), compress: true });
  pdf.setProperties({ title: `RPS ${docTitle(doc)}`.trim(), creator: 'RPS Editor' });
  pdf.setLineJoin('miter');
  registerFonts(pdf);

  pages.forEach((page, i) => {
    if (i > 0) pdf.addPage('a4', orientation(page));
    for (const it of page.items) drawItem(pdf, it);
  });
  attachRps(pdf, doc);
  return pdf;
}

// Data RPS disisipkan sebagai lampiran PDF (embedded file, dikompres Flate) agar PDF ini bisa dibuka & diedit lagi.
// Penanda /RPSEditor pada kamus stream dipakai saat membaca kembali (lihat rpsFromPdf).
function attachRps(pdf, doc) {
  const json = JSON.stringify(doc);
  const raw = strToU8(json);
  const z = zlibSync(raw, { level: 9 });
  let bin = '';
  for (let i = 0; i < z.length; i += 0x8000) bin += String.fromCharCode.apply(null, z.subarray(i, i + 0x8000));
  const name = (slug(docTitle(doc)).normalize('NFKD').replace(/[^A-Za-z0-9-]/g, '') || 'dokumen') + '.rps';
  let fileSpec;
  pdf.internal.events.subscribe('postPutResources', function () {
    const ef = this.internal.newObject();
    this.internal.out(
      `<< /Type /EmbeddedFile /Subtype /application#2Fjson /RPSEditor 1 /Filter /FlateDecode /Length ${z.length} /Params << /Size ${raw.length} >> >>`
    );
    this.internal.out('stream');
    this.internal.out(bin);
    this.internal.out('endstream');
    this.internal.out('endobj');
    fileSpec = this.internal.newObject();
    this.internal.out(
      `<< /Type /Filespec /F (${name}) /UF (${name}) /Desc (Data RPS Editor) /AFRelationship /Source /EF << /F ${ef} 0 R >> >>`
    );
    this.internal.out('endobj');
  });
  pdf.internal.events.subscribe('putCatalog', function () {
    this.internal.out(`/Names << /EmbeddedFiles << /Names [(${name}) ${fileSpec} 0 R] >> >>`);
    this.internal.out(`/AF [${fileSpec} 0 R]`);
  });
}

/** Mengambil JSON RPS dari PDF hasil ekspor app ini; null bila tidak ada. */
export function rpsFromPdf(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  const at = s.lastIndexOf('/RPSEditor 1');
  if (at < 0) return null;
  const dictStart = s.lastIndexOf('<<', at);
  const m = /\/Length (\d+)/.exec(s.slice(dictStart, s.indexOf('stream', at)));
  if (!m) return null;
  let p = s.indexOf('stream', at) + 6;
  if (s[p] === '\r') p++;
  if (s[p] === '\n') p++;
  try {
    return strFromU8(unzlibSync(bytes.subarray(p, p + Number(m[1]))));
  } catch {
    return null;
  }
}

function style(pdf, it) {
  pdf.setLineWidth(it.lw ?? 0.25);
  pdf.setDrawColor(it.stroke ?? '#000000');
  if (it.fill) pdf.setFillColor(it.fill);
  return it.fill ? (it.stroke ? 'FD' : 'F') : 'S';
}

function drawItem(pdf, it) {
  switch (it.t) {
    case 'rect': {
      const st = style(pdf, it);
      if (it.r) pdf.roundedRect(it.x, it.y, it.w, it.h, it.r, it.r, st);
      else pdf.rect(it.x, it.y, it.w, it.h, st);
      break;
    }
    case 'poly': {
      const st = style(pdf, it);
      const [x0, y0] = it.pts[0];
      const deltas = [];
      for (let i = 1; i < it.pts.length; i++) {
        deltas.push([it.pts[i][0] - it.pts[i - 1][0], it.pts[i][1] - it.pts[i - 1][1]]);
      }
      pdf.lines(deltas, x0, y0, [1, 1], it.closed ? st : 'S', !!it.closed);
      break;
    }
    case 'circle':
      pdf.circle(it.cx, it.cy, it.r, style(pdf, it));
      break;
    case 'text':
      pdf.setFont(pdfFont(), it.bold ? 'bold' : 'normal');
      pdf.setFontSize(it.size);
      pdf.setTextColor(it.color ?? '#000000');
      it.lines.forEach((line, i) => {
        const y = baseline(it, i);
        if (typeof line === 'string') pdf.text(line, it.x, y, { align: it.align ?? 'left', ...(it.italic && { angle: oblique(pdf, y) }) });
        else richLine(pdf, it, line, y);
      });
      break;
    case 'image': {
      const fmt = it.src.startsWith('data:image/jpeg') ? 'JPEG' : 'PNG';
      pdf.addImage(it.src, fmt, it.x, it.y, it.w, it.h, undefined, 'FAST');
      break;
    }
  }
}

/** Satu baris berformat: tiap run ditulis berurutan dengan fontnya sendiri. */
function richLine(pdf, it, runs, y) {
  const font = (r) => {
    pdf.setFont(pdfFont(), r.b || it.bold ? 'bold' : 'normal');
    pdf.setFontSize(it.size);
  };
  const widths = runs.map((r) => (font(r), pdf.getTextWidth(r.text)));
  const total = widths.reduce((a, w) => a + w, 0);
  let x = it.align === 'center' ? it.x - total / 2 : it.align === 'right' ? it.x - total : it.x + (runs.indent ?? 0);
  runs.forEach((r, k) => {
    font(r);
    pdf.text(r.text, x, y, r.i || it.italic ? { angle: oblique(pdf, y) } : {});
    if (r.u) {
      // Posisi dan tebal garis bawah mengikuti metrik Calibri.
      const uy = y + it.size * PT * 0.13;
      pdf.setDrawColor(it.color ?? '#000000');
      pdf.setLineWidth(it.size * PT * 0.06);
      pdf.line(x, uy, x + widths[k], uy);
    }
    x += widths[k];
  });
}

// Miring tiruan (tanpa file font italic), sudut sama dengan italic sintetis browser di pratinjau.
// jsPDF ikut memiringkan posisi teks, jadi geser balik sebesar kemiringan pada baseline-nya.
const SLANT = 0.25;
function oblique(pdf, y) {
  const k = pdf.internal.scaleFactor;
  return new pdf.Matrix(1, 0, SLANT, 1, -SLANT * (pdf.internal.pageSize.getHeight() - y) * k, 0);
}
