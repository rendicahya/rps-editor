// Pustaka Daring: RPS bersama di Firestore. Firebase baru dimuat saat fitur ini dipakai.
// Batasan akses ditegakkan oleh firestore.rules di repositori SOP Editor (proyek Firebase yang sama);
// yang di sini hanya mengikuti aturan itu. Anggota dan grup dipakai bersama SOP Editor, dokumennya terpisah.

/** Koleksi RPS. Kunci `sops`/`folders` dipertahankan karena dipakai sebagai `kind` oleh komponen pustaka. */
const C = {
  sops: 'rps',
  folders: 'rpsFolders',
  editing: 'rpsEditing',
  usage: 'stats/rpsUsage',
  capacity: 'stats/rpsCapacity'
};

const EMULATOR = import.meta.env.VITE_FIREBASE_EMULATOR;

const config = {
  apiKey: 'AIzaSyCuv37tY1qhzeS90hd1NeDC6i19DTZTp3w',
  authDomain: 'sop-editor-c2a61.firebaseapp.com',
  projectId: EMULATOR ? 'demo-sop-editor' : 'sop-editor-c2a61',
  storageBucket: 'sop-editor-c2a61.firebasestorage.app',
  messagingSenderId: '973015723802',
  appId: '1:973015723802:web:3d8b506ba52ec33022c6a3'
};

const DOMAIN = /@(ub\.ac\.id|gmail\.com)$/; // sama dengan inDomain() di firestore.rules
export const MAX_SOP_BYTES = 524288; // sama dengan batas di firestore.rules
const DEFAULT_LIMIT = 500 * 1000 * 1000;
const EDITING_BEAT = 2 * 60 * 1000;
const EDITING_EXPIRY = 5 * 60 * 1000;

/**
 * status: idle | loading | out | domain (bukan akun @ub.ac.id atau @gmail.com) | notMember | in | error.
 * editing: sopId → daftar orang lain yang sedang mengedit.
 */
export const faculty = $state({ status: 'idle', user: null, role: null, groups: [], error: '', editing: {} });

// Email anggota yang terakhir lolos pemeriksaan di server, agar aplikasi tetap bisa dipakai saat luring.
const MEMBER_KEY = 'sop-member';
function rememberMember(email) {
  try {
    if (email) localStorage.setItem(MEMBER_KEY, email);
    else localStorage.removeItem(MEMBER_KEY);
  } catch {}
}
function rememberedMember() {
  try {
    return localStorage.getItem(MEMBER_KEY);
  } catch {
    return null;
  }
}

/** Aplikasi hanya untuk anggota terdaftar; saat server tak terjangkau, keanggotaan terakhir yang diingat dipakai. */
export const canUseApp = () =>
  faculty.status === 'in' || (['loading', 'error'].includes(faculty.status) && !!faculty.user && faculty.user.email === rememberedMember());

export const isAdmin = () => faculty.status === 'in' && faculty.role === 'admin';
export const canManage = (sop) => isAdmin() || sop.createdBy === faculty.user?.uid;
export const EVERYONE = '*';
/** Isi daftar hak akses selain email dan '*' adalah id grup. */
export const isGroup = (who) => who !== EVERYONE && !who.includes('@');
/** Semua isi daftar hak akses yang berlaku untuk akun ini. */
const myTokens = () => [faculty.user?.email, EVERYONE, ...faculty.groups];
const granted = (list) => !!list && myTokens().some((t) => list.includes(t));
export const canRead = (item) => canManage(item) || granted(item.readers);
export const canEdit = (sop) => !sop.deletedBy && (canManage(sop) || granted(sop.editors));
/** Ada orang lain selain pemiliknya yang bisa melihat. */
export const isShared = (item) => (item.readers ?? []).some((r) => r !== item.createdByEmail);
/** Bentuk `tab.remote` untuk SOP yang terbuka di tab. */
export const remoteOf = (sop) => ({
  id: sop.id, rev: sop.rev, title: sop.title, folder: sop.folder ?? null,
  shared: isShared(sop), canEdit: canEdit(sop), canRename: canEdit(sop), manage: canManage(sop)
});

/** code: conflict | gone | full | denied | too-big | blank */
export class FacultyError extends Error {
  constructor(code, message, info = {}) {
    super(message);
    this.code = code;
    Object.assign(this, info);
  }
}

let svc;
function load() {
  svc ??= (async () => {
    const [{ initializeApp }, A, F] = await Promise.all([import('firebase/app'), import('firebase/auth'), import('firebase/firestore')]);
    const fb = initializeApp(config);
    const auth = A.getAuth(fb);
    const db = F.getFirestore(fb);
    if (EMULATOR) {
      A.connectAuthEmulator(auth, 'http://127.0.0.1:9199', { disableWarnings: true });
      F.connectFirestoreEmulator(db, '127.0.0.1', 8181);
    }
    return { A, F, auth, db };
  })();
  svc.catch(() => (svc = null)); // gagal memuat (mis. luring): boleh dicoba lagi
  return svc;
}

