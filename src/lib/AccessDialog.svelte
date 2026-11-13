<script>
  import Icon from './Icon.svelte';
  import { tips } from './tips.js';
  import { dismiss } from './dismiss.js';
  import * as F from './faculty.svelte.js';

  /**
   * target: { kind: 'folders' | 'sops', item, name, parent } atau null. `parent` adalah folder induk yang terlihat.
   * onsave(data): data untuk F.setAccess. Tanpa hak mengelola, dialog hanya menampilkan siapa yang punya akses.
   */
  let { target, onsave, onclose } = $props();

  const EVERYONE_LABEL = 'Semua anggota';
  let dialog;
  let follow = $state(true);
  let rows = $state([]); // { who, role: 'view' | 'edit' }
  let members = $state([]);
  let groups = $state([]);
  let who = $state('');
  let role = $state('view');
  let error = $state('');

  const item = $derived(target?.item);
  const owner = $derived(item?.createdByEmail ?? null);
  const parent = $derived(target?.parent ?? null);
  const manage = $derived(!!item && F.canManage(item));
  const isFolder = $derived(target?.kind === 'folders');
  const rawParent = $derived(isFolder ? item?.parent : item?.folder);

  function toRows({ readers = [], editors = [] }) {
    return readers.filter((r) => r !== owner).map((r) => ({ who: r, role: editors.includes(r) ? 'edit' : 'view' }));
  }
  const followed = $derived(toRows(F.inherited(parent, owner)));
  const shown = $derived(parent && follow ? followed : rows);
  const groupLabel = (g) => `Grup ${g.name}`;
  const label = (w) => {
    if (w === F.EVERYONE) return EVERYONE_LABEL;
    if (!F.isGroup(w)) return w;
    const g = groups.find((x) => x.id === w);
    return g ? groupLabel(g) : 'Grup yang sudah dihapus';
  };
  const choices = $derived([
    ...groups.filter((g) => !rows.some((r) => r.who === g.id)).map(groupLabel),
    ...members.map((m) => m.email).filter((e) => e !== owner && !rows.some((r) => r.who === e))
  ]);

  $effect(() => {
    if (target && !dialog.open) {
      follow = !item.custom;
      rows = toRows(item);
      who = '';
      role = 'view';
      error = '';
      dialog.showModal();
      // Nama grup juga dibutuhkan saat hanya melihat, agar yang tampil bukan id-nya.
      F.listGroups().then((g) => (groups = g)).catch(() => {});
      if (manage) F.listMembers().then((m) => (members = m)).catch(() => {});
    } else if (!target && dialog.open) dialog.close();
  });

  function setFollow(on) {
    // Mulai dari daftar yang sedang berlaku, agar mengubah satu orang tidak menghapus yang lain.
    if (!on && follow) rows = followed.map((r) => ({ ...r }));
    follow = on;
  }

  // Akses umum: apakah semua anggota bisa melihat atau mengedit, tanpa harus mengetik "Semua anggota".
  const general = $derived(shown.find((r) => r.who === F.EVERYONE)?.role ?? 'none');
  function setGeneral(v) {
    if (parent && follow) setFollow(false);
    rows = rows.filter((r) => r.who !== F.EVERYONE);
    if (v !== 'none') rows.unshift({ who: F.EVERYONE, role: v });
  }

  /** Menambahkan isian kotak email/grup ke daftar. Mengembalikan false bila isiannya tidak bisa ditambahkan. */
  function add(e) {
    e?.preventDefault();
    const typed = who.trim().replace(/\s+/g, ' ').toLowerCase();
    const group = groups.find((g) => groupLabel(g).toLowerCase() === typed || g.name.toLowerCase() === typed);
    const value = typed === EVERYONE_LABEL.toLowerCase() ? F.EVERYONE : group ? group.id : typed;
    if (!value) return true;
    if (value !== F.EVERYONE && !group && !members.some((m) => m.email === value)) {
      error = typed.includes('@')
        ? `${typed} belum terdaftar sebagai anggota. Minta admin mendaftarkannya.`
        : `Tidak ada anggota atau grup bernama ${who.trim()}.`;
      return false;
    }
    if (value === owner) {
      error = 'Pemilik sudah otomatis bisa melihat dan mengedit.';
      return false;
    }
    error = '';
    const found = rows.find((r) => r.who === value);
    if (found) found.role = role;
    else rows.push({ who: value, role });
    who = '';
    return true;
  }

  function save(e) {
    e.preventDefault();
    if (parent && follow) return onsave({ custom: false, ...F.inherited(parent, owner) });
    // Email yang sudah diketik tapi belum ditambahkan dengan tombol + ikut disimpan, bukan diam-diam dibuang.
    if (manage && who.trim() && !add()) return;
    const own = owner ? [owner] : [];
    const readers = [...own, ...rows.map((r) => r.who)];
    const editors = [...own, ...rows.filter((r) => r.role === 'edit').map((r) => r.who)];
    // Tanpa folder induk dan tanpa siapa pun, tidak ada yang berbeda dari bawaan. Induk yang tidak terlihat oleh akun
    // ini tetap harus disimpan sebagai khusus, karena daftar induknya tidak diketahui.
    onsave({ custom: !!rows.length || !!parent || !!rawParent, readers, editors });
  }
