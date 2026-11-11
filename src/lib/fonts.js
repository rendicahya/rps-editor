// Font dokumen RPS: wajib Calibri. Calibri tidak boleh disebarkan bersama aplikasi, jadi diambil
// dari perangkat pengguna (Local Font Access API atau file .ttf yang dipilih) lalu disimpan di
// IndexedDB browser ini. Selama Calibri belum tersedia dipakai Carlito (OFL, metrik identik),
// sehingga tata letak tidak berubah saat font diganti.
// Font yang sama dipakai jsPDF (ukur teks & ekspor) dan pratinjau SVG (lewat FontFace).

// Nama keluarga untuk CSS/SVG; di PDF font didaftarkan dengan nama aslinya (pdfFont()).
const FACE = 'SOPDoc';
const CARLITO = { normal: 'Carlito-Regular.ttf', bold: 'Carlito-Bold.ttf' };
const WEIGHT = { normal: '400', bold: '700' };

let data = null; // { normal: base64, bold: base64 }
let source = 'carlito';
let faces = [];
let revision = 0;

/** 'calibri' bila Calibri asli terpakai, selain itu 'carlito'. */
export const fontSource = () => source;
/** Nama font dokumen di jsPDF (juga BaseFont di berkas PDF). */
export const pdfFont = () => (source === 'calibri' ? 'Calibri' : 'Carlito');
/** Bertambah setiap font dokumen diganti (pengukur teks perlu dibuat ulang). */
export const fontRevision = () => revision;

/** Set data font langsung (base64 per gaya) — dipakai saat tidak ada fetch, mis. di Node. */
export function setFontData(d) {
  data = d;
  revision++;
}

export async function loadFonts(baseUrl) {
  const calibri = (await readStored().catch(() => null)) ?? (await fromLocalFonts(false).catch(() => null));
  if (calibri) return apply(calibri, 'calibri');
  const entries = await Promise.all(
    Object.entries(CARLITO).map(async ([style, file]) => {
      const res = await fetch(`${baseUrl}fonts/${file}`);
      if (!res.ok) throw new Error(`Font ${file} gagal dimuat (${res.status}).`);
      return [style, await res.arrayBuffer()];
    })
  );
  await apply(Object.fromEntries(entries), 'carlito');
}

/** Ambil Calibri dari font terpasang di perangkat (harus dipanggil dari klik pengguna). */
export async function useSystemCalibri() {
  const fonts = await fromLocalFonts(true);
  if (!fonts) throw new Error('Calibri (Regular dan Bold) tidak ditemukan di perangkat ini.');
  await apply(fonts, 'calibri');
  await store(fonts).catch(() => {});
}

/** Pakai file Calibri yang dipilih pengguna (calibri.ttf dan calibrib.ttf). */
export async function useCalibriFiles(files) {
  const fonts = {};
  for (const file of files) {
    const buf = await file.arrayBuffer();
    const name = fontNames(buf);
    if (name?.family !== 'Calibri') continue;
    if (name.style === 'Regular') fonts.normal = buf;
    if (name.style === 'Bold') fonts.bold = buf;
  }
  const missing = [!fonts.normal && 'Calibri Regular (calibri.ttf)', !fonts.bold && 'Calibri Bold (calibrib.ttf)'].filter(Boolean);
  if (missing.length) throw new Error('File yang dipilih tidak memuat ' + missing.join(' dan ') + '.');
  await apply(fonts, 'calibri');
  await store(fonts).catch(() => {});
}

export function registerFonts(pdf) {
  if (!data) throw new Error('Font dokumen belum dimuat.');
  for (const style of Object.keys(WEIGHT)) {
    const file = `${pdfFont()}-${style}.ttf`;
    pdf.addFileToVFS(file, data[style]);
    pdf.addFont(file, pdfFont(), style);
  }
}

async function apply(buffers, src) {
  if (typeof FontFace !== 'undefined') {
    const next = Object.entries(WEIGHT).map(([style, weight]) => new FontFace(FACE, buffers[style], { weight }));
    await Promise.all(next.map((f) => f.load()));
    for (const f of faces) document.fonts.delete(f);
    for (const f of next) document.fonts.add(f);
    faces = next;
  }
  data = { normal: toBase64(buffers.normal), bold: toBase64(buffers.bold) };
  source = src;
  revision++;
}

async function fromLocalFonts(ask) {
  if (typeof window === 'undefined' || !('queryLocalFonts' in window)) return null;
  if (!ask) {
    const perm = await navigator.permissions?.query({ name: 'local-fonts' }).catch(() => null);
    if (perm?.state !== 'granted') return null;
  }
  const list = await window.queryLocalFonts({ postscriptNames: ['Calibri', 'Calibri-Bold'] });
  const pick = (ps) => list.find((f) => f.postscriptName === ps);
  const regular = pick('Calibri');
  const bold = pick('Calibri-Bold');
  if (!regular || !bold) return null;
  return { normal: await (await regular.blob()).arrayBuffer(), bold: await (await bold.blob()).arrayBuffer() };
}

/** Nama keluarga & gaya (name ID 1 dan 2) dari file TrueType/OpenType; null bila bukan font. */
function fontNames(buf) {
  try {
    const v = new DataView(buf);
    const tables = v.getUint16(4);
    for (let i = 0; i < tables; i++) {
      const rec = 12 + i * 16;
      if (String.fromCharCode(...new Uint8Array(buf, rec, 4)) !== 'name') continue;
      const base = v.getUint32(rec + 8);
      const count = v.getUint16(base + 2);
      const strings = base + v.getUint16(base + 4);
      const out = {};
      for (let j = 0; j < count; j++) {
        const r = base + 6 + j * 12;
        const platform = v.getUint16(r);
        const id = v.getUint16(r + 6);
        if ((id !== 1 && id !== 2) || (platform !== 3 && platform !== 1)) continue;
        const bytes = new Uint8Array(buf, strings + v.getUint16(r + 10), v.getUint16(r + 8));
        const text = platform === 3 ? new TextDecoder('utf-16be').decode(bytes) : String.fromCharCode(...bytes);
        out[id === 1 ? 'family' : 'style'] ??= text;
      }
      return out;
    }
  } catch {}
  return null;
}

// Penyimpanan Calibri di IndexedDB (hanya di browser pengguna sendiri).
function db() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('sop-editor-fonts', 1); // sengaja sama dengan SOP Editor (origin sama): Calibri cukup dipilih sekali
    req.onupgradeneeded = () => req.result.createObjectStore('fonts');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function readStored() {
  const d = await db();
  return new Promise((resolve, reject) => {
    const req = d.transaction('fonts').objectStore('fonts').get('calibri');
    req.onsuccess = () => resolve(req.result?.normal && req.result?.bold ? req.result : null);
    req.onerror = () => reject(req.error);
  });
}

async function store(fonts) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const tx = d.transaction('fonts', 'readwrite');
    tx.objectStore('fonts').put(fonts, 'calibri');
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

function toBase64(buf) {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