// Hanya ada saat pengujian dengan emulator; hilang dari hasil build.
if (EMULATOR) {
  window.__facultyLogin = async (email, name) => {
    const { A, auth } = await load();
    await A.signInWithCredential(auth, A.GoogleAuthProvider.credential(JSON.stringify({ sub: email, email, email_verified: true, name })));
  };
}

const offlineMessage = 'Pustaka Daring tidak bisa dihubungi. Periksa koneksi internet, lalu coba lagi.';

function readable(e) {
  if (e?.code === 'permission-denied') return 'Akses ditolak server. Bila ini baru disiapkan, pastikan aturan keamanan sudah dipasang.';
  if (e?.code === 'unavailable' || e?.code === 'auth/network-request-failed') return offlineMessage;
  return e?.message ?? String(e);
}

async function applyUser(u) {
  faculty.groups = [];
  if (!u) return Object.assign(faculty, { status: 'out', user: null, role: null, error: '' });
  const user = { uid: u.uid, email: u.email.toLowerCase(), name: (u.displayName || u.email).slice(0, 120) };
  if (!u.emailVerified || !DOMAIN.test(user.email)) {
    rememberMember(null);
    return Object.assign(faculty, { status: 'domain', user, role: null, error: '' });
  }
  // `user` langsung diisi: anggota yang diingat sudah boleh memakai aplikasi selagi keanggotaan diperiksa.
  Object.assign(faculty, { status: 'loading', user, role: null, error: '' });
  try {
    const { F, db } = await load();
    const m = await F.getDocFromServer(F.doc(db, 'members', user.email));
    if (!m.exists()) {
      rememberMember(null);
      return Object.assign(faculty, { status: 'notMember', user, role: null, error: '' });
    }
    const role = m.data().role;
    if (role === 'admin') await ensureUsage();
    rememberMember(user.email);
    Object.assign(faculty, { status: 'in', user, role, groups: m.data().groups ?? [], error: '' });
  } catch (e) {
    Object.assign(faculty, { status: 'error', user, role: null, error: readable(e) });
  }
}

let ready;
/** Memuat Firebase dan memulihkan login; aman dipanggil berulang. */
export function start() {
  ready ??= (async () => {
    faculty.status = 'loading';
    const { A, auth } = await load();
    await new Promise((resolve) => A.onAuthStateChanged(auth, (u) => applyUser(u).finally(resolve)));
  })().catch((e) => {
    ready = null;
    Object.assign(faculty, { status: 'error', error: readable(e) });
  });
  return ready;
}

export async function signIn() {
  const { A, auth } = await load();
  const provider = new A.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  try {
    await A.signInWithPopup(auth, provider);
  } catch (e) {
    if (e.code === 'auth/popup-closed-by-user' || e.code === 'auth/cancelled-popup-request') return;
    throw new Error(e.code === 'auth/popup-blocked' ? 'Jendela login diblokir browser. Izinkan pop-up untuk situs ini, lalu coba lagi.' : readable(e));
  }
}

export async function signOut() {
  releaseEditing();
  rememberMember(null);
  const { A, auth } = await load();
  await A.signOut(auth);
}

/** Mencoba lagi setelah gangguan, atau setelah admin mendaftarkan akun ini. */
export async function recheck() {
  const { auth } = await load();
  await applyUser(auth.currentUser);
}

const ms = (t) => t?.toMillis?.() ?? 0;

function row(d) {
  const s = d.data({ serverTimestamps: 'estimate' });
  return { ...s, id: d.id, createdAt: ms(s.createdAt), updatedAt: ms(s.updatedAt), deletedAt: ms(s.deletedAt) };
}

const utf8Size = (s) => new TextEncoder().encode(s).length;

/** Bentuk dokumen untuk Pustaka Daring. `title` menimpa nama mata kuliah bila diberikan. */
function cloudJson(doc, title) {
  const copy = JSON.parse(JSON.stringify(doc));
  if (title !== undefined) copy.identitas.mataKuliah = title;
  const json = JSON.stringify(copy);
  const size = utf8Size(json);
  if (size > MAX_SOP_BYTES) throw new FacultyError('too-big', `RPS ini terlalu besar untuk Pustaka Daring (${Math.ceil(size / 1024)} KB, maksimal ${MAX_SOP_BYTES / 1024} KB).`);
  return { json, size, title: copy.identitas.mataKuliah.trim().slice(0, 300), nomor: String(copy.identitas.kode ?? '').slice(0, 120) };
}

async function isFull() {
  const { F, db } = await load();
  try {
    await F.getDocFromServer(F.doc(db, C.capacity));
    return false;
  } catch (e) {
    return e.code === 'permission-denied';
  }
}

/** Menerjemahkan penolakan server menjadi pesan yang bisa ditindaklanjuti. */
async function failed(e) {
  if (e instanceof FacultyError) throw e;
  if (e?.code === 'permission-denied') {
    if (await isFull()) throw new FacultyError('full', 'Penyimpanan Pustaka Daring penuh. Hubungi admin.');
    throw new FacultyError('denied', 'Server menolak penyimpanan ini. Mungkin hak akses berubah atau ruang pustaka tidak cukup; hubungi admin bila berulang.');
  }
  throw new Error(readable(e));
}

