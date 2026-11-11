<script>
  import PageSvg from './PageSvg.svelte';
  import PageFields from './PageFields.svelte';

  let { pages, zoom = 100, editable = true } = $props();
  // Lebar tampilan sebanding ukuran kertas: halaman lanskap (297 mm) memenuhi lebar area, halaman potret lebih sempit.
  const WIDEST = 297;
</script>

<div class="pages" style:--zoom={zoom / 100}>
  {#each pages as page, i (i)}
    <figure class="sheet" style:--frac={page.w / WIDEST}>
      <div class="page">
        <PageSvg {page} />
        {#if page.fields.length}<PageFields fields={page.fields} {editable} />{/if}
      </div>
      <figcaption>Halaman {i + 1} / {pages.length}</figcaption>
    </figure>
  {/each}
</div>

<style>
  .pages {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1.25rem;
    padding: 1.25rem;
  }
  .sheet {
    margin: 0;
    width: calc(100% * var(--zoom) * var(--frac));
    max-width: none;
    flex: none;
  }
  .page {
    position: relative;
    container-type: inline-size;
  }
  .sheet :global(svg) {
    box-shadow: 0 1px 3px rgb(0 0 0 / 0.15), 0 8px 24px rgb(0 0 0 / 0.08);
  }
  figcaption {
    text-align: center;
    font-size: 0.75rem;
    color: var(--muted);
    margin-top: 0.4rem;
  }
</style>
