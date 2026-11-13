<script>
  import Icon from './Icon.svelte';
  import Tour from './Tour.svelte';

  // Tombol "?" kecil yang membuka tur singkat untuk satu dialog. Langkah yang targetnya tidak tampil dilewati.
  let { steps, label = 'Tur singkat' } = $props();
  let open = $state(false);
</script>

<button type="button" class="help" onclick={() => (open = true)} aria-label={label} title={label}><Icon name="help" size={16} /></button>
<Tour bind:open {steps} />

<style>
  .help {
    flex: none;
    display: inline-grid;
    place-items: center;
    width: 1.9rem;
    height: 1.9rem;
    border: 1px solid transparent;
    border-radius: 6px;
    background: transparent;
    color: var(--muted);
    cursor: pointer;
  }
  .help:hover,
  .help:focus-visible {
    background: var(--surface-2);
    color: var(--accent);
  }
</style>
