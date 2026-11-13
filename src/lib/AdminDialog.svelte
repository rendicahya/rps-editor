<script>
  import { untrack } from 'svelte';
  import * as F from './faculty.svelte.js';
  import { faculty } from './faculty.svelte.js';
  import Icon from './Icon.svelte';
  import * as ui from './ask.svelte.js';
  import { dismiss } from './dismiss.js';
  import { DEFAULTS, DEFAULT_FIELDS, defaultsMeta, applyDefaults } from './appDefaults.svelte.js';

  /** Pengaturan khusus admin: bawaan RPS baru, anggota, grup, dan penyimpanan. Anggota dan grup dipakai bersama aplikasi lain di proyek Firebase yang sama. onnotify(pesan): toast di App. */
  let { open = $bindable(false), onnotify } = $props();

  const PAGES = [
    ['defaults', 'Bawaan RPS baru', 'filePlus', 'Nama universitas dan fakultas untuk RPS baru'],
    ['members', 'Anggota', 'user', 'Daftarkan anggota dan atur perannya'],
    ['groups', 'Grup', 'users', 'Kelompok anggota untuk memberi hak akses sekaligus'],
    ['storage', 'Penyimpanan', 'gauge', 'Pemakaian dan batas penyimpanan']
  ];
  let view = $state(DEFAULTS.universitas || DEFAULTS.fakultas ? 'members' : 'defaults');
  let dialog;

  let usage = $state(null);
  let members = $state([]);
  let newEmail = $state('');
  let newRole = $state('member');
  let newGroup = $state(''); // grup untuk anggota baru; '' = tanpa grup
  let groups = $state([]);
  let groupName = $state('');
  let openGroup = $state(null); // id grup yang daftar anggotanya sedang dibuka

  $effect(() => {
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  });
  // Data dibaca sekali setiap dialog dibuka, bukan tiap berpindah halaman, agar hemat kuota baca.
  $effect(() => {
    if (open && faculty.status === 'in') untrack(refreshAdmin);
  });
  // Bila peran admin dicabut saat dialog terbuka, dialog ditutup.
  $effect(() => {
    if (open && faculty.role !== 'admin') open = false;
  });

  // Bawaan RPS baru: formulir mengikuti nilai di server selama admin belum mengetiknya.
  const pickDefaults = (d) => Object.fromEntries(DEFAULT_FIELDS.map(([k]) => [k, d[k] ?? '']));
  let dflt = $state(pickDefaults(DEFAULTS));
  let dfltEdited = $state(false);
  let dfltBusy = $state(false);
  $effect(() => {
    const cur = pickDefaults(DEFAULTS);
    if (!untrack(() => dfltEdited)) dflt = cur;
  });
  const tidyDefaults = (d) => Object.fromEntries(DEFAULT_FIELDS.map(([k, , , max]) => [k, d[k].trim().replace(/\s+/g, ' ').slice(0, max)]));
  const dfltDirty = $derived(DEFAULT_FIELDS.some(([k]) => tidyDefaults(dflt)[k] !== DEFAULTS[k]));
  async function saveDefaults(e) {
    e?.preventDefault();
    if (!dfltDirty || dfltBusy) return;
    dfltBusy = true;
    try {
      const values = tidyDefaults(dflt);
      await F.saveDefaults(values);
      applyDefaults({ ...values, updatedAt: Date.now(), updatedByName: faculty.user.name });
      dfltEdited = false;
      dflt = pickDefaults(DEFAULTS); // tampilkan versi yang sudah dirapikan
      onnotify?.('Bawaan RPS baru disimpan. Berlaku untuk RPS yang dibuat setelah ini.');
    } catch (err) {
      ui.alert(err.message);
    } finally {
      dfltBusy = false;
    }
  }
  function resetDefaultsForm() {
    dflt = pickDefaults(DEFAULTS);
    dfltEdited = false;
  }
  const dfltWhen = $derived(defaultsMeta.updatedAt ? new Date(defaultsMeta.updatedAt).toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'short' }) : '');

  async function refreshAdmin() {
    try {
      [usage, members, groups] = await Promise.all([F.getUsage(), F.listMembers(), F.listGroups()]);
    } catch (e) {
      ui.alert(e.message);
    }
  }
  const adminAct = (fn) => fn().catch((e) => ui.alert(e.message)).finally(refreshAdmin);

  /** Email dari teks yang dipisah koma, spasi, titik koma, atau baris; "Nama <email>" juga diterima. */
  function parseEmails(text) {
    const good = new Set();
    const bad = [];
    for (const raw of text.split(/[\s,;]+/)) {
      const t = raw.replace(/^[<("'[]+|[>)"'\]]+$/g, '').toLowerCase();
      if (!t.includes('@')) continue; // potongan nama, mis. dari "Nama Lengkap <email>"
      if (/^[^@\s/]+@(ub\.ac\.id|gmail\.com)$/.test(t)) good.add(t);
      else bad.push(raw);
    }
    return { good: [...good], bad };
  }
  const emailCount = $derived(parseEmails(newEmail).good.length);

  async function addMember(e) {
    e?.preventDefault();
    const { good, bad } = parseEmails(newEmail);
    if (!good.length) return ui.alert('Masukkan alamat email @ub.ac.id atau @gmail.com. Beberapa email bisa dipisah koma, spasi, titik koma, atau baris baru.');
    if (bad.length && !(await ui.confirm(`${bad.length} alamat dilewati karena bukan email @ub.ac.id atau @gmail.com yang sah:\n${bad.join(', ')}\n\nTetap tambahkan ${good.length} email lainnya?`, { title: 'Tambah anggota', ok: 'Tambahkan' }))) return;
    const known = new Set(members.map((m) => m.email));
    const fresh = good.filter((x) => !known.has(x));
    const role = newRole;
    const group = newGroup;
    try {
      await F.addMembers(good, role, group, members);
      newEmail = '';
      const already = good.length - fresh.length;
      const gname = group ? groups.find((g) => g.id === group)?.name : '';
      if (good.length > 1 || already) {
        ui.alert(
          `${fresh.length} anggota baru ditambahkan${fresh.length ? ` sebagai ${role === 'admin' ? 'admin' : 'anggota'}` : ''}.` +
            (already ? ` ${already} sudah terdaftar${gname ? ` dan dimasukkan ke grup ${gname}` : ''}; perannya tidak diubah.` : '') +
            (bad.length ? ` ${bad.length} alamat tidak sah dilewati.` : ''),
          { title: 'Tambah anggota' }
        );
      }
    } catch (err) {
      ui.alert(err.message);
    } finally {
      refreshAdmin();
    }
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
  /** Grup baru dengan anggota yang sama. Hak akses RPS tidak ikut disalin; atur lewat Hak akses bila perlu. */
  async function duplicateGroup(g) {
    const taken = (n) => groups.some((x) => x.name.toLowerCase() === n.toLowerCase());
    let suggest = cleanName(`${g.name} (salinan)`);
    for (let i = 2; taken(suggest); i++) suggest = cleanName(`${g.name} (salinan ${i})`);
    const name = cleanName((await ui.prompt('Nama grup baru', suggest, { title: `Duplikat grup ${g.name}`, ok: 'Duplikat', maxlength: 80 })) ?? '');
    if (!name) return;
    if (taken(name)) return ui.alert(`Grup ${name} sudah ada.`);
    const emails = inGroup(g).map((m) => m.email);
    adminAct(async () => {
      const id = await F.createGroup(name);
      await F.setGroupMembers(id, emails, members);
      openGroup = id;
    });
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
  const percent = $derived(usage ? Math.min(100, (usage.bytes / usage.limit) * 100) : 0);
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
    title={tip}
    onclick={() => !opts.disabled && run()}
  ><Icon name={icon} size={15} /></button>
{/snippet}

<dialog bind:this={dialog} class="dialog" use:dismiss onclose={() => (open = false)}>
  <header>
    <h2><Icon name="settings" size={18} />Admin</h2>
    <button type="button" class="x" onclick={() => (open = false)} aria-label="Tutup"><Icon name="x" size={14} /></button>
  </header>
  <div class="body">
    <nav aria-label="Halaman admin">
      {#each PAGES as [v, label, icon, tip] (v)}
        <button type="button" class:sel={view === v} aria-current={view === v ? 'page' : undefined} title={tip} onclick={() => (view = v)}>
          <Icon name={icon} size={15} /><span>{label}</span>
        </button>
      {/each}
    </nav>
    <div class="admin">
      {#if view === 'storage'}
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
      {:else if view === 'defaults'}
      <section>
        <h3>Bawaan RPS baru</h3>
        <small>
          Isian awal kop setiap RPS baru, juga dipakai Asisten AI. RPS yang sudah ada tidak berubah.
          {#if defaultsMeta.custom && dfltWhen}Terakhir diubah {defaultsMeta.updatedByName || 'admin'}, {dfltWhen}.{:else}<strong>Belum diatur:</strong> RPS baru dimulai dengan nama universitas dan fakultas kosong.{/if}
        </small>
        <form class="defaults" onsubmit={saveDefaults} oninput={() => (dfltEdited = true)}>
          {#each DEFAULT_FIELDS as [k, label, hint, max] (k)}
            <label>
              <span>{label}</span>
              <input maxlength={max} bind:value={dflt[k]} placeholder={hint} />
            </label>
          {/each}
          <div class="row">
            <button class="btn small primary" disabled={!dfltDirty || dfltBusy}><Icon name="save" size={14} />{dfltBusy ? 'Menyimpan…' : 'Simpan bawaan'}</button>
            {#if dfltEdited}<button type="button" class="btn small ghost" onclick={resetDefaultsForm}>Batalkan perubahan</button>{/if}
          </div>
        </form>
      </section>
      {:else if view === 'members'}
      <section>
        <h3>Anggota <span class="muted">{members.length}</span></h3>
        <form onsubmit={addMember} class="row add-members">
          <textarea
            bind:value={newEmail}
            rows={newEmail.includes('\n') || emailCount > 1 ? 4 : 1}
            placeholder="Email anggota baru (boleh beberapa)" title="Akun @ub.ac.id atau @gmail.com. Beberapa email bisa dipisah koma, spasi, titik koma, atau baris baru."
            aria-label="Email anggota baru"
            onkeydown={(e) => {
              // Enter menambahkan; Shift+Enter untuk baris baru (menempel daftar email tetap bisa).
              if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
                e.preventDefault();
                addMember();
              }
            }}
          ></textarea>
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
          <button class="btn primary add-btn" disabled={!newEmail.trim()}><Icon name="plus" size={15} />{emailCount > 1 ? `Tambah ${emailCount}` : 'Tambah'}</button>
        </form>
        {#if emailCount > 1}<small class="muted">{emailCount} email akan ditambahkan.</small>{/if}
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
      {:else if view === 'groups'}
      <section>
        <h3>Grup <span class="muted">{groups.length}</span></h3>
        <small>Grup bisa dipilih di Hak akses seperti email, sehingga semua anggotanya mendapat hak yang sama sekaligus. Anggota yang ditambahkan ke grup langsung mendapat hak grup itu.</small>
        <form onsubmit={addGroup} class="row">
          <input bind:value={groupName} maxlength="80" placeholder="Nama grup baru, mis. Prodi Informatika" aria-label="Nama grup baru" />
          <button class="btn primary add-btn" disabled={!groupName.trim()}><Icon name="plus" size={15} />Buat grup</button>
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
                  {@render ib('copy', 'Duplikat grup beserta anggotanya', () => duplicateGroup(g))}
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
      {/if}
    </div>
  </div>
</dialog>

<style>
  .dialog {
    width: min(900px, calc(100vw - 2rem));
    height: min(680px, calc(100dvh - 2rem));
    border: 0;
    border-radius: 14px;
    padding: 1rem 1.1rem;
    box-shadow: 0 20px 50px rgb(0 0 0 / 0.25);
    background: var(--surface);
    color: var(--text);
  }
  .dialog[open] {
    display: flex;
    flex-direction: column;
  }
  .dialog::backdrop {
    background: rgb(15 23 42 / 0.45);
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.75rem;
  }
  h2 {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    margin: 0;
    font-size: 1.1rem;
  }
  .x {
    border: 0;
    background: none;
    color: var(--muted);
    cursor: pointer;
  }
  .body {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: 12rem minmax(0, 1fr);
    gap: 1rem;
  }
  nav {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    padding: 0.4rem;
    border-radius: 10px;
    background: var(--surface-2);
  }
  nav button {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.45rem 0.6rem;
    border: 0;
    border-radius: 6px;
    background: none;
    color: var(--text);
    font: inherit;
    font-size: 0.88rem;
    text-align: left;
    cursor: pointer;
  }
  nav button:hover:not(.sel) {
    background: var(--line);
  }
  nav button.sel {
    background: var(--accent-soft);
    color: var(--accent);
  }
  @media (max-width: 640px) {
    .body {
      grid-template-columns: 1fr;
      grid-template-rows: auto minmax(0, 1fr);
    }
    nav {
      flex-direction: row;
      overflow-x: auto;
    }
    nav button {
      flex: none;
    }
  }
  h3 {
    margin: 0 0 0.4rem;
    font-size: 0.95rem;
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
  .ib:hover:not([aria-disabled='true']) {
    background: var(--surface-2);
    color: var(--text);
  }
  .ib.danger:hover:not([aria-disabled='true']) {
    color: var(--danger);
  }
  .ib.on {
    background: var(--accent-soft);
    color: var(--accent);
  }
  .ib[aria-disabled='true'] {
    opacity: 0.4;
    cursor: default;
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
  .add-btn {
    flex: none;
    white-space: nowrap;
  }
  .add-btn:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .defaults {
    display: grid;
    gap: 0.45rem;
    margin-top: 0.5rem;
  }
  .defaults label {
    display: grid;
    grid-template-columns: 9.5rem 1fr;
    align-items: start;
    gap: 0.6rem;
    font-size: 0.85rem;
  }
  .defaults label > span {
    padding-top: 0.4rem;
    color: var(--muted);
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
  .row input,
  .add-members textarea {
    flex: 1;
    min-width: 12rem;
  }
  .add-members {
    align-items: flex-start;
  }
  .add-members textarea {
    resize: vertical;
    font: inherit;
    min-height: 2.1rem;
    box-sizing: border-box;
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