async function ensureUsage() {
  const { F, db } = await load();
  const ref = F.doc(db, C.usage);
  if (!(await F.getDocFromServer(ref)).exists()) await F.setDoc(ref, { bytes: 0, limit: DEFAULT_LIMIT, lastSop: '' });
}

// ---- Daftar ----

/** Email, '*', dan grup akun ini, dibagi sesuai batas 30 nilai per kueri `array-contains-any`. */
function tokenChunks() {
  const all = myTokens();
  const out = [];
  for (let i = 0; i < all.length; i += 30) out.push(all.slice(i, i + 30));
  return out;
}

/** SOP yang boleh dilihat akun ini: { live, bin }. Admin melihat semua, termasuk seluruh recycle bin. */
export async function listSops() {
  const { F, db } = await load();
  const col = F.collection(db, C.sops);
  const { uid } = faculty.user;
  const q = (...w) => F.getDocsFromServer(F.query(col, ...w));
  const snaps = isAdmin()
    ? [await F.getDocsFromServer(col)]
    : await Promise.all([
        ...tokenChunks().map((t) => q(F.where('deletedBy', '==', null), F.where('readers', 'array-contains-any', t))),
        q(F.where('deletedBy', '==', uid))
      ]);
  const all = new Map();
  for (const s of snaps) for (const d of s.docs) all.set(d.id, row(d));
  const sorted = [...all.values()].sort((a, b) => b.updatedAt - a.updatedAt);
  return { live: sorted.filter((s) => !s.deletedBy), bin: sorted.filter((s) => s.deletedBy) };
}

export async function listVersions(id) {
  const { F, db } = await load();
  const snap = await F.getDocsFromServer(F.collection(db, C.sops, id, 'versions'));
  return snap.docs.map((d) => ({ ...d.data(), savedAt: ms(d.data().savedAt) })).sort((a, b) => b.rev - a.rev);
}

// ---- Folder ----

export async function listFolders() {
  const { F, db } = await load();
  const col = F.collection(db, C.folders);
  const { uid } = faculty.user;
  const q = (...w) => F.getDocsFromServer(F.query(col, ...w));
  const snaps = isAdmin()
    ? [await F.getDocsFromServer(col)]
    : await Promise.all([...tokenChunks().map((t) => q(F.where('readers', 'array-contains-any', t))), q(F.where('createdBy', '==', uid))]);
  const all = new Map();
  for (const s of snaps) for (const d of s.docs) all.set(d.id, { ...d.data({ serverTimestamps: 'estimate' }), id: d.id, parent: d.data().parent ?? null });
  return [...all.values()];
}

/**
 * Induk tiap folder setelah dibersihkan: induk yang tidak terlihat atau sudah dihapus, dan putaran akibat dua orang
 * memindahkan bersamaan, dibaca sebagai tingkat utama. Aturan server tidak bisa memeriksa keduanya.
 */
export function resolveParents(folders) {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const out = new Map();
  for (const f of folders) {
    const seen = new Set();
    let p = f.parent;
    while (p && p !== f.id && byId.has(p) && !seen.has(p)) {
      seen.add(p);
      p = byId.get(p).parent;
    }
    out.set(f.id, p === f.id || !byId.has(f.parent) ? null : f.parent);
  }
  return out;
}

const folderWrite = (p) => p.catch((e) => { throw new Error(readable(e)); });

const union = (a, b) => [...new Set([...a, ...b])];
const owned = (owner) => (owner ? [owner] : []);
/** Daftar hak akses yang wajib dimiliki item yang mengikuti `parent` (null: tingkat utama). */
export function inherited(parent, owner) {
  return parent
    ? { readers: union(parent.readers ?? [], owned(owner)), editors: union(parent.editors ?? [], owned(owner)) }
    : { readers: owned(owner), editors: owned(owner) };
}

/** Mengembalikan folder bila akun ini boleh menambah isinya (pemilik atau admin), selain itu null (tingkat utama). */
async function usableFolder(id) {
  if (!id) return null;
  const { F, db } = await load();
  try {
    const snap = await F.getDocFromServer(F.doc(db, C.folders, id));
    if (snap.exists() && canManage(snap.data())) return snap.data();
  } catch (e) {
    if (e.code !== 'permission-denied') throw e;
  }
  return null;
}

export async function createFolder(name, parent) {
  const { F, db } = await load();
  const { uid, email, name: createdByName } = faculty.user;
  const up = await folderWrite(usableFolder(parent));
  if (parent && !up) throw new Error('Hanya pemilik folder ini yang bisa menambah isinya.');
  const ref = await folderWrite(F.addDoc(F.collection(db, C.folders), {
    name, parent, custom: false, ...inherited(up, email),
    createdBy: uid, createdByName, createdByEmail: email, createdAt: F.serverTimestamp()
  }));
  return ref.id;
}

export async function renameFolder(id, name) {
  const { F, db } = await load();
  await folderWrite(F.updateDoc(F.doc(db, C.folders, id), { name }));
}

/** `target` adalah folder tujuan (null: tingkat utama). Isi folder menyusul lewat reconcileAccess. */
export async function moveFolder(f, target) {
  const { F, db } = await load();
  const lists = f.custom ? {} : inherited(target, f.createdByEmail);
  await folderWrite(F.updateDoc(F.doc(db, C.folders, f.id), { parent: target?.id ?? null, ...lists }));
}

