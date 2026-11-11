<script>
  import { app } from './store.svelte.js';
  import { searchPattern, findMatches, replaceIn } from './findReplace.js';

  /** onjump(field) → tampilkan isian kolom itu di halaman (field.ref). */
  let { open = $bindable(false), onjump, onnotify } = $props();

  let query = $state('');
  let replacement = $state('');
  let caseSensitive = $state(false);
  let input = $state();

  const pattern = $derived(searchPattern(query, caseSensitive));
  const results = $derived(open ? findMatches(app.doc, pattern) : []);
  const total = $derived(results.reduce((a, r) => a + r.count, 0));
  const MAX = 200;

  $effect(() => {
    if (open) input?.select();
  });

  function replaceOne(r) {
    replaceIn(r.field, pattern, replacement);
  }

  function replaceAll() {
    const fields = results.map((r) => r.field);
    const n = fields.reduce((a, f) => a + replaceIn(f, pattern, replacement), 0);
    onnotify(`${n} teks diganti di ${fields.length} kolom`);
  }

  function onKey(e) {
    if (open && e.key === 'Escape' && !document.querySelector('dialog[open]')) open = false;
  }
</script>

<svelte:window onkeydown={onKey} />

{#if open}
  <div class="find" role="dialog" aria-label="Cari dan ganti">
    <div class="head">
      <strong>Cari &amp; ganti</strong>
      <button class="icon" onclick={() => (open = false)} title="Tutup (Esc)">✕</button>
    </div>
    <input bind:this={input} bind:value={query} placeholder="Cari…" aria-label="Cari" />
    <input bind:value={replacement} placeholder="Ganti dengan…" aria-label="Ganti dengan" />
    <div class="row">
      <label class="check"><input type="checkbox" bind:checked={caseSensitive} /> Huruf besar/kecil</label>
      <button class="btn small primary" disabled={!total} onclick={replaceAll}>Ganti semua</button>
    </div>
    {#if query}
      <p class="summary">
        {total ? `${total} kecocokan di ${results.length} kolom` : 'Tidak ditemukan'}
      </p>
    {/if}
    {#if results.length}
      <ul>
        {#each results.slice(0, MAX) as r, i (i)}
          <li>
            <button class="hit" onclick={() => onjump(r.field)} title="Tampilkan kolom ini">
              <span class="where">{r.field.label}{r.count > 1 ? ` (${r.count})` : ''}</span>
              <span class="snippet">{#each r.parts as p, j (j)}{#if p.hit}<mark>{p.text}</mark>{:else}{p.text}{/if}{/each}</span>
            </button>
            <button class="btn small" onclick={() => replaceOne(r)} title="Ganti di kolom ini">Ganti</button>
          </li>
        {/each}
      </ul>
      {#if results.length > MAX}<p class="summary">Menampilkan {MAX} kolom pertama.</p>{/if}
    {/if}
  </div>
{/if}

<style>
  .find {
    position: fixed;
    top: 4rem;
    right: 1rem;
    z-index: 15;
    width: min(380px, calc(100vw - 2rem));
    max-height: calc(100vh - 5rem);
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
    padding: 0.75rem 0.85rem;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: 12px;
    box-shadow: 0 16px 40px rgb(0 0 0 / 0.2);
  }
  .head,
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }
  .summary {
    margin: 0;
    font-size: 0.8rem;
    color: var(--muted);
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    overflow: auto;
    display: grid;
    gap: 0.3rem;
  }
  li {
    display: flex;
    align-items: flex-start;
    gap: 0.4rem;
  }
  .hit {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    text-align: left;
    border: 1px solid var(--line);
    border-radius: 7px;
    background: var(--surface-2);
    padding: 0.35rem 0.5rem;
    cursor: pointer;
  }
  .hit:hover {
    border-color: var(--accent);
  }
  .where {
    font-size: 0.72rem;
    font-weight: 600;
    color: var(--muted);
  }
  .snippet {
    font-size: 0.82rem;
    overflow-wrap: anywhere;
  }
  mark {
    background: var(--mark);
    color: inherit;
    border-radius: 2px;
  }
</style>
