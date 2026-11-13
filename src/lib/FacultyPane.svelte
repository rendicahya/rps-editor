<script>
  import { tick, untrack } from 'svelte';
  import { SvelteSet } from 'svelte/reactivity';
  import { haystack } from './library.js';
  import { readRpsFiles } from './bulkImport.js';
  import * as F from './faculty.svelte.js';
  import { faculty, canManage, canEdit } from './faculty.svelte.js';
  import AccessDialog from './AccessDialog.svelte';
  import ContextMenu from './ContextMenu.svelte';
  import Icon from './Icon.svelte';
  import * as ui from './ask.svelte.js';
  import { dismiss } from './dismiss.js';
  import { librarySort, sorted } from './librarySort.svelte.js';
  import SortSelect from './SortSelect.svelte';
  import VersionDiffDialog from './VersionDiffDialog.svelte';
  import ProdiRekapDialog from './ProdiRekapDialog.svelte';
  import KelengkapanDialog from './KelengkapanDialog.svelte';
  import SopInfoDialog from './SopInfoDialog.svelte';
  import { review, setReviewYears, REVIEW_CHOICES, reviewSince, reviewDue, isReviewDue } from './review.svelte.js';
  import { formatTanggal, todayIso } from './model.js';
  import { registerXlsx } from './register.js';
  import { downloadBlob } from './files.js';
  import { rpsZip, rpsText, safeName } from './rpsZip.js';
  import { notes, copyLink, markMentionsSeen, unseenMentions } from './comments.svelte.js';

  /**
   * openIds: id RPS yang sedang terbuka di tab. onopen(sop), onupload(folder): di App.
   * onloaded(live): daftar baru dimuat, tab yang terbuka mengikuti hak akses terbaru. onrenamed(id, hasil renameSop): tab mengikuti.
   * onbinned(id): tab RPS yang dihapus ditutup. Bila tab dipertahankan karena ada perubahan belum tersimpan, hasilnya
   * fungsi untuk menautkannya lagi (dipakai Urungkan); selain itu false.
   * Panel di dialog Pustaka: open = dialognya terbuka, active = tab Daring yang tampil, host = elemen <dialog>,
   * tabs = pemilih tab di kepala panel, onclose() menutup dialog.
   * tabjson(id): isi tab yang sedang membuka RPS `id` (boleh belum tersimpan), atau null.
   * onrestoretab(id, json): memuat isi versi lama ke tab yang membuka RPS `id`.
   * onbook(sops, title): menggabungkan `sops` (baris pustaka, berurutan) menjadi satu PDF.
   */
  let { open = false, active = false, host, tabs, onclose, openIds = [], cansave = true, onopen, onupload, oncreate, onloaded, onrenamed, onbinned, onnotify, tabjson, onrestoretab, onbook, onopencomment } = $props();

  let moveDialog;
  let view = $state('sops'); // sops | mentions | bin
  let live = $state([]);
  let bin = $state([]);
  let folders = $state([]);
  let folderId = $state(null); // folder yang dipilih; null = tingkat utama
  const expanded = new SvelteSet();
  let moving = $state(null); // { item, isFolder, target }
  let accessTarget = $state(null);
  let infoOf = $state(null); // RPS yang detailnya sedang ditampilkan
  let menu = $state(null); // { x, y, items }
  let query = $state('');
  let busy = $state(false);
  let loadError = $state('');
  let history = $state(null); // { id, versions }
  let compare = $state(null); // { title, sources, left, right } untuk dialog Bandingkan versi
  let only = $state(''); // '' | 'due' (perlu ditinjau) | 'notes' (ada komentar terbuka): dari semua folder
  let groups = $state([]); // untuk nama grup di lencana hak akses
  // Filter daftar RPS (berlaku di semua folder, bersama pencarian). '' = tidak menyaring.
  const NO_FILTER = { owner: '', access: '', changed: '', code: '' };
  let filt = $state({ ...NO_FILTER });
  let filterOpen = $state(false);
  const filtering = $derived(Object.values(filt).some(Boolean));
  const resetFilters = () => Object.assign(filt, NO_FILTER);
  const CHANGED = [
    ['7', 'dalam 7 hari terakhir'],
    ['30', 'dalam 30 hari terakhir'],
    ['90', 'dalam 3 bulan terakhir'],
    ['365', 'dalam 1 tahun terakhir'],
    ['old', 'lebih dari 1 tahun lalu']
  ];

  const admin = $derived(faculty.status === 'in' && faculty.role === 'admin');

  // Tiap kali dialog dibuka, panel ini mulai dari daftar RPS lagi.
  let wasOpen = false;
  let loaded = $state(false);
  $effect(() => {
    if (open && !wasOpen) {
      query = '';
      history = null;
      only = '';
      resetFilters();
      filterOpen = false;
      view = 'sops';
      // Dibuka dari angka sebutan baru di tombol Pustaka: langsung ke daftar "Menyebut saya".
      untrack(() => {
        if (notes.wantMentions) openMentions();
        notes.wantMentions = false;
      });
      loaded = false;
    }
    wasOpen = open;
  });

  // Daftar dibaca sekali per pembukaan dialog (atau saat akun berubah), baru ketika tab Daring tampil,
  // tidak terus-menerus dan tidak tiap kali berpindah tab, agar hemat kuota baca.
  $effect(() => {
    if (open && active) F.start();
  });
  $effect(() => {
    if (faculty.status !== 'in') loaded = false;
    else if (open && active && !loaded) {
      loaded = true;
      refresh();
    }
  });

  $effect(() => {
    if (moving && !moveDialog.open) moveDialog.showModal();
    else if (!moving && moveDialog.open) moveDialog.close();
  });

  async function refresh() {
    busy = true;
    loadError = '';
    try {
      // Grup ikut dibaca (koleksi kecil) agar lencana hak akses menampilkan namanya, bukan sekadar jumlah.
      const [r, f, g] = await Promise.all([F.listSops(), F.listFolders(), F.listGroups().catch(() => groups)]);
      groups = g;
      // Penyebaran hak akses tidak boleh menghalangi tampilnya daftar; yang gagal dicoba lagi saat dimuat berikutnya.
      await F.reconcileAccess(f, [...r.live, ...r.bin]).catch(() => {});
      live = r.live.map(withText);
      bin = r.bin.map(withText);
      folders = f;
      onloaded(r.live);
      loadCounts(r.live.map((s) => s.id));
    } catch (e) {
      loadError = e.message;
    } finally {
      busy = false;
    }
  }
  /** Baris pustaka ditambah teks pencarian dan tanggal acuan tinjauan. */
  function withText(s) {
    let identitas = {};
    try {
      identitas = JSON.parse(s.json).identitas ?? {};
    } catch {}
    // Isian identitas untuk Detail dan daftar induk.
    const info = {
      kode: identitas.kode ?? '', prodi: identitas.prodi ?? '', semester: identitas.semester ?? '', tahunAkademik: identitas.tahunAkademik ?? '',
      sks: (identitas.sksTeori ?? 0) + (identitas.sksPraktikum ?? 0), dosen: (identitas.dosenPengelola ?? []).filter((d) => d?.trim()),
      koordinator: identitas.koordinator ?? '', tglPenyusunan: identitas.tglPenyusunan ?? ''
    };
    return { ...s, text: haystack({ ...s, fileName: null, tags: [s.createdByName, s.code] }), since: reviewSince(identitas), info };
  }

  const words = $derived(query.trim().toLowerCase().split(/\s+/).filter(Boolean));
  const isDue = (s) => isReviewDue(s.since, review.years);
  const DAY = 86400000;
  function passFilter(s) {
    const f = filt;
    if (f.owner && s.createdByEmail !== f.owner) return false;
    if (f.access) {
      const readers = s.readers ?? [];
      if (f.access === 'private' ? F.isShared(s) : !readers.includes(f.access)) return false;
    }
    if (f.changed) {
      const age = Date.now() - s.updatedAt;
      if (f.changed === 'old' ? age <= 365 * DAY : age > Number(f.changed) * DAY) return false;
    }
    if (f.code && (f.code === 'with') !== !!s.code) return false;
    return true;
  }
  const matchText = (s) => words.every((w) => s.text.includes(w));
  const matches = (s) => matchText(s) && (!only || (only === 'due' ? isDue(s) : openCount(s) > 0)) && passFilter(s);
  const searching = $derived(words.length > 0 || !!only || filtering);
  /** Pilihan filter Pemilik: pembuat RPS yang terlihat, akun ini paling atas. */
  const owners = $derived.by(() => {
    const m = new Map();
    for (const s of live) if (s.createdByEmail && !m.has(s.createdByEmail)) m.set(s.createdByEmail, s.createdByName || s.createdByEmail);
    const me = faculty.user?.email;
    return [...m].sort(([a, x], [b, y]) => (b === me) - (a === me) || x.localeCompare(y, 'id'));
  });
  const dueCount = $derived(live.filter(isDue).length);

  // ---- Komentar terbuka per RPS (dihitung sekali tiap daftar dimuat; RPS di tab aktif mengikuti panel komentar) ----
  let noteCounts = $state(new Map());
  async function loadCounts(ids) {
    try {
      noteCounts = await F.countOpenComments(ids);
    } catch {}
  }
  function openCount(s) {
    if (notes.sopId === s.id && notes.status === 'ready') return notes.list.filter((c) => !c.parent && !c.resolved).length;
    return noteCounts.get(s.id) ?? 0;
  }
  const notesCount = $derived(live.filter((s) => openCount(s) > 0).length);

  // ---- Komentar yang menyebut akun ini ----
  let seenBefore = $state(0); // batas "baru" saat daftar dibuka
  function openMentions() {
    seenBefore = notes.seen;
    view = 'mentions';
    history = null;
    markMentionsSeen();
  }
  const mentions = $derived([...notes.mine].sort((a, b) => b.at - a.at));
  const sopById = $derived(new Map(live.map((s) => [s.id, s])));
  const shortText = (t, n = 160) => (t.length > n ? t.slice(0, n) + '…' : t);
  const shownBin = $derived(bin.filter(matchText));

  // ---- Folder ----
  const byId = $derived(new Map(folders.map((f) => [f.id, f])));
  const parents = $derived(F.resolveParents(folders));
  const folderOf = (s) => (byId.has(s.folder) ? s.folder : null);
  const here = $derived(byId.has(folderId) ? folderId : null);
  const byName = (a, b) => a.name.localeCompare(b.name, 'id');
  const childrenOf = (id) => folders.filter((f) => parents.get(f.id) === id).sort(byName);
  /** Menambah isi hanya untuk pemilik folder dan admin; tingkat utama terbuka untuk semua anggota. */
  const canAdd = (id) => !id || (byId.has(id) && canManage(byId.get(id)));

  /** Folder dari tingkat teratas sampai `id`. */
  function pathOf(id) {
    const path = [];
    for (let f = byId.get(id); f; f = byId.get(parents.get(f.id))) path.unshift(f);
    return path;
  }
  const pathText = (id) => pathOf(id).map((f) => f.name).join(' / ');
  const crumbs = $derived(pathOf(here));

  /** Ringkasan isi folder untuk baris folder di panel kanan. */
  function folderInfo(f) {
    const subs = childrenOf(f.id).length;
    const n = counts.get(f.id) ?? 0;
    return [subs && `${subs} folder`, n && `${n} RPS`].filter(Boolean).join(', ') || 'Kosong';
  }

  // ---- Lebar pohon folder (bisa digeser, diingat per browser) ----
  const TREE_KEY = 'rps-editor.treeWidth';
  const TREE_MIN = 160;
  const TREE_DEFAULT = 250;
  let panes = $state();
  let treeW = $state(TREE_DEFAULT);
  try {
    const saved = Number(localStorage.getItem(TREE_KEY));
    if (saved >= TREE_MIN) treeW = saved;
  } catch {}
  const treeMax = () => Math.max(TREE_MIN, Math.min(600, (panes?.clientWidth ?? 900) - 360));
  function setTree(w) {
    treeW = Math.round(Math.min(treeMax(), Math.max(TREE_MIN, w)));
    try {
      localStorage.setItem(TREE_KEY, String(treeW));
    } catch {}
  }
  function splitDown(e) {
    if (e.button !== 0) return;
    e.preventDefault();
    const el = e.currentTarget;
    const left = panes.getBoundingClientRect().left;
    el.setPointerCapture(e.pointerId);
    const move = (ev) => setTree(ev.clientX - left);
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  }
  function splitKey(e) {
    const step = e.shiftKey ? 50 : 16;
    if (e.key === 'ArrowLeft') setTree(treeW - step);
    else if (e.key === 'ArrowRight') setTree(treeW + step);
    else if (e.key === 'Home') setTree(TREE_MIN);
    else if (e.key === 'End') setTree(treeMax());
    else return;
    e.preventDefault();
  }
  const shownLive = $derived(
    sorted(live.filter((s) => (searching ? matches(s) : folderOf(s) === here)), librarySort.by, titleOf, (s) => s.updatedAt)
  );
  /** Waktu perubahan terakhir di dalam folder (termasuk subfolder), untuk urutan menurut tanggal. */
  const activity = $derived.by(() => {
    const out = new Map(folders.map((f) => [f.id, f.createdAt ?? 0]));
    for (const s of live) {
      for (let id = folderOf(s), n = 0; id && n < 100; id = parents.get(id), n++) {
        if (s.updatedAt > (out.get(id) ?? 0)) out.set(id, s.updatedAt);
      }
    }
    return out;
  });
  const shownFolders = $derived(
    sorted(
      only || filtering ? [] : searching ? folders.filter((f) => words.every((w) => f.name.toLowerCase().includes(w))) : childrenOf(here),
      librarySort.by,
      (f) => f.name,
      (f) => activity.get(f.id) ?? 0
    )
  );
  const counts = $derived.by(() => {
    const out = new Map();
    for (const s of live) out.set(folderOf(s), (out.get(folderOf(s)) ?? 0) + 1);
    return out;
  });

  /** Semua folder berurutan menurut pohonnya, untuk pilihan tujuan pindah. */
  const flatTree = $derived.by(() => {
    const out = [];
    const walk = (id, depth) => {
      for (const f of childrenOf(id)) {
        out.push({ id: f.id, name: f.name, depth });
        walk(f.id, depth + 1);
      }
    };
    walk(null, 0);
    return out;
  });
  // Tujuan harus folder milik sendiri (admin: semua folder). Folder tidak bisa dipindahkan ke dirinya sendiri atau ke dalam subfoldernya.
  const moveTargets = $derived(flatTree.filter((t) => canAdd(t.id) && !insideMoved(moving?.entries ?? [], t.id)));

  // ---- Pilihan dan navigasi keyboard di daftar ----
  // `cursor`: baris yang sedang difokuskan. Pilihan (`selected`) terpisah dari kursor: Ctrl+klik/Spasi menandai satu,
  // Shift+klik/Shift+panah menandai rentang dari `anchor`. Tindakan berlaku untuk pilihan, atau baris kursor bila tidak ada pilihan.
  const selected = new SvelteSet();
  let anchor = null;
  let cursor = $state(null);
  let clip = $state(null); // entri yang dipotong (Ctrl+X), menunggu Ctrl+V
  let listEl = $state();
  let treeEl = $state();
  let search = $state();
  const rows = $derived(
    view === 'bin' ? shownBin.map((s) => entryOf(s, false)) : view === 'sops' ? [...shownFolders.map((f) => entryOf(f, true)), ...shownLive.map((s) => entryOf(s, false))] : []
  );
  const selRows = $derived(rows.filter((r) => selected.has(r.key)));
  // Pilihan dikosongkan setiap pindah folder, tampilan, atau pencarian.
  $effect(() => {
    view, here, query, only, filt.owner, filt.access, filt.changed, filt.code;
    untrack(() => {
      selected.clear();
      anchor = null;
    });
  });

  function selectRange(from, to) {
    const keys = rows.map((r) => r.key);
    let a = keys.indexOf(from);
    const b = keys.indexOf(to);
    if (b < 0) return;
    if (a < 0) a = b;
    selected.clear();
    for (let i = Math.min(a, b); i <= Math.max(a, b); i++) selected.add(keys[i]);
  }
  function toggleSel(key) {
    if (!selected.delete(key)) selected.add(key);
    anchor = key;
  }
  /** Klik baris: Ctrl/Cmd menandai satu, Shift menandai rentang, klik biasa membuka. */
  function rowClick(e, row, open) {
    const prev = cursor;
    cursor = row.key;
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      toggleSel(row.key);
    } else if (e.shiftKey) {
      e.preventDefault();
      if (!selected.size || !anchor) anchor = prev ?? row.key;
      selectRange(anchor, row.key);
    } else open();
  }
  function pickClick(e, row) {
    e.stopPropagation();
    const prev = cursor;
    cursor = row.key;
    if (e.shiftKey && (selected.size ? anchor : prev)) {
      if (!selected.size || !anchor) anchor = prev;
      selectRange(anchor, row.key);
    } else toggleSel(row.key);
  }
  /** Sasaran tindakan: pilihan, atau baris kursor bila tidak ada yang dipilih. */
  const targets = () => (selRows.length ? selRows : rows.filter((r) => r.key === cursor));

  async function focusRow(key) {
    await tick();
    const el = key && listEl?.querySelector(`[data-key="${CSS.escape(key)}"] .main`);
    if (el) {
      cursor = key;
      el.focus();
      el.scrollIntoView({ block: 'nearest' });
    } else listEl?.focus();
  }
  /** Masuk ke folder lewat keyboard, lalu fokus ke baris pertama isinya (atau ke `key`). */
  async function enterFolder(id, key) {
    select(id);
    await tick();
    focusRow(key ?? rows[0]?.key);
  }
  function openRow(row) {
    if (view === 'bin') return;
    if (row.isFolder) enterFolder(row.item.id);
    else openSop(row.item);
  }
  function renameRow(row) {
    if (view === 'bin' || !canEdit(row.item)) return;
    row.isFolder ? renameFolder(row.item) : rename(row.item);
  }
  function cut(list) {
    const own = list.filter((d) => canManage(d.item));
    if (!own.length) return onnotify('Tidak ada yang bisa dipindahkan di antara yang dipilih');
    clip = own;
    onnotify(`${countText(own)} dipotong. Buka folder tujuan, lalu tekan Ctrl+V.`);
  }
  function paste(target = here) {
    if (!clip || view !== 'sops') return;
    const list = clip;
    clip = null;
    moveMany(list, target);
  }
  function removeRows(list) {
    if (view === 'bin') purgeMany(list.map((d) => d.item));
    else deleteMany(list);
  }

  function listKey(e) {
    const t = e.target;
    if (t.matches('input:not(.pick), textarea, select')) return;
    const onRow = t === listEl || !!t.closest('.main') || t.matches('.pick');
    const i = rows.findIndex((r) => r.key === cursor);
    const row = rows[i];
    const ctrl = e.ctrlKey || e.metaKey;
    const go = (j) => {
      const next = rows[Math.max(0, Math.min(rows.length - 1, j))];
      if (!next) return;
      if (e.shiftKey) {
        if (!selected.size || !anchor) anchor = cursor ?? next.key;
        selectRange(anchor, next.key);
      }
      focusRow(next.key);
    };
    const k = e.key;
    if (k === 'ArrowDown') go(i < 0 ? 0 : i + 1);
    else if (k === 'ArrowUp' && e.altKey) here && !searching && enterFolder(parents.get(here) ?? null, 'f:' + here);
    else if (k === 'ArrowUp') go(i < 0 ? 0 : i - 1);
    else if (k === 'Home') go(0);
    else if (k === 'End') go(rows.length - 1);
    else if (k === 'PageDown') go(i + 10);
    else if (k === 'PageUp') go(i - 10);
    else if (!onRow) return;
    else if (k === 'Enter' && row && !ctrl) openRow(row);
    else if (k === ' ' && row && !t.matches('.pick')) {
      if (e.shiftKey && anchor) selectRange(anchor, row.key);
      else toggleSel(row.key);
    } else if (k === 'a' && ctrl) rows.forEach((r) => selected.add(r.key));
    else if (k === 'Escape' && (selected.size || clip)) {
      if (selected.size) selected.clear();
      else clip = null;
    } else if (k === 'Delete' && targets().length) removeRows(targets());
    else if (k === 'F2' && row) renameRow(row);
    else if (k === 'Backspace' && here && !searching && view === 'sops') enterFolder(parents.get(here) ?? null, 'f:' + here);
    else if (k === 'x' && ctrl && view === 'sops' && targets().length) cut(targets());
    else if ((k === 'ContextMenu' || (k === 'F10' && e.shiftKey)) && row) {
      const r = listEl.querySelector(`[data-key="${CSS.escape(row.key)}"] .main`).getBoundingClientRect();
      showRowMenu(r.left + 24, r.bottom - 4, row);
    } else return;
    e.preventDefault();
    e.stopPropagation();
  }

  /** Pohon folder: ↑/↓ berpindah folder, → membuka cabang atau masuk ke subfolder, ← menutup cabang atau naik ke induk. */
  function treeKey(e) {
    const btns = [...treeEl.querySelectorAll('.tname')];
    const i = btns.indexOf(document.activeElement);
    if (i < 0) return;
    const idOf = (b) => b.closest('[data-id]').dataset.id || null;
    const id = idOf(btns[i]);
    const go = (b) => {
      if (!b) return;
      b.focus();
      select(idOf(b));
    };
    const kids = id ? childrenOf(id).length : 1;
    if (e.key === 'ArrowDown') go(btns[i + 1]);
    else if (e.key === 'ArrowUp') go(btns[i - 1]);
    else if (e.key === 'Home') go(btns[0]);
    else if (e.key === 'End') go(btns.at(-1));
    else if (e.key === 'ArrowRight') {
      if (id && kids && !expanded.has(id)) expanded.add(id);
      else if (kids) go(btns[i + 1]);
    } else if (e.key === 'ArrowLeft') {
      if (id && kids && expanded.has(id)) expanded.delete(id);
      else if (id) go(treeEl.querySelector(`[data-id="${CSS.escape(parents.get(id) ?? '')}"] .tname`));
    } else if (e.key === 'F2' && id && canEdit(byId.get(id))) renameFolder(byId.get(id));
    else if (e.key === 'Delete' && id && canManage(byId.get(id))) removeFolder(byId.get(id));
    else return;
    e.preventDefault();
  }

  /** Pintasan yang berlaku di seluruh panel (bukan saat mengetik). */
  function panelKey(e) {
    if (!open || !active || faculty.status !== 'in' || moving || accessTarget || menu) return;
    // Hanya bila dialog Pustaka yang teratas (bukan saat ada dialog lain di atasnya).
    if ([...document.querySelectorAll('dialog[open]')].filter((d) => d.matches(':modal')).at(-1) !== host) return;
    const t = e.target;
    const typing = t.matches?.('input:not(.pick), textarea, select, [contenteditable]');
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && e.key === 'f') {
      search?.focus();
      search?.select();
    } else if (typing) return;
    else if (ctrl && e.key === 'z' && !e.shiftKey) {
      if (!undoLast()) return;
    } else if (ctrl && e.key === 'v' && clip && view === 'sops' && !searching) paste();
    else return;
    e.preventDefault();
  }

  function select(id) {
    view = 'sops';
    folderId = id;
    query = '';
    only = '';
    resetFilters();
    history = null;
    for (const f of pathOf(id)) expanded.add(f.id);
  }
  function toggle(id) {
    if (!expanded.delete(id)) expanded.add(id);
  }

  const nameTaken = (name, parent, except) =>
    folders.some((f) => f.id !== except && parents.get(f.id) === parent && f.name.toLowerCase() === name.toLowerCase());
  const askName = async (title, current = '', ok = 'Simpan') =>
    (await ui.prompt('Nama folder', current, { title, ok, maxlength: 120 }))?.trim().slice(0, 120).trim();
  const takenMessage = (name) => `Sudah ada folder bernama "${name}" di lokasi ini.`;

  async function newFolder(parent = here) {
    const name = await askName('Folder baru', '', 'Buat');
    if (!name) return;
    if (nameTaken(name, parent)) return ui.alert(takenMessage(name));
    if (parent) expanded.add(parent);
    act(() => F.createFolder(name, parent), 'Folder dibuat');
  }

  async function renameFolder(f) {
    const name = await askName('Ubah nama folder', f.name);
    if (!name || name === f.name) return;
    if (nameTaken(name, parents.get(f.id), f.id)) return ui.alert(takenMessage(name));
    act(() => F.renameFolder(f.id, name), 'Nama folder diubah');
  }

  // Yang dihitung hanya isi yang terlihat. Isi dengan hak khusus milik orang lain akan tampil di tingkat utama
  // bagi pemiliknya setelah foldernya dihapus, jadi tidak hilang.
  async function removeFolder(f) {
    const subs = childrenOf(f.id).length;
    const sops = live.filter((s) => folderOf(s) === f.id).length;
    if (subs || sops) {
      const isi = [subs && `${subs} subfolder`, sops && `${sops} RPS`].filter(Boolean).join(' dan ');
      return ui.alert(`Folder "${f.name}" masih berisi ${isi}. Pindahkan isinya dulu. RPS milik orang lain hanya bisa dipindahkan oleh pemiliknya atau admin.`, { title: 'Folder belum kosong' });
    }
    if (!(await ui.confirm(`Hapus folder "${f.name}"?`, { ok: 'Hapus', danger: true }))) return;
    if (folderId === f.id) folderId = parents.get(f.id) ?? null;
    act(() => F.deleteFolder(f.id), 'Folder dihapus');
  }

  function submitMove(e) {
    e.preventDefault();
    const { entries, target } = moving;
    moving = null;
    moveMany(entries, target);
  }

  // ---- Entri: { key, item, isFolder }. key 'f:<id>' untuk folder, 's:<id>' untuk RPS. ----
  const entryOf = (item, isFolder) => ({ key: (isFolder ? 'f:' : 's:') + item.id, item, isFolder });
  const parentOf = (d) => (d.isFolder ? (parents.get(d.item.id) ?? null) : folderOf(d.item));
  const nameOf = (d) => (d.isFolder ? d.item.name : titleOf(d.item));
  const countText = (list) => (list.length === 1 ? `"${nameOf(list[0])}"` : `${list.length} item`);
  /** Entri dengan data terbaru (daftar bisa sudah dimuat ulang); yang sudah tidak ada dibuang. */
  function fresh(list) {
    return list.map((d) => ({ ...d, item: d.isFolder ? byId.get(d.item.id) : live.find((s) => s.id === d.item.id) })).filter((d) => d.item);
  }
  /** Folder di `list` tidak boleh dipindahkan ke dirinya sendiri atau subfoldernya. */
  const insideMoved = (list, target) => !!target && list.some((d) => d.isFolder && pathOf(target).some((a) => a.id === d.item.id));

  /** Memindahkan beberapa item ke `target` (null = Utama). Hasilnya bisa diurungkan dari pesan yang muncul. */
  async function moveMany(list, target) {
    const todo = fresh(list).filter((d) => parentOf(d) !== target && canManage(d.item));
    if (insideMoved(todo, target)) return ui.alert('Folder tidak bisa dipindahkan ke dalam dirinya sendiri atau subfoldernya.');
    const names = new Set();
    const clash = [];
    const go = todo.filter((d) => {
      if (!d.isFolder) return true;
      const k = d.item.name.toLowerCase();
      if (nameTaken(d.item.name, target, d.item.id) || names.has(k)) return !clash.push(d.item.name);
      return names.add(k);
    });
    const dest = byId.get(target) ?? null;
    const done = [];
    let err;
    if (go.length) {
      if (target) expanded.add(target);
      try {
        for (const d of go) {
          const from = parentOf(d);
          await (d.isFolder ? F.moveFolder(d.item, dest) : F.moveSop(d.item, dest));
          done.push({ ...d, from });
        }
      } catch (e) {
        err = e;
      }
      selected.clear();
      await refresh();
    }
    const problems = [err?.message, clash.length && `Tidak dipindahkan karena sudah ada folder bernama ${clash.map((n) => `"${n}"`).join(', ')} di tujuan.`].filter(Boolean);
    if (problems.length) ui.alert(problems.join('\n\n'));
    if (done.length) offerUndo(`${countText(done)} dipindahkan ke ${dest?.name ?? 'Utama'}`, () => undoMove(done));
  }
  function undoMove(done) {
    act(async () => {
      for (const d of [...done].reverse()) {
        const back = byId.get(d.from) ?? null;
        await (d.isFolder ? F.moveFolder(d.item, back) : F.moveSop(d.item, back));
      }
    }, 'Pemindahan dibatalkan');
  }

  // ---- Urungkan (tombol di pesan atau Ctrl+Z selama pesannya masih tampil) ----
  let undoFn = null;
  let undoAt = 0;
  function offerUndo(msg, fn) {
    let used = false;
    const run = () => {
      if (used) return;
      used = true;
      undoFn = null;
      fn();
    };
    undoFn = run;
    undoAt = Date.now();
    onnotify(msg, { label: 'Urungkan', run });
  }
  function undoLast() {
    if (!undoFn || Date.now() - undoAt > 8000) return false;
    onnotify('');
    undoFn();
    return true;
  }

  // ---- Seret dan lepas ----
  // Yang bisa diseret: RPS dan folder yang boleh dipindahkan (pemilik dan admin). Bila yang diseret termasuk pilihan,
  // semua yang dipilih ikut. Tempat lepas: folder di pohon, breadcrumb, folder di daftar, dan area daftar.
  // Berkas dari luar (ZIP berisi .rps, .rps, .json, PDF/DOCX hasil ekspor) juga bisa dilepas ke tempat yang sama: diimpor.
  let drag = $state(null); // { entries }
  let dropAt = $state(undefined); // id folder yang sedang disorot; null = Utama
  let hoverTimer;
  const fileDrag = (e) => !drag && !!e.dataTransfer?.types.includes('Files');
  function canDrop(target, files = false) {
    if (files) return !importing && canAdd(target);
    if (!drag || !canAdd(target) || drag.entries.every((d) => parentOf(d) === target)) return false;
    return !insideMoved(drag.entries, target);
  }
  const dragged = (id) => !!drag?.entries.some((d) => d.item.id === id) || !!clip?.some((d) => d.item.id === id);
  function dragStart(e, item, isFolder) {
    const own = entryOf(item, isFolder);
    const entries = (selected.has(own.key) ? selRows : [own]).filter((d) => canManage(d.item));
    if (!entries.length) return e.preventDefault();
    e.stopPropagation();
    menu = null;
    drag = { entries };
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', entries.map(nameOf).join('\n'));
    if (entries.length > 1) {
      // Gambar seret berisi jumlah item. Ditempel di dialog karena isi di bawah dialog modal tidak digambar.
      const ghost = document.createElement('div');
      ghost.textContent = `${entries.length} item`;
      ghost.style.cssText = 'position:fixed;top:-100px;left:0;padding:4px 10px;border-radius:6px;background:#1f4e8c;color:#fff;font:600 13px system-ui';
      (host ?? document.body).appendChild(ghost);
      e.dataTransfer.setDragImage(ghost, -8, -8);
      setTimeout(() => ghost.remove());
    }
  }
  function dragOver(e, target) {
    const files = fileDrag(e);
    if (!drag && !files) return;
    e.stopPropagation();
    if (!canDrop(target, files)) {
      // Berkas tetap ditahan di sini agar tidak jatuh ke editor (yang akan membukanya di tab).
      if (files) e.preventDefault();
      e.dataTransfer.dropEffect = 'none';
      if (dropAt === target) dropAt = undefined;
      return;
    }
    e.preventDefault();
    e.dataTransfer.dropEffect = files ? 'copy' : 'move';
    if (dropAt !== target) {
      dropAt = target;
      clearTimeout(hoverTimer);
      // Folder tertutup terbuka sendiri bila disorot sebentar, agar subfoldernya bisa dituju.
      if (target && !expanded.has(target)) hoverTimer = setTimeout(() => dropAt === target && expanded.add(target), 700);
    }
  }
  function dragLeave(e, target) {
    if (dropAt === target && !e.currentTarget.contains(e.relatedTarget)) dropAt = undefined;
  }
  function dropOn(e, target) {
    e.preventDefault();
    e.stopPropagation();
    const files = fileDrag(e);
    const d = drag;
    const ok = canDrop(target, files);
    dragEnd();
    if (files) {
      if (ok) importFiles([...e.dataTransfer.files], target);
      else if (!importing) ui.alert(noAddTip);
    } else if (d && ok) moveMany(d.entries, target);
  }
  function dragEnd() {
    clearTimeout(hoverTimer);
    drag = null;
    dropAt = undefined;
  }
  /** Atribut tempat lepas untuk folder `target` (null = Utama). */
  const dropzone = (target) => ({
    ondragover: (e) => dragOver(e, target),
    ondragenter: (e) => dragOver(e, target),
    ondragleave: (e) => dragLeave(e, target),
    ondrop: (e) => dropOn(e, target)
  });

  // ---- Impor banyak RPS sekaligus ----
  let importing = $state(null); // { done, total }
  let importInput;
  const placeName = (id) => (id ? byId.get(id)?.name : 'Utama');
  const list = (rows, max = 8) => rows.slice(0, max).join('\n') + (rows.length > max ? `\n… dan ${rows.length - max} lainnya` : '');

  function pickImport(target = here) {
    importInput.dataset.target = target ?? '';
    importInput.value = '';
    importInput.click();
  }

  /**
   * Mengunggah RPS dari ZIP/berkas ke folder `target` sebagai RPS baru milik akun ini.
   * Subfolder di dalam ZIP dibuat ulang di bawah `target`; folder bernama sama yang boleh diisi dipakai ulang.
   */
  async function importFiles(files, target) {
    if (importing || !files.length) return;
    if (!canAdd(target)) return ui.alert(noAddTip);
    let res;
    try {
      res = await readRpsFiles(files);
    } catch (e) {
      return ui.alert(e.message);
    }
    const { items, skipped } = res;
    const skippedText = skipped.length ? `\n\nDilewati (${skipped.length}):\n${list(skipped.map((s) => `• ${s.name}: ${s.reason}`))}` : '';
    if (!items.length) return ui.alert(`Tidak ada RPS yang bisa diunggah. Lepaskan berkas .rps, atau berkas .zip berisi berkas .rps.${skippedText}`, { title: 'Tidak ada yang diunggah' });
    const dirs = new Set(items.flatMap((i) => i.folders.map((_, k) => i.folders.slice(0, k + 1).join('/'))));
    const msg =
      `Unggah ${items.length} RPS ke ${target ? `folder ${placeName(target)}` : 'Utama'}?` +
      (dirs.size ? `\n\nFolder di dalam ZIP ikut dibuat (${dirs.size} folder). Folder yang namanya sudah ada di sini dipakai.` : '') +
      `\n\n${list(items.map((i) => `• ${i.title}`))}${skippedText}`;
    if (!(await ui.confirm(msg, { title: 'Unggah ke Pustaka Daring', ok: 'Unggah' }))) return;

    importing = { done: 0, total: items.length };
    const made = new Map(); // 'A/B' → Promise<id folder>
    const ensureFolder = (path) => {
      let p = Promise.resolve(target);
      path.forEach((_, k) => {
        const key = path.slice(0, k + 1).join('/');
        if (!made.has(key)) {
          const name = path[k].slice(0, 120).trim();
          made.set(key, p.then((parent) => {
            const same = folders.find((f) => (parents.get(f.id) ?? null) === parent && f.name.toLowerCase() === name.toLowerCase());
            if (same && !canAdd(same.id)) throw new Error(`folder "${name}" sudah ada dan bukan milik Anda`);
            return same ? same.id : F.createFolder(name, parent);
          }));
        }
        p = made.get(key);
      });
      return p;
    };
    const failed = [];
    let ok = 0;
    let stopped = false;
    for (const it of items) {
      try {
        await F.uploadSop(it.doc, it.title, await ensureFolder(it.folders));
        ok++;
      } catch (e) {
        failed.push(`• ${it.name}: ${e.message}`);
        if (e.code === 'full') {
          stopped = true; // penyimpanan penuh: sisanya pasti gagal juga
          break;
        }
      }
      importing.done++;
    }
    importing = null;
    if (target) expanded.add(target);
    await refresh();
    if (ok) onnotify(`${ok} RPS diunggah ke ${placeName(target)}`);
    if (failed.length) {
      const rest = stopped ? `\n\n${items.length - ok - failed.length} RPS lainnya tidak diunggah.` : '';
      ui.alert(`${failed.length} RPS gagal diunggah:\n\n${list(failed)}${rest}`, { title: ok ? 'Sebagian gagal diunggah' : 'Gagal mengunggah' });
    }
  }

  async function act(fn, done) {
    try {
      await fn();
      if (done) onnotify(done);
    } catch (e) {
      ui.alert(e.message);
    }
    await refresh();
  }

  /** Nama di pustaka: kode pustaka (bila ada) lalu nama RPS. Kodenya tidak ikut ke isi RPS. */
  const titleOf = (s) => [s.code, s.title || 'RPS tanpa judul'].filter(Boolean).join(' ');

  async function changeCode(s) {
    const raw = await ui.prompt('Kode hanya tampil di pustaka sebagai awalan nama, misalnya A.1 atau Smt-3, dan tidak tampil di dokumen RPS. Kosongkan untuk menghapus kode.', s.code ?? '', { title: 'Kode pustaka', ok: 'Simpan', maxlength: 40 });
    if (raw == null) return;
    const code = raw.trim().replace(/\s+/g, ' ').slice(0, 40);
    if (code === (s.code ?? '')) return;
    try {
      await F.setSopCode(s.id, code);
      live = live.map((x) => (x.id === s.id ? { ...x, code } : x));
      onnotify(code ? 'Kode pustaka disimpan' : 'Kode pustaka dihapus');
    } catch (e) {
      ui.alert(e.message);
    }
  }
  const isOpen = (s) => openIds.includes(s.id);

  // Awalan nama seperti "B.2" atau "B.2.1." dipindah menjadi kode pustaka; sisanya menjadi nama RPS.
  const PREFIX = /^([A-Za-z](?:\.\d+)+)\.?\s+(\S.*)$/;
  const prefixOf = (s) => (canEdit(s) && !s.deletedAt ? (s.title ?? '').trim().match(PREFIX) : null);
  const withPrefix = (list) => list.filter((d) => !d.isFolder && prefixOf(d.item)).map((d) => d.item);

  async function prefixToCode(sops) {
    sops = sops.filter((s) => prefixOf(s));
    if (!sops.length) return;
    const sample = sops.slice(0, 3).map((s) => `"${s.title}"`).join(', ') + (sops.length > 3 ? `, dan ${sops.length - 3} lainnya` : '');
    const ok = await ui.confirm(`Awalan nama ${sops.length} RPS (${sample}) akan dipindah ke kode pustaka. Nama RPS di dokumennya ikut berubah dan tercatat sebagai versi baru.`, { title: 'Pindahkan awalan ke kode', ok: 'Pindahkan' });
    if (!ok) return;
    const failed = [];
    for (const s of sops) {
      const [, code, title] = prefixOf(s);
      try {
        onrenamed(s.id, await F.renameSop(s.id, title));
        await F.setSopCode(s.id, code);
      } catch (e) {
        failed.push(`${s.title}: ${e.message}`);
      }
    }
    selected.clear();
    await refresh();
    const done = sops.length - failed.length;
    if (done) onnotify(`Awalan ${done} RPS dipindah ke kode pustaka`);
    if (failed.length) ui.alert(`${failed.length} RPS tidak bisa diubah:\n${failed.join('\n')}`, { title: 'Sebagian gagal' });
  }

  /** RPS kosong dibuat di `folder` lalu langsung dibuka di tab baru. */
  async function newSop(folder = here) {
    const name = (await ui.prompt('Nama RPS', '', { title: 'RPS baru', ok: 'Buat', maxlength: 300 }))?.trim();
    if (!name) return;
    try {
      await oncreate(name, folder);
      onclose();
      onnotify('RPS baru dibuat');
    } catch (e) {
      ui.alert(e.message);
    }
  }

  function openSop(s) {
    // Sedang diedit orang lain: dialog tetap terbuka (App juga memeriksa langsung ke server sebelum membuka).
    if (namesEditing(s) && !isOpen(s)) return ui.alert(`RPS ini sedang diedit oleh ${namesEditing(s)}, jadi belum bisa dibuka. Coba lagi setelah selesai.`, { title: 'RPS terkunci' });
    onclose();
    onopen(s);
  }

  async function rename(s) {
    const name = (await ui.prompt('Nama RPS', s.title, { title: 'Ubah nama RPS', ok: 'Simpan' }))?.trim();
    if (!name || name === s.title) return;
    act(async () => onrenamed(s.id, await F.renameSop(s.id, name)), 'Nama RPS diubah');
  }

  const moveToBin = (s) => deleteMany([entryOf(s, false)]);

  /**
   * Menghapus beberapa item. RPS masuk Recycle bin tanpa konfirmasi dan bisa diurungkan dari pesan yang muncul.
   * Folder harus kosong (isinya boleh ikut dihapus bersamanya), dihapus permanen, jadi diminta konfirmasi dulu.
   */
  async function deleteMany(list) {
    list = fresh(list).filter((d) => canManage(d.item));
    if (!list.length) return;
    const sops = list.filter((d) => !d.isFolder).map((d) => d.item);
    const dirs = list.filter((d) => d.isFolder).map((d) => d.item);
    if (dirs.length) {
      const gone = new Set(list.map((d) => d.item.id));
      const full = dirs.filter((f) => childrenOf(f.id).some((c) => !gone.has(c.id)) || live.some((s) => folderOf(s) === f.id && !gone.has(s.id)));
      if (full.length) {
        const what = full.length === 1 ? `Folder "${full[0].name}" masih` : `${full.length} folder masih`;
        return ui.alert(`${what} berisi item yang tidak ikut dihapus. Pindahkan isinya dulu, atau pilih isinya juga. RPS milik orang lain hanya bisa dipindahkan oleh pemiliknya atau admin.`, { title: 'Folder belum kosong' });
      }
      const what = [dirs.length === 1 ? `folder "${dirs[0].name}"` : `${dirs.length} folder`, sops.length && `${sops.length} RPS`].filter(Boolean).join(' dan ');
      const note = sops.length ? '\n\nRPS masuk Recycle bin dan bisa dikembalikan, tetapi folder yang dihapus tidak bisa dikembalikan.' : '';
      if (!(await ui.confirm(`Hapus ${what}?${note}`, { ok: 'Hapus', danger: true }))) return;
    }
    const done = [];
    let removed = 0;
    let err;
    try {
      for (const s of sops) {
        await F.moveToBin(s.id);
        done.push({ s, relink: onbinned(s.id) });
      }
      // Subfolder lebih dulu, baru induknya.
      for (const f of dirs.sort((a, b) => pathOf(b.id).length - pathOf(a.id).length)) {
        if (folderId === f.id) folderId = parents.get(f.id) ?? null;
        await F.deleteFolder(f.id);
        removed++;
      }
    } catch (e) {
      err = e;
    }
    selected.clear();
    await refresh();
    if (err) ui.alert(err.message);
    if (done.length) {
      const kept = done.some((d) => d.relink) ? '. Perubahan yang belum tersimpan masih ada di tabnya.' : '';
      const sopText = done.length === 1 ? `"${titleOf(done[0].s)}"` : `${done.length} RPS`;
      const dirText = removed ? ` dan ${removed} folder dihapus` : '';
      offerUndo(`${sopText} dipindahkan ke Recycle bin${dirText}${kept}`, () => undoBin(done));
    } else if (removed) onnotify(removed === 1 ? 'Folder dihapus' : `${removed} folder dihapus`);
  }
  function undoBin(done) {
    act(async () => {
      for (const { s, relink } of done) {
        await F.restoreFromBin(s.id);
        if (relink) relink();
      }
    }, done.length === 1 ? `"${titleOf(done[0].s)}" dikembalikan` : `${done.length} RPS dikembalikan`);
  }

  const duplicate = (s) => act(() => F.duplicateSop(s), 'Salinan dibuat');
  const startMove = (list) => list.length && (moving = { entries: list, target: parentOf(list[0]) });
  const moveSop = (s) => startMove([entryOf(s, false)]);
  const moveFolder = (f) => startMove([entryOf(f, true)]);
  const restoreFromBin = (s) => restoreMany([s]);
  function restoreMany(list) {
    selected.clear();
    act(async () => {
      for (const s of list) await F.restoreFromBin(s.id);
    }, list.length === 1 ? 'RPS dipulihkan' : `${list.length} RPS dipulihkan`);
  }

  const purge = (s) => purgeMany([s]);
  async function purgeMany(list) {
    const what = list.length === 1 ? `"${titleOf(list[0])}"` : `${list.length} RPS`;
    const msg = `Hapus ${what} secara permanen?\n\nSeluruh riwayat versinya, termasuk suntingan orang lain, ikut terhapus. Tindakan ini tidak bisa dibatalkan.`;
    if (!(await ui.confirm(msg, { title: 'Hapus permanen', ok: 'Hapus permanen', danger: true }))) return;
    selected.clear();
    act(async () => {
      for (const s of list) await F.purgeSop(s);
    }, 'Dihapus permanen');
  }

  async function toggleHistory(s) {
    if (history?.id === s.id) return (history = null);
    try {
      history = { id: s.id, versions: await F.listVersions(s.id) };
    } catch (e) {
      ui.alert(e.message);
    }
  }

  const reloadHistory = async (s) => {
    if (history?.id === s.id) history = { id: s.id, versions: await F.listVersions(s.id) };
  };
  const sumSize = (vs) => vs.reduce((a, v) => a + (v.size ?? 0), 0);

  /** Menghapus versi riwayat `list` satu per satu (pemilik dan admin). */
  async function pruneMany(s, list, done) {
    await act(async () => {
      for (const v of list) await F.pruneVersion(s.id, v.rev);
    }, done);
    await reloadHistory(s).catch(() => {});
  }

  async function pruneOne(s, v) {
    const msg = `Hapus versi ${when(v.savedAt)} (${v.savedByName}) dari riwayat "${titleOf(s)}"?\n\nVersi ini tidak bisa dikembalikan lagi.`;
    if (!(await ui.confirm(msg, { title: 'Hapus versi', ok: 'Hapus', danger: true }))) return;
    pruneMany(s, [v], 'Versi dihapus dari riwayat');
  }

  /** Menyisakan sejumlah versi terbaru; sisanya dihapus. */
  async function pruneOld(s) {
    const versions = history?.id === s.id ? history.versions : await F.listVersions(s.id);
    if (!versions.length) return ui.alert('RPS ini belum punya versi lama.');
    const raw = await ui.prompt(`Simpan berapa versi terbaru? Versi yang lebih lama dihapus. Isi 0 untuk menghapus seluruh riwayat (isi saat ini tetap utuh).\n\nSaat ini ada ${versions.length} versi lama (${size(sumSize(versions))}).`, String(Math.min(5, versions.length - 1)), { title: 'Hapus riwayat lama', ok: 'Lanjut', type: 'number' });
    if (raw == null) return;
    const keep = Math.floor(Number(raw));
    if (!Number.isFinite(keep) || keep < 0) return ui.alert('Isi dengan angka 0 atau lebih.');
    const drop = versions.slice(keep); // urut dari yang terbaru
    if (!drop.length) return ui.alert(`Riwayat sudah berisi ${versions.length} versi atau kurang; tidak ada yang dihapus.`);
    const oldest = drop.at(-1);
    const msg = `Hapus ${drop.length} versi lama "${titleOf(s)}" (${size(sumSize(drop))}), dari ${when(oldest.savedAt)} sampai ${when(drop[0].savedAt)}?` +
      `\n\n${keep ? `${keep} versi terbaru tetap disimpan.` : 'Seluruh riwayat dihapus; isi saat ini tetap utuh.'} Tindakan ini tidak bisa dibatalkan.`;
    if (!(await ui.confirm(msg, { title: 'Hapus riwayat lama', ok: `Hapus ${drop.length} versi`, danger: true }))) return;
    pruneMany(s, drop, `${drop.length} versi lama dihapus`);
  }

  async function restoreVersion(s, v) {
    if (isOpen(s)) {
      // RPS sedang terbuka: isi versi lama dimuat ke tabnya sebagai perubahan biasa (bisa di-Undo), baru masuk ke
      // Pustaka Daring setelah disimpan. Dengan begitu suntingan di tab tidak tertimpa diam-diam.
      const msg = `Muat isi versi ${when(v.savedAt)} ke tab "${titleOf(s)}" yang sedang terbuka?\n\nIsi tab diganti, tetapi bisa dibatalkan dengan Urungkan (Ctrl+Z). Simpan ke Pustaka Daring untuk menjadikannya isi terkini.`;
      if (!(await ui.confirm(msg, { title: 'Kembalikan versi', ok: 'Muat ke tab' }))) return;
      history = null;
      onclose();
      onrestoretab(s.id, v.json);
      return;
    }
    const msg = `Kembalikan isi "${titleOf(s)}" ke versi ${when(v.savedAt)}? Isi saat ini tetap tersimpan di Riwayat.`;
    if (!(await ui.confirm(msg, { ok: 'Kembalikan' }))) return;
    history = null;
    act(() => F.restoreVersion(s.id, v), 'Versi lama dikembalikan');
  }

  /** Dialog Bandingkan versi: `v` dibandingkan dengan isi terkini (atau versi `v` saja bila tidak diberikan). */
  async function compareVersions(s, v = null) {
    let versions;
    try {
      versions = history?.id === s.id ? history.versions : await F.listVersions(s.id);
    } catch (e) {
      return ui.alert(e.message);
    }
    if (!versions.length) return ui.alert('RPS ini belum punya versi lama untuk dibandingkan.');
    const tab = isOpen(s) ? tabjson?.(s.id) : null;
    const sources = [
      ...(tab && tab !== s.json ? [{ key: 'tab', label: 'Isi di tab (belum disimpan)', json: tab }] : []),
      { key: 'cur', label: `Isi terkini · ${when(s.updatedAt)} · ${s.updatedByName}`, json: s.json },
      ...versions.map((x) => ({ key: 'v' + x.rev, label: `${when(x.savedAt)} · ${x.savedByName}`, json: x.json }))
    ];
    compare = { title: titleOf(s), sources, left: 'v' + (v ?? versions[0]).rev, right: 'cur' };
  }

  // ---- Gabung jadi satu PDF ----
  /** RPS pada entri `list`, termasuk isi folder (dan subfoldernya) yang dipilih, dalam urutan tampilan daftar. */
  function sopsOf(list) {
    const out = [];
    const seen = new Set();
    const put = (s) => !seen.has(s.id) && (seen.add(s.id), out.push(s));
    const walk = (id, depth = 0) => {
      if (depth > 50) return;
      for (const s of sorted(live.filter((x) => folderOf(x) === id), librarySort.by, titleOf, (x) => x.updatedAt)) put(s);
      for (const f of childrenOf(id)) walk(f.id, depth + 1);
    };
    for (const d of list) (d.isFolder ? walk(d.item.id) : put(d.item));
    return out;
  }
  async function makeBook(list) {
    const sops = sopsOf(list);
    if (!sops.length) return ui.alert('Tidak ada RPS di pilihan ini.');
    const folder = list.length === 1 && list[0].isFolder ? list[0].item.name : '';
    const raw = await ui.prompt(
      `${sops.length} RPS digabung menjadi satu PDF, diawali halaman daftar isi yang bisa diklik. Judul halaman depan:`,
      folder ? `Kumpulan RPS ${folder}` : 'Kumpulan RPS',
      { title: 'Gabung jadi satu PDF', ok: 'Buat PDF', maxlength: 200 }
    );
    const title = raw?.trim().replace(/\s+/g, ' ');
    if (!title) return;
    onclose();
    onbook(sops, title);
  }

  // ---- Rekap CPL: matriks mata kuliah × CPL untuk RPS pilihan atau isi folder ----
  let rekap = $state(null);
  function makeRekap(list) {
    const sops = sopsOf(list);
    if (!sops.length) return ui.alert('Tidak ada RPS di pilihan ini.');
    const folder = list.length === 1 && list[0].isFolder ? list[0].item.name : '';
    rekap = { title: folder || `${sops.length} RPS dipilih`, items: sops };
  }

  // ---- Kelengkapan RPS: hasil Periksa, komentar, tinjauan, dan daftar mata kuliah katalog ----
  let lengkap = $state(null);
  function makeLengkap(list) {
    const sops = sopsOf(list);
    if (!sops.length) return ui.alert('Tidak ada RPS di pilihan ini.');
    const folder = list.length === 1 && list[0].isFolder ? list[0].item.name : '';
    lengkap = { title: folder || `${sops.length} RPS dipilih`, items: sops };
  }

  // ---- Cadangan ZIP ----
  /**
   * Berkas ZIP dari entri `list`: RPS di akar ZIP, isi folder (dan subfoldernya) di bawah nama folder itu.
   * Folder kosong tidak ikut karena ZIP hanya memuat berkas .rps.
   */
  function zipFiles(list) {
    const files = [];
    const seen = new Set();
    const put = (s, dirs) => {
      if (seen.has(s.id) || !s.json) return;
      seen.add(s.id);
      files.push({ dirs, name: titleOf(s), json: s.json, mtime: s.updatedAt });
    };
    const walk = (id, dirs, depth = 0) => {
      if (depth > 50) return;
      for (const s of sorted(live.filter((x) => folderOf(x) === id), 'name-asc', titleOf, (x) => x.updatedAt)) put(s, dirs);
      for (const f of childrenOf(id)) walk(f.id, [...dirs, f.name], depth + 1);
    };
    for (const d of list) (d.isFolder ? walk(d.item.id, [d.item.name]) : d.root ? walk(null, []) : put(d.item, d.dirs ?? []));
    return files;
  }
  function downloadZip(list, name) {
    const files = zipFiles(list);
    if (!files.length) return ui.alert('Tidak ada RPS untuk diunduh.', { title: 'Unduh ZIP' });
    try {
      downloadBlob(rpsZip(files), `${safeName(name).replace(/ /g, '-')}-${todayIso()}.zip`);
      onnotify(`${files.length} RPS diunduh dalam berkas ZIP`);
    } catch (e) {
      ui.alert('ZIP gagal dibuat: ' + e.message, { title: 'Unduh ZIP' });
    }
  }
  /** Tombol toolbar: hasil yang tampil saat mencari/menyaring (dengan jalur foldernya), selain itu folder ini atau seluruh pustaka. */
  function downloadHere() {
    if (searching) return downloadZip(shownLive.map((s) => ({ item: s, dirs: pathOf(folderOf(s)).map((f) => f.name) })), 'Hasil-pencarian-RPS');
    if (here) return downloadZip([entryOf(byId.get(here), true)], byId.get(here).name);
    downloadZip([{ root: true }], 'Pustaka-Daring-RPS');
  }
  function downloadRps(s) {
    downloadBlob(new Blob([rpsText(s.json)], { type: 'application/json' }), `${safeName(titleOf(s))}.rps`);
  }

  // ---- Hak akses ----
  function openAccess(kind, item) {
    const up = kind === 'folders' ? parents.get(item.id) : folderOf(item);
    accessTarget = { kind, item, name: kind === 'folders' ? item.name : titleOf(item), parent: byId.get(up) ?? null };
  }
  function saveAccess(data) {
    const { kind, item } = accessTarget;
    accessTarget = null;
    act(() => F.setAccess(kind, item.id, data), 'Hak akses disimpan');
  }
  /** Lencana siapa yang bisa melihat, untuk daftar: satu tag per grup (nama grup), lalu jumlah orang. */
  const nameOfGroup = (id) => groups.find((g) => g.id === id)?.name;
  function accessTags(item) {
    const readers = item.readers ?? [];
    if (readers.includes(F.EVERYONE)) return ['Semua anggota'];
    const others = readers.filter((r) => r !== item.createdByEmail);
    const ids = others.filter(F.isGroup);
    // Grup yang sudah dihapus atau belum termuat dihitung saja, tanpa nama.
    const named = ids.map(nameOfGroup).filter(Boolean).sort((a, b) => a.localeCompare(b, 'id'));
    const unnamed = ids.length - named.length;
    const nPeople = others.length - ids.length;
    const tags = [...named, unnamed && `${unnamed} grup`, nPeople && `${nPeople} orang`].filter(Boolean);
    return tags.length ? tags : ['Private'];
  }
  const accessTip = (item) => (canManage(item) ? 'Atur hak akses' : 'Lihat hak akses');

  // ---- Menu klik kanan ----
  function openMenu(e, items) {
    e.preventDefault();
    e.stopPropagation();
    menu = { x: e.clientX, y: e.clientY, items };
  }
  /** Menu baris: bila baris itu termasuk pilihan beberapa item, menu berlaku untuk semua yang dipilih. */
  function showRowMenu(x, y, row) {
    cursor = row.key;
    const many = selected.has(row.key) && selRows.length > 1;
    const items = view === 'bin' ? (many ? binBatchMenu(selRows) : binMenu(row.item)) : many ? batchMenu(selRows) : row.isFolder ? folderMenu(row.item) : sopMenu(row.item);
    menu = { x, y, items };
  }
  function rowMenu(e, row) {
    e.preventDefault();
    e.stopPropagation();
    showRowMenu(e.clientX, e.clientY, row);
  }
  function batchMenu(list) {
    const own = list.filter((d) => canManage(d.item));
    const n = own.length;
    return [
      { head: `${list.length} item dipilih` },
      { label: 'Gabung jadi satu PDF…', icon: 'book', run: () => makeBook(list) },
      { label: 'Unduh sebagai ZIP', icon: 'download', run: () => downloadZip(list, 'RPS-terpilih') },
      { label: 'Rekap CPL…', icon: 'grid', run: () => makeRekap(list) },
      { label: 'Kelengkapan RPS…', icon: 'check', run: () => makeLengkap(list) },
      ...(withPrefix(list).length ? [{ label: `Pindahkan awalan nama ke kode (${withPrefix(list).length} RPS)…`, icon: 'pencil', run: () => prefixToCode(withPrefix(list)) }] : []),
      { sep: true },
      { label: `Pindahkan ${n} item…`, icon: 'move', run: () => startMove(own), disabled: !n },
      { label: 'Potong', icon: 'cut', hint: 'Ctrl+X', run: () => cut(own), disabled: !n },
      { sep: true },
      { label: `Hapus ${n} item`, icon: 'trash', hint: 'Del', run: () => deleteMany(own), danger: true, disabled: !n },
      { sep: true },
      { label: 'Batal pilih', icon: 'x', hint: 'Esc', run: () => selected.clear() }
    ];
  }
  const binBatchMenu = (list) => [
    { head: `${list.length} RPS dipilih` },
    { label: `Pulihkan ${list.length} RPS`, icon: 'restore', run: () => restoreMany(list.map((d) => d.item)) },
    { sep: true },
    { label: `Hapus permanen ${list.length} RPS`, icon: 'trash', hint: 'Del', run: () => purgeMany(list.map((d) => d.item)), danger: true },
    { sep: true },
    { label: 'Batal pilih', icon: 'x', hint: 'Esc', run: () => selected.clear() }
  ];
  function hereItems(id) {
    const add = canAdd(id);
    return [
      ...(clip ? [{ label: `Tempel ${countText(clip)} di sini`, icon: 'paste', hint: 'Ctrl+V', run: () => paste(id), disabled: !add }, { sep: true }] : []),
      { label: 'RPS baru di sini', icon: 'filePlus', run: () => newSop(id), disabled: !add },
      { label: 'Folder baru di sini', icon: 'folderPlus', run: () => newFolder(id), disabled: !add },
      { label: 'Unggah dokumen ini ke sini', icon: 'upload', run: () => onupload(id), disabled: !add || !cansave },
      { label: 'Unggah berkas .rps atau .zip ke sini…', icon: 'import', run: () => pickImport(id), disabled: !add || !!importing }
    ];
  }
  function folderMenu(f) {
    const manage = canManage(f);
    return [
      { label: 'Buka', icon: 'folder', hint: 'Enter', run: () => select(f.id) },
      { sep: true },
      ...hereItems(f.id),
      { sep: true },
      { label: 'Gabung isinya jadi satu PDF…', icon: 'book', run: () => makeBook([entryOf(f, true)]), disabled: !sopsOf([entryOf(f, true)]).length },
      { label: 'Unduh isinya sebagai ZIP', icon: 'download', run: () => downloadZip([entryOf(f, true)], f.name), disabled: !sopsOf([entryOf(f, true)]).length },
      { label: 'Rekap CPL isinya…', icon: 'grid', run: () => makeRekap([entryOf(f, true)]), disabled: !sopsOf([entryOf(f, true)]).length },
      { label: 'Kelengkapan RPS isinya…', icon: 'check', run: () => makeLengkap([entryOf(f, true)]), disabled: !sopsOf([entryOf(f, true)]).length },
      { label: accessTip(f), icon: 'users', run: () => openAccess('folders', f) },
      ...(canEdit(f) ? [{ label: 'Ubah nama', icon: 'pencil', hint: 'F2', run: () => renameFolder(f) }] : []),
      ...(manage
        ? [
            { label: 'Pindahkan', icon: 'move', run: () => moveFolder(f) },
            { label: 'Potong', icon: 'cut', hint: 'Ctrl+X', run: () => cut([entryOf(f, true)]) },
            { sep: true },
            { label: 'Hapus', icon: 'trash', hint: 'Del', run: () => removeFolder(f), danger: true }
          ]
        : [])
    ];
  }
  function sopMenu(s) {
    const manage = canManage(s);
    return [
      { label: 'Buka', icon: 'open', hint: 'Enter', run: () => openSop(s) },
      { sep: true },
      { label: 'Detail', icon: 'info', run: () => (infoOf = s.id) },
      { label: 'Duplikat', icon: 'copy', run: () => duplicate(s) },
      { label: 'Unduh berkas .rps', icon: 'download', run: () => downloadRps(s) },
      { label: 'Riwayat', icon: 'history', run: () => toggleHistory(s) },
      { label: 'Bandingkan versi…', icon: 'compare', run: () => compareVersions(s) },
      { label: 'Salin tautan', icon: 'link', run: async () => onnotify(await copyLink(s.id)) },
      ...(manage ? [{ label: 'Hapus riwayat lama…', icon: 'trash', run: () => pruneOld(s) }] : []),
      { label: accessTip(s), icon: 'users', run: () => openAccess('sops', s) },
      ...(canEdit(s) ? [{ label: 'Ubah nama', icon: 'pencil', hint: 'F2', run: () => rename(s) }, { label: 'Ubah kode pustaka…', icon: 'pencil', run: () => changeCode(s) }] : []),
      ...(prefixOf(s) ? [{ label: `Pindahkan awalan "${prefixOf(s)[1]}" ke kode`, icon: 'pencil', run: () => prefixToCode([s]) }] : []),
      ...(manage
        ? [
            { label: 'Pindahkan', icon: 'move', run: () => moveSop(s) },
            { label: 'Potong', icon: 'cut', hint: 'Ctrl+X', run: () => cut([entryOf(s, false)]) },
            { sep: true },
            { label: 'Hapus', icon: 'trash', hint: 'Del', run: () => moveToBin(s), danger: true }
          ]
        : [])
    ];
  }
  const binMenu = (s) => [
    { label: 'Pulihkan', icon: 'restore', run: () => restoreFromBin(s) },
    { sep: true },
    { label: 'Hapus permanen', icon: 'trash', hint: 'Del', run: () => purge(s), danger: true }
  ];

  const noAddTip = 'Hanya pemilik folder ini yang bisa menambah isinya';
  const uploadBlocked = $derived(!canAdd(here) ? noAddTip : !cansave ? 'Dokumen ini kosong atau sudah tertaut ke Pustaka Daring' : '');
  const uploadTip = $derived(uploadBlocked || (here ? `Unggah dokumen ini ke ${byId.get(here).name}` : 'Unggah dokumen ini ke Utama'));

  const size = (n) => (n >= 1e6 ? `${(n / 1e6).toLocaleString('id-ID', { maximumFractionDigits: 1 })} MB` : `${Math.ceil(n / 1000).toLocaleString('id-ID')} KB`);
  const when = (ms) => new Date(ms).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
  // "5 menit yang lalu" dan seterusnya; `now` diperbarui tiap menit selama pustaka terbuka.
  let now = $state(Date.now());
  $effect(() => {
    if (!open) return;
    now = Date.now();
    const t = setInterval(() => (now = Date.now()), 60000);
    return () => clearInterval(t);
  });
  const rtf = new Intl.RelativeTimeFormat('id', { numeric: 'always' });
  function ago(ms) {
    let v = Math.max(0, now - ms) / 60000;
    if (v < 1) return 'baru saja';
    let unit = 'minute';
    for (const [n, u] of [[60, 'minute'], [24, 'hour'], [7, 'day'], [365.25 / 12 / 7, 'week'], [12, 'month'], [Infinity, 'year']]) {
      unit = u;
      if (v < n) break;
      v /= n;
    }
    return rtf.format(-Math.floor(v), unit);
  }

  /** RPS di folder `id` beserta subfoldernya; null = semua. */
  function within(s, id) {
    if (!id) return true;
    for (let f = folderOf(s), n = 0; f && n < 100; f = parents.get(f), n++) if (f === id) return true;
    return false;
  }
  /**
   * Daftar induk RPS (XLSX). Saat mencari atau menyaring: hasil yang tampil. Selain itu: folder ini beserta
   * subfoldernya (di Utama berarti seluruh pustaka yang bisa dilihat akun ini).
   */
  function exportRegister() {
    const list = sorted(searching ? shownLive : live.filter((s) => within(s, here)), 'name-asc', titleOf, (s) => s.updatedAt);
    if (!list.length) return ui.alert('Tidak ada RPS untuk dimasukkan ke daftar induk.', { title: 'Daftar induk RPS' });
    const scope = searching ? 'Hasil pencarian atau filter' : here ? `Folder ${pathText(here)} beserta subfoldernya` : 'Seluruh Pustaka Daring';
    const date = (v) => (v ? formatTanggal(v) : '');
    const columns = [
      { label: 'No.', width: 5 },
      { label: 'Kode pustaka', width: 10 },
      { label: 'Kode MK', width: 12 },
      { label: 'Mata kuliah', width: 36 },
      { label: 'SKS', width: 6 },
      { label: 'Semester', width: 10 },
      { label: 'Tahun akademik', width: 12 },
      { label: 'Program studi', width: 22 },
      { label: 'Dosen pengelola', width: 34 },
      { label: 'Folder', width: 22 },
      { label: 'Tanggal penyusunan', width: 16 },
      { label: `Jatuh tempo tinjauan (${review.years} tahun)`, width: 18 },
      { label: 'Status tinjauan', width: 15 },
      { label: 'Pemilik', width: 22 },
      { label: 'Terakhir diubah', width: 19 },
      { label: 'Diubah oleh', width: 22 },
      { label: 'Hak akses', width: 24 }
    ];
    const rows = list.map((s, i) => [
      i + 1,
      s.code ?? '',
      s.info?.kode ?? '',
      s.title || 'RPS tanpa judul',
      s.info?.sks || '',
      s.info?.semester ?? '',
      s.info?.tahunAkademik ?? '',
      s.info?.prodi ?? '',
      (s.info?.dosen ?? []).join('; '),
      folderOf(s) ? pathText(folderOf(s)) : 'Utama',
      date(s.since),
      date(reviewDue(s.since)),
      !s.since ? 'Tanggal belum diisi' : isDue(s) ? 'Perlu ditinjau' : 'Berlaku',
      s.createdByName ?? '',
      when(s.updatedAt),
      s.updatedByName ?? '',
      accessTags(s).join(', ')
    ]);
    const blob = registerXlsx({
      title: 'Daftar Induk RPS',
      note: `${scope} · ${list.length} RPS · diunduh ${when(Date.now())} oleh ${faculty.user.name}`,
      columns,
      rows,
      author: faculty.user.name
    });
    downloadBlob(blob, `Daftar-Induk-RPS-${todayIso()}.xlsx`);
    onnotify(`Daftar induk ${list.length} RPS diunduh`);
  }

  /** Isi dialog Detail. Diambil dari `live` agar ikut terbarui (mis. setelah kodenya diubah). */
  const info = $derived.by(() => {
    const s = infoOf && live.find((x) => x.id === infoOf);
    if (!s) return null;
    const who = (uid, name) => (uid === faculty.user.uid ? `Anda (${name})` : name);
    const editors = namesEditing(s);
    const i = s.info ?? {};
    return {
      name: titleOf(s),
      rows: [
        ['Nama RPS', s.title || '—'],
        ['Kode pustaka', s.code || '—', 'Hanya tampil di pustaka, tidak di dokumen RPS'],
        ['Mata kuliah', [i.kode, i.sks ? `${i.sks} SKS` : '', i.semester, i.tahunAkademik].filter(Boolean).join(' · ') || '—'],
        ...(i.prodi ? [['Program studi', i.prodi]] : []),
        ...(i.dosen?.length ? [['Dosen pengelola', i.dosen.join('; ')]] : []),
        ['Lokasi', folderOf(s) ? pathText(folderOf(s)) : 'Utama'],
        ['Hak akses', accessTags(s).join(', ') + (s.custom && folderOf(s) ? ' (khusus)' : '')],
        ['Hak Anda', canManage(s) ? 'Mengelola' : canEdit(s) ? 'Edit' : 'Hanya lihat'],
        ['Dibuat oleh', who(s.createdBy, s.createdByName), s.createdByEmail],
        ['Dibuat', s.createdAt ? when(s.createdAt) : '—'],
        ['Terakhir diubah', `${when(s.updatedAt)} (${ago(s.updatedAt)}) oleh ${who(s.updatedBy, s.updatedByName)}`],
        ['Revisi', String(s.rev)],
        ...(s.since ? [['Disusun', formatTanggal(s.since), 'Tanggal penyusunan di identitas RPS']] : []),
        ['Ukuran', `Isi ${size(s.size)}, termasuk riwayat ${size(s.totalBytes)}`],
        ...(openCount(s) ? [['Komentar terbuka', String(openCount(s))]] : []),
        ...(editors ? [['Sedang diedit', editors]] : [])
      ]
    };
  });
  const namesEditing = (s) => (faculty.editing[s.id] ?? []).map((m) => m.name).join(', ');