</script>

<dialog bind:this={dialog} class="dialog" use:tips use:dismiss onclose={onclose}>
  {#if target}
    <form onsubmit={save}>
      <h2>Hak akses</h2>
      <p class="name"><Icon name={isFolder ? 'folder' : 'file'} /> <span>{target.name}</span></p>

      {#if parent}
        <div class="seg" role="radiogroup" aria-label="Sumber hak akses">
          <label class:on={follow}><input type="radio" checked={follow} disabled={!manage} onchange={() => setFollow(true)} /> Ikuti folder {parent.name}</label>
          <label class:on={!follow}><input type="radio" checked={!follow} disabled={!manage} onchange={() => setFollow(false)} /> Khusus</label>
        </div>
      {/if}

      <p class="label">Akses umum{#if parent && follow} <span>(mengikuti folder {parent.name})</span>{/if}</p>
      <div class="seg" role="radiogroup" aria-label="Akses umum">
        <label class:on={general === 'none'}><input type="radio" name="general" checked={general === 'none'} disabled={!manage} onchange={() => setGeneral('none')} /> Private</label>
        <label class:on={general === 'view'}><input type="radio" name="general" checked={general === 'view'} disabled={!manage} onchange={() => setGeneral('view')} /> Semua anggota bisa melihat</label>
        <label class:on={general === 'edit'}><input type="radio" name="general" checked={general === 'edit'} disabled={!manage} onchange={() => setGeneral('edit')} /> Semua anggota bisa mengedit</label>
      </div>

      <p class="label">Orang dan grup</p>
      <ul class="people">
        <li>
          <span class="who">{owner ?? item.createdByName}</span>
          <span class="fixed">Pemilik</span>
          <span class="gap"></span>
        </li>
        {#each shown.filter((r) => r.who !== F.EVERYONE) as r (r.who)}
          <li>
            <span class="who">{label(r.who)}</span>
            {#if manage && !(parent && follow)}
              <select bind:value={r.role} aria-label={`Hak ${label(r.who)}`}>
                <option value="view">Lihat</option>
                <option value="edit">Edit</option>
              </select>
              <button type="button" class="ib danger" aria-label={`Hapus ${label(r.who)}`} data-tip="Hapus dari daftar" onclick={() => (rows = rows.filter((x) => x.who !== r.who))}><Icon name="x" /></button>
            {:else}
              <span class="fixed">{r.role === 'edit' ? 'Edit' : 'Lihat'}</span>
              <span class="gap"></span>
            {/if}
          </li>
        {/each}
      </ul>

      {#if manage && !(parent && follow)}
        <div class="add">
          <input bind:value={who} list="access-members" placeholder="Email anggota atau nama grup" aria-label="Email anggota atau nama grup" onkeydown={(e) => e.key === 'Enter' && who.trim() && add(e)} />
          <datalist id="access-members">
            {#each choices as c (c)}<option value={c}></option>{/each}
          </datalist>
          <select bind:value={role} aria-label="Hak untuk anggota atau grup ini">
            <option value="view">Lihat</option>
            <option value="edit">Edit</option>
          </select>
          <button type="button" class="btn primary add-btn" disabled={!who.trim()} onclick={add}><Icon name="plus" size={15} />Tambah</button>
        </div>
        {#if error}<p class="error">{error}</p>{/if}
      {/if}

      <small>
        {#if isFolder}
          Lihat: membuka folder dan isinya. Edit: juga mengubah nama folder dan mengedit isi RPS di dalamnya. Menambah isi folder hanya untuk pemiliknya dan admin. Isi folder ikut berubah, kecuali yang hak aksesnya khusus.
        {:else}
          Lihat: membuka dan menduplikat. Edit: juga mengubah isi dan namanya. Memindahkan dan menghapus tetap hanya untuk pemilik dan admin.
        {/if}
      </small>

      <footer>
        {#if manage}
          <button type="button" class="btn" onclick={onclose}>Batal</button>
          <button class="btn primary"><Icon name="save" size={15} />Simpan</button>
        {:else}
          <button type="button" class="btn" onclick={onclose}>Tutup</button>
        {/if}
      </footer>
    </form>
  {/if}
</dialog>

<style>
  .dialog {
    width: min(520px, calc(100vw - 2rem));
    border: 0;
    border-radius: 14px;
    padding: 1.1rem 1.2rem;
    box-shadow: 0 20px 50px rgb(0 0 0 / 0.25);
    background: var(--surface);
    color: var(--text);
  }
  .dialog::backdrop {
    background: rgb(15 23 42 / 0.45);
  }
  h2 {
    margin: 0 0 0.3rem;
    font-size: 1.05rem;
  }
  .name {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    margin: 0 0 0.7rem;
    color: var(--muted);
    font-size: 0.88rem;
    overflow-wrap: anywhere;
  }
  .name :global(svg) {
    flex: none;
  }
  .seg {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
    margin-bottom: 0.6rem;
  }
  .seg label {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.3rem 0.6rem;
    border: 1px solid var(--line);
    border-radius: 8px;
    cursor: pointer;
    font-size: 0.85rem;
    overflow-wrap: anywhere;
  }
  .seg label.on {
    background: var(--accent-soft);
    border-color: transparent;
    color: var(--accent);
  }
  .seg input {
    width: auto;
    margin: 0;
  }
  .label {
    margin: 0 0 0.3rem;
    font-size: 0.82rem;
    font-weight: 600;
  }
  .label span {
    color: var(--muted);
    font-weight: 400;
  }
  .people {
    list-style: none;
    margin: 0 0 0.6rem;
    padding: 0;
    max-height: 15rem;
    overflow: auto;
    border: 1px solid var(--line);
    border-radius: 10px;
  }
  .people li {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    min-height: 2.3rem;
    padding: 0.25rem 0.6rem;
    border-bottom: 1px solid var(--line);
    font-size: 0.86rem;
  }
  .people li:last-child {
    border-bottom: 0;
  }
  .who {
    flex: 1;
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .fixed {
    color: var(--muted);
    font-size: 0.8rem;
  }
  .gap {
    width: 1.75rem;
    flex: none;
  }
  select {
    width: auto;
    flex: none;
  }
  .add {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    margin-bottom: 0.5rem;
  }
  .add input {
    flex: 1;
    min-width: 0;
  }
  .add-btn {
    flex: none;
    white-space: nowrap;
  }
  .add-btn:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .ib {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: none;
    width: 1.75rem;
    height: 1.75rem;
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
  .ib.danger:hover {
    color: var(--danger);
  }
  .error {
    margin: 0 0 0.5rem;
    color: var(--danger);
    font-size: 0.82rem;
  }
  small {
    display: block;
    color: var(--muted);
    font-size: 0.78rem;
    line-height: 1.45;
  }
  footer {
    display: flex;
    justify-content: flex-end;
    gap: 0.4rem;
    margin-top: 0.9rem;
  }
</style>
