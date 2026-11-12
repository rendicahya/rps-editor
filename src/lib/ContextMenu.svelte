<script>
  import Icon from './Icon.svelte';

  // Menu klik kanan. Item: { label, icon, run, disabled, danger, checked, hint, title } | { sep: true } | { head }.
  // `icon`: nama ikon di Icon.svelte. Item centang yang berikon ditandai dengan ikon yang disorot, bukan ✓.
  // Menu tidak mengambil fokus (isian yang diklik kanan tetap fokus dengan seleksinya), jadi navigasi
  // keyboard (↑/↓, Enter, Esc) ditangkap di window pada fase capture.
  // `host`: tempat menu ditempel. Di dalam <dialog> modal harus dialog itu sendiri, karena <body> ada di bawahnya.
  let { x, y, items, onclose, host = null } = $props();

  let el = $state();
  let active = $state(-1);
  let pos = $state({ left: 0, top: 0 });
  const usable = $derived(items.map((it, i) => (it.run && !it.disabled ? i : -1)).filter((i) => i >= 0));

  // Di dalam layar: geser ke kiri bila mepet kanan, buka ke atas bila mepet bawah.
  $effect(() => {
    const r = el.getBoundingClientRect();
    pos = {
      left: Math.max(4, Math.min(x, innerWidth - r.width - 4)),
      top: y + r.height > innerHeight - 4 ? Math.max(4, y - r.height) : y
    };
  });

  function pick(it) {
    if (!it.run || it.disabled) return;
    onclose();
    it.run();
  }

  $effect(() => {
    const key = (e) => {
      if (!['Escape', 'ArrowDown', 'ArrowUp', 'Enter', 'Tab'].includes(e.key)) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape' || e.key === 'Tab') onclose();
      else if (e.key === 'Enter') active >= 0 ? pick(items[active]) : onclose();
      else if (usable.length) {
        const k = usable.indexOf(active);
        const d = e.key === 'ArrowDown' ? 1 : -1;
        active = usable[k < 0 ? (d > 0 ? 0 : usable.length - 1) : (k + d + usable.length) % usable.length];
      }
    };
    const outside = (e) => !el.contains(e.target) && onclose();
    const close = () => onclose();
    addEventListener('keydown', key, true);
    addEventListener('pointerdown', outside, true);
    addEventListener('wheel', close, true);
    addEventListener('resize', close);
    addEventListener('blur', close);
    return () => {
      removeEventListener('keydown', key, true);
      removeEventListener('pointerdown', outside, true);
      removeEventListener('wheel', close, true);
      removeEventListener('resize', close);
      removeEventListener('blur', close);
    };
  });

  /** Menu ditempel di <body> agar posisi fixed tidak terpengaruh transformasi halaman. */
  function portal(node) {
    (host ?? document.body).appendChild(node);
    return { destroy: () => node.remove() };
  }
</script>

<div
  bind:this={el}
  use:portal
  class="ctx"
  role="menu"
  tabindex="-1"
  style="left:{pos.left}px;top:{pos.top}px"
  onpointerdown={(e) => e.preventDefault()}
  oncontextmenu={(e) => e.preventDefault()}
>
  {#each items as it, i (i)}
    {#if it.sep}
      <hr />
    {:else if it.head}
      <div class="cm-head">{it.head}</div>
    {:else}
      <button
        role={it.checked === undefined ? 'menuitem' : 'menuitemcheckbox'}
        aria-checked={it.checked === undefined ? undefined : !!it.checked}
        tabindex="-1"
        class:active={active === i}
        class:danger={it.danger}
        aria-disabled={!!it.disabled}
        title={it.title ?? ''}
        onpointerenter={() => (active = it.disabled ? -1 : i)}
        onclick={() => pick(it)}
      >
        <span class="cm-check" class:on={it.icon && it.checked}>
          {#if it.icon}<Icon name={it.icon} size={15} />{:else if it.checked}✓{/if}
        </span>
        <span class="cm-label">{it.label}</span>
        {#if it.hint}<span class="cm-hint">{it.hint}</span>{/if}
      </button>
    {/if}
  {/each}
</div>

<style>
  .ctx {
    position: fixed;
    z-index: 1000;
    min-width: 210px;
    max-width: 300px;
    max-height: calc(100vh - 8px);
    overflow-y: auto;
    padding: 4px;
    font: 12.5px/1.2 var(--ui-font, system-ui, sans-serif);
    color: var(--text, #1f2633);
    background: var(--surface, #fff);
    border: 1px solid var(--line, #c9d0dc);
    border-radius: 8px;
    box-shadow: 0 8px 24px rgb(0 0 0 / 0.18);
    outline: none;
    user-select: none;
  }
  .ctx hr {
    margin: 4px 6px;
    border: 0;
    border-top: 1px solid var(--line, #e3e7ee);
  }
  .ctx .cm-head {
    padding: 5px 8px 3px 30px;
    font-size: 11px;
    font-weight: 600;
    color: var(--muted, #6b7487);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .ctx button {
    display: flex;
    align-items: center;
    width: 100%;
    gap: 6px;
    padding: 5px 8px 5px 4px;
    border: 0;
    border-radius: 5px;
    background: none;
    min-height: 0;
    margin: 0;
    color: var(--text, #1f2633);
    font: 400 12.5px/1.25 var(--ui-font, system-ui, sans-serif);
    text-transform: none;
    letter-spacing: normal;
    box-shadow: none;
    text-align: left;
    cursor: pointer;
  }
  .ctx button.active {
    background: var(--accent, #1f4e8c);
    color: #fff;
  }
  .ctx button.danger {
    color: var(--danger, #b42318);
  }
  .ctx button.danger.active {
    background: var(--danger, #b42318);
    color: #fff;
  }
  .ctx button[aria-disabled='true'] {
    color: var(--muted, #a3aab8);
    opacity: 0.6;
    cursor: default;
  }
  .ctx .cm-check {
    width: 20px;
    height: 20px;
    flex: none;
    display: grid;
    place-items: center;
    border-radius: 4px;
    opacity: 0.85;
  }
  .ctx .cm-check.on {
    background: color-mix(in srgb, var(--accent, #1f4e8c) 18%, transparent);
    color: var(--accent, #1f4e8c);
    opacity: 1;
  }
  .ctx button.active .cm-check.on {
    background: rgb(255 255 255 / 0.22);
    color: #fff;
  }
  .ctx .cm-label {
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .ctx .cm-hint {
    margin: 0 0 0 12px;
    font-size: 11px;
    line-height: 1;
    opacity: 0.6;
  }
</style>
