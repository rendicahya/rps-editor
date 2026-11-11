<script>
  import { SvelteSet } from 'svelte/reactivity';
  import { haystack } from './library.js';
  import * as F from './faculty.svelte.js';
  import { faculty, canManage, canEdit } from './faculty.svelte.js';
  import AccessDialog from './AccessDialog.svelte';
  import ContextMenu from './ContextMenu.svelte';
  import Icon from './Icon.svelte';
  import * as ui from './ask.svelte.js';

  /**
   * openIds: id RPS yang sedang terbuka di tab. onopen(sop), onupload(folder): di App.
   * onloaded(live): daftar baru dimuat, tab yang terbuka mengikuti hak akses terbaru. onrenamed(id, hasil renameSop): tab mengikuti.
   * onbinned(id): tab RPS yang dihapus ditutup; hasilnya true bila tab dipertahankan karena ada perubahan belum tersimpan.
   * Panel di dialog Pustaka: open = dialognya terbuka, active = tab Daring yang tampil, host = elemen <dialog>,
   * tabs = pemilih tab di kepala panel, onclose() menutup dialog.
   */
  let { open = false, active = false, host, tabs, onclose, openIds = [], cansave = true, onopen, onupload, oncreate, onloaded, onrenamed, onbinned, onnotify } = $props();

  let moveDialog;
  let view = $state('sops'); // sops | bin | admin
  let live = $state([]);
  let bin = $state([]);
  let folders = $state([]);
  let folderId = $state(null); // folder yang dipilih; null = tingkat utama
  const expanded = new SvelteSet();
  let moving = $state(null); // { item, isFolder, target }
  let accessTarget = $state(null);
  let menu = $state(null); // { x, y, items }
  let query = $state('');
  let busy = $state(false);
  let loadError = $state('');
  let history = $state(null); // { id, versions }
  let usage = $state(null);
  let members = $state([]);
  let newEmail = $state('');
  let newRole = $state('member');
  let newGroup = $state(''); // grup untuk anggota baru; '' = tanpa grup
  let groups = $state([]);
  let groupName = $state('');
  let openGroup = $state(null); // id grup yang daftar anggotanya sedang dibuka

  const admin = $derived(faculty.status === 'in' && faculty.role === 'admin');

  // Tiap kali dialog dibuka, panel ini mulai dari daftar RPS lagi.
  let wasOpen = false;
  let loaded = $state(false);
  $effect(() => {
    if (open && !wasOpen) {
      query = '';
      history = null;
      view = 'sops';
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
    if (open && active && faculty.status === 'in' && view === 'admin') refreshAdmin();
  });

  $effect(() => {
    if (moving && !moveDialog.open) moveDialog.showModal();
    else if (!moving && moveDialog.open) moveDialog.close();
  });

  async function refresh() {
    busy = true;
    loadError = '';
    try {
      const [r, f] = await Promise.all([F.listSops(), F.listFolders()]);
      // Penyebaran hak akses tidak boleh menghalangi tampilnya daftar; yang gagal dicoba lagi saat dimuat berikutnya.
      await F.reconcileAccess(f, [...r.live, ...r.bin]).catch(() => {});
      live = r.live.map(withText);
      bin = r.bin.map(withText);
      folders = f;
      onloaded(r.live);
    } catch (e) {
      loadError = e.message;
    } finally {
      busy = false;
    }
  }
  const withText = (s) => ({ ...s, text: haystack({ ...s, fileName: null, tags: [s.createdByName] }) });

  const words = $derived(query.trim().toLowerCase().split(/\s+/).filter(Boolean));
  const matches = (s) => words.every((w) => s.text.includes(w));
  const searching = $derived(words.length > 0);
  const shownBin = $derived(bin.filter(matches));

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

  const shownFolders = $derived(searching ? folders.filter((f) => words.every((w) => f.name.toLowerCase().includes(w))).sort(byName) : childrenOf(here));
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
  const shownLive = $derived(live.filter((s) => (searching ? matches(s) : folderOf(s) === here)));
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
  const moveTargets = $derived(flatTree.filter((t) => canAdd(t.id) && !(moving?.isFolder && pathOf(t.id).some((a) => a.id === moving.item.id))));

  function select(id) {
    view = 'sops';
    folderId = id;
    query = '';
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
    const { item, isFolder, target } = moving;
    moving = null;
    moveTo(item, isFolder, target);
  }
  function moveTo(item, isFolder, target) {
    const dest = byId.get(target) ?? null;
    if (isFolder) {
      if (target === parents.get(item.id)) return;
      if (nameTaken(item.name, target, item.id)) return ui.alert(takenMessage(item.name));
      if (target) expanded.add(target);
      act(() => F.moveFolder(item, dest), 'Folder dipindahkan');
    } else if (target !== folderOf(item)) {
      act(() => F.moveSop(item, dest), 'RPS dipindahkan');
    }
  }

  // ---- Seret dan lepas ----
  // Yang bisa diseret: RPS dan folder yang boleh dipindahkan (pemilik dan admin). Tempat lepas: folder di pohon,
  // breadcrumb, folder di hasil pencarian, dan area daftar (folder yang sedang dibuka).
  let drag = $state(null); // { item, isFolder }
  let dropAt = $state(undefined); // id folder yang sedang disorot; null = Utama
  let hoverTimer;
  const parentOf = (d) => (d.isFolder ? (parents.get(d.item.id) ?? null) : folderOf(d.item));
  function canDrop(target) {
    if (!drag || target === parentOf(drag) || !canAdd(target)) return false;
    return !(drag.isFolder && target && pathOf(target).some((a) => a.id === drag.item.id));
  }
  function dragStart(e, item, isFolder) {
    if (!canManage(item)) return e.preventDefault();
    e.stopPropagation();
    menu = null;
    drag = { item, isFolder };
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', isFolder ? item.name : titleOf(item));
  }
  function dragOver(e, target) {
    if (!drag) return;
    e.stopPropagation();
    if (!canDrop(target)) {
      e.dataTransfer.dropEffect = 'none';
      if (dropAt === target) dropAt = undefined;
      return;
    }
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
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
    const d = drag;
    const ok = canDrop(target);
    dragEnd();
    if (d && ok) moveTo(d.item, d.isFolder, target);
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

  async function act(fn, done) {
    try {
      await fn();
      if (done) onnotify(done);
    } catch (e) {
      ui.alert(e.message);
    }
    await refresh();
  }

  const titleOf = (s) => s.title || 'RPS tanpa judul';
  const isOpen = (s) => openIds.includes(s.id);

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
    onclose();
    onopen(s);
  }

  async function rename(s) {
    const name = (await ui.prompt('Nama RPS', s.title, { title: 'Ubah nama RPS', ok: 'Simpan' }))?.trim();
    if (!name || name === s.title) return;
    act(async () => onrenamed(s.id, await F.renameSop(s.id, name)), 'Nama RPS diubah');
  }

  function moveToBin(s) {
    act(async () => {
      await F.moveToBin(s.id);
      const kept = onbinned(s.id);
      onnotify(kept ? 'Dipindahkan ke Recycle bin. Perubahan yang belum tersimpan masih ada di tabnya.' : 'Dipindahkan ke Recycle bin');
    });
  }

  const duplicate = (s) => act(() => F.duplicateSop(s), 'Salinan dibuat');
  const moveSop = (s) => (moving = { item: s, isFolder: false, target: folderOf(s) });
  const moveFolder = (f) => (moving = { item: f, isFolder: true, target: parents.get(f.id) ?? null });
  const restoreFromBin = (s) => act(() => F.restoreFromBin(s.id), 'RPS dipulihkan');

  async function purge(s) {
    const msg = `Hapus "${titleOf(s)}" secara permanen?\n\nSeluruh riwayat versinya, termasuk suntingan orang lain, ikut terhapus. Tindakan ini tidak bisa dibatalkan.`;
    if (await ui.confirm(msg, { title: 'Hapus permanen', ok: 'Hapus permanen', danger: true })) act(() => F.purgeSop(s), 'Dihapus permanen');
  }

  async function toggleHistory(s) {
    if (history?.id === s.id) return (history = null);
    try {
      history = { id: s.id, versions: await F.listVersions(s.id) };
    } catch (e) {
      ui.alert(e.message);
    }
  }

  async function restoreVersion(s, v) {
    const msg = `Kembalikan isi "${titleOf(s)}" ke versi ${when(v.savedAt)}? Isi saat ini tetap tersimpan di Riwayat.`;
    if (!(await ui.confirm(msg, { ok: 'Kembalikan' }))) return;
    history = null;
    act(() => F.restoreVersion(s.id, v), 'Versi lama dikembalikan');
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
  /** Ringkasan siapa yang bisa melihat, untuk lencana di daftar. */
  function accessLabel(item) {
    const readers = item.readers ?? [];
    if (readers.includes(F.EVERYONE)) return 'Semua anggota';
    const others = readers.filter((r) => r !== item.createdByEmail);
    const nGroups = others.filter(F.isGroup).length;
    const nPeople = others.length - nGroups;
    return [nGroups && `${nGroups} grup`, nPeople && `${nPeople} orang`].filter(Boolean).join(' · ') || 'Private';
  }
  const accessTip = (item) => (canManage(item) ? 'Atur hak akses' : 'Lihat hak akses');

  // ---- Menu klik kanan ----
  function openMenu(e, items) {
    e.preventDefault();
    e.stopPropagation();
    menu = { x: e.clientX, y: e.clientY, items };
  }
  function hereItems(id) {
    const add = canAdd(id);
    return [
      { label: 'RPS baru di sini', run: () => newSop(id), disabled: !add },
      { label: 'Folder baru di sini', run: () => newFolder(id), disabled: !add },
      { label: 'Unggah dokumen ini ke sini', run: () => onupload(id), disabled: !add || !cansave }
    ];
  }
  function folderMenu(f) {
    const manage = canManage(f);
    return [
      { label: 'Buka', run: () => select(f.id) },
      { sep: true },
      ...hereItems(f.id),
      { sep: true },
      { label: accessTip(f), run: () => openAccess('folders', f) },
      ...(canEdit(f) ? [{ label: 'Ubah nama', run: () => renameFolder(f) }] : []),
      ...(manage
        ? [
            { label: 'Pindahkan', run: () => moveFolder(f) },
            { sep: true },
            { label: 'Hapus', run: () => removeFolder(f), danger: true }
          ]
        : [])
    ];
  }
  function sopMenu(s) {
    const manage = canManage(s);
    return [
      { label: 'Buka', run: () => openSop(s) },
      { sep: true },
      { label: 'Duplikat', run: () => duplicate(s) },
      { label: 'Riwayat', run: () => toggleHistory(s) },
      { label: accessTip(s), run: () => openAccess('sops', s) },
      ...(canEdit(s) ? [{ label: 'Ubah nama', run: () => rename(s) }] : []),
      ...(manage
        ? [
            { label: 'Pindahkan', run: () => moveSop(s) },
            { sep: true },
            { label: 'Hapus', run: () => moveToBin(s), danger: true }
          ]
        : [])
    ];
  }
  const binMenu = (s) => [
    { label: 'Pulihkan', run: () => restoreFromBin(s) },
    { sep: true },
    { label: 'Hapus permanen', run: () => purge(s), danger: true }
  ];

  const noAddTip = 'Hanya pemilik folder ini yang bisa menambah isinya';
  const uploadBlocked = $derived(!canAdd(here) ? noAddTip : !cansave ? 'Dokumen ini kosong atau sudah tertaut ke Pustaka Daring' : '');
  const uploadTip = $derived(uploadBlocked || (here ? `Unggah dokumen ini ke ${byId.get(here).name}` : 'Unggah dokumen ini ke Utama'));

  // ---- Admin ----
  async function refreshAdmin() {
    try {
      [usage, members, groups] = await Promise.all([F.getUsage(), F.listMembers(), F.listGroups()]);
    } catch (e) {
      ui.alert(e.message);
    }
  }
  const adminAct = (fn) => fn().catch((e) => ui.alert(e.message)).finally(refreshAdmin);

  function addMember(e) {
    e.preventDefault();
    const email = newEmail.trim().toLowerCase();
    if (!/^[^@\s/]+@(ub\.ac\.id|gmail\.com)$/.test(email)) return ui.alert('Masukkan alamat email @ub.ac.id atau @gmail.com.');
    newEmail = '';
    const existing = members.find((m) => m.email === email);
    const kept = existing?.groups ?? [];
    adminAct(() => F.setMember(email, newRole, newGroup ? [...new Set([...kept, newGroup])] : kept));
  }

  const groupNames = (m) => m.groups.map((id) => groups.find((g) => g.id === id)?.name).filter(Boolean);
  const inGroup = (g) => members.filter((m) => m.groups.includes(g.id));
  const cleanName = (s) => s.trim().replace(/\s+/g, ' ').slice(0, 80);
  function addGroup(e) {
    e.preventDefault();
    const name = cleanName(groupName);
    if (!name) return;
    if (groups.some((g) => g.name.toLowerCase() === name.toLowerCase())) return ui.alert(`Grup ${name} sudah ada.`);
    groupName = '';
    adminAct(async () => (openGroup = await F.createGroup(name)));
  }
  async function renameGroup(g) {
    const name = cleanName((await ui.prompt('Nama grup', g.name, { title: 'Ubah nama grup', ok: 'Simpan', maxlength: 80 })) ?? '');
    if (!name || name === g.name) return;
    if (groups.some((x) => x.id !== g.id && x.name.toLowerCase() === name.toLowerCase())) return ui.alert(`Grup ${name} sudah ada.`);
    adminAct(() => F.renameGroup(g.id, name));
  }
  async function deleteGroup(g) {
    const msg = `Hapus grup ${g.name}? Anggotanya tetap terdaftar, tetapi hak akses yang diberikan lewat grup ini tidak berlaku lagi.`;
    if (await ui.confirm(msg, { ok: 'Hapus', danger: true })) adminAct(() => F.deleteGroup(g.id, members));
  }
  function toggleInGroup(g, m, on) {
    const emails = inGroup(g).map((x) => x.email).filter((x) => x !== m.email);
    adminAct(() => F.setGroupMembers(g.id, on ? [...emails, m.email] : emails, members));
  }
  async function removeMember(m) {
    if (await ui.confirm(`Cabut akses ${m.email}? RPS buatannya tetap ada.`, { ok: 'Cabut akses', danger: true })) adminAct(() => F.removeMember(m.email));
  }
  async function changeLimit() {
    const raw = await ui.prompt('Batas penyimpanan (MB)', String(Math.round(usage.limit / 1e6)), { title: 'Ubah batas penyimpanan', ok: 'Simpan', type: 'number' });
    const v = Number(raw);
    if (raw && v > 0) adminAct(() => F.setLimit(Math.round(v * 1e6)));
  }
  const recount = () => adminAct(() => F.recountUsage());

  const size = (n) => (n >= 1e6 ? `${(n / 1e6).toLocaleString('id-ID', { maximumFractionDigits: 1 })} MB` : `${Math.ceil(n / 1000).toLocaleString('id-ID')} KB`);
  const when = (ms) => new Date(ms).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
  const percent = $derived(usage ? Math.min(100, (usage.bytes / usage.limit) * 100) : 0);
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

{#snippet node(f, depth)}
  {@const kids = childrenOf(f.id)}
  {@const opened = expanded.has(f.id)}
  <li role="treeitem" aria-selected={view === 'sops' && here === f.id} aria-expanded={kids.length ? opened : undefined}>
    <div class="tn" class:sel={view === 'sops' && here === f.id} class:drop={dropAt === f.id} class:dragging={drag?.item === f} style:padding-left="{depth * 0.9 + 0.2}rem" role="presentation" draggable={canManage(f)} ondragstart={(e) => dragStart(e, f, true)} ondragend={dragEnd} {...dropzone(f.id)} oncontextmenu={(e) => openMenu(e, folderMenu(f))}>
      {#if kids.length}
        <button type="button" class="chev" class:open={opened} aria-label={opened ? `Tutup ${f.name}` : `Buka ${f.name}`} onclick={() => toggle(f.id)}><Icon name="chevron" size={13} /></button>
      {:else}
        <span class="chev none"></span>
      {/if}
      <button type="button" class="tname" onclick={() => select(f.id)}>
        <Icon name="folder" size={15} />
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
    {#if faculty.status === 'in' && view !== 'admin'}
      <input class="search" type="search" bind:value={query} placeholder="Cari mata kuliah, kode, pembuat, dosen, CPL/CPMK, atau materi…" />
    {:else}
      <span class="grow"></span>
    {/if}
    {#if admin}
      <button type="button" class="adm" class:on={view === 'admin'} aria-pressed={view === 'admin'} data-tip={view === 'admin' ? 'Kembali ke daftar RPS' : 'Anggota, grup, dan penyimpanan'} onclick={() => (view = view === 'admin' ? 'sops' : 'admin')}>
        <Icon name="settings" size={15} /><span>Admin</span>
      </button>
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
          <ul role="tree" aria-label="Folder">
            <li role="treeitem" aria-selected={view === 'sops' && !here}>
              <div class="tn" class:sel={view === 'sops' && !here} class:drop={dropAt === null} style:padding-left="0.2rem" role="presentation" {...dropzone(null)}>
                <span class="chev none"></span>
                <button type="button" class="tname" onclick={() => select(null)}>
                  <Icon name="folder" size={15} />
                  <span>Utama</span>
                  {#if counts.get(null)}<small>{counts.get(null)}</small>{/if}
                </button>
              </div>
            </li>
            {#each childrenOf(null) as f (f.id)}{@render node(f, 1)}{/each}
          </ul>
        </div>
        <nav aria-label="Lainnya">
          <button type="button" class="tname nav" class:sel={view === 'bin'} onclick={() => (view = 'bin')}>
            <Icon name="trash" size={15} /><span>Recycle bin</span>{#if bin.length}<small>{bin.length}</small>{/if}
          </button>
        </nav>
      </aside>

      <section class="content">
        {#if view === 'sops'}
          <div class="crumbs">
            {#if searching}
              <span class="muted grow">Hasil pencarian di semua folder</span>
            {:else}
              <nav class="grow" aria-label="Lokasi folder">
                <button class="crumb" class:drop={dropAt === null} aria-current={here ? undefined : 'location'} onclick={() => select(null)} {...dropzone(null)} oncontextmenu={(e) => openMenu(e, hereItems(null))}>Utama</button>
                {#each crumbs as c (c.id)}
                  <span class="sep" aria-hidden="true">/</span>
                  <button class="crumb" class:drop={dropAt === c.id} aria-current={c.id === here ? 'location' : undefined} onclick={() => select(c.id)} {...dropzone(c.id)} oncontextmenu={(e) => openMenu(e, folderMenu(c))}>{c.name}</button>
                {/each}
              </nav>
            {/if}
            {#if here && !searching}
              {@render ib('users', accessTip(byId.get(here)), () => openAccess('folders', byId.get(here)))}
            {/if}
            {@render ib('filePlus', canAdd(here) ? 'RPS baru di sini' : noAddTip, () => newSop(), { disabled: !canAdd(here) })}
            {@render ib('folderPlus', canAdd(here) ? 'Folder baru di sini' : noAddTip, () => newFolder(), { disabled: !canAdd(here) })}
            {@render ib('upload', uploadTip, () => onupload(here), { disabled: !!uploadBlocked })}
            {@render ib('refresh', 'Muat ulang daftar', refresh)}
          </div>
          <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
          <ul class="list" class:drop={!searching && drag && dropAt === here} oncontextmenu={(e) => openMenu(e, hereItems(here))} {...(searching ? {} : dropzone(here))}>
            {#each shownFolders as f (f.id)}
              {@const parent = parents.get(f.id)}
              <li class:drop={dropAt === f.id} class:dragging={drag?.item === f} draggable={canManage(f)} ondragstart={(e) => dragStart(e, f, true)} ondragend={dragEnd} {...dropzone(f.id)} oncontextmenu={(e) => openMenu(e, folderMenu(f))}>
                <button class="main" onclick={() => select(f.id)}>
                  <strong><Icon name="folder" size={15} /> {f.name} <em class:shared={F.isShared(f)}>{accessLabel(f)}</em></strong>
                  <small>{[searching && parent && `di ${pathText(parent)}`, folderInfo(f), `dibuat ${f.createdBy === faculty.user.uid ? 'Anda' : f.createdByName}`].filter(Boolean).join(' · ')}</small>
                </button>
              </li>
            {/each}
            {#each shownLive as s (s.id)}
              {@const manage = canManage(s)}
              {@const editors = namesEditing(s)}
              <li class:dragging={drag?.item === s} draggable={manage} ondragstart={(e) => dragStart(e, s, false)} ondragend={dragEnd} oncontextmenu={(e) => openMenu(e, sopMenu(s))}>
                <button class="main" onclick={() => openSop(s)}>
                  <strong>
                    <Icon name="file" size={15} />
                    {titleOf(s)}
                    <em class:shared={F.isShared(s)}>{accessLabel(s)}</em>
                    {#if s.custom && folderOf(s)}<em>Khusus</em>{/if}
                    {#if !canEdit(s)}<em>Hanya lihat</em>{/if}
                    {#if isOpen(s)}<em>Terbuka di tab</em>{/if}
                  </strong>
                  <small title={s.createdByEmail}>
                    {[searching && folderOf(s) && `di ${pathText(folderOf(s))}`, s.nomor, `dibuat ${s.createdBy === faculty.user.uid ? 'Anda' : s.createdByName}`, `diubah ${s.updatedByName}, ${when(s.updatedAt)}`].filter(Boolean).join(' · ')}
                  </small>
                  {#if editors}<small class="editing">✎ Sedang diedit oleh {editors}</small>{/if}
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
                    {#each history.versions as v (v.rev)}
                      <div>
                        <span>{when(v.savedAt)} · {v.savedByName}</span>
                        {#if canEdit(s)}
                          {@render ib('restore', isOpen(s) ? 'Tutup tabnya dulu untuk mengembalikan versi' : 'Kembalikan versi ini', () => restoreVersion(s, v), { disabled: isOpen(s) })}
                        {/if}
                      </div>
                    {:else}
                      <span class="muted">Belum ada versi lama.</span>
                    {/each}
                  </div>
                {/if}
              </li>
            {/each}
            {#if !shownFolders.length && !shownLive.length}
              <li class="empty">{busy ? 'Memuat…' : searching ? 'Tidak ada yang cocok.' : here ? 'Folder ini masih kosong.' : 'Belum ada folder atau RPS di sini.'}</li>
            {/if}
          </ul>
        {:else if view === 'bin'}
          <ul class="list">
            {#each shownBin as s (s.id)}
              <li oncontextmenu={(e) => openMenu(e, binMenu(s))}>
                <div class="main static">
                  <strong><Icon name="file" size={15} /> {titleOf(s)}</strong>
                  <small>{[s.nomor, `dibuat ${s.createdBy === faculty.user.uid ? 'Anda' : s.createdByName}`, `dihapus ${when(s.deletedAt)}`, size(s.totalBytes)].filter(Boolean).join(' · ')}</small>
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
        {:else if admin}
      <div class="admin">
        <section>
          <h3>Penyimpanan</h3>
          {#if usage}
            <p class="usage"><strong>{size(usage.bytes)}</strong> dari {size(usage.limit)} terpakai · sisa {size(Math.max(0, usage.limit - usage.bytes))}</p>
            <div class="meter" role="progressbar" aria-valuenow={Math.round(percent)} aria-valuemin="0" aria-valuemax="100"><span style:width="{percent}%"></span></div>
            <small>
              Perkiraan dari ukuran isi RPS, riwayat, dan Recycle bin. Ruang sebenarnya lebih besar karena indeks Firestore.
              Kuota baca dan tulis harian hanya terlihat di Firebase Console.
            </small>
            <div class="row">
              {@render ib('gauge', 'Ubah batas penyimpanan', changeLimit)}
              {@render ib('refresh', 'Hitung ulang pemakaian', recount)}
            </div>
          {:else}
            <small>Memuat…</small>
          {/if}
        </section>
        <section>
          <h3>Anggota <span class="muted">{members.length}</span></h3>
          <form onsubmit={addMember} class="row">
            <input bind:value={newEmail} type="email" placeholder="nama@ub.ac.id atau nama@gmail.com" aria-label="Email anggota baru" />
            <select bind:value={newRole} aria-label="Peran">
              <option value="member">Anggota</option>
              <option value="admin">Admin</option>
            </select>
            {#if groups.length}
              <select bind:value={newGroup} aria-label="Grup anggota baru">
                <option value="">Tanpa grup</option>
                {#each groups as g (g.id)}<option value={g.id}>{g.name}</option>{/each}
              </select>
            {/if}
            <button class="ib" aria-label="Tambah anggota" data-tip="Tambah anggota" disabled={!newEmail.trim()}><Icon name="plus" /></button>
          </form>
          <ul class="members">
            {#each members as m (m.email)}
              {@const self = m.email === faculty.user.email}
              {@const gn = groupNames(m)}
              <li>
                <span>{m.email}{self ? ' (Anda)' : ''}{#if gn.length}<small class="groups-of">{gn.join(', ')}</small>{/if}</span>
                <select value={m.role} disabled={self} aria-label={`Peran ${m.email}`} onchange={(e) => adminAct(() => F.setMember(m.email, e.currentTarget.value, m.groups))}>
                  <option value="member">Anggota</option>
                  <option value="admin">Admin</option>
                </select>
                {@render ib('trash', self ? 'Anda tidak bisa mencabut akses sendiri' : 'Cabut akses', () => removeMember(m), { danger: true, disabled: self })}
              </li>
            {/each}
          </ul>
        </section>
        <section>
          <h3>Grup <span class="muted">{groups.length}</span></h3>
          <small>Grup bisa dipilih di Hak akses seperti email, sehingga semua anggotanya mendapat hak yang sama sekaligus. Anggota yang ditambahkan ke grup langsung mendapat hak grup itu.</small>
          <form onsubmit={addGroup} class="row">
            <input bind:value={groupName} maxlength="80" placeholder="Nama grup baru, mis. Prodi Informatika" aria-label="Nama grup baru" />
            <button class="ib" aria-label="Buat grup" data-tip="Buat grup" disabled={!groupName.trim()}><Icon name="plus" /></button>
          </form>
          {#if groups.length}
            <ul class="members">
              {#each groups as g (g.id)}
                {@const shown = openGroup === g.id}
                {@const count = inGroup(g).length}
                <li class="group">
                  <div class="group-head">
                    <span>{g.name} <small class="groups-of">{count} anggota</small></span>
                    {@render ib('users', shown ? 'Tutup daftar anggota' : 'Atur anggota grup', () => (openGroup = shown ? null : g.id), { on: shown, expanded: shown })}
                    {@render ib('pencil', 'Ubah nama grup', () => renameGroup(g))}
                    {@render ib('trash', 'Hapus grup', () => deleteGroup(g), { danger: true })}
                  </div>
                  {#if shown}
                    <div class="group-members">
                      {#each members as m (m.email)}
                        <label><input type="checkbox" checked={m.groups.includes(g.id)} onchange={(e) => toggleInGroup(g, m, e.currentTarget.checked)} /> {m.email}</label>
                      {/each}
                    </div>
                  {/if}
                </li>
              {/each}
            </ul>
          {/if}
        </section>
      </div>
        {/if}
      </section>
    </div>
  {:else}
    <div class="gate">
      {#if faculty.status === 'out'}
        <p>Pustaka Daring menyimpan RPS bersama secara daring. Masuk dengan akun Google <strong>@ub.ac.id</strong> atau <strong>@gmail.com</strong> yang sudah didaftarkan admin.</p>
        <button class="btn primary" onclick={() => F.signIn().catch((e) => ui.alert(e.message))}>Masuk dengan Google</button>
      {:else if faculty.status === 'domain'}
        <p><strong>{faculty.user.email}</strong> tidak bisa dipakai. Pustaka Daring hanya untuk akun @ub.ac.id atau @gmail.com.</p>
        <button class="btn" onclick={() => F.signOut().then(() => F.signIn()).catch((e) => ui.alert(e.message))}>Ganti akun</button>
      {:else if faculty.status === 'notMember'}
        <p><strong>{faculty.user.email}</strong> belum terdaftar sebagai anggota. Minta admin Pustaka Daring mendaftarkan akun ini.</p>
        <button class="btn" onclick={() => F.recheck()}>Periksa lagi</button>
      {:else if faculty.status === 'error'}
        <p class="error">{faculty.error}</p>
        <button class="btn" onclick={() => (faculty.user ? F.recheck() : F.start())}>Coba lagi</button>
      {:else}
        <p>Memuat…</p>
      {/if}
    </div>
  {/if}
  {#if menu}<ContextMenu x={menu.x} y={menu.y} items={menu.items} {host} onclose={() => (menu = null)} />{/if}

<dialog bind:this={moveDialog} class="dialog small-dialog" onclose={() => (moving = null)}>
  {#if moving}
    <form onsubmit={submitMove}>
      <h2>Pindahkan</h2>
      <p class="muted moved">{moving.isFolder ? moving.item.name : titleOf(moving.item)}</p>
      <label class="move">
        <span>Ke folder</span>
        <select bind:value={moving.target}>
          <option value={null}>Utama</option>
          {#each moveTargets as t (t.id)}
            <option value={t.id}>{'   '.repeat(t.depth + 1)}{t.name}</option>
          {/each}
        </select>
      </label>
      {#if !moving.item.custom}<small class="muted">Hak aksesnya akan mengikuti folder tujuan.</small>{/if}
      <footer class="end">
        <button type="button" class="btn" onclick={() => (moving = null)}>Batal</button>
        <button class="btn primary">Pindahkan</button>
      </footer>
    </form>
  {/if}
</dialog>

<AccessDialog target={accessTarget} onsave={saveAccess} onclose={() => (accessTarget = null)} />

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
  h3 {
    margin: 0 0 0.45rem;
    font-size: 0.92rem;
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
  .adm {
    flex: none;
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    height: 1.95rem;
    padding: 0 0.7rem;
    border: 1px solid var(--line);
    border-radius: 7px;
    background: none;
    color: var(--text);
    font: inherit;
    font-size: 0.82rem;
    cursor: pointer;
  }
  .adm:hover:not(.on) {
    background: var(--surface-2);
  }
  .adm.on {
    border-color: transparent;
    background: var(--accent-soft);
    color: var(--accent);
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
    width: 1.2rem;
    height: 1.2rem;
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
    gap: 0.35rem;
    padding: 0.28rem 0.35rem 0.28rem 0.1rem;
    border: 0;
    background: none;
    color: inherit;
    font: inherit;
    font-size: 0.85rem;
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
    font-size: 0.72rem;
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
  .sep {
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
    vertical-align: -2px;
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
  .btn:disabled {
    opacity: 0.45;
    cursor: default;
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
  .admin {
    overflow: auto;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 0.3rem 0.2rem;
  }
  .admin section {
    flex: none;
  }
  .admin select {
    width: auto;
    flex: none;
  }
  .admin small {
    display: block;
    color: var(--muted);
    font-size: 0.78rem;
    line-height: 1.45;
  }
  .usage {
    margin: 0 0 0.35rem;
    font-size: 0.9rem;
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
  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    margin-top: 0.5rem;
  }
  .row input {
    flex: 1;
    min-width: 12rem;
  }
  .members {
    list-style: none;
    margin: 0.5rem 0 0;
    padding: 0;
    border: 1px solid var(--line);
    border-radius: 10px;
  }
  .members li {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.35rem 0.6rem;
    border-bottom: 1px solid var(--line);
    font-size: 0.85rem;
  }
  .members li:last-child {
    border-bottom: 0;
  }
  .members span {
    flex: 1;
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .admin .groups-of {
    display: block;
    font-size: 0.76rem;
  }
  .members li.group {
    display: block;
  }
  .group-head {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .group-members {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    max-height: 14rem;
    overflow: auto;
    margin: 0.35rem 0 0.15rem;
    padding: 0.4rem 0.5rem;
    border-radius: 8px;
    background: var(--surface-2);
  }
  .group-members label {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    overflow-wrap: anywhere;
    cursor: pointer;
  }
  .group-members input {
    width: auto;
    margin: 0;
  }
</style>
