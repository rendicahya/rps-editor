/** Urutan daftar di dialog Pustaka (Lokal dan Daring sama), diingat per browser. */
const KEY = 'rps-editor.librarySort';

export const SORTS = [
  ['updated-desc', 'Terakhir diubah'],
  ['updated-asc', 'Paling lama diubah'],
  ['name-asc', 'Nama (A–Z)'],
  ['name-desc', 'Nama (Z–A)']
];

let initial = 'updated-desc';
try {
  const v = localStorage.getItem(KEY);
  if (SORTS.some(([k]) => k === v)) initial = v;
} catch {
  /* tidak apa-apa: pakai urutan bawaan */
}

export const librarySort = $state({ by: initial });

export function setSort(by) {
  librarySort.by = by;
  try {
    localStorage.setItem(KEY, by);
  } catch {
    /* tidak apa-apa: urutan hanya tidak diingat */
  }
}

const collator = new Intl.Collator('id', { numeric: true, sensitivity: 'base' });

/** Salinan `list` yang sudah diurutkan. name(x): teks nama, time(x): waktu terakhir diubah (ms). */
export function sorted(list, by, name, time) {
  const dir = by.endsWith('-asc') ? 1 : -1;
  const byName = (a, b) => collator.compare(name(a), name(b));
  const cmp = by.startsWith('name')
    ? (a, b) => dir * byName(a, b) || time(b) - time(a)
    : (a, b) => dir * (time(a) - time(b)) || byName(a, b);
  return [...list].sort(cmp);
}