export async function deleteFolder(id) {
  const { F, db } = await load();
  await folderWrite(F.deleteDoc(F.doc(db, C.folders, id)));
}

// ---- Hak akses ----

/** data: { custom, readers, editors }. Isi folder menyusul lewat reconcileAccess. */
export async function setAccess(kind, id, data) {
  const { F, db } = await load();
  await folderWrite(F.updateDoc(F.doc(db, C[kind], id), data));
}

const sameList = (a = [], b = []) => a.length === b.length && new Set([...a, ...b]).size === a.length;
const WRITE_CHUNK = 10; // aturan server punya batas evaluasi per permintaan

/**
 * Menyamakan daftar hak akses semua item yang terlihat dengan folder induknya, dari tingkat teratas ke bawah. Dijalankan
 * setiap daftar dimuat, sehingga penyebaran yang terputus (mis. koneksi hilang) selesai saat dibuka berikutnya. Admin
 * sekaligus mengonversi data dari sebelum hak akses per pengguna. Mengubah `folders` dan `sops` di tempat.
 */
export async function reconcileAccess(folders, sops) {
  const { F, db } = await load();
  const admin = isAdmin();
  const { uid, email } = faculty.user;
  const byId = new Map(folders.map((f) => [f.id, f]));
  const parents = resolveParents(folders);
  const writes = [];
  const queue = (kind, item, data) => {
    Object.assign(item, data);
    writes.push({ ref: F.doc(db, C[kind], item.id), data, item });
  };

  for (const f of folders) {
    if (f.createdBy === uid && !f.createdByEmail) {
      f.createdByEmail = email;
      writes.push({ ref: F.doc(db, C.folders, f.id), data: { createdByEmail: email }, item: f });
    }
  }

  const visit = (f) => {
    const up = byId.get(parents.get(f.id));
    if (f.readers === undefined) {
      // Dulu semua anggota bisa melihat folder dan mengisinya.
      if (admin) queue('folders', f, up ? { custom: false, ...inherited(up, f.createdByEmail) } : { custom: true, readers: union([EVERYONE], owned(f.createdByEmail)), editors: union([EVERYONE], owned(f.createdByEmail)) });
    } else if (!f.custom) {
      // Induknya tidak terlihat oleh akun ini: daftarnya tidak bisa diketahui. Untuk admin berarti sudah terhapus.
      const unknown = f.parent && !byId.has(f.parent) && !admin;
      const cycle = f.parent && byId.has(f.parent) && !up;
      const want = inherited(up, f.createdByEmail);
      if (!unknown && !cycle && (!sameList(f.readers, want.readers) || !sameList(f.editors, want.editors))) queue('folders', f, want);
    }
    for (const c of folders) if (parents.get(c.id) === f.id) visit(c);
  };
  for (const f of folders) if (!parents.get(f.id)) visit(f);

  for (const s of sops) {
    const up = byId.get(s.folder) ?? null;
    if (s.readers === undefined) {
      if (!admin) continue;
      const all = union([EVERYONE], [s.createdByEmail]);
      const data = s.visibility === 'public'
        ? (up ? { custom: false, ...inherited(up, s.createdByEmail) } : { custom: true, readers: all, editors: all })
        : { custom: !!up, ...inherited(null, s.createdByEmail) }; // SOP private di dalam folder tetap private
      queue('sops', s, data);
      writes.at(-1).data = { ...data, visibility: F.deleteField() };
      delete s.visibility;
    } else if (!s.custom && !s.deletedBy && (admin || !s.folder || up)) {
      const want = inherited(up, s.createdByEmail);
      if (!sameList(s.readers, want.readers) || !sameList(s.editors, want.editors)) queue('sops', s, want);
    }
  }

  for (let i = 0; i < writes.length; i += WRITE_CHUNK) {
    const chunk = writes.slice(i, i + WRITE_CHUNK);
    const b = F.writeBatch(db);
    chunk.forEach((w) => b.update(w.ref, w.data));
    // Satu penolakan (mis. folder baru saja berubah lagi) tidak boleh menggagalkan yang lain dalam kelompoknya.
    await b.commit().catch(() => Promise.allSettled(chunk.map((w) => F.updateDoc(w.ref, w.data))));
  }
}

// ---- Menulis ----

/**
 * Mengunggah sebagai SOP baru yang mengikuti hak akses foldernya; akun ini tercatat sebagai pemiliknya.
 * Bila `folder` bukan milik akun ini (dan bukan admin), SOP masuk ke tingkat utama.
 */
