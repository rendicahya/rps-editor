<script>
  import Icon from './Icon.svelte';
  import { dismiss } from './dismiss.js';

  /**
   * info: { name, rows: [label, value, tip?][] } atau null. oncode: tombol ubah kode pustaka (tidak ada = tidak tampil).
   */
  let { info, oncode, onclose } = $props();
  let dialog;

  $effect(() => {
    if (info && !dialog.open) dialog.showModal();
    else if (!info && dialog.open) dialog.close();
  });
</script>

<dialog bind:this={dialog} class="dialog" use:dismiss onclose={onclose} aria-labelledby="sop-info-title">
  {#if info}
    <header>
      <h2 id="sop-info-title"><Icon name="info" size={18} /><span>{info.name}</span></h2>
      <button type="button" class="x" onclick={onclose} aria-label="Tutup"><Icon name="x" size={14} /></button>
    </header>
    <dl>
      {#each info.rows as [label, value, tip]}
        <dt>{label}</dt>
        <dd title={tip}>{value}</dd>
      {/each}
    </dl>
    <footer>
      {#if oncode}<button type="button" class="btn" onclick={oncode}><Icon name="pencil" size={14} />Ubah kode pustaka</button>{/if}
      <button type="button" class="btn primary" onclick={onclose}>Tutup</button>
    </footer>
  {/if}
</dialog>

<style>
  .dialog {
    width: min(520px, calc(100vw - 2rem));
    max-height: calc(100dvh - 2rem);
    border: 0;
    border-radius: 14px;
    padding: 1rem 1.1rem;
    box-shadow: 0 20px 50px rgb(0 0 0 / 0.25);
    background: var(--surface);
    color: var(--text);
  }
  .dialog::backdrop {
    background: rgb(15 23 42 / 0.45);
  }
  header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.75rem;
    margin-bottom: 0.75rem;
  }
  h2 {
    display: flex;
    align-items: flex-start;
    gap: 0.45rem;
    margin: 0;
    font-size: 1.05rem;
    overflow-wrap: anywhere;
  }
  h2 :global(svg) {
    flex: none;
    margin-top: 0.15rem;
  }
  .x {
    border: 0;
    background: none;
    color: var(--muted);
    cursor: pointer;
  }
  dl {
    display: grid;
    grid-template-columns: max-content minmax(0, 1fr);
    gap: 0.4rem 1rem;
    margin: 0;
    font-size: 0.88rem;
  }
  dt {
    color: var(--muted);
  }
  dd {
    margin: 0;
    overflow-wrap: anywhere;
  }
  footer {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    margin-top: 1rem;
  }
  @media (max-width: 480px) {
    dl {
      grid-template-columns: 1fr;
      gap: 0.1rem;
    }
    dd {
      margin-bottom: 0.4rem;
    }
  }
</style>
