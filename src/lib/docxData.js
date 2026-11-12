// Data RPS (JSON) di dalam paket DOCX hasil ekspor, agar berkas Word bisa dibuka lagi di RPS Editor.
// Terpisah dari docx.js supaya membuka/mengimpor DOCX tidak ikut memuat kode ekspor Word.
import { unzipSync, strFromU8 } from 'fflate';

export const DATA_PART = 'rps-editor/data.rps';
export const DATA_REL = 'https://rendicahya.github.io/rps-editor/relationships/data';

/** Mengambil JSON RPS dari DOCX hasil ekspor app ini; null bila tidak ada (atau bukan berkas ZIP). */
export function rpsFromDocx(bytes) {
  try {
    const files = unzipSync(bytes, { filter: (f) => f.name === DATA_PART });
    return files[DATA_PART] ? strFromU8(files[DATA_PART]) : null;
  } catch {
    return null;
  }
}