export async function uploadSop(doc, title, folder = null) {
  const { F, db } = await load();
  const { uid, email, name } = faculty.user;
  const c = cloudJson(doc, title);
  const up = await usableFolder(folder).catch(failed);
  if (!up) folder = null;
  const lists = inherited(up, email);
  const ref = F.doc(F.collection(db, C.sops));
  const b = F.writeBatch(db);
  const now = F.serverTimestamp();
  b.set(ref, {
    ...c, totalBytes: c.size, rev: 1, custom: false, ...lists, folder,
    createdBy: uid, createdByName: name, createdByEmail: email, createdAt: now,
    updatedAt: now, updatedBy: uid, updatedByName: name, deletedAt: null, deletedBy: null
  });
  b.update(F.doc(db, C.usage), { bytes: F.increment(c.size), lastSop: ref.id });
  await b.commit().catch(failed);
  return remoteOf({ id: ref.id, rev: 1, title: c.title, folder, createdBy: uid, createdByEmail: email, ...lists });
}

/** Isi lama pindah ke riwayat dan isi baru ditulis dalam satu transaksi (lihat isContentSave di aturan). */
function writeContent(F, db, tx, ref, cur, c) {
  const { uid, name } = faculty.user;
  tx.set(F.doc(ref, 'versions', String(cur.rev)), {
    rev: cur.rev, title: cur.title, nomor: cur.nomor, json: cur.json, size: cur.size,
    savedAt: cur.updatedAt, savedBy: cur.updatedBy, savedByName: cur.updatedByName
  });
  tx.update(ref, {
    json: c.json, size: c.size, title: c.title, nomor: c.nomor, totalBytes: cur.totalBytes + c.size, rev: cur.rev + 1,
    updatedAt: F.serverTimestamp(), updatedBy: uid, updatedByName: name
  });
  tx.update(F.doc(db, C.usage), { bytes: F.increment(c.size), lastSop: ref.id });
}

async function readForWrite(tx, ref) {
  let snap;
  try {
    snap = await tx.get(ref);
  } catch (e) {
    if (e.code === 'permission-denied') throw goneError();
    throw e;
  }
  if (!snap.exists() || snap.data().deletedBy) throw goneError();
  return snap.data();
}
const goneError = () => new FacultyError('gone', 'RPS ini sudah dihapus, atau hak akses Anda sudah dicabut.');

/**
 * Menyimpan perubahan dari salinan `baseRev`. Bila SOP sudah diubah orang lain, melempar `conflict`
 * kecuali `overwrite`.
 */
export async function saveSop(id, doc, baseRev, { overwrite = false } = {}) {
  const { F, db } = await load();
  const ref = F.doc(db, C.sops, id);
  return F.runTransaction(db, async (tx) => {
    const cur = await readForWrite(tx, ref);
    if (cur.rev !== baseRev && !overwrite) {
      throw new FacultyError('conflict', 'RPS ini sudah diubah orang lain.', { by: cur.updatedByName, at: ms(cur.updatedAt) });
    }
    const c = cloudJson(doc);
    if (c.json === cur.json && c.title === cur.title) return { rev: cur.rev, title: cur.title, unchanged: true };
    writeContent(F, db, tx, ref, cur, c);
    return { rev: cur.rev + 1, title: c.title };
  }).catch(failed);
}

/**
 * Mengubah nama: nama di pustaka dan Nama SOP di dalam dokumen ikut sama, tercatat sebagai versi baru.
 * Hasil: { from, rev, title }, `from` adalah revisi tepat sebelum penggantian nama.
 */
export async function renameSop(id, title) {
  const { F, db } = await load();
  const ref = F.doc(db, C.sops, id);
  return F.runTransaction(db, async (tx) => {
    const cur = await readForWrite(tx, ref);
    const c = cloudJson(JSON.parse(cur.json), title);
    writeContent(F, db, tx, ref, cur, c);
    return { from: cur.rev, rev: cur.rev + 1, title: c.title };
  }).catch(failed);
}

/** Isi versi lama menjadi isi terkini (isi saat ini tetap tersimpan di riwayat); namanya tidak ikut mundur. */
export async function restoreVersion(id, version) {
  const { F, db } = await load();
  const ref = F.doc(db, C.sops, id);
  await F.runTransaction(db, async (tx) => {
    const cur = await readForWrite(tx, ref);
    writeContent(F, db, tx, ref, cur, cloudJson(JSON.parse(version.json), cur.title));
  }).catch(failed);
}

/**
 * Menghapus satu versi riwayat (pemilik dan admin). Ruang yang dipakainya dikembalikan ke penghitung; `prunedRev`
 * menandai versi yang dihapus agar aturan server bisa memeriksa ukurannya (lihat isHistoryPrune).
 */
export async function pruneVersion(id, rev) {
  const { F, db } = await load();
  const ref = F.doc(db, C.sops, id);
  const vref = F.doc(ref, 'versions', String(rev));
  await F.runTransaction(db, async (tx) => {
    const cur = await readForWrite(tx, ref);
    const v = await tx.get(vref);
    if (!v.exists()) return; // sudah dihapus orang lain
    const size = v.data().size;
    tx.delete(vref);
    tx.update(ref, { totalBytes: cur.totalBytes - size, prunedRev: String(rev), prunedAt: F.serverTimestamp() });
    tx.update(F.doc(db, C.usage), { bytes: F.increment(-size), lastSop: id });
  }).catch(failed);
}

