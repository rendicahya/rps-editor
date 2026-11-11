<script>
  import { applyCase, CASES, editField, toggleList, listKindAt } from './richtext.js';
  import { asStep } from './history.js';

  // Tombol format teks (tebal/miring/garis bawah) untuk isian berformat yang sedang difokus.
  // Tombol tidak mengambil fokus, jadi perintahnya berlaku pada seleksi di isian tersebut.
  const FORMATS = [
    ['bold', 'B', 'Tebal (Ctrl+B)'],
    ['italic', 'I', 'Miring (Ctrl+I)'],
    ['underline', 'U', 'Garis bawah (Ctrl+U)'],
    ['removeFormat', 'T', 'Hapus format']
  ];

  // Daftar hanya untuk isian banyak baris (sel tabel langkah).
  const LISTS = [
    ['bullet', 'Daftar poin (Ctrl+Shift+8)'],
    ['number', 'Daftar bernomor (Ctrl+Shift+7)']
  ];

  let active = $state(false);
  let multi = $state(false);
  let list = $state('');
  let state = $state({});

  function update() {
    const el = document.activeElement;
    active = !!el?.classList?.contains('f-rich');
    multi = active && el.getAttribute('aria-multiline') === 'true';
    if (active) for (const [cmd] of FORMATS.slice(0, 3)) state[cmd] = document.queryCommandState(cmd);
    list = multi ? listKindAt(el) : '';
  }

  function run(cmd) {
    if (!active) return;
    asStep(() => document.execCommand(cmd));
    update();
  }

  function setList(kind) {
    if (!multi) return;
    asStep(() => editField(document.activeElement, (v, a, b) => toggleList(v, a, b, kind)));
    update();
  }

  let caseOpen = $state(false);
  let caseWrap;

  function setCase(mode) {
    caseOpen = false;
    if (active) asStep(() => applyCase(document.activeElement, mode));
    update();
  }

  $effect(() => {
    if (!active) caseOpen = false;
  });
</script>

<svelte:document
  onfocusin={update}
  onfocusout={() => setTimeout(update)}
  onselectionchange={update}
  oninput={update}
  onpointerdown={(e) => caseOpen && !caseWrap?.contains(e.target) && (caseOpen = false)}
  onkeydown={(e) => caseOpen && e.key === 'Escape' && (caseOpen = false)}
/>

<div
  class="fmt"
  role="toolbar"
  aria-label="Format teks"
  title={active ? '' : 'Klik butir ketentuan atau sel tabel langkah untuk memformat teks'}
>
  {#each FORMATS as [cmd, label, title] (cmd)}
    <button
      class="fmt-{cmd}"
      class:on={state[cmd] && active}
      disabled={!active}
      {title}
      aria-label={title}
      aria-pressed={cmd === 'removeFormat' ? undefined : !!(state[cmd] && active)}
      onpointerdown={(e) => e.preventDefault()}
      onclick={() => run(cmd)}>{label}</button
    >
  {/each}
  {#each LISTS as [kind, title] (kind)}
    <button
      class="fmt-list"
      class:on={list === kind}
      disabled={!multi}
      title={multi ? title : 'Daftar poin/bernomor tersedia di sel tabel langkah'}
      aria-label={title}
      aria-pressed={list === kind}
      onpointerdown={(e) => e.preventDefault()}
      onclick={() => setList(kind)}
    >
      <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
        {#if kind === 'bullet'}
          <circle cx="2.5" cy="4" r="1.3" /><circle cx="2.5" cy="8" r="1.3" /><circle cx="2.5" cy="12" r="1.3" />
        {:else}
          <text x="0.3" y="5.6" font-size="5" font-family="system-ui, sans-serif">1</text>
          <text x="0.3" y="9.6" font-size="5" font-family="system-ui, sans-serif">2</text>
          <text x="0.3" y="13.6" font-size="5" font-family="system-ui, sans-serif">3</text>
        {/if}
        <rect x="5.5" y="3.3" width="9" height="1.4" rx="0.7" /><rect x="5.5" y="7.3" width="9" height="1.4" rx="0.7" /><rect
          x="5.5"
          y="11.3"
          width="9"
          height="1.4"
          rx="0.7"
        />
      </svg>
    </button>
  {/each}
  <div class="case" bind:this={caseWrap}>
    <button
      class="fmt-case"
      class:open={caseOpen}
      disabled={!active}
      title="Ubah huruf besar/kecil (Shift+F3)"
      aria-label="Ubah huruf besar/kecil"
      aria-haspopup="menu"
      aria-expanded={caseOpen}
      onpointerdown={(e) => e.preventDefault()}
      onclick={() => (caseOpen = !caseOpen)}>Aa<span class="caret">▾</span></button
    >
    {#if caseOpen}
      <div class="case-menu" role="menu">
        {#each CASES as [mode, label] (mode)}
          <button role="menuitem" onpointerdown={(e) => e.preventDefault()} onclick={() => setCase(mode)}
            >{label}</button
          >
        {/each}
      </div>
    {/if}
  </div>
</div>

<style>
  .fmt {
    display: flex;
    align-items: center;
    gap: 2px;
  }
  button {
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
    padding: 0;
    border: 1px solid transparent;
    border-radius: 5px;
    background: transparent;
    color: var(--text);
    font: 700 14px/1 Georgia, 'Times New Roman', serif;
    cursor: pointer;
  }
  button:hover:not(:disabled) {
    background: var(--surface-2);
    border-color: var(--line);
  }
  button:disabled {
    opacity: 0.35;
    cursor: default;
  }
  button.on {
    background: var(--accent);
    border-color: var(--accent);
    color: #fff;
  }
  .fmt-italic {
    font-style: italic;
  }
  .fmt-underline {
    text-decoration: underline;
  }
  .fmt-removeFormat {
    position: relative;
    font-weight: 400;
  }
  .fmt-list svg {
    fill: currentColor;
  }
  .case {
    position: relative;
  }
  .fmt-case {
    display: flex;
    gap: 1px;
    width: auto;
    padding: 0 3px;
    font-weight: 400;
  }
  .fmt-case.open {
    background: var(--surface-2);
    border-color: var(--line);
  }
  .caret {
    font: 9px/1 system-ui, sans-serif;
    opacity: 0.7;
  }
  .case-menu {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    z-index: 50;
    display: flex;
    flex-direction: column;
    min-width: 170px;
    padding: 4px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--surface);
    box-shadow: 0 6px 20px rgb(0 0 0 / 0.15);
  }
  .case-menu button {
    display: block;
    width: 100%;
    height: auto;
    padding: 6px 10px;
    text-align: left;
    font: 400 0.85rem/1.2 system-ui, sans-serif;
  }
  .fmt-removeFormat::after {
    content: '';
    position: absolute;
    left: 5px;
    right: 5px;
    top: 50%;
    border-top: 1.5px solid currentColor;
    transform: rotate(-35deg);
  }
</style>
