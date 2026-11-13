<script>
  import Icon from './Icon.svelte';
  import Preview from './Preview.svelte';
  import { dismiss } from './dismiss.js';
  import { parseDocumentText, formatTanggal } from './model.js';
  import { layoutDocument } from './layout.js';

  /**
   * Pratinjau halaman RPS tanpa membukanya di tab. item: { title, json, where? } atau null.
   * onopen: tombol Buka (tidak ada = tidak tampil), onclose: dialog ditutup.
   */
  let { item, onopen, onclose } = $props();
  let dialog;

  $effect(() => {
    if (item && !dialog.open) dialog.showModal();
    else if (!item && dialog.open) dialog.close();
  });

  const cap = (s) => s.charAt(0) + s.slice(1).toLowerCase();
  const view = $derived.by(() => {
    if (!item) return null;
    try {
      const doc = parseDocumentText(item.json);
      const id = doc.identitas;
      const sks = (Number(id.sksTeori) || 0) + (Number(id.sksPraktikum) || 0);
      const facts = [
        id.kode && `Kode ${id.kode}`,
        sks && `${sks} SKS`,
        id.semester && [cap(id.semester), id.tahunAkademik].filter(Boolean).join(' '),
        id.prodi,
        id.tglPenyusunan && `Disusun ${formatTanggal(id.tglPenyusunan)}`,
        `${doc.pertemuan.length} pertemuan`,
        item.where
      ].filter(Boolean);
      return { pages: layoutDocument(doc), facts };
    } catch (e) {
      return { error: e.message };
    }
  });
</script>

<dialog bind:this={dialog} class="dialog" use:dismiss onclose={onclose} aria-labelledby="rps-preview-title">
  {#if item}
    <header>
      <div>
        <h2 id="rps-preview-title">{item.title || 'RPS tanpa judul'}</h2>
        {#if view.facts}<p>{view.facts.join(' · ')}</p>{/if}
      </div>
      <button type="button" class="x" onclick={onclose} aria-label="Tutup"><Icon name="x" size={14} /></button>
    </header>
    <div class="body">
      {#if view.error}
        <p class="err">RPS ini tidak bisa ditampilkan: {view.error}</p>
      {:else}
        <Preview pages={view.pages} fields={false} />
      {/if}
    </div>
    <footer>
      <button type="button" class="btn" onclick={onclose}>Tutup</button>
      {#if onopen && !view.error}<button type="button" class="btn primary" onclick={onopen}><Icon name="open" size={15} />Buka di tab</button>{/if}
    </footer>
  {/if}
</dialog>

<style>
  .dialog {
    width: min(1100px, calc(100vw - 2rem));
    height: calc(100dvh - 2rem);
    max-height: none;
    border: 0;
    border-radius: 14px;
    padding: 0;
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
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.9rem 1.1rem 0.7rem;
    border-bottom: 1px solid var(--line);
  }
  h2 {
    margin: 0;
    font-size: 1.05rem;
    overflow-wrap: anywhere;
  }
  header p {
    margin: 0.2rem 0 0;
    font-size: 0.8rem;
    color: var(--muted);
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
    overflow: auto;
    background: var(--surface-2);
  }
  .err {
    padding: 1.5rem;
    color: var(--danger);
  }
  footer {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    padding: 0.7rem 1.1rem;
    border-top: 1px solid var(--line);
  }
  @media (max-width: 600px) {
    .dialog {
      width: 100vw;
      height: 100dvh;
      border-radius: 0;
    }
  }
</style>
