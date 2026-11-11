<script>
  import { newTabId } from './store.svelte.js';
  import { docTitle } from './model.js';
  import * as ui from './ask.svelte.js';
  import Icon from './Icon.svelte';
  import { listEntries, putEntry, patchEntry, deleteEntry, cleanTags, haystack } from './library.js';

  /**
   * openIds: id tab yang sedang terbuka (= id entri pustaka), current: id tab aktif.
   * Panel di dialog Pustaka: open = dialognya terbuka, active = tab Lokal yang tampil, tabs = pemilih tab di kepala panel,
   * onclose() menutup dialog.
   */
  let { open = false, active = false, tabs, onclose, openIds = [], current, onopen, onsave, cansave = true, onnotify } = $props();

  let entries = $state([]);
  let query = $state('');
  let tag = $state(null); // saringan label: null = semua, '' = tanpa label
  let tagEdit = $state(null); // id entri yang labelnya sedang diatur
  let newTag = $state('');
  let picked = $state([]); // id entri yang dicentang untuk dihapus sekaligus

  // Tiap kali dialog dibuka, pencarian dan pilihan dikosongkan.
  let wasOpen = false;
  $effect(() => {
    if (open && !wasOpen) {
      query = '';
      tagEdit = null;
      picked = [];
    }
    wasOpen = open;
  });
  // Dibaca ulang tiap kali tab Lokal tampil: isinya di browser ini, murah dibaca, dan bisa berubah dari tab Daring.
  $effect(() => {
    if (open && active) refresh();
  });

  async function refresh() {
    try {
      entries = (await listEntries()).map((e) => ({ ...e, tags: e.tags ?? [], text: haystack(e) }));
    } catch {
      entries = [];
      ui.alert('Pustaka Lokal tidak bisa dibaca di browser ini (mode privat atau penyimpanan diblokir).');
    }
  }

  const shown = $derived.by(() => {
    const q = query.trim().toLowerCase();
    const byTag = (e) => tag === null || (tag === '' ? !e.tags.length : e.tags.includes(tag));
    return entries.filter((e) => byTag(e) && (!q || q.split(/\s+/).every((w) => e.text.includes(w))));
  });
  // Pilihan untuk hapus sekaligus: hanya entri yang tampil dan tidak sedang terbuka di tab.
  const deletable = $derived(shown.filter((e) => !openIds.includes(e.id)));
  const chosen = $derived(deletable.filter((e) => picked.includes(e.id)));
  const allChosen = $derived(deletable.length > 0 && chosen.length === deletable.length);
  function togglePick(id) {
    picked = picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id];
  }
  function pickAll() {
    const ids = deletable.map((e) => e.id);
    picked = allChosen ? picked.filter((x) => !ids.includes(x)) : [...new Set([...picked, ...ids])];
  }
  async function removePicked() {
    const n = chosen.length;
    if (!n || !(await ui.confirm(`Hapus ${n} dokumen terpilih dari pustaka? Tindakan ini tidak bisa dibatalkan.`, { ok: 'Hapus', danger: true }))) return;
    for (const e of chosen) await deleteEntry(e.id);
    picked = [];
    await refresh();
    onnotify(`${n} dokumen dihapus`);
  }
  // Label beserta jumlah entrinya; allTags untuk pengaturan label entri.
  const tagList = $derived.by(() => {
    const n = new Map();
    for (const e of entries) for (const t of e.tags) n.set(t, (n.get(t) ?? 0) + 1);
    return [...n].sort((a, b) => a[0].localeCompare(b[0], 'id'));
  });
  const untagged = $derived(entries.filter((e) => !e.tags.length).length);
  const allTags = $derived(cleanTags(entries.flatMap((e) => e.tags)));

  const rtf = new Intl.RelativeTimeFormat('id', { numeric: 'auto' });
  function ago(ms) {
    const s = (ms - Date.now()) / 1000;
    if (s > -60) return 'baru saja';
    for (const [unit, n] of [['minute', 60], ['hour', 3600], ['day', 86400]]) {
      const v = Math.round(s / n);
      if (unit === 'day' ? v > -7 : Math.abs(v) < (unit === 'minute' ? 60 : 24)) return rtf.format(v, unit);
    }
    return new Date(ms).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  const titleOf = (e) => e.title || 'RPS tanpa judul';

  function pick(e) {
    onclose();
    onopen(e);
  }

  async function duplicate(e) {
    const d = JSON.parse(e.json);
    d.identitas.mataKuliah = (docTitle(d) || 'RPS tanpa judul') + ' (salinan)';
    const now = Date.now();
    await putEntry({ id: newTabId(), title: d.identitas.mataKuliah, nomor: d.identitas.kode, fileName: null, created: now, updated: now, json: JSON.stringify(d), tags: [...e.tags] });
    await refresh();
    onnotify('Salinan dibuat');
  }

  // Label: pengelompokan bebas (mis. Akademik, Keuangan); satu RPS boleh berlabel lebih dari satu.
  async function setTags(e, tags) {
    await patchEntry(e.id, { tags: cleanTags(tags) });
    await refresh();
  }
  const toggleTag = (e, t) => setTags(e, e.tags.includes(t) ? e.tags.filter((x) => x !== t) : [...e.tags, t]);
  async function addTag(e) {
    const v = newTag.trim();
    if (!v) return;
    newTag = '';
    await setTags(e, [...e.tags, v]);
  }
  /** Mengganti (fn = t => nama baru) atau menghapus (fn = () => null) satu label di semua entri. */
  async function mapTag(old, fn) {
    for (const e of entries) {
      if (e.tags.includes(old)) await patchEntry(e.id, { tags: cleanTags(e.tags.map((t) => (t === old ? fn(t) : t)).filter(Boolean)) });
    }
    await refresh();
  }
  async function renameTag(old) {
    const name = (await ui.prompt('Nama label', old, { title: 'Ubah nama label', ok: 'Simpan' }))?.trim().replace(/\s+/g, ' ');
    if (!name || name === old) return;
    await mapTag(old, () => name);
    tag = allTags.find((t) => t.toLowerCase() === name.toLowerCase()) ?? null;
  }
  async function removeTag(old) {
    const n = entries.filter((e) => e.tags.includes(old)).length;
    if (!(await ui.confirm(`Hapus label "${old}" dari ${n} entri? Dokumennya tidak ikut terhapus.`, { ok: 'Hapus label', danger: true }))) return;
    await mapTag(old, () => null);
    tag = null;
  }

  async function saveCurrent() {
    await onsave();
    tag = null;
    tagEdit = null;
    query = '';
    await refresh();
  }

  async function remove(e) {
    if (!(await ui.confirm(`Hapus "${titleOf(e)}" dari pustaka? Tindakan ini tidak bisa dibatalkan.`, { ok: 'Hapus', danger: true }))) return;
    await deleteEntry(e.id);
    await refresh();
  }
</script>

  <header>
    {@render tabs()}
    <input class="search" type="search" bind:value={query} placeholder="Cari mata kuliah, kode, label, dosen, CPL/CPMK, atau materi…" />
    <button class="ib x" onclick={onclose} aria-label="Tutup" data-tip="Tutup"><Icon name="x" /></button>
  </header>
  <p class="hint">
    RPS di Pustaka Lokal tersimpan di browser ini. Tekan Ctrl+S untuk menyimpan perubahannya. Data hilang bila data situs
    browser dihapus, jadi simpan juga RPS penting sebagai berkas .rps.
  </p>

  {#if tagList.length || tag !== null}
    <div class="tagbar" role="group" aria-label="Saring menurut label">
      <button class:on={tag === null} aria-pressed={tag === null} onclick={() => (tag = null)}>Semua</button>
      {#each tagList as [t, n] (t)}
        <button class:on={tag === t} aria-pressed={tag === t} onclick={() => (tag = tag === t ? null : t)}>{t} <span>{n}</span></button>
      {/each}
      {#if untagged}
        <button class:on={tag === ''} aria-pressed={tag === ''} onclick={() => (tag = tag === '' ? null : '')}>Tanpa label <span>{untagged}</span></button>
      {/if}
      {#if tag}
        <span class="grow"></span>
        <button class="link" onclick={() => renameTag(tag)}>Ubah nama label</button>
        <button class="link danger" onclick={() => removeTag(tag)}>Hapus label</button>
      {/if}
    </div>
  {/if}

  {#if shown.length}
    <div class="selbar">
      <label>
        <input
          type="checkbox"
          checked={allChosen}
          indeterminate={chosen.length > 0 && !allChosen}
          disabled={!deletable.length}
          onchange={pickAll}
        />
        Pilih semua{deletable.length < shown.length ? ' (kecuali yang terbuka di tab)' : ''}
      </label>
      {#if chosen.length}
        <span>{chosen.length} dipilih</span>
        <button class="btn small danger" onclick={removePicked}>Hapus terpilih</button>
        <button class="link" onclick={() => (picked = [])}>Batal</button>
      {/if}
    </div>
  {/if}

  <ul class="list">
    {#each shown as e (e.id)}
      {@const isOpen = openIds.includes(e.id)}
      <li class:current={e.id === current}>
        <input
          type="checkbox"
          class="pick"
          checked={!isOpen && picked.includes(e.id)}
          disabled={isOpen}
          onchange={() => togglePick(e.id)}
          aria-label={`Pilih ${titleOf(e)}`}
          title={isOpen ? 'Tutup tabnya dulu untuk menghapus' : 'Pilih untuk dihapus sekaligus'}
        />
        <button class="main" onclick={() => pick(e)}>
          <strong>
            {titleOf(e)}
            {#if e.id === current}<em>sedang dibuka</em>{:else if isOpen}<em>terbuka di tab</em>{/if}
          </strong>
          <small>
            {[e.nomor, e.fileName, 'diubah ' + ago(e.updated)].filter(Boolean).join(' · ')}
          </small>
          {#if e.tags.length}
            <span class="tags">{#each e.tags as t (t)}<i>{t}</i>{/each}</span>
          {/if}
        </button>
        <span class="acts">
          <button
            class="btn small"
            class:on={tagEdit === e.id}
            aria-expanded={tagEdit === e.id}
            onclick={() => ((tagEdit = tagEdit === e.id ? null : e.id), (newTag = ''))}
            title="Atur label untuk mengelompokkan">Label</button
          >
          <button class="btn small" onclick={() => duplicate(e)} title="Buat salinan di pustaka">Duplikat</button>
          <button
            class="btn small danger"
            onclick={() => remove(e)}
            disabled={isOpen}
            title={isOpen ? 'Tutup tabnya dulu untuk menghapus' : 'Hapus dari pustaka'}
          >Hapus</button>
        </span>
        {#if tagEdit === e.id}
          <div class="tag-edit">
            {#each allTags as t (t)}
              <label class:on={e.tags.includes(t)}>
                <input type="checkbox" checked={e.tags.includes(t)} onchange={() => toggleTag(e, t)} />
                {t}
              </label>
            {/each}
            <form
              onsubmit={(ev) => {
                ev.preventDefault();
                addTag(e);
              }}
            >
              <!-- svelte-ignore a11y_autofocus -->
              <input bind:value={newTag} placeholder={allTags.length ? 'Label baru…' : 'Label baru, mis. Akademik'} aria-label="Label baru" autofocus />
              <button class="btn small" disabled={!newTag.trim()}>Tambah</button>
            </form>
          </div>
        {/if}
      </li>
    {:else}
      <li class="empty">
        {query.trim() ? 'Tidak ada yang cocok.' : 'Belum ada dokumen. RPS yang disimpan ke Pustaka Lokal akan muncul di sini.'}
      </li>
    {/each}
  </ul>

  <footer>
    <button class="btn" onclick={saveCurrent} disabled={!cansave}>Simpan dokumen ini ke pustaka</button>
  </footer>

<style>
  header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
  }
  .search {
    flex: 1;
    min-width: 0;
    margin: 0 0.5rem;
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
  .ib:hover {
    background: var(--surface-2);
    color: var(--text);
  }
  .hint {
    margin: 0 0 0.6rem;
  }
  .list {
    list-style: none;
    margin: 0;
    padding: 0;
    overflow: auto;
    flex: 1;
    min-height: 8rem;
    border: 1px solid var(--line);
    border-radius: 10px;
  }
  .list li {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
    padding: 0.45rem 0.6rem;
    border-bottom: 1px solid var(--line);
  }
  .list li:last-child {
    border-bottom: 0;
  }
  .list li.current {
    background: var(--surface-2);
  }
  .main {
    flex: 1;
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
  }
  .main strong,
  .main small {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .main:hover strong {
    color: var(--accent);
  }
  .main small {
    color: var(--muted);
    font-size: 0.78rem;
  }
  em {
    font-style: normal;
    font-size: 0.72rem;
    font-weight: 500;
    color: var(--accent);
    background: var(--accent-soft);
    border-radius: 99px;
    padding: 0.05rem 0.45rem;
    margin-left: 0.3rem;
  }
  .selbar {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    font-size: 0.82rem;
    color: var(--muted);
    min-height: 1.9rem;
  }
  .selbar label {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    padding-left: 0.6rem;
  }
  .selbar .link {
    border: 0;
    background: none;
    color: var(--accent);
    cursor: pointer;
    font-size: 0.8rem;
  }
  .pick {
    flex: none;
    margin: 0;
  }
  .acts {
    display: flex;
    gap: 0.3rem;
    flex: none;
  }
  .acts .on {
    background: var(--accent-soft);
    color: var(--accent);
  }
  .tagbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.3rem;
    margin-bottom: 0.6rem;
  }
  .tagbar button {
    border: 1px solid var(--line);
    border-radius: 99px;
    background: none;
    color: var(--muted);
    padding: 0.15rem 0.6rem;
    font-size: 0.8rem;
    font-weight: 500;
    cursor: pointer;
  }
  .tagbar button span {
    font-size: 0.72rem;
    opacity: 0.75;
  }
  .tagbar button.on {
    border-color: var(--accent);
    background: var(--accent-soft);
    color: var(--accent);
  }
  .tagbar button.link {
    border: 0;
    padding: 0.15rem 0.3rem;
    text-decoration: underline;
  }
  .tags {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
    margin-top: 0.15rem;
  }
  .tags i {
    font-style: normal;
    font-size: 0.7rem;
    font-weight: 500;
    color: var(--muted);
    border: 1px solid var(--line);
    border-radius: 99px;
    padding: 0 0.45rem;
  }
  .tag-edit {
    flex-basis: 100%;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.35rem;
    padding: 0.4rem 0.5rem;
    border-radius: 8px;
    background: var(--surface-2);
  }
  .tag-edit label {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    font-size: 0.8rem;
    border: 1px solid var(--line);
    border-radius: 99px;
    padding: 0.1rem 0.55rem 0.1rem 0.35rem;
    background: var(--surface);
    cursor: pointer;
  }
  .tag-edit label.on {
    border-color: var(--accent);
    color: var(--accent);
  }
  .tag-edit input[type='checkbox'] {
    margin: 0;
  }
  .tag-edit form {
    display: flex;
    gap: 0.3rem;
  }
  .tag-edit form input {
    width: 12rem;
    font: inherit;
    font-size: 0.8rem;
    padding: 0.2rem 0.45rem;
    border: 1px solid var(--line);
    border-radius: 6px;
    background: var(--surface);
    color: var(--text);
  }
  .danger {
    color: var(--danger);
  }
  .btn:disabled {
    opacity: 0.45;
    cursor: default;
  }
  .empty {
    justify-content: center;
    color: var(--muted);
    padding: 1.5rem !important;
    font-size: 0.9rem;
  }
  footer {
    display: flex;
    gap: 0.4rem;
    margin-top: 0.8rem;
  }
  .grow {
    flex: 1;
  }
</style>
