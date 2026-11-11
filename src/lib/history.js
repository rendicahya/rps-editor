// Penghubung riwayat undo milik App untuk komponen isian (App mendaftarkan penanganannya).
const handlers = { checkpoint: () => {}, undo: () => {}, redo: () => {} };

export const connectHistory = (h) => Object.assign(handlers, h);

/** Tutup langkah undo yang sedang berjalan: perubahan berikutnya menjadi langkah tersendiri. */
export const checkpoint = () => handlers.checkpoint();
export const undo = () => handlers.undo();
export const redo = () => handlers.redo();

/** Jalankan `fn` sebagai satu langkah undo, terpisah dari ketikan sebelum dan sesudahnya. */
export function asStep(fn) {
  checkpoint();
  const r = fn();
  checkpoint();
  return r;
}
