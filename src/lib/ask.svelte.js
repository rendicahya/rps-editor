// Pengganti alert/confirm/prompt bawaan browser. Ditampilkan oleh AskDialog.svelte yang dipasang sekali di App.
// Setiap fungsi mengembalikan Promise; permintaan yang datang bersamaan ditampilkan bergantian.

export const asks = $state({ queue: [] });

function push(req) {
  return new Promise((resolve) => asks.queue.push({ ...req, resolve }));
}

/** Pesan dengan satu tombol. opts: { title } */
export const alert = (message, opts = {}) => push({ kind: 'alert', message: String(message ?? ''), ...opts });

/** Ya/tidak, hasilnya true atau false. opts: { title, ok, cancel, danger } */
export const confirm = (message, opts = {}) => push({ kind: 'confirm', message, ...opts });

/** Isian satu baris, hasilnya teks atau null bila dibatalkan. opts: { title, ok, type, maxlength } */
export const prompt = (label, value = '', opts = {}) => push({ kind: 'prompt', message: label, value: String(value ?? ''), ...opts });

export function answer(value) {
  const req = asks.queue.shift();
  req?.resolve(value);
}