/**
 * Hasil duplikat: pemiliknya akun ini, dan siapa pun yang bisa melihat atau mengedit aslinya mendapat hak yang sama
 * pada salinan. Server hanya menerima RPS baru yang mengikuti foldernya, jadi daftar hak dipasang sesudahnya bila
 * berbeda; bila langkah itu gagal, salinan tetap ada dengan hak dari foldernya.
 */
export async function duplicateSop(sop) {
  const copy = await uploadSop(JSON.parse(sop.json), `Salinan dari ${sop.title || 'RPS tanpa judul'}`.slice(0, 300), sop.folder);
  const me = faculty.user.email;
  const want = { readers: union(sop.readers ?? [], [me]), editors: union(sop.editors ?? [], [me]) };
  const { F, db } = await load();
  const snap = await F.getDocFromServer(F.doc(db, C.sops, copy.id)).catch(() => null);
  const got = snap?.data();
  if (got && (!sameList(got.readers, want.readers) || !sameList(got.editors, want.editors))) {
    await setAccess('sops', copy.id, { custom: true, ...want }).catch(() => {});
  }
  return copy;
}

async function patch(id, data) {
  const { F, db } = await load();
  await F.updateDoc(F.doc(db, C.sops, id), data).catch(failed);
}
/** `target` adalah folder tujuan (null: tingkat utama). SOP dengan hak khusus tidak berubah daftarnya. */
export const moveSop = (s, target) => patch(s.id, { folder: target?.id ?? null, ...(s.custom ? {} : inherited(target, s.createdByEmail)) });
export async function moveToBin(id) {
  const { F } = await load();
  await patch(id, { deletedAt: F.serverTimestamp(), deletedBy: faculty.user.uid });
}
export const restoreFromBin = (id) => patch(id, { deletedAt: null, deletedBy: null });

/** Hapus permanen, riwayat dan komentarnya ikut. Tidak bisa dibatalkan. */
export async function purgeSop(sop) {
  const { F, db } = await load();
  const ref = F.doc(db, C.sops, sop.id);
  // Komentar dihapus lebih dulu, terpisah dari penghapusan RPS-nya agar batas penulisan per batch tidak terlampaui.
  const notes = await F.getDocsFromServer(F.collection(ref, 'comments')).catch(() => null);
  for (let i = 0; notes && i < notes.docs.length; i += 200) {
    const b = F.writeBatch(db);
    notes.docs.slice(i, i + 200).forEach((c) => b.delete(c.ref));
    await b.commit().catch(() => {}); // komentar yang tersisa tidak menghalangi penghapusan RPS
  }
  const versions = await F.getDocsFromServer(F.collection(ref, 'versions'));
  const b = F.writeBatch(db);
  versions.forEach((v) => b.delete(v.ref));
  b.delete(ref);
  b.update(F.doc(db, C.usage), { bytes: F.increment(-sop.totalBytes), lastSop: sop.id });
  await b.commit().catch(failed);
}

// ---- Komentar: catatan peninjauan per RPS, terpisah dari isinya (lihat bagian Komentar di aturan) ----

export const COMMENT_MAX = 4000; // sama dengan validCommentText di firestore.rules

function commentFailed(e) {
  if (e?.code === 'permission-denied') throw new Error('Server menolak komentar ini. Mungkin RPS-nya sudah dihapus atau hak akses Anda berubah.');
  throw new Error(readable(e));
}
const commentsOf = (F, db, sopId) => F.collection(db, C.sops, sopId, 'comments');

/** Mengikuti komentar RPS `sopId`; onChange(daftar) setiap ada perubahan. Panggil fungsi hasilnya untuk berhenti. */
export function watchComments(sopId, onChange, onError) {
  let stop = null;
  let dead = false;
  load()
    .then(({ F, db }) => {
      if (dead) return;
      stop = F.onSnapshot(
        commentsOf(F, db, sopId),
        (snap) =>
          onChange(
            snap.docs.map((d) => {
              const c = d.data({ serverTimestamps: 'estimate' });
              return { ...c, id: d.id, at: ms(c.at), editedAt: ms(c.editedAt), resolvedAt: ms(c.resolvedAt), pending: d.metadata.hasPendingWrites };
            })
          ),
        (e) => onError?.(readable(e))
      );
    })
    .catch((e) => onError?.(readable(e)));
  return () => {
    dead = true;
    stop?.();
  };
}

/** Komentar utama (`parent` null; `anchor` = data-field isian yang dikomentari, atau null) atau balasan. */
export async function addComment(sopId, { parent = null, anchor = null, label = '', quote = '', text }) {
  const { F, db } = await load();
  const { uid, email, name } = faculty.user;
  await F.addDoc(commentsOf(F, db, sopId), {
    parent, anchor: parent ? null : anchor, label: parent ? '' : label.slice(0, 200), quote: parent ? '' : quote.slice(0, 300),
    text: text.slice(0, COMMENT_MAX), by: uid, byName: name, byEmail: email, at: F.serverTimestamp(), editedAt: null,
    resolved: false, resolvedBy: null, resolvedByName: null, resolvedAt: null
  }).catch(commentFailed);
}

export async function editComment(sopId, id, text) {
  const { F, db } = await load();
  await F.updateDoc(F.doc(commentsOf(F, db, sopId), id), { text: text.slice(0, COMMENT_MAX), editedAt: F.serverTimestamp() }).catch(commentFailed);
}

