<script>
  import { tick } from 'svelte';
  import LocalPane from './LocalPane.svelte';
  import FacultyPane from './FacultyPane.svelte';
  import { tips } from './tips.js';

  /**
   * Dialog Pustaka: tab Lokal (browser ini) dan Daring (RPS bersama). Kedua panel tetap terpasang, jadi folder dan
   * pencarian di tab Daring tidak hilang saat berpindah tab. local/faculty: props untuk masing-masing panel.
   */
  let { open = $bindable(false), tab = $bindable('local'), local, faculty } = $props();
  $effect(() => {
    if (!TABS.some(([t]) => t === tab)) tab = 'local';
  });

  // Pustaka Daring untuk RPS (koleksi rps/rpsFolders) belum aktif: aturan Firestore-nya perlu ditambahkan dulu.
  const FACULTY_READY = false;
  const TABS = [
    ['local', 'Lokal', 'RPS yang disimpan di browser ini'],
    ...(FACULTY_READY ? [['faculty', 'Daring', 'RPS bersama secara daring, untuk anggota fakultas']] : [])
  ];

  let dialog = $state();

  $effect(() => {
    if (open && !dialog.open) {
      dialog.showModal();
      focusSearch();
    } else if (!open && dialog.open) dialog.close();
  });

  const close = () => (open = false);

  async function focusSearch() {
    await tick();
    dialog.querySelector(`[data-pane="${tab}"] input[type="search"]`)?.focus();
  }

  function choose(t) {
    tab = t;
    try {
      localStorage.setItem('rps-editor.libraryTab', t);
    } catch {
      /* tidak apa-apa: tab terakhir hanya tidak diingat */
    }
  }

  function tabKey(e) {
    const i = TABS.findIndex(([t]) => t === tab);
    const next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: TABS.length - 1 }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    const t = TABS[(next + TABS.length) % TABS.length][0];
    choose(t);
    tick().then(() => dialog.querySelector(`[data-pane="${t}"] [role="tab"][aria-selected="true"]`)?.focus());
  }
</script>

{#snippet tabs()}
  <div class="libtabs" role="tablist" aria-label="Pustaka" tabindex="-1" onkeydown={tabKey}>
    <span class="label">Pustaka</span>
    {#each TABS as [t, name, desc] (t)}
      <button
        type="button"
        role="tab"
        aria-selected={tab === t}
        aria-controls="libpane-{t}"
        tabindex={tab === t ? 0 : -1}
        data-tip={desc}
        onclick={() => choose(t)}>{name}</button
      >
    {/each}
  </div>
{/snippet}

<dialog bind:this={dialog} class="dialog" use:tips onclose={close}>
  <div class="pane" id="libpane-local" data-pane="local" role="tabpanel" aria-label="Pustaka Lokal" hidden={tab !== 'local'}>
    <LocalPane {open} active={tab === 'local'} {tabs} onclose={close} {...local} />
  </div>
  {#if FACULTY_READY}
    <div class="pane" id="libpane-faculty" data-pane="faculty" role="tabpanel" aria-label="Pustaka Daring" hidden={tab !== 'faculty'}>
      <FacultyPane {open} active={tab === 'faculty'} host={dialog} {tabs} onclose={close} {...faculty} />
    </div>
  {/if}
</dialog>

<style>
  .dialog {
    width: min(1180px, calc(100vw - 2rem));
    height: min(760px, calc(100vh - 3rem));
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
  .pane {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
  .pane[hidden] {
    display: none;
  }
  .libtabs {
    flex: none;
    display: flex;
    align-items: center;
    gap: 0.15rem;
    padding: 0.2rem;
    border-radius: 9px;
    background: var(--surface-2);
  }
  .label {
    font-weight: 700;
    font-size: 1.05rem;
    padding: 0 0.6rem 0 0.4rem;
  }
  [role='tab'] {
    border: 0;
    border-radius: 7px;
    background: none;
    color: var(--muted);
    font: inherit;
    font-size: 0.88rem;
    font-weight: 600;
    padding: 0.3rem 0.85rem;
    cursor: pointer;
  }
  [role='tab']:hover {
    color: var(--text);
  }
  [role='tab'][aria-selected='true'] {
    background: var(--surface);
    color: var(--accent);
    box-shadow: 0 1px 3px rgb(0 0 0 / 0.15);
  }
</style>
