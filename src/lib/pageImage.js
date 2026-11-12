// Halaman tata letak sebagai gambar (canvas, latar putih), untuk PDF "Gambar" yang teksnya tidak bisa diseleksi.
// Primitifnya sama dengan pratinjau dan PDF; teks memakai font dokumen (FontFace "SOPDoc", lihat fonts.js).
import { baseline, PT } from './layout.js';

export const FONT = 'SOPDoc, Calibri, Carlito, sans-serif';

const loadImage = (src) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Gambar di dokumen gagal dimuat.'));
    img.src = src;
  });

/** Menunggu font dokumen siap dipakai canvas. */
export const loadDocFonts = () => Promise.all([document.fonts.load(`400 12px SOPDoc`), document.fonts.load(`700 12px SOPDoc`)]);

/** Satu halaman sebagai canvas; `images` = cache src → HTMLImageElement. */
export async function renderPage(page, images, dpi = 200) {
  const S = dpi / 25.4;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(page.w * S);
  canvas.height = Math.round(page.h * S);
  const g = canvas.getContext('2d');
  g.fillStyle = '#fff';
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.lineJoin = 'miter';

  // Sama dengan style() di pdf.js: berisi tanpa garis → isi saja; selain itu bergaris (bawaan hitam).
  const paint = (it) => {
    if (it.fill) {
      g.fillStyle = it.fill;
      g.fill();
      if (!it.stroke) return;
    }
    g.strokeStyle = it.stroke ?? '#000';
    g.lineWidth = (it.lw ?? 0.25) * S;
    g.stroke();
  };
  const font = (it, r = {}) => {
    g.font = `${r.i || it.italic ? 'italic ' : ''}${r.b || it.bold ? 700 : 400} ${it.size * PT * S}px ${FONT}`;
  };

  for (const it of page.items) {
    if (it.t === 'rect') {
      g.beginPath();
      if (it.r && g.roundRect) g.roundRect(it.x * S, it.y * S, it.w * S, it.h * S, it.r * S);
      else g.rect(it.x * S, it.y * S, it.w * S, it.h * S);
      paint(it);
    } else if (it.t === 'poly') {
      g.beginPath();
      it.pts.forEach(([x, y], k) => (k ? g.lineTo(x * S, y * S) : g.moveTo(x * S, y * S)));
      if (it.closed) g.closePath();
      paint(it.closed ? it : { ...it, fill: null });
    } else if (it.t === 'circle') {
      g.beginPath();
      g.arc(it.cx * S, it.cy * S, it.r * S, 0, 2 * Math.PI);
      paint(it);
    } else if (it.t === 'image') {
      if (!images.has(it.src)) images.set(it.src, await loadImage(it.src));
      g.drawImage(images.get(it.src), it.x * S, it.y * S, it.w * S, it.h * S);
    } else if (it.t === 'text') {
      g.fillStyle = it.color ?? '#000';
      g.textBaseline = 'alphabetic';
      it.lines.forEach((line, j) => {
        const y = baseline(it, j) * S;
        if (typeof line === 'string') {
          font(it);
          g.textAlign = it.align ?? 'left';
          g.fillText(line, it.x * S, y);
          return;
        }
        // Baris berformat: run demi run, dengan garis bawah seperti di PDF.
        g.textAlign = 'left';
        const widths = line.map((r) => (font(it, r), g.measureText(r.text).width));
        const total = widths.reduce((a, w) => a + w, 0);
        let x = it.align === 'center' ? it.x * S - total / 2 : it.align === 'right' ? it.x * S - total : (it.x + (line.indent ?? 0)) * S;
        line.forEach((r, k) => {
          font(it, r);
          g.fillText(r.text, x, y);
          if (r.u) g.fillRect(x, y + (it.size * PT * 0.13 - it.size * PT * 0.03) * S, widths[k], Math.max(1, it.size * PT * 0.06 * S));
          x += widths[k];
        });
      });
    }
  }
  return canvas;
}