export async function resolveComment(sopId, id, done) {
  const { F, db } = await load();
  const { uid, name } = faculty.user;
  const data = done
    ? { resolved: true, resolvedBy: uid, resolvedByName: name, resolvedAt: F.serverTimestamp() }
    : { resolved: false, resolvedBy: null, resolvedByName: null, resolvedAt: null };
  await F.updateDoc(F.doc(commentsOf(F, db, sopId), id), data).catch(commentFailed);
}

/** Menghapus komentar `id` beserta balasannya (`replies`: id balasan). */
export async function deleteComment(sopId, id, replies = []) {
  const { F, db } = await load();
  const col = commentsOf(F, db, sopId);
  const b = F.writeBatch(db);
  b.delete(F.doc(col, id));
  replies.forEach((r) => b.delete(F.doc(col, r)));
  await b.commit().catch(commentFailed);
}

// ---- "Sedang diedit": hanya pemberitahuan, tidak pernah menghalangi orang lain menyimpan ----

const marks = new Set();
let beat = null;

async function sendMark(sopId) {
  const { F, db } = await load();
  const { uid, name } = faculty.user;
  await F.setDoc(F.doc(db, C.editing, `${sopId}_${uid}`), { sopId, uid, name, at: F.serverTimestamp() });
}

async function clearMark(sopId, uid) {
  const { F, db } = await load();
  await F.deleteDoc(F.doc(db, C.editing, `${sopId}_${uid}`));
}

/** Tandai (atau lepaskan tanda) bahwa akun ini sedang mengedit SOP bersama `sopId`. */
export function setEditing(sopId, on) {
  if (faculty.status !== 'in' || on === marks.has(sopId)) return;
  if (on) {
    marks.add(sopId);
    sendMark(sopId).catch(() => {});
    beat ??= setInterval(() => marks.forEach((id) => sendMark(id).catch(() => {})), EDITING_BEAT);
  } else {
    marks.delete(sopId);
    clearMark(sopId, faculty.user.uid).catch(() => {});
    if (!marks.size) {
      clearInterval(beat);
      beat = null;
    }
  }
}

export function releaseEditing() {
  for (const id of [...marks]) setEditing(id, false);
}

let watchers = 0;
let stopWatch = null;
let lastMarks = [];
let sweep = null;

function publishEditing() {
  const now = Date.now();
  const next = {};
  for (const m of lastMarks) {
    if (now - m.at > EDITING_EXPIRY) {
      if (now - m.at > EDITING_EXPIRY + 60000) clearMark(m.sopId, m.uid).catch(() => {}); // sisa browser yang tertutup
      continue;
    }
    if (m.uid !== faculty.user?.uid) (next[m.sopId] ??= []).push(m);
  }
  faculty.editing = next;
}

/** Mengikuti siapa yang sedang mengedit selama dibutuhkan; panggil fungsi hasilnya untuk berhenti. */
export function watchEditing() {
  watchers++;
  if (watchers === 1) {
    load().then(({ F, db }) => {
      if (!watchers) return;
      stopWatch = F.onSnapshot(
        F.collection(db, C.editing),
        (snap) => {
          lastMarks = snap.docs.map((d) => {
            const m = d.data({ serverTimestamps: 'estimate' });
            return { ...m, at: ms(m.at) };
          });
          publishEditing();
        },
        () => {} // akses dicabut atau luring: keterangan ini tidak penting untuk diberitahukan
      );
    });
    sweep = setInterval(publishEditing, 60000);
  }
  return () => {
    if (--watchers) return;
    stopWatch?.();
    stopWatch = null;
    clearInterval(sweep);
    faculty.editing = {};
  };
}

// ---- Khusus admin ----

export async function getUsage() {
  const { F, db } = await load();
  return (await F.getDocFromServer(F.doc(db, C.usage))).data();
}

export async function setLimit(limit) {
  const { F, db } = await load();
  await F.updateDoc(F.doc(db, C.usage), { limit });
}

/** Menyamakan penghitung dengan jumlah ukuran semua SOP (termasuk recycle bin dan riwayatnya). */
export async function recountUsage() {
  const { F, db } = await load();
  const all = await F.getDocsFromServer(F.collection(db, C.sops));
  let bytes = 0;
  all.forEach((d) => (bytes += d.data().totalBytes ?? 0));
  await F.updateDoc(F.doc(db, C.usage), { bytes, lastSop: '' });
  return bytes;
}

export async function listMembers() {
  const { F, db } = await load();
  const snap = await F.getDocsFromServer(F.collection(db, 'members'));
  return snap.docs.map((d) => ({ email: d.id, role: d.data().role, groups: d.data().groups ?? [] })).sort((a, b) => a.email.localeCompare(b.email));
}

/** `groups` ikut ditulis agar mengubah peran tidak mengeluarkan anggota dari grupnya. */
export async function setMember(email, role, groups = []) {
  const { F, db } = await load();
  await F.setDoc(F.doc(db, 'members', email), { role, groups, addedBy: faculty.user.email, addedAt: F.serverTimestamp() });
}

