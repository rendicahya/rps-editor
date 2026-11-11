import { emptyDocument, normalizeDocument, docTitle } from './model.js';

const KEY = 'rps-editor:doc';
const TABS_KEY = 'rps-editor:tabs';

function read(key) {
  try {
    return JSON.parse(localStorage.getItem(key));
  } catch {
    return null; // data rusak atau storage tidak tersedia
  }
}

function valid(raw) {
  try {
    return raw ? normalizeDocument(raw) : null;
  } catch {
    return null;
  }
}

export const newTabId = () => Math.random().toString(36).slice(2, 10);

/**
 * Isi tab yang tidak aktif (di luar state reaktif): id → { json, handle, past, future }.
 * Dokumen tab aktif selalu ada di app.doc.
 */
export const stash = new Map();

// Tab tersimpan: { active, tabs: [{ id, fileName, json }] }; dokumen tab aktif disimpan terpisah di KEY.
const saved = read(TABS_KEY);
const list = [];
for (const t of Array.isArray(saved?.tabs) ? saved.tabs : []) {
  if (!t?.id) continue;
  if (t.id === saved.active) list.push({ id: t.id, title: '', fileName: t.fileName ?? null });
  else {
    const doc = valid(safeParse(t.json));
    if (!doc) continue;
    list.push({ id: t.id, title: docTitle(doc), fileName: t.fileName ?? null });
    stash.set(t.id, { json: JSON.stringify(doc), handle: null, past: [], future: [] });
  }
}
let active = list.find((t) => t.id === saved?.active);
if (!active) list.unshift((active = { id: newTabId(), title: '', fileName: null }));

function safeParse(json) {
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export const app = $state({
  doc: valid(read(KEY)) ?? emptyDocument(),
  /** Handle File System Access API untuk "Simpan" berikutnya tanpa dialog. */
  fileHandle: null,
  fileName: active.fileName,
  /** Nama mata kuliah tidak bisa diubah: dokumen dari Pustaka Daring milik orang lain. */
  nameLocked: false
});

/** Daftar tab (judul tab aktif dibaca langsung dari app.doc). */
export const tabs = $state({ active: active.id, list });

export function persist(json) {
  try {
    localStorage.setItem(KEY, json);
    localStorage.setItem(
      TABS_KEY,
      JSON.stringify({
        active: tabs.active,
        tabs: tabs.list.map((t) =>
          t.id === tabs.active ? { id: t.id, fileName: app.fileName } : { id: t.id, fileName: t.fileName, json: stash.get(t.id)?.json }
        )
      })
    );
  } catch {
    // kuota penuh / mode privat: abaikan, pengguna tetap bisa simpan JSON manual
  }
}

// Keadaan tab browser ini untuk dipulihkan setelah muat ulang. Tersimpan per tab browser, jadi jendela lain
// yang membuka aplikasi tidak menimpanya (berbeda dari localStorage di atas).
const SESSION_KEY = 'rps-editor:session';

export function saveSession(session) {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // Kuota penuh: jangan sampai muat ulang memulihkan keadaan lama.
    try {
      sessionStorage.removeItem(SESSION_KEY);
    } catch {}
  }
}

/** Keadaan yang dipulihkan, atau null bila halaman ini bukan hasil muat ulang (aplikasi baru dibuka). */
export function loadSession() {
  try {
    if (performance.getEntriesByType('navigation')[0]?.type !== 'reload') return null;
    const s = JSON.parse(sessionStorage.getItem(SESSION_KEY));
    const list = [];
    for (const t of s.tabs) {
      const doc = valid(safeParse(t.json));
      if (doc) list.push({ ...t, doc, json: JSON.stringify(doc) });
    }
    return list.some((t) => t.id === s.active) ? { ...s, tabs: list } : null;
  } catch {
    return null;
  }
}
