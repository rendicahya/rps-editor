// Komentar peninjauan pada RPS Pustaka Daring (disimpan di Firestore, lihat faculty.svelte.js). Modul ini menyimpan
// komentar RPS yang sedang dibuka dan menghubungkan isian halaman dengan panel komentar.
import { plainText } from './richtext.js';
import { formatTanggal, formatAngka } from './model.js';
import { textFields } from './findReplace.js';

/**
 * sopId: RPS daring tab aktif (null: tab bukan RPS daring). list: semua komentar dan balasannya.
 * status: idle | loading | ready | error. marked: isian (lihat noteRef) yang punya komentar terbuka.
 * focus: isian halaman yang terakhir diklik. request: { ref } permintaan berkomentar dari menu klik kanan.
 */
export const notes = $state({
  sopId: null, list: [], status: 'idle', error: '', marked: new Set(), focus: null, request: null,
  highlight: null, // id komentar yang perlu ditampilkan (dari tautan atau daftar sebutan)
  mine: [], // komentar dari RPS mana pun yang menyebut akun ini
  seen: readSeen(), // waktu terakhir daftar sebutan dibuka
  wantMentions: false // dialog Pustaka dibuka langsung di daftar sebutan
});

/** Dari menu klik kanan isian: buka panel komentar dengan komentar baru untuk isian `ref`. */
export const commentOn = (ref) => (notes.request = { ref });

/**
 * Rujukan komentar untuk data-field isian. Isian yang tampil lebih dari sekali (identitas di Lembar Kerja,
 * kode asesmen di tabel kategori) dirujuk sama dengan isian aslinya.
 */
export const noteRef = (field) => (field ? field.replace(/^(cover|lk\d+):/, '').replace(/@.*$/, '') : null);

/** Isian identitas yang hanya tampil di sampul (tidak ikut Cari). */
const SAMPUL = { universitas: 'Universitas', fakultas: 'Fakultas', tahun: 'Tahun' };
/** "Pekan 3" atau "Pekan 3 praktikum": kuliah dan praktikum bisa berpekan sama. */
const pekan = (p) => `Pekan ${p.pekan}${p.jenis === 'praktikum' ? ' praktikum' : ''}`;

// ---- Tautan langsung ----

/** Tautan yang membuka RPS daring `id` (dan menyorot komentar `cid`) di aplikasi ini. */
export function sopLink(id, cid = null) {
  const u = new URL(location.pathname, location.origin);
  u.searchParams.set('rps', id);
  if (cid) u.searchParams.set('komentar', cid);
  return u.href;
}

/** Menyalin tautan ke clipboard; hasilnya pesan untuk ditampilkan. */
export async function copyLink(id, cid = null) {
  const link = sopLink(id, cid);
  try {
    await navigator.clipboard.writeText(link);
    return cid ? 'Tautan komentar disalin.' : 'Tautan RPS disalin. Penerima perlu masuk dan punya hak lihat.';
  } catch {
    return 'Browser tidak mengizinkan menyalin. Tautan: ' + link;
  }
}

// ---- Sebutan (@email) ----

const SEEN_KEY = 'rps-editor.mentionsSeen';
function readSeen() {
  try {
    return Number(localStorage.getItem(SEEN_KEY)) || 0;
  } catch {
    return 0;
  }
}
/** Daftar sebutan sudah dilihat. */
export function markMentionsSeen() {
  notes.seen = Date.now();
  try {
    localStorage.setItem(SEEN_KEY, String(notes.seen));
  } catch {}
}
/** Sebutan dari orang lain yang datang setelah daftar sebutan terakhir dibuka. */
export const unseenMentions = (me) => notes.mine.filter((c) => c.by !== me && c.at > notes.seen).length;

export const MENTION_RE = /@([a-z0-9._%+-]+@(?:ub\.ac\.id|gmail\.com))/gi;

/** Email yang disebut di `text` (huruf kecil, tanpa duplikat). */
export function findMentions(text) {
  return [...new Set([...String(text).matchAll(MENTION_RE)].map((m) => m[1].toLowerCase()))];
}

/**
 * Anggota yang bisa melihat RPS `sop` ({ readers, createdByEmail }); `members` dari listMembers. Admin selalu bisa.
 */
export function readersOf(sop, members) {
  const list = sop?.readers ?? [];
  const all = list.includes('*');
  return members
    .filter((m) => all || m.role === 'admin' || m.email === sop?.createdByEmail || list.includes(m.email) || m.groups.some((g) => list.includes(g)))
    .map((m) => m.email);
}

const short = (t, n = 200) => {
  const s = plainText(String(t ?? '')).replace(/\s+/g, ' ').trim();
  return s.length > n ? s.slice(0, n) + '…' : s;
};
const byId = (list, id) => list.find((x) => x.id === id);
const codes = (list, ids) => (ids ?? []).map((id) => byId(list, id)?.kode).filter(Boolean).join(', ');

