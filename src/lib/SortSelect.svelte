<script>
  import Icon from './Icon.svelte';
  import { SORTS, librarySort, setSort } from './librarySort.svelte.js';
</script>

<label class="sort" data-tip="Urutkan daftar">
  <Icon name="sort" size={14} />
  <select value={librarySort.by} aria-label="Urutkan" onchange={(e) => setSort(e.currentTarget.value)}>
    {#each SORTS as [k, label] (k)}<option value={k}>{label}</option>{/each}
  </select>
</label>

<style>
  .sort {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    flex: none;
    color: var(--muted);
    font-size: 0.8rem;
  }
  select {
    width: auto;
    font: inherit;
    font-size: 0.8rem;
    padding: 0.15rem 0.3rem;
    border: 1px solid var(--line);
    border-radius: 6px;
    background: var(--surface);
    color: var(--text);
    cursor: pointer;
  }
</style>