/**
 * Mendaftarkan banyak email sekaligus dengan `role` dan grup `group` (boleh kosong). Anggota yang sudah terdaftar
 * tidak berubah perannya; hanya dimasukkan ke `group`. `members` adalah hasil listMembers.
 */
export async function addMembers(emails, role, group, members) {
  const { F, db } = await load();
  const known = new Map(members.map((m) => [m.email, m]));
  const writes = [];
  for (const email of emails) {
    const ref = F.doc(db, 'members', email);
    const m = known.get(email);
    if (!m) writes.push((b) => b.set(ref, { role, groups: group ? [group] : [], addedBy: faculty.user.email, addedAt: F.serverTimestamp() }));
    else if (group && !m.groups.includes(group)) writes.push((b) => b.update(ref, { groups: F.arrayUnion(group) }));
  }
  for (let i = 0; i < writes.length; i += WRITE_CHUNK) {
    const b = F.writeBatch(db);
    writes.slice(i, i + WRITE_CHUNK).forEach((w) => w(b));
    await b.commit();
  }
  if (group && emails.includes(faculty.user.email)) faculty.groups = union(faculty.groups, [group]);
}

export async function removeMember(email) {
  const { F, db } = await load();
  await F.deleteDoc(F.doc(db, 'members', email));
}

// ---- Grup: semua anggota bisa melihat untuk memberi hak akses, hanya admin yang mengelola ----

export async function listGroups() {
  const { F, db } = await load();
  const snap = await F.getDocsFromServer(F.collection(db, 'groups'));
  return snap.docs.map((d) => ({ id: d.id, name: d.data().name })).sort((a, b) => a.name.localeCompare(b.name, 'id'));
}

export async function createGroup(name) {
  const { F, db } = await load();
  return (await F.addDoc(F.collection(db, 'groups'), { name })).id;
}

export async function renameGroup(id, name) {
  const { F, db } = await load();
  await F.updateDoc(F.doc(db, 'groups', id), { name });
}

/** Menyamakan isi grup `id` dengan `emails`. `members` adalah hasil listMembers. */
export async function setGroupMembers(id, emails, members) {
  const { F, db } = await load();
  const want = new Set(emails);
  const changes = members.filter((m) => m.groups.includes(id) !== want.has(m.email));
  for (let i = 0; i < changes.length; i += WRITE_CHUNK) {
    const b = F.writeBatch(db);
    for (const m of changes.slice(i, i + WRITE_CHUNK)) {
      b.update(F.doc(db, 'members', m.email), { groups: m.groups.includes(id) ? F.arrayRemove(id) : F.arrayUnion(id) });
    }
    await b.commit();
  }
  if (want.has(faculty.user.email)) faculty.groups = union(faculty.groups, [id]);
  else faculty.groups = faculty.groups.filter((g) => g !== id);
}

/** Anggotanya dikeluarkan lebih dulu. Hak akses yang memakai grup ini tidak lagi berlaku untuk siapa pun. */
export async function deleteGroup(id, members) {
  const { F, db } = await load();
  await setGroupMembers(id, [], members);
  await F.deleteDoc(F.doc(db, 'groups', id));
}

// ---- Katalog kurikulum: CPL/CPMK per prodi (curricula/{id}) ----
// Semua anggota membaca. Admin membuat/menghapus prodi dan menunjuk pengelolanya; pengelola prodi mengedit isinya.

/** Pengelola prodi `c` (atau admin) boleh mengedit isi katalognya. */
export const canEditCurriculum = (c) => isAdmin() || (!!faculty.user && (c?.managers ?? []).includes(faculty.user.email));

export async function listCurricula() {
  const { F, db } = await load();
  const snap = await F.getDocsFromServer(F.collection(db, 'curricula'));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data(), updatedAt: ms(d.data().updatedAt) }))
    .sort((a, b) => a.nama.localeCompare(b.nama, 'id'));
}

/** Menulis seluruh isi katalog `id` (membuat bila belum ada; hanya admin yang boleh membuat). */
export async function saveCurriculum(id, { nama, departemen, managers, cpl, cpmk }) {
  const { F, db } = await load();
  const data = {
    nama: nama.trim().slice(0, 120), departemen: (departemen ?? '').trim().slice(0, 120),
    managers: [...new Set(managers.map((m) => m.trim().toLowerCase()).filter(Boolean))],
    cpl: cpl.map(({ id, kode, teks }) => ({ id, kode, teks })),
    cpmk: cpmk.map(({ id, kode, teks, cpl }) => ({ id, kode, teks, cpl: [...cpl] })),
    updatedAt: F.serverTimestamp(), updatedBy: faculty.user.uid, updatedByName: faculty.user.name
  };
  await F.setDoc(F.doc(db, 'curricula', id), data).catch((e) => {
    throw new Error(e?.code === 'permission-denied' ? 'Anda tidak berhak mengubah katalog prodi ini.' : readable(e));
  });
}

export async function deleteCurriculum(id) {
  const { F, db } = await load();
  await F.deleteDoc(F.doc(db, 'curricula', id)).catch((e) => {
    throw new Error(readable(e));
  });
}
