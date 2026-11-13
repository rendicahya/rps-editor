// Isian bawaan untuk RPS baru (nama universitas dan fakultas). Admin mengaturnya di Admin › Bawaan RPS baru;
// nilainya disimpan di Firestore `config/rps`, diikuti secara langsung, dan disimpan juga di browser agar tetap
// berlaku saat luring. Sengaja tidak ada nilai yang ditulis di kode: sebelum admin mengaturnya, semuanya kosong.
import { DEFAULTS_KEY, setDocDefaults } from './model.js';

const EMPTY = Object.freeze({ universitas: '', fakultas: '' });

/** Kunci yang bisa diatur admin, beserta label, contoh, dan batas panjangnya (sama dengan validRpsDefaults di firestore.rules). */
export const DEFAULT_FIELDS = [
  ['universitas', 'Universitas', 'mis. UNIVERSITAS BRAWIJAYA', 200],
  ['fakultas', 'Fakultas', 'mis. FAKULTAS ILMU KOMPUTER', 200]
];

function cached() {
  try {
    const c = JSON.parse(localStorage.getItem(DEFAULTS_KEY) ?? 'null');
    return c && typeof c === 'object' ? c : null;
  } catch {
    return null;
  }
}

/** Hanya kunci yang dikenal dan bertipe teks; sisanya kosong. */
function clean(d) {
  const out = { ...EMPTY };
  for (const [k, , , max] of DEFAULT_FIELDS) if (typeof d?.[k] === 'string') out[k] = d[k].slice(0, max);
  return out;
}

// Nilai yang berlaku sekarang (reaktif). meta: siapa dan kapan terakhir diubah admin (0 = belum pernah).
export const DEFAULTS = $state(clean(cached()));
/** Ada isian bawaan yang terisi. */
export const hasDefaults = () => Object.values(DEFAULTS).some(Boolean);

export const defaultsMeta = $state({ custom: !!cached(), updatedAt: cached()?.updatedAt ?? 0, updatedByName: cached()?.updatedByName ?? '' });

/** Menerapkan konfigurasi dari server (null = admin belum pernah mengatur; semua kosong). */
export function applyDefaults(d) {
  Object.assign(DEFAULTS, clean(d));
  Object.assign(defaultsMeta, { custom: !!d, updatedAt: d?.updatedAt ?? 0, updatedByName: d?.updatedByName ?? '' });
  setDocDefaults(clean(d));
  try {
    if (d) localStorage.setItem(DEFAULTS_KEY, JSON.stringify({ ...clean(d), updatedAt: defaultsMeta.updatedAt, updatedByName: defaultsMeta.updatedByName }));
    else localStorage.removeItem(DEFAULTS_KEY);
  } catch {}
}
