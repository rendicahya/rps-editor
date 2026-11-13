<script>
  import { matchSnippet } from './library.js';

  /** Cuplikan isi RPS tempat kata pencarian ditemukan. parts: hasil searchParts, words: kata pencarian (huruf kecil). */
  let { parts, words } = $props();
  const m = $derived(matchSnippet(parts, words));
</script>

{#if m}
  <span class="snip"><b>{m.where}:</b> {#each m.pieces as p, i (i)}{#if p.hit}<mark>{p.text}</mark>{:else}{p.text}{/if}{/each}</span>
{/if}

<style>
  .snip {
    display: block;
    margin-top: 0.15rem;
    font-size: 0.78rem;
    color: var(--muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  b {
    font-weight: 600;
  }
  mark {
    background: var(--mark-bg, #fde68a);
    color: inherit;
    border-radius: 2px;
    padding: 0 1px;
  }
  :global(:root[data-theme='dark']) mark {
    background: #854d0e;
  }
</style>