</script>

{#snippet ib(icon, tip, run, opts = {})}
  <button
    type="button"
    class="ib"
    class:danger={opts.danger}
    class:on={opts.on}
    aria-label={tip}
    aria-disabled={opts.disabled ? 'true' : undefined}
    aria-expanded={opts.expanded}
    data-tip={tip}
    onclick={() => !opts.disabled && run()}
  >
    <Icon name={icon} />
  </button>
{/snippet}

{#snippet pick(row)}
  <input type="checkbox" class="pick" tabindex="-1" checked={selected.has(row.key)} aria-label={`Pilih ${nameOf(row)}`} onclick={(e) => pickClick(e, row)} />
{/snippet}

{#snippet selBar()}
  {#if selRows.length}
    {@const own = selRows.filter((d) => canManage(d.item))}
    {@const pre = withPrefix(selRows)}
    {@const all = rows.every((r) => selected.has(r.key))}
    <div class="selbar" role="toolbar" aria-label="Tindakan untuk yang dipilih">
      <label class="pickall" title={all ? 'Batal pilih (Esc)' : 'Pilih semua'}>
        <input
          type="checkbox"
          class="pick"
          checked={all}
          indeterminate={!all}
          onchange={() => (all ? selected.clear() : rows.forEach((r) => selected.add(r.key)))}
        />
        <strong>{selRows.length} dipilih</strong>
      </label>
      {#if view === 'bin'}
        <button type="button" class="btn" onclick={() => restoreMany(selRows.map((d) => d.item))}><Icon name="restore" size={14} /> Pulihkan</button>
        <button type="button" class="btn danger" onclick={() => purgeMany(selRows.map((d) => d.item))}><Icon name="trash" size={14} /> Hapus permanen</button>
      {:else}
        <button type="button" class="btn" onclick={() => makeBook(selRows)} title="Gabungkan RPS yang dipilih (termasuk isi folder) menjadi satu PDF berdaftar isi"><Icon name="book" size={14} /> Gabung PDF</button>
        <button type="button" class="btn" onclick={() => downloadZip(selRows, 'RPS-terpilih')} title="Unduh RPS yang dipilih (termasuk isi folder) sebagai berkas .rps dalam ZIP"><Icon name="download" size={14} /> Unduh ZIP</button>
        <button type="button" class="btn" onclick={() => makeRekap(selRows)} title="Matriks mata kuliah × CPL dari RPS yang dipilih (termasuk isi folder)"><Icon name="grid" size={14} /> Rekap CPL</button>
        <button type="button" class="btn" onclick={() => makeLengkap(selRows)} title="Laporan kelengkapan RPS yang dipilih (termasuk isi folder): hasil Periksa, komentar, dan mata kuliah katalog yang belum punya RPS"><Icon name="check" size={14} /> Kelengkapan</button>
        {#if pre.length}<button type="button" class="btn" onclick={() => prefixToCode(pre)} title="Awalan nama seperti B.2 dipindah ke kode pustaka"><Icon name="pencil" size={14} /> Awalan ke kode ({pre.length})</button>{/if}
        <button type="button" class="btn" disabled={!own.length} onclick={() => startMove(own)}><Icon name="move" size={14} /> Pindahkan</button>
        <button type="button" class="btn danger" disabled={!own.length} onclick={() => deleteMany(own)}><Icon name="trash" size={14} /> Hapus</button>
      {/if}
    </div>
  {/if}
{/snippet}

{#snippet node(f, depth)}
  {@const kids = childrenOf(f.id)}
  {@const opened = expanded.has(f.id)}
  <li role="treeitem" aria-selected={view === 'sops' && !only && here === f.id} aria-expanded={kids.length ? opened : undefined}>
    <div class="tn" data-id={f.id} class:sel={view === 'sops' && !only && here === f.id} class:drop={dropAt === f.id} class:dragging={dragged(f.id)} style:padding-left="{depth * 0.9 + 0.2}rem" role="presentation" draggable={canManage(f)} ondragstart={(e) => dragStart(e, f, true)} ondragend={dragEnd} {...dropzone(f.id)} oncontextmenu={(e) => openMenu(e, folderMenu(f))}>
      {#if kids.length}
        <button type="button" class="chev" class:open={opened} aria-label={opened ? `Tutup ${f.name}` : `Buka ${f.name}`} onclick={() => toggle(f.id)}><Icon name="chevron" size={15} /></button>
      {:else}
        <span class="chev none"></span>
      {/if}
      <button type="button" class="tname" onclick={() => select(f.id)}>
        <Icon name="folder" size={18} />
        <span>{f.name}</span>
        {#if counts.get(f.id)}<small>{counts.get(f.id)}</small>{/if}
      </button>
    </div>
    {#if kids.length && opened}
      <ul role="group">
        {#each kids as k (k.id)}{@render node(k, depth + 1)}{/each}
      </ul>
    {/if}
  </li>
{/snippet}

  <header>
    {@render tabs()}
    {#if faculty.status === 'in'}
      <input class="search" type="search" bind:this={search} bind:value={query} onkeydown={(e) => e.key === 'ArrowDown' && rows.length && (e.preventDefault(), focusRow(rows[0].key))} placeholder="Cari mata kuliah, kode, pembuat, dosen, CPL/CPMK, atau materi…" />
    {:else}
      <span class="grow"></span>
    {/if}
    {#if faculty.user}
      <small class="who" title={faculty.user.email}>{faculty.user.name}{admin ? ' · Admin' : ''}</small>
      {@render ib('logout', 'Keluar', () => F.signOut())}
    {/if}
    <button class="ib x" onclick={onclose} aria-label="Tutup" data-tip="Tutup"><Icon name="x" /></button>
  </header>

  {#if faculty.status === 'in'}
    {#if loadError}<p class="error">{loadError} <button class="link" onclick={refresh}>Coba lagi</button></p>{/if}
    <div class="panes" bind:this={panes} style:grid-template-columns="{treeW}px minmax(0, 1fr)">
      <aside>
        <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
        <div class="split" role="separator" aria-orientation="vertical" aria-label="Lebar daftar folder" aria-valuenow={treeW} aria-valuemin={TREE_MIN} tabindex="0" title="Geser untuk mengubah lebar (klik dua kali: lebar awal)" onpointerdown={splitDown} onkeydown={splitKey} ondblclick={() => setTree(TREE_DEFAULT)}></div>
        <div class="tree" role="presentation" oncontextmenu={(e) => openMenu(e, hereItems(null))}>
          <ul role="tree" aria-label="Folder" bind:this={treeEl} onkeydown={treeKey}>
            <li role="treeitem" aria-selected={view === 'sops' && !only && !here}>
              <div class="tn" data-id="" class:sel={view === 'sops' && !only && !here} class:drop={dropAt === null} style:padding-left="0.2rem" role="presentation" {...dropzone(null)}>
                <span class="chev none"></span>
                <button type="button" class="tname" onclick={() => select(null)}>
                  <Icon name="folder" size={18} />
                  <span>Utama</span>
                  {#if counts.get(null)}<small>{counts.get(null)}</small>{/if}
                </button>
              </div>
            </li>
            {#each childrenOf(null) as f (f.id)}{@render node(f, 1)}{/each}
          </ul>
        </div>
        <nav aria-label="Lainnya">
          <button
            type="button"
            class="tname nav"
            class:sel={view === 'sops' && only === 'due'}
            title={`RPS yang disusun lebih dari ${review.years} tahun lalu (menurut tanggal penyusunan)`}
            onclick={() => {
              select(here);
              only = 'due';
            }}
          >
            <Icon name="alert" size={15} /><span>Perlu ditinjau</span>{#if dueCount}<small class="due">{dueCount}</small>{/if}
          </button>
          <button
            type="button"
            class="tname nav"
            class:sel={view === 'sops' && only === 'notes'}
            title="RPS yang masih punya komentar belum selesai"
            onclick={() => {
              select(here);
              only = 'notes';
            }}
          >
            <Icon name="comment" size={15} /><span>Ada komentar</span>{#if notesCount}<small class="notes">{notesCount}</small>{/if}
          </button>
          <button type="button" class="tname nav" class:sel={view === 'mentions'} title="Komentar yang menyebut Anda (@email Anda)" onclick={openMentions}>
            <Icon name="reply" size={15} /><span>Menyebut saya</span>{#if unseenMentions(faculty.user?.uid)}<small class="notes">{unseenMentions(faculty.user?.uid)}</small>{/if}
          </button>
          <button type="button" class="tname nav" class:sel={view === 'bin'} onclick={() => (view = 'bin')}>
            <Icon name="trash" size={15} /><span>Recycle bin</span>{#if bin.length}<small>{bin.length}</small>{/if}
          </button>
        </nav>
      </aside>

      <section class="content">
        {#if view === 'sops'}
          <div class="crumbs">
            {#if only === 'due'}
              <span class="muted grow due-head">
                Perlu ditinjau: disusun lebih dari
                <select value={review.years} onchange={(e) => setReviewYears(Number(e.currentTarget.value))} aria-label="Jangka tinjauan berkala">
                  {#each REVIEW_CHOICES as y (y)}<option value={y}>{y} tahun</option>{/each}
                </select>
                lalu (menurut tanggal penyusunan){words.length ? ', sesuai pencarian' : ''}
                <button type="button" class="link" onclick={() => (only = '')}>Tampilkan semua</button>
              </span>
            {:else if only === 'notes'}
              <span class="muted grow due-head">
                RPS dengan komentar yang belum selesai{words.length ? ', sesuai pencarian' : ''}
                <button type="button" class="link" onclick={() => (only = '')}>Tampilkan semua</button>
              </span>
            {:else if searching}
              <span class="muted grow">{words.length ? 'Hasil pencarian' : 'Hasil filter'} di semua folder · {shownLive.length} RPS</span>
            {:else}
              <nav class="grow" aria-label="Lokasi folder">
                <button class="crumb" class:drop={dropAt === null} aria-current={here ? undefined : 'location'} onclick={() => select(null)} {...dropzone(null)} oncontextmenu={(e) => openMenu(e, hereItems(null))}>Utama</button>
                {#each crumbs as c (c.id)}
                  <span class="crumb-sep" aria-hidden="true">/</span>
                  <button class="crumb" class:drop={dropAt === c.id} aria-current={c.id === here ? 'location' : undefined} onclick={() => select(c.id)} {...dropzone(c.id)} oncontextmenu={(e) => openMenu(e, folderMenu(c))}>{c.name}</button>
                {/each}
              </nav>
            {/if}
            {@render ib('filter', filtering ? 'Filter (aktif)' : 'Filter', () => (filterOpen = !filterOpen), { on: filterOpen || filtering, expanded: filterOpen || filtering })}
            <SortSelect />
            {@render ib('table', searching ? 'Unduh daftar induk RPS (XLSX) dari hasil yang tampil' : here ? 'Unduh daftar induk RPS (XLSX) folder ini beserta subfoldernya' : 'Unduh daftar induk RPS (XLSX) seluruh pustaka', exportRegister)}
            {@render ib('download', searching ? 'Unduh cadangan (ZIP) hasil yang tampil' : here ? 'Unduh cadangan (ZIP) folder ini beserta subfoldernya' : 'Unduh cadangan (ZIP) seluruh pustaka', downloadHere)}
            {#if here && !searching}
              {@render ib('users', accessTip(byId.get(here)), () => openAccess('folders', byId.get(here)))}
            {/if}
            {@render ib('filePlus', canAdd(here) ? 'RPS baru di sini' : noAddTip, () => newSop(), { disabled: !canAdd(here) })}
            {@render ib('folderPlus', canAdd(here) ? 'Folder baru di sini' : noAddTip, () => newFolder(), { disabled: !canAdd(here) })}
            {@render ib('upload', uploadTip, () => onupload(here), { disabled: !!uploadBlocked })}
            {@render ib('import', !canAdd(here) ? noAddTip : 'Unggah berkas .rps atau .zip ke sini (bisa juga diseret ke daftar)', () => pickImport(), { disabled: !canAdd(here) || !!importing })}
            {@render ib('refresh', 'Muat ulang daftar', refresh)}
          </div>
          {#if importing}
            <div class="importing" role="status">
              <span>Mengunggah {Math.min(importing.done + 1, importing.total)} dari {importing.total} RPS…</span>
              <div class="meter"><span style:width="{(importing.done / importing.total) * 100}%"></span></div>
            </div>
          {/if}
          {#if filterOpen || filtering}
            <div class="filters" role="group" aria-label="Filter RPS">
              <label>
                <span>Pemilik</span>
                <select bind:value={filt.owner}>
                  <option value="">Semua</option>
                  {#each owners as [email, name] (email)}<option value={email}>{email === faculty.user.email ? `${name} (Anda)` : name}</option>{/each}
                </select>
              </label>
              <label>
                <span>Hak akses</span>
                <select bind:value={filt.access}>
                  <option value="">Semua</option>
                  <option value={F.EVERYONE}>Semua anggota</option>
                  {#each [...groups].sort((a, b) => a.name.localeCompare(b.name, 'id')) as g (g.id)}<option value={g.id}>Grup {g.name}</option>{/each}
                  <option value="private">Private</option>
                </select>
              </label>
              <label>
                <span>Diubah</span>
                <select bind:value={filt.changed}>
                  <option value="">Kapan saja</option>
                  {#each CHANGED as [v, label] (v)}<option value={v}>{label}</option>{/each}
                </select>
              </label>
              <label>
                <span>Kode pustaka</span>
                <select bind:value={filt.code}>
                  <option value="">Semua</option>
                  <option value="with">Sudah ada kode</option>
                  <option value="without">Belum ada kode</option>
                </select>
              </label>
              {#if filtering}<button type="button" class="link" onclick={resetFilters}>Hapus filter</button>{/if}
            </div>
          {/if}
          {#if !drag && dropAt !== undefined}
            <p class="filehint" aria-hidden="true">Lepaskan berkas .rps atau .zip untuk mengunggah ke {dropAt ? byId.get(dropAt)?.name : 'Utama'}</p>
          {/if}
          {@render selBar()}
          <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
          <ul class="list" class:selecting={selected.size > 0} class:drop={!searching && dropAt !== undefined && dropAt === here} tabindex="-1" bind:this={listEl} onkeydown={listKey} oncontextmenu={(e) => openMenu(e, hereItems(here))} {...(searching ? {} : dropzone(here))}>
            {#each shownFolders as f (f.id)}
              {@const parent = parents.get(f.id)}
              {@const row = entryOf(f, true)}
              <li data-key={row.key} class:sel={selected.has(row.key)} class:drop={dropAt === f.id} class:dragging={dragged(f.id)} draggable={canManage(f)} ondragstart={(e) => dragStart(e, f, true)} ondragend={dragEnd} {...dropzone(f.id)} oncontextmenu={(e) => rowMenu(e, row)}>
                {@render pick(row)}
                <button class="main" onclick={(e) => rowClick(e, row, () => enterFolder(f.id))} onfocus={() => (cursor = row.key)}>
                  <strong><Icon name="folder" size={18} /> {f.name} {#each accessTags(f) as t}<em class:shared={F.isShared(f)}>{t}</em>{/each}</strong>
                  <small>{#if searching && parent}<span>di {pathText(parent)}</span>{/if}<span>{folderInfo(f)}</span></small>
                </button>
                <span class="acts" role="group" aria-label="Tindakan folder">
                  {@render ib('users', accessTip(f), () => openAccess('folders', f))}
                </span>
              </li>
            {/each}
            {#each shownLive as s (s.id)}
              {@const manage = canManage(s)}
              {@const editors = namesEditing(s)}
              {@const row = entryOf(s, false)}
              <li data-key={row.key} class:sel={selected.has(row.key)} class:dragging={dragged(s.id)} draggable={manage} ondragstart={(e) => dragStart(e, s, false)} ondragend={dragEnd} oncontextmenu={(e) => rowMenu(e, row)}>
                {@render pick(row)}
                <button class="main" onclick={(e) => rowClick(e, row, () => openSop(s))} onfocus={() => (cursor = row.key)}>
                  <strong>
                    <Icon name="file" size={15} />
                    {titleOf(s)}
                    {#each accessTags(s) as t}<em class:shared={F.isShared(s)}>{t}</em>{/each}
                    {#if s.custom && folderOf(s)}<em>Khusus</em>{/if}
                    {#if !canEdit(s)}<em>Hanya lihat</em>{/if}
                    {#if isOpen(s)}<em>Terbuka di tab</em>{/if}
                    {#if isDue(s)}<em class="due" title={`Disusun ${formatTanggal(s.since)}, lebih dari ${review.years} tahun lalu`}>Perlu ditinjau</em>{/if}
                    {#if openCount(s)}<em class="notes" title="Komentar yang belum ditandai selesai">{openCount(s)} komentar</em>{/if}
                  </strong>
                  <small title={`Terakhir diubah ${when(s.updatedAt)} oleh ${s.updatedByName}`}>
                    {#if searching && folderOf(s)}<span>di {pathText(folderOf(s))}</span>{/if}{#if only === 'due'}<span>disusun {formatTanggal(s.since)}</span>{/if}<span>Diubah {ago(s.updatedAt)}</span>
                  </small>
                  {#if editors}<small class="editing">🔒 Terkunci, sedang diedit oleh {editors}</small>{/if}
                </button>
                <span class="acts" role="group" aria-label="Tindakan RPS">
                  {@render ib('copy', 'Duplikat sebagai milik Anda', () => duplicate(s))}
                  {@render ib('history', 'Riwayat', () => toggleHistory(s), { on: history?.id === s.id, expanded: history?.id === s.id })}
                  {@render ib('users', accessTip(s), () => openAccess('sops', s))}
                  {#if canEdit(s)}{@render ib('pencil', 'Ubah nama', () => rename(s))}{/if}
                  {#if manage}
                    {@render ib('move', 'Pindahkan', () => moveSop(s))}
                    {@render ib('trash', 'Pindahkan ke Recycle bin', () => moveToBin(s), { danger: true })}
                  {/if}
                </span>
                {#if history?.id === s.id}
                  <div class="history">
                    {#if history.versions.length}
                      <div class="hhead">
                        <span class="muted">{history.versions.length} versi lama{manage ? ` · ${size(sumSize(history.versions))}` : ''}</span>
                        <span class="hacts">
                          <button type="button" class="link cmp" onclick={() => compareVersions(s)}>Bandingkan versi…</button>
                          {#if manage}<button type="button" class="link" onclick={() => pruneOld(s)}>Hapus riwayat lama…</button>{/if}
                        </span>
                      </div>
                    {/if}
                    {#each history.versions as v (v.rev)}
                      <div>
                        <span>{when(v.savedAt)} · {v.savedByName}</span>
                        <span class="hacts">
                          {@render ib('compare', 'Bandingkan dengan isi terkini', () => compareVersions(s, v))}
                          {#if canEdit(s)}
                            {@render ib('restore', isOpen(s) ? 'Muat versi ini ke tab yang terbuka (simpan untuk menerapkannya)' : 'Kembalikan versi ini', () => restoreVersion(s, v))}
                          {/if}
                          {#if manage}
                            {@render ib('trash', 'Hapus versi ini dari riwayat', () => pruneOne(s, v), { danger: true })}
                          {/if}
                        </span>
                      </div>
                    {:else}
                      <span class="muted">Belum ada versi lama.</span>
                    {/each}
                  </div>
                {/if}
              </li>
            {/each}
            {#if !shownFolders.length && !shownLive.length}
              <li class="empty">
                {busy ? 'Memuat…' : searching ? 'Tidak ada yang cocok.' : here ? 'Folder ini masih kosong.' : 'Belum ada folder atau RPS di sini.'}
                {#if !busy && !searching && canAdd(here)}<small>Seret berkas .rps atau .zip ke sini untuk mengunggah banyak RPS sekaligus.</small>{/if}
              </li>
            {/if}
          </ul>
        {:else if view === 'mentions'}
          <div class="crumbs">
            <span class="muted grow">Komentar yang menyebut Anda, terbaru di atas. Klik untuk membuka RPS dan komentarnya.</span>
          </div>
          <ul class="list mentions">
            {#each mentions as c (c.sopId + '/' + c.id)}
              {@const s = sopById.get(c.sopId)}
              <li>
                <button class="main" disabled={!s} title={s ? 'Buka RPS dan tampilkan komentar ini' : 'RPS ini sudah dihapus, atau Anda tidak punya hak untuk melihatnya'} onclick={() => onopencomment(c.sopId, c.id)}>
                  <strong>
                    <Icon name="comment" size={15} />
                    {s ? titleOf(s) : 'RPS tidak tersedia'}
                    {#if c.at > seenBefore && c.by !== faculty.user.uid}<em class="notes">Baru</em>{/if}
                    {#if c.parent}<em>Balasan</em>{:else if c.label}<em>{c.label}</em>{/if}
                    {#if c.resolved}<em>Selesai</em>{/if}
                  </strong>
                  <span class="quote">{shortText(c.text)}</span>
                  <small>{c.byName} · {when(c.at)}</small>
                </button>
              </li>
            {:else}
              <li class="empty">Belum ada komentar yang menyebut Anda. Orang lain bisa menyebut Anda dengan mengetik @ lalu email Anda di komentar.</li>
            {/each}
          </ul>
        {:else if view === 'bin'}
          {@render selBar()}
          <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
          <ul class="list" class:selecting={selected.size > 0} tabindex="-1" bind:this={listEl} onkeydown={listKey}>
            {#each shownBin as s (s.id)}
              {@const row = entryOf(s, false)}
              <li data-key={row.key} class:sel={selected.has(row.key)} oncontextmenu={(e) => rowMenu(e, row)}>
                {@render pick(row)}
                <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
                <div class="main static" tabindex="0" onclick={(e) => rowClick(e, row, () => {})} onfocus={() => (cursor = row.key)}>
                  <strong><Icon name="file" size={15} /> {titleOf(s)}</strong>
                  <small title={`Dihapus ${when(s.deletedAt)}`}>{[`dihapus ${ago(s.deletedAt)}`, size(s.totalBytes)].join(' · ')}</small>
                </div>
                <span class="acts" role="group" aria-label="Tindakan RPS">
                  {@render ib('restore', 'Pulihkan', () => restoreFromBin(s))}
                  {@render ib('trash', 'Hapus permanen', () => purge(s), { danger: true })}
                </span>
              </li>
            {:else}
              <li class="empty">{busy ? 'Memuat…' : query.trim() ? 'Tidak ada yang cocok.' : 'Recycle bin kosong.'}</li>
            {/each}
          </ul>
        {/if}
      </section>
    </div>
  {:else}
    <div class="gate">
      {#if faculty.status === 'out'}
        <p>Pustaka Daring menyimpan RPS bersama secara daring. Masuk dengan akun Google <strong>@ub.ac.id</strong> atau <strong>@gmail.com</strong> yang sudah didaftarkan admin.</p>
        <button class="btn primary" onclick={() => F.signIn().catch((e) => ui.alert(e.message))}><Icon name="login" size={15} />Masuk dengan Google</button>
      {:else if faculty.status === 'domain'}
        <p><strong>{faculty.user.email}</strong> tidak bisa dipakai. Pustaka Daring hanya untuk akun @ub.ac.id atau @gmail.com.</p>
        <button class="btn" onclick={() => F.signOut().then(() => F.signIn()).catch((e) => ui.alert(e.message))}><Icon name="users" size={15} />Ganti akun</button>
      {:else if faculty.status === 'notMember'}
        <p><strong>{faculty.user.email}</strong> belum terdaftar sebagai anggota. Minta admin Pustaka Daring mendaftarkan akun ini.</p>
        <button class="btn" onclick={() => F.recheck()}><Icon name="refresh" size={15} />Periksa lagi</button>
      {:else if faculty.status === 'error'}
        <p class="error">{faculty.error}</p>
        <button class="btn" onclick={() => (faculty.user ? F.recheck() : F.start())}><Icon name="refresh" size={15} />Coba lagi</button>
      {:else}
        <p>Memuat…</p>
      {/if}
    </div>
  {/if}
  <input
    bind:this={importInput}
    type="file"
    multiple
    hidden
    accept=".zip,.rps,.json,.pdf,.docx,application/zip,application/json,application/pdf"
    onchange={(e) => importFiles([...e.currentTarget.files], e.currentTarget.dataset.target || null)}
  />
  <svelte:window onkeydown={panelKey} />
  {#if menu}<ContextMenu x={menu.x} y={menu.y} items={menu.items} {host} onclose={() => (menu = null)} />{/if}

<dialog bind:this={moveDialog} class="dialog small-dialog" use:dismiss onclose={() => (moving = null)}>
  {#if moving}
    <form onsubmit={submitMove}>
      <h2>Pindahkan</h2>
      <p class="muted moved">{moving.entries.length === 1 ? nameOf(moving.entries[0]) : `${moving.entries.length} item`}</p>
      <label class="move">
        <span>Ke folder</span>
        <select bind:value={moving.target}>
          <option value={null}>Utama</option>
          {#each moveTargets as t (t.id)}
            <option value={t.id}>{'   '.repeat(t.depth + 1)}{t.name}</option>
          {/each}
        </select>
      </label>
      {#if moving.entries.some((d) => !d.item.custom)}<small class="muted">Hak aksesnya akan mengikuti folder tujuan.</small>{/if}
      <footer class="end">
        <button type="button" class="btn" onclick={() => (moving = null)}>Batal</button>
        <button class="btn primary"><Icon name="move" size={15} />Pindahkan</button>
      </footer>
    </form>
  {/if}
</dialog>

<SopInfoDialog {info} oncode={info && canEdit(live.find((x) => x.id === infoOf)) ? () => changeCode(live.find((x) => x.id === infoOf)) : undefined} onclose={() => (infoOf = null)} />
<AccessDialog target={accessTarget} onsave={saveAccess} onclose={() => (accessTarget = null)} />

{#if compare}
  <VersionDiffDialog
    open={true}
    title={compare.title}
    sources={compare.sources}
    bind:left={compare.left}
    bind:right={compare.right}
    onclose={() => (compare = null)}
  />
{/if}

{#if rekap}
  <ProdiRekapDialog
    open={true}
    title={rekap.title}
    items={rekap.items}
    onopen={(s) => {
      rekap = null;
      openSop(s);
    }}
    onclose={() => (rekap = null)}
  />
{/if}

{#if lengkap}
  <KelengkapanDialog
    open={true}
    title={lengkap.title}
    items={lengkap.items}
    notes={openCount}
    onopen={(s) => {
      lengkap = null;
      openSop(s);
    }}
    onclose={() => (lengkap = null)}
  />
{/if}


<style>
  .dialog {
    width: min(1180px, calc(100vw - 2rem));
    max-height: calc(100vh - 3rem);
    border: 0;
    border-radius: 14px;
    padding: 1rem 1.1rem;
    box-shadow: 0 20px 50px rgb(0 0 0 / 0.25);
    background: var(--surface);
    color: var(--text);
    flex-direction: column;
  }
  .dialog[open] {
    display: flex;
  }
  .dialog::backdrop {
    background: rgb(15 23 42 / 0.45);
  }
  .small-dialog {
    width: min(460px, calc(100vw - 2rem));
  }
  header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.7rem;
  }
  h2 {
    margin: 0;
    font-size: 1.1rem;
    flex: none;
  }
  .grow {
    flex: 1;
    min-width: 0;
  }
  .search {
    flex: 1;
    min-width: 0;
    margin: 0 0.5rem;
  }
  .who {
    flex: none;
    max-width: 14rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--muted);
    font-size: 0.8rem;
  }
  .muted {
    color: var(--muted);
    font-weight: 400;
  }
  .ib {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: none;
    width: 1.85rem;
    height: 1.85rem;
    padding: 0;
    border: 1px solid transparent;
    border-radius: 7px;
    background: none;
    color: var(--muted);
    cursor: pointer;
  }
  .ib:hover:not([aria-disabled='true']):not(:disabled) {
    background: var(--surface-2);
    color: var(--text);
  }
  .ib.danger:hover:not([aria-disabled='true']):not(:disabled) {
    color: var(--danger);
  }
  .ib.on {
    background: var(--accent-soft);
    color: var(--accent);
  }
  .ib[aria-disabled='true'],
  .ib:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .panes {
    flex: 1;
    min-height: 0;
    display: grid;
    border: 1px solid var(--line);
    border-radius: 10px;
    overflow: hidden;
  }
  aside {
    position: relative;
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    border-right: 1px solid var(--line);
    background: var(--surface-2);
  }
  .split {
    position: absolute;
    z-index: 2;
    top: 0;
    bottom: 0;
    right: -4px;
    width: 7px;
    cursor: col-resize;
    touch-action: none;
    outline: none;
  }
  .split::after {
    content: '';
    position: absolute;
    top: 0;
    bottom: 0;
    left: 2px;
    width: 3px;
    background: transparent;
    transition: background 0.15s;
  }
  .split:hover::after,
  .split:active::after,
  .split:focus-visible::after {
    background: var(--accent);
  }
  .tree {
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: 0.35rem;
  }
  .tree ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .tn {
    display: flex;
    align-items: center;
    border-radius: 6px;
  }
  .tn:hover {
    background: var(--line);
  }
  .tn.drop,
  .crumb.drop,
  .list > li.drop {
    background: var(--accent-soft);
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }
  .list.drop {
    outline: 2px dashed var(--accent);
    outline-offset: -2px;
    border-radius: 6px;
  }
  .dragging {
    opacity: 0.45;
  }
  .tn.sel,
  .tname.nav.sel {
    background: var(--accent-soft);
    color: var(--accent);
  }
  .chev {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: none;
    width: 1.5rem;
    height: 1.5rem;
    padding: 0;
    border: 0;
    background: none;
    color: var(--muted);
    cursor: pointer;
  }
  .chev.none {
    cursor: default;
  }
  .chev.open :global(svg) {
    transform: rotate(90deg);
  }
  .tname {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 0.45rem;
    padding: 0.42rem 0.4rem 0.42rem 0.1rem;
    border: 0;
    background: none;
    color: inherit;
    font: inherit;
    font-size: 0.95rem;
    text-align: left;
    cursor: pointer;
  }
  .tname :global(svg) {
    flex: none;
  }
  .tname span {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .tname small {
    flex: none;
    color: var(--muted);
    font-size: 0.78rem;
  }
  aside nav {
    flex: none;
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    padding: 0.5rem 0.6rem 0.75rem;
    border-top: 1px solid var(--line);
  }
  .tname.nav {
    width: 100%;
    padding: 0.4rem 0.6rem;
    border-radius: 6px;
  }
  .tname.nav:hover:not(.sel) {
    background: var(--line);
  }
  .content {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    padding: 0.45rem 0.6rem;
  }
  .crumbs {
    display: flex;
    align-items: center;
    gap: 0.15rem;
    min-height: 2rem;
    margin-bottom: 0.35rem;
    font-size: 0.85rem;
  }
  .crumbs nav {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.15rem 0.3rem;
  }
  .crumb {
    border: 0;
    background: none;
    padding: 0.1rem 0.2rem;
    font: inherit;
    color: var(--accent);
    cursor: pointer;
    overflow-wrap: anywhere;
    text-align: left;
  }
  .crumb:hover {
    text-decoration: underline;
  }
  .crumb[aria-current] {
    color: var(--text);
    font-weight: 600;
  }
  .filters {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: 0.4rem 0.75rem;
    padding: 0.5rem 0.6rem;
    margin-bottom: 0.4rem;
    border-radius: 8px;
    background: var(--surface-2);
    font-size: 0.82rem;
  }
  .filters label {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    color: var(--muted);
  }
  .filters select {
    min-width: 9rem;
    max-width: 16rem;
    width: auto;
    padding: 0.25rem 0.35rem;
    border: 1px solid var(--line);
    border-radius: 6px;
    background: var(--surface);
    color: var(--text);
    font: inherit;
  }
  .filters .link {
    align-self: center;
    margin-left: auto;
  }
  .crumb-sep {
    color: var(--muted);
  }
  .list {
    list-style: none;
    margin: 0;
    padding: 0;
    overflow: auto;
    flex: 1;
    min-height: 0;
  }
  .list > li {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
    padding: 0.4rem 0.45rem;
    border-bottom: 1px solid var(--line);
    border-radius: 6px;
  }
  .list > li:hover:not(.empty) {
    background: var(--surface-2);
  }
  .main {
    flex: 1 1 18rem;
    min-width: 0;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.1rem;
    border: 0;
    background: none;
    text-align: left;
    padding: 0.15rem 0;
    cursor: pointer;
    color: inherit;
    font: inherit;
  }
  .main strong :global(svg) {
    vertical-align: -3px;
    color: var(--muted);
  }
  .main.static {
    cursor: default;
  }
  button.main:hover strong {
    color: var(--accent);
  }
  .main small {
    color: var(--muted);
    font-size: 0.78rem;
  }
  .main small > span + span::before {
    content: ' · ';
  }
  .main small.editing {
    color: var(--danger);
    font-weight: 500;
  }
  em {
    font-style: normal;
    font-size: 0.72rem;
    font-weight: 500;
    color: var(--muted);
    border: 1px solid var(--line);
    border-radius: 99px;
    padding: 0.03rem 0.45rem;
    margin-left: 0.2rem;
    white-space: nowrap;
  }
  em.shared {
    color: var(--accent);
    background: var(--accent-soft);
    border-color: transparent;
  }
  .acts {
    display: inline-flex;
    flex: none;
  }
  /* Tombol tindakan hanya tampil pada baris yang disorot mouse atau difokuskan keyboard, agar daftar panjang tidak
     penuh tombol. Ruangnya tetap dipakai, jadi baris tidak bergeser. Layar sentuh (tanpa hover) selalu menampilkannya. */
  @media (hover: hover) {
    .list > li .acts {
      opacity: 0;
      transition: opacity 0.12s;
    }
    .list > li:hover .acts,
    .list > li:focus-within .acts,
    .list > li .acts:has(.on) {
      opacity: 1;
    }
  }
  .btn:disabled {
    opacity: 0.45;
    cursor: default;
  }
  /* ---- Pilihan ---- */
  .list:focus {
    outline: none;
  }
  .list > li.sel,
  .list > li.sel:hover {
    background: var(--accent-soft);
  }
  .list > li:has(> .main:focus-visible) {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }
  .main:focus-visible {
    outline: none;
  }
  .pick {
    flex: none;
    width: 15px;
    height: 15px;
    margin: 0 0 0 0.1rem;
    accent-color: var(--accent);
    cursor: pointer;
  }
  @media (hover: hover) {
    .list:not(.selecting) > li:not(:hover) .pick {
      opacity: 0;
    }
  }
  .selbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.4rem;
    margin-bottom: 0.35rem;
    padding: 0.3rem 0.5rem;
    border-radius: 8px;
    background: var(--accent-soft);
    font-size: 0.84rem;
  }
  .selbar strong {
    color: var(--accent);
  }
  .pickall {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    margin-right: 0.3rem;
    cursor: pointer;
  }
  .selbar .btn {
    padding: 0.22rem 0.6rem;
    font-size: 0.82rem;
  }
  .selbar .btn.danger {
    color: var(--danger);
  }
  .history {
    flex-basis: 100%;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    padding: 0.4rem 0.5rem;
    border-radius: 8px;
    background: var(--surface);
    border: 1px solid var(--line);
    font-size: 0.82rem;
  }
  .history div {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }
  .history .hhead {
    padding-bottom: 0.25rem;
    border-bottom: 1px solid var(--line);
  }
  .history .hacts {
    display: flex;
    gap: 0.15rem;
  }
  .history .link {
    border: 0;
    background: none;
    padding: 0;
    color: var(--danger);
    font: inherit;
    cursor: pointer;
  }
  .history .link:hover {
    text-decoration: underline;
  }
  .history .hhead .hacts {
    gap: 0.9rem;
  }
  .history .link.cmp {
    color: var(--accent);
  }
  em.due {
    color: #92400e;
    background: var(--warn-bg, #fef3c7);
    border-color: var(--warn-line, #f59e0b);
  }
  small.due {
    color: #92400e !important;
    font-weight: 600;
  }
  em.notes {
    color: var(--accent);
    background: var(--accent-soft);
    border-color: var(--accent);
  }
  small.notes {
    color: var(--accent) !important;
    font-weight: 600;
  }
  .mentions .quote {
    font-size: 0.85rem;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .mentions .main:disabled {
    cursor: default;
    opacity: 0.6;
  }
  .due-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.3rem;
  }
  .due-head select {
    width: auto;
    padding: 0.05rem 0.3rem;
    font-size: 0.8rem;
  }
  .empty {
    justify-content: center;
    color: var(--muted);
    padding: 1.5rem !important;
    font-size: 0.9rem;
    border-bottom: 0 !important;
  }
  .moved {
    margin: 0.2rem 0 0.7rem;
    font-size: 0.88rem;
    overflow-wrap: anywhere;
  }
  .move {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.86rem;
    margin-bottom: 0.4rem;
  }
  .move span {
    flex: none;
  }
  .move select {
    flex: 1;
    min-width: 0;
  }
  .small-dialog small {
    font-size: 0.78rem;
  }
  .end {
    display: flex;
    justify-content: flex-end;
    gap: 0.4rem;
    margin-top: 0.9rem;
  }
  .gate {
    padding: 1.5rem 0.5rem;
    text-align: center;
  }
  .gate p {
    margin: 0 0 1rem;
    line-height: 1.5;
  }
  .error {
    color: var(--danger);
    font-size: 0.85rem;
    margin: 0 0 0.5rem;
  }
  .link {
    border: 0;
    background: none;
    color: var(--accent);
    cursor: pointer;
    text-decoration: underline;
  }
  .meter {
    height: 8px;
    border-radius: 99px;
    background: var(--surface-2);
    overflow: hidden;
    margin-bottom: 0.4rem;
  }
  .meter span {
    display: block;
    height: 100%;
    background: var(--accent);
  }
  .content {
    position: relative;
  }
  .filehint {
    position: absolute;
    left: 50%;
    bottom: 1rem;
    transform: translateX(-50%);
    z-index: 2;
    margin: 0;
    padding: 0.45rem 0.9rem;
    border-radius: 999px;
    background: var(--accent);
    color: #fff;
    font-size: 0.85rem;
    font-weight: 600;
    white-space: nowrap;
    pointer-events: none;
    box-shadow: 0 4px 14px rgb(0 0 0 / 0.2);
  }
  .importing {
    margin: 0 0 0.4rem;
    font-size: 0.82rem;
    color: var(--muted);
  }
  .importing .meter {
    margin: 0.25rem 0 0;
    height: 6px;
  }
  .meter span {
    transition: width 0.2s;
  }
  .empty small {
    flex-basis: 100%;
    text-align: center;
    font-size: 0.8rem;
  }
</style>
