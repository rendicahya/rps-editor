<script>
  import * as ui from './ask.svelte.js';
  import * as Faculty from './faculty.svelte.js';
  import { faculty } from './faculty.svelte.js';
  import { uid } from './model.js';
  import { dismiss } from './dismiss.js';
  import Icon from './Icon.svelte';

  /**
   * Katalog kurikulum: CPL/CPMK per prodi di Pustaka Daring (curricula/{id}).
   * Semua anggota membaca dan bisa memakai isinya di RPS yang sedang dibuka (onimport);
   * pengelola prodi mengedit katalog prodinya, admin juga membuat/menghapus prodi dan menunjuk pengelola.
   */
  let { open = $bindable(false), onimport, cansave = true } = $props();

  let dialog = $state();
  let list = $state([]);
  let selId = $state(null);
  let draft = $state(null); // salinan katalog terpilih yang sedang diedit
  let saved = $state(''); // JSON draft saat terakhir dimuat/disimpan
  let busy = $state(false);
  let error = $state('');
  let pickCpl = $state(new Set());
  let pickCpmk = $state(new Set());

  const signedIn = $derived(faculty.status === 'in');
  const admin = $derived(Faculty.isAdmin());
  const sel = $derived(list.find((c) => c.id === selId) ?? null);
  const editable = $derived(!!sel && Faculty.canEditCurriculum(sel));
  const dirty = $derived(!!draft && JSON.stringify(draft) !== saved);
  const mine = (c) => (c.managers ?? []).includes(faculty.user?.email);

  $effect(() => {
    if (open && !dialog.open) {
      dialog.showModal();
      refresh();
    } else if (!open && dialog.open) dialog.close();
  });

  async function close() {
    if (dirty && !(await ui.confirm('Perubahan katalog belum disimpan. Tutup tanpa menyimpan?', { ok: 'Tutup', danger: true }))) {
      if (!dialog.open) dialog.showModal();
      return;
    }
    open = false;
  }

  async function refresh(keep = selId) {
    if (faculty.status !== 'in') await Faculty.start();
    if (faculty.status !== 'in') return;
    busy = true;
    error = '';
    try {
      list = await Faculty.listCurricula();
      // Prodi yang dikelola akun ini dipilih lebih dulu.
      select(list.find((c) => c.id === keep)?.id ?? list.find(mine)?.id ?? list[0]?.id ?? null);
    } catch (e) {
      error = e.message;
    } finally {
      busy = false;
    }
  }

  async function select(id) {
    if (id !== selId && dirty && !(await ui.confirm('Perubahan katalog belum disimpan. Pindah prodi tanpa menyimpan?', { ok: 'Pindah', danger: true }))) return;
    selId = id;
    const c = list.find((x) => x.id === id);
    draft = c
      ? { nama: c.nama, departemen: c.departemen ?? '', managers: (c.managers ?? []).join('\n'), cpl: structuredClone(c.cpl ?? []), cpmk: structuredClone(c.cpmk ?? []), mk: structuredClone(c.mk ?? []) }
      : null;
    saved = JSON.stringify(draft);
    pickCpl = new Set();
    pickCpmk = new Set();
    pasteOpen = false;
  }

  const slug = (s) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

  async function addProdi() {
    const nama = (await ui.prompt('Nama program studi', '', { title: 'Tambah prodi', ok: 'Tambah' }))?.trim();
    if (!nama) return;
    let id = slug(nama) || uid();
    while (list.some((c) => c.id === id)) id += '-' + uid().slice(0, 3);
    busy = true;
    try {
      await Faculty.saveCurriculum(id, { nama, departemen: '', managers: [], cpl: [], cpmk: [] });
      await refresh(id);
    } catch (e) {
      ui.alert(e.message);
    } finally {
      busy = false;
    }
  }

  async function removeProdi() {
    if (!sel || !(await ui.confirm(`Hapus katalog "${sel.nama}"? RPS yang sudah memakai isinya tidak berubah.`, { ok: 'Hapus', danger: true }))) return;
    busy = true;
    try {
      await Faculty.deleteCurriculum(sel.id);
      saved = JSON.stringify(draft); // tidak ada lagi yang perlu disimpan
      await refresh(null);
    } catch (e) {
      ui.alert(e.message);
    } finally {
      busy = false;
    }
  }

  async function save() {
    if (!draft.nama.trim()) return ui.alert('Nama prodi tidak boleh kosong.');
    busy = true;
    try {
      await Faculty.saveCurriculum(sel.id, { ...draft, managers: draft.managers.split(/[\s,;]+/) });
      await refresh(sel.id);
    } catch (e) {
      ui.alert(e.message);
    } finally {
      busy = false;
    }
  }

  // Daftar mata kuliah kurikulum: dipakai laporan kelengkapan RPS (mata kuliah mana yang belum punya RPS).
  let pasteOpen = $state(false);
  let pasteText = $state('');
  const addMk = () => draft.mk.push({ id: uid(), kode: '', nama: '', sks: 0, semester: 0 });
  /** Baris dari Excel (tab) atau CSV (; atau ,): kode, nama, SKS, semester. Baris judul dan kode yang sudah ada dilewati. */
  function pasteMk() {
    const have = new Set(draft.mk.map((m) => m.kode.trim().toLowerCase()));
    let added = 0;
    let skipped = 0;
    for (const line of pasteText.split(/\r?\n/)) {
      if (!line.trim()) continue;
      const cols = (line.includes('\t') ? line.split('\t') : line.split(/[;,](?=(?:[^"]*"[^"]*")*[^"]*$)/)).map((s) => s.trim().replace(/^"|"$/g, ''));
      const [kode = '', nama = '', sks = '', semester = ''] = cols;
      if (!kode || (sks && !/^\d+([.,]\d+)?$/.test(sks))) {
        skipped++;
        continue;
      }
      const key = kode.toLowerCase();
      if (have.has(key)) {
        skipped++;
        continue;
      }
      have.add(key);
      draft.mk.push({ id: uid(), kode, nama, sks: Number(sks.replace(',', '.')) || 0, semester: Number(semester) || 0 });
      added++;
    }
    pasteText = '';
    pasteOpen = false;
    ui.alert(`${added} mata kuliah ditambahkan${skipped ? `, ${skipped} baris dilewati (judul, tanpa kode, atau kodenya sudah ada)` : ''}. Jangan lupa Simpan katalog.`);
  }
  const mkSorted = $derived(
    draft ? draft.mk.map((m, i) => ({ m, i })).sort((a, b) => (a.m.semester || 99) - (b.m.semester || 99) || a.m.kode.localeCompare(b.m.kode, 'id', { numeric: true })) : []
  );

  const addCpl = () => draft.cpl.push({ id: uid(), kode: '', teks: '' });
  const addCpmk = () => draft.cpmk.push({ id: uid(), kode: '', teks: '', cpl: [] });
  function removeCpl(i) {
    const id = draft.cpl[i].id;
    draft.cpl.splice(i, 1);
    for (const m of draft.cpmk) m.cpl = m.cpl.filter((c) => c !== id);
  }
  const toggle = (arr, v) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const flip = (set, v) => {
    const n = new Set(set);
    if (n.has(v)) n.delete(v);
    else n.add(v);
    return n;
  };
  const allPicked = $derived(!!draft && draft.cpl.every((c) => pickCpl.has(c.id)) && draft.cpmk.every((m) => pickCpmk.has(m.id)));
  function pickAll() {
    const on = !allPicked;
    pickCpl = new Set(on ? draft.cpl.map((c) => c.id) : []);
    pickCpmk = new Set(on ? draft.cpmk.map((m) => m.id) : []);
  }

  function use() {
    if (!pickCpl.size && !pickCpmk.size) return ui.alert('Centang CPL atau CPMK yang akan dipakai.');
    // Yang dipakai adalah versi tersimpan, bukan perubahan yang belum disimpan.
    const r = onimport(sel, { cpl: pickCpl, cpmk: pickCpmk });
    if (r) open = false;
  }
</script>

<dialog bind:this={dialog} class="dialog" use:dismiss={close} onclose={() => (open = false)} oncancel={(e) => (e.preventDefault(), close())}>
  <header>
    <strong>Katalog Kurikulum</strong>
    <span class="sub">CPL, CPMK, dan mata kuliah per program studi, dipakai bersama semua dosen</span>
    <button class="x" onclick={close} aria-label="Tutup" title="Tutup (Esc)"><Icon name="x" size={16} /></button>
  </header>
  {#if !signedIn}
    <p class="note">Katalog kurikulum ada di Pustaka Daring. {faculty.status === 'loading' ? 'Memuat…' : 'Masuk dulu untuk membukanya.'}</p>
  {:else}
    <div class="body">
      <aside>
        <ul>
          {#each list as c (c.id)}
            <li>
              <button class:on={c.id === selId} onclick={() => select(c.id)}>
                <span>{c.nama}</span>
                <small>{c.departemen || '—'}{mine(c) ? ' · Anda pengelola' : ''}</small>
              </button>
            </li>
          {:else}
            <li class="empty">{busy ? 'Memuat…' : 'Belum ada prodi.'}</li>
          {/each}
        </ul>
        {#if admin}<button class="btn small" onclick={addProdi} disabled={busy}><Icon name="plus" size={14} />Prodi</button>{/if}
      </aside>
      <section>
        {#if error}<p class="error">{error}</p>{/if}
        {#if draft && sel}
          <div class="meta">
            <label>Program studi <input bind:value={draft.nama} readonly={!admin} /></label>
            <label>Departemen <input bind:value={draft.departemen} readonly={!admin} /></label>
            <label class="wide">Pengelola prodi (email, satu per baris)
              <textarea rows="2" bind:value={draft.managers} readonly={!admin} placeholder={admin ? 'nama@ub.ac.id' : 'Belum ada pengelola'}></textarea>
            </label>
          </div>
          {#if !editable}<p class="note">Hanya pengelola prodi ini dan admin yang bisa mengubah katalognya. Anda tetap bisa memakai isinya.</p>{/if}

          <div class="tbl-head">
            <h3>CPL Prodi</h3>
            <label class="pickall"><input type="checkbox" checked={allPicked} onchange={pickAll} /> Pilih semua untuk dipakai</label>
          </div>
          <table>
            <thead><tr><th class="c">Pakai</th><th class="k">Kode</th><th>Uraian</th>{#if editable}<th class="c"></th>{/if}</tr></thead>
            <tbody>
              {#each draft.cpl as c, i (c.id)}
                <tr>
                  <td class="c"><input type="checkbox" checked={pickCpl.has(c.id)} onchange={() => (pickCpl = flip(pickCpl, c.id))} aria-label="Pakai {c.kode}" /></td>
                  <td class="k">{#if editable}<input bind:value={c.kode} placeholder="CPL01" />{:else}{c.kode}{/if}</td>
                  <td>{#if editable}<textarea rows="2" bind:value={c.teks}></textarea>{:else}{c.teks}{/if}</td>
                  {#if editable}<td class="c"><button class="del" onclick={() => removeCpl(i)} title="Hapus CPL" aria-label="Hapus CPL"><Icon name="trash" size={14} /></button></td>{/if}
                </tr>
              {:else}
                <tr><td colspan="4" class="empty">Belum ada CPL.</td></tr>
              {/each}
            </tbody>
          </table>
          {#if editable}<button class="btn small" onclick={addCpl}><Icon name="plus" size={14} />CPL</button>{/if}

          <h3>CPMK</h3>
          <table>
            <thead><tr><th class="c">Pakai</th><th class="k">Kode</th><th>Uraian</th><th class="s">Mendukung CPL</th>{#if editable}<th class="c"></th>{/if}</tr></thead>
            <tbody>
              {#each draft.cpmk as m, i (m.id)}
                <tr>
                  <td class="c"><input type="checkbox" checked={pickCpmk.has(m.id)} onchange={() => (pickCpmk = flip(pickCpmk, m.id))} aria-label="Pakai {m.kode}" /></td>
                  <td class="k">{#if editable}<input bind:value={m.kode} placeholder="CPMK-01" />{:else}{m.kode}{/if}</td>
                  <td>{#if editable}<textarea rows="2" bind:value={m.teks}></textarea>{:else}{m.teks}{/if}</td>
                  <td class="s">
                    <span class="chips">
                      {#each draft.cpl as c (c.id)}
                        {@const on = m.cpl.includes(c.id)}
                        {#if editable}
                          <button class:on aria-pressed={on} onclick={() => (m.cpl = toggle(m.cpl, c.id))}>{c.kode || '?'}</button>
                        {:else if on}
                          <span class="chip">{c.kode}</span>
                        {/if}
                      {/each}
                    </span>
                  </td>
                  {#if editable}<td class="c"><button class="del" onclick={() => draft.cpmk.splice(i, 1)} title="Hapus CPMK" aria-label="Hapus CPMK"><Icon name="trash" size={14} /></button></td>{/if}
                </tr>
              {:else}
                <tr><td colspan="5" class="empty">Belum ada CPMK.</td></tr>
              {/each}
            </tbody>
          </table>
          {#if editable}<button class="btn small" onclick={addCpmk}><Icon name="plus" size={14} />CPMK</button>{/if}

          <div class="tbl-head">
            <h3>Mata Kuliah <small class="sub">{draft.mk.length ? `${draft.mk.length} mata kuliah, ${draft.mk.reduce((n, m) => n + (Number(m.sks) || 0), 0)} SKS` : 'untuk laporan kelengkapan RPS'}</small></h3>
          </div>
          <table>
            <thead><tr><th class="k">Kode</th><th>Nama mata kuliah</th><th class="n">SKS</th><th class="n">Semester</th>{#if editable}<th class="c"></th>{/if}</tr></thead>
            <tbody>
              {#each mkSorted as { m, i } (m.id)}
                <tr>
                  <td class="k">{#if editable}<input bind:value={m.kode} placeholder="COM60004" />{:else}{m.kode}{/if}</td>
                  <td>{#if editable}<input bind:value={m.nama} />{:else}{m.nama}{/if}</td>
                  <td class="n">{#if editable}<input type="number" min="0" max="24" bind:value={m.sks} />{:else}{m.sks || ''}{/if}</td>
                  <td class="n">{#if editable}<input type="number" min="0" max="14" bind:value={m.semester} />{:else}{m.semester || ''}{/if}</td>
                  {#if editable}<td class="c"><button class="del" onclick={() => draft.mk.splice(i, 1)} title="Hapus mata kuliah" aria-label="Hapus mata kuliah"><Icon name="trash" size={14} /></button></td>{/if}
                </tr>
              {:else}
                <tr><td colspan="5" class="empty">Belum ada daftar mata kuliah. Dengan daftar ini, laporan kelengkapan bisa menunjukkan mata kuliah yang belum punya RPS.</td></tr>
              {/each}
            </tbody>
          </table>
          {#if editable}
            <div class="row-btns">
              <button class="btn small" onclick={addMk}><Icon name="plus" size={14} />Mata kuliah</button>
              <button class="btn small" onclick={() => (pasteOpen = !pasteOpen)} aria-expanded={pasteOpen}><Icon name="paste" size={14} />Tempel dari Excel…</button>
            </div>
            {#if pasteOpen}
              <div class="paste">
                <p class="note">Salin kolom <b>Kode, Nama, SKS, Semester</b> (urutan ini) dari Excel, lalu tempel di sini. Satu mata kuliah per baris; baris judul dilewati.</p>
                <textarea rows="6" bind:value={pasteText} placeholder={'COM60004\tPemrograman Dasar\t3\t1'}></textarea>
                <button class="btn small primary" onclick={pasteMk} disabled={!pasteText.trim()}><Icon name="plus" size={14} />Tambahkan</button>
              </div>
            {/if}
          {/if}
        {:else if !busy && signedIn}
          <p class="note">{admin ? 'Tambahkan prodi untuk mulai menyusun katalog.' : 'Belum ada katalog prodi. Hubungi admin.'}</p>
        {/if}
      </section>
    </div>
    <footer>
      {#if admin && sel}<button class="btn danger-text" onclick={removeProdi} disabled={busy}><Icon name="trash" size={15} />Hapus prodi</button>{/if}
      <span class="grow"></span>
      {#if sel}
        <button class="btn" onclick={use} disabled={!cansave || busy || (!pickCpl.size && !pickCpmk.size)} title={dirty ? 'Yang dipakai adalah isi katalog yang tersimpan' : 'Salin CPL/CPMK yang dicentang ke RPS yang sedang dibuka'}>
          <Icon name="import" size={15} />Pakai di RPS ini ({pickCpl.size + pickCpmk.size})
        </button>
      {/if}
      {#if editable}<button class="btn primary" onclick={save} disabled={busy || !dirty}><Icon name="save" size={15} />{busy ? 'Menyimpan…' : 'Simpan katalog'}</button>{/if}
    </footer>
  {/if}
</dialog>

<style>
  .dialog {
    width: min(1100px, calc(100vw - 2rem));
    height: min(760px, calc(100vh - 3rem));
    border: 0;
    border-radius: 14px;
    padding: 1rem 1.1rem;
    box-shadow: 0 20px 50px rgb(0 0 0 / 0.25);
    background: var(--surface);
    color: var(--text);
    flex-direction: column;
    gap: 0.7rem;
  }
  .dialog[open] {
    display: flex;
  }
  .dialog::backdrop {
    background: rgb(15 23 42 / 0.45);
  }
  header {
    display: flex;
    align-items: baseline;
    gap: 0.75rem;
  }
  header strong {
    font-size: 1.05rem;
  }
  .sub {
    color: var(--muted);
    font-size: 0.82rem;
    flex: 1;
  }
  .x {
    display: inline-flex;
    padding: 0.2rem;
    border: 0;
    background: none;
    color: var(--muted);
    font-size: 1rem;
    cursor: pointer;
  }
  .body {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: 220px 1fr;
    gap: 1rem;
  }
  aside {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    min-height: 0;
    border-right: 1px solid var(--line);
    padding-right: 0.75rem;
  }
  aside ul {
    list-style: none;
    margin: 0;
    padding: 0;
    overflow: auto;
    display: grid;
    gap: 2px;
  }
  aside li button {
    width: 100%;
    display: grid;
    text-align: left;
    gap: 1px;
    padding: 0.4rem 0.55rem;
    border: 0;
    border-radius: 7px;
    background: none;
    color: var(--text);
    font: inherit;
    cursor: pointer;
  }
  aside li button:hover {
    background: var(--surface-2);
  }
  aside li button.on {
    background: var(--surface-2);
    box-shadow: inset 3px 0 0 var(--accent);
  }
  aside small {
    color: var(--muted);
    font-size: 0.75rem;
  }
  section {
    overflow: auto;
    min-height: 0;
    padding-right: 0.25rem;
  }
  .meta {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.5rem 0.75rem;
    margin-bottom: 0.5rem;
  }
  .meta label {
    display: grid;
    gap: 0.2rem;
    font-size: 0.78rem;
    color: var(--muted);
  }
  .meta .wide {
    grid-column: 1 / -1;
  }
  input:not([type='checkbox']),
  textarea {
    font: inherit;
    font-size: 0.85rem;
    padding: 0.3rem 0.45rem;
    border: 1px solid var(--line);
    border-radius: 6px;
    background: var(--surface);
    color: var(--text);
    width: 100%;
    box-sizing: border-box;
    resize: vertical;
  }
  input[readonly],
  textarea[readonly] {
    background: var(--surface-2);
  }
  h3 {
    margin: 0.9rem 0 0.35rem;
    font-size: 0.9rem;
  }
  .tbl-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
  }
  .pickall {
    font-size: 0.78rem;
    color: var(--muted);
    display: flex;
    gap: 0.3rem;
    align-items: center;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.85rem;
    margin-bottom: 0.4rem;
  }
  th {
    text-align: left;
    font-size: 0.75rem;
    color: var(--muted);
    font-weight: 600;
    padding: 0.25rem 0.35rem;
    border-bottom: 1px solid var(--line);
  }
  td {
    padding: 0.3rem 0.35rem;
    border-bottom: 1px solid var(--line);
    vertical-align: top;
  }
  .c {
    width: 2.6rem;
    text-align: center;
  }
  .k {
    width: 8.5rem;
  }
  .s {
    width: 12rem;
  }
  .n {
    width: 5rem;
    text-align: center;
  }
  h3 .sub {
    font-weight: 400;
    margin-left: 0.4rem;
  }
  .row-btns {
    display: flex;
    gap: 0.4rem;
  }
  .paste {
    display: grid;
    gap: 0.4rem;
    margin-top: 0.5rem;
    justify-items: start;
  }
  .empty {
    color: var(--muted);
    font-size: 0.82rem;
    padding: 0.5rem;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 3px;
  }
  .chips button,
  .chip {
    padding: 2px 7px;
    border: 1px solid var(--line);
    border-radius: 999px;
    background: var(--surface);
    color: var(--text);
    font: 600 0.72rem/1.2 var(--ui-font);
    cursor: pointer;
  }
  .chips button.on,
  .chip {
    background: var(--accent);
    border-color: var(--accent);
    color: #fff;
  }
  .del {
    display: inline-flex;
    padding: 0.2rem;
    border: 0;
    background: none;
    color: var(--danger, #b42318);
    cursor: pointer;
  }
  .note {
    color: var(--muted);
    font-size: 0.85rem;
  }
  .error {
    color: var(--danger, #b42318);
    font-size: 0.85rem;
  }
  footer {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }
  .grow {
    flex: 1;
  }
  .danger-text {
    color: var(--danger, #b42318);
  }
</style>