/** { label, quote } isian `ref` pada dokumen saat ini; null bila isiannya sudah tidak ada. Tanpa `ref`: seluruh RPS. */
export function describeAnchor(doc, ref) {
  if (!ref) return { label: 'Seluruh RPS', quote: '' };
  const [kind, a, b, c] = ref.split(':');
  const tf = textFields(doc).find((f) => f.ref === ref);
  if (tf) {
    const p = kind === 'pertemuan' && byId(doc.pertemuan, a);
    return { label: p ? tf.label.replace(/^Pekan \S+/, pekan(p)) : tf.label, quote: short(tf.obj[tf.key]) };
  }

  const id = doc.identitas;
  if (kind === 'id' && SAMPUL[a] && !b) return { label: SAMPUL[a], quote: short(id[a]) };
  if (kind === 'lk' && b === 'kode') {
    const l = byId(doc.lembarKerja, a);
    return l && { label: 'Lembar kerja · kode', quote: short(l.kode) };
  }
  if (ref === 'id:tglPenyusunan') return { label: 'Tanggal penyusunan', quote: formatTanggal(id.tglPenyusunan) };
  if (ref === 'pk:sks') return { label: 'Bobot SKS', quote: `${id.sksTeori ?? 0} teori, ${id.sksPraktikum ?? 0} praktikum` };
  if (ref === 'pk:semester') return { label: 'Semester', quote: short(id.semester) };
  if (ref === 'pk:sifat') return { label: 'Sifat', quote: short(id.sifat) };
  if (kind === 'pk') {
    if (a === 'cpmk') {
      const x = byId(doc.cpmk, b);
      return x && { label: `${x.kode || 'CPMK'} · CPL yang didukung`, quote: codes(doc.cpl, x.cpl) };
    }
    if (a === 'sub') {
      const x = byId(doc.subCpmk, b);
      return x && { label: `${x.kode || 'Sub-CPMK'} · CPMK induk`, quote: byId(doc.cpmk, x.cpmk)?.kode ?? '' };
    }
    if (a === 'pekan' || a === 'psub') {
      const p = byId(doc.pertemuan, b);
      if (!p) return null;
      return a === 'pekan' ? { label: `${pekan(p)} · pekan dan jenis`, quote: '' } : { label: `${pekan(p)} · Sub-CPMK`, quote: codes(doc.subCpmk, p.subCpmk) };
    }
    if (a === 'lksem' || a === 'lksub') {
      const l = byId(doc.lembarKerja, b);
      if (!l) return null;
      return { label: `${l.kode || 'Lembar kerja'} · ${a === 'lksem' ? 'semester' : 'Sub-CPMK dan asesmen'}`, quote: '' };
    }
    return null;
  }
  if (kind === 'asesmen') {
    const x = byId(doc.asesmen, a);
    if (!x) return null;
    const name = x.kode || 'Asesmen';
    if (b === 'porsi') {
      const s = byId(doc.subCpmk, c);
      return s ? { label: `${name} · porsi ${s.kode || 'Sub-CPMK'}`, quote: formatAngka(x.porsi?.[c]) } : null;
    }
    const L = { siakad: 'kategori SIAKAD', obe: 'kategori SIM OBE', bobot: 'bobot (%)' };
    return L[b] ? { label: `${name} · ${L[b]}`, quote: b === 'bobot' ? formatAngka(x.bobot) : short(x[b]) } : null;
  }
  if (kind === 'pertemuan') {
    const p = byId(doc.pertemuan, a);
    if (!p) return null;
    if (b === 'bobot') return { label: `${pekan(p)} · bobot`, quote: formatAngka(p.bobot) };
    if (b === 'metode') {
      const k = Number(c);
      return k < Math.max(1, p.metode.length) ? { label: `${pekan(p)} · metode ${k + 1}`, quote: short(p.metode[k]) } : null;
    }
  }
  return null;
}

/**
 * Isian yang dikomentari `c` pada dokumen saat ini, atau null bila sudah tidak ada. Butir daftar teks (dosen, tim dosen,
 * metode) dirujuk lewat nomor urutnya, jadi bila butir disisipi atau diurutkan ulang, butir yang teksnya sama dengan saat
 * dikomentari dipakai.
 */
export function currentRef(doc, c) {
  if (!c.anchor) return null;
  const m = /^(.*):(\d+)$/.exec(c.anchor);
  if (m && c.quote && describeAnchor(doc, c.anchor)?.quote !== c.quote) {
    for (let j = 0; j < 200; j++) {
      const d = describeAnchor(doc, `${m[1]}:${j}`);
      if (!d) break;
      if (d.quote === c.quote) return `${m[1]}:${j}`;
    }
  }
  return describeAnchor(doc, c.anchor) ? c.anchor : null;
}
