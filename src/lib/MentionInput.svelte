<script>
  import { tick } from 'svelte';

  /**
   * Textarea komentar dengan saran @email: mengetik "@" diikuti huruf menampilkan anggota `people` (email) yang cocok.
   * ↑/↓ memilih, Enter/Tab memakai, Esc menutup saran. Tombol lain diteruskan ke onkeydown.
   */
  let { value = $bindable(''), people = [], onkeydown, ...rest } = $props();

  let el = $state();
  let token = $state(null); // { start, end, q } kata "@…" di posisi kursor
  let pick = $state(0);

  export const focus = () => el?.focus();

  const hits = $derived.by(() => {
    if (!token) return [];
    const q = token.q.toLowerCase();
    return people.filter((p) => p.includes(q) && p !== q).sort((a, b) => b.startsWith(q) - a.startsWith(q) || a.localeCompare(b)).slice(0, 6);
  });

  function scan() {
    const pos = el.selectionStart;
    if (pos !== el.selectionEnd) return (token = null);
    const m = /(^|\s)@([^\s@]*(?:@[^\s]*)?)$/.exec(value.slice(0, pos));
    token = m ? { start: pos - m[2].length - 1, end: pos, q: m[2] } : null;
    pick = 0;
  }

  async function use(email) {
    const after = value.slice(token.end).replace(/^[^\s]*/, '');
    const insert = `@${email} `;
    value = value.slice(0, token.start) + insert + after.replace(/^\s/, '');
    const pos = token.start + insert.length;
    token = null;
    await tick();
    el.focus();
    el.setSelectionRange(pos, pos);
  }

  function key(e) {
    if (token && hits.length) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        pick = (pick + (e.key === 'ArrowDown' ? 1 : hits.length - 1)) % hits.length;
        return;
      }
      if ((e.key === 'Enter' && !e.ctrlKey && !e.metaKey) || e.key === 'Tab') {
        e.preventDefault();
        use(hits[pick]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        token = null;
        return;
      }
    }
    onkeydown?.(e);
  }
</script>

<div class="mi">
  <textarea
    bind:this={el}
    bind:value
    {...rest}
    oninput={scan}
    onclick={scan}
    onkeyup={(e) => ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key) && scan()}
    onblur={() => setTimeout(() => (token = null), 150)}
    onkeydown={key}
  ></textarea>
  {#if token && hits.length}
    <ul class="sug" role="listbox" aria-label="Sebut anggota">
      {#each hits as p, i (p)}
        <li role="option" aria-selected={i === pick}>
          <button type="button" class:on={i === pick} onpointerdown={(e) => e.preventDefault()} onclick={() => use(p)}>@{p}</button>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .mi {
    position: relative;
  }
  textarea {
    width: 100%;
    resize: vertical;
    font: inherit;
    font-size: 0.85rem;
    box-sizing: border-box;
  }
  .sug {
    position: absolute;
    left: 0;
    right: 0;
    top: 100%;
    z-index: 5;
    margin: 2px 0 0;
    padding: 0.2rem;
    list-style: none;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: 8px;
    box-shadow: 0 8px 24px rgb(0 0 0 / 0.18);
  }
  .sug button {
    width: 100%;
    text-align: left;
    border: 0;
    border-radius: 5px;
    background: none;
    color: var(--text);
    font: inherit;
    font-size: 0.8rem;
    padding: 0.25rem 0.45rem;
    cursor: pointer;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .sug button.on,
  .sug button:hover {
    background: var(--accent-soft);
    color: var(--accent);
  }
</style>
