<script>
  import { tick, untrack } from 'svelte';

  // Tur pengenalan: menyorot bagian aplikasi satu per satu. Langkah tanpa `target`, atau yang targetnya
  // tidak tampil (mis. halaman saat tidak ada RPS terbuka), ditampilkan di tengah / dilewati.
  // Langkah: { title, text, target?: selektor CSS, before?: fungsi yang dijalankan sebelum langkah tampil }.
  let { open = $bindable(false), steps = [], ondone } = $props();

  let dlg = $state();
  let i = $state(0);
  let rect = $state(null); // kotak sorotan
  let card = $state();
  let pos = $state({ left: 0, top: 0, centered: true });

  const PAD = 6;
  const GAP = 12;

  const visible = (el) => {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
  };
  const targetOf = (s) => (s?.target ? document.querySelector(s.target) : null);
  // Langkah yang berlaku saat tur dibuka; dihitung sekali agar penomoran tetap.
  let shown = $state([]);
  const step = $derived(shown[i]);

  $effect(() => {
    if (!open || !dlg) return;
    // Hanya bergantung pada `open`: place() membaca langkah aktif, yang tidak boleh memicu efek ini lagi.
    untrack(() => {
      // Langkah dengan `before` (mis. pindah halaman dialog) baru menampilkan targetnya saat langkah itu dibuka.
      shown = steps.filter((s) => !s.target || s.before || visible(targetOf(s)));
      i = 0;
      if (!dlg.open) dlg.showModal();
      place();
    });
  });

  async function place() {
    step?.before?.();
    await tick();
    const el = targetOf(step);
    if (el) {
      el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); // mis. bagian bawah dialog yang panjang
      const r = el.getBoundingClientRect();
      rect = { left: r.left - PAD, top: r.top - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 };
    } else rect = null;
    await tick();
    if (!card) return;
    card.querySelector('.next')?.focus();
    const cw = card.offsetWidth;
    const ch = card.offsetHeight;
    const vw = innerWidth;
    const vh = innerHeight;
    if (!rect) {
      pos = { left: (vw - cw) / 2, top: Math.max(16, (vh - ch) / 2), centered: true };
      return;
    }
    const clampX = (x) => Math.min(Math.max(16, x), vw - cw - 16);
    const left = clampX(rect.left + rect.width / 2 - cw / 2);
    const below = rect.top + rect.height + GAP;
    const above = rect.top - GAP - ch;
    let top;
    if (below + ch <= vh - 16) top = below;
    else if (above >= 16) top = above;
    else top = Math.min(rect.top + 24, vh - ch - 16); // target besar: kartu di dalamnya
    pos = { left, top, centered: false };
  }

  function go(d) {
    const n = i + d;
    if (n < 0) return;
    if (n >= shown.length) return finish();
    i = n;
    place();
  }

  function finish() {
    open = false;
    dlg?.close();
    rect = null;
    ondone?.();
  }

  function onkey(e) {
    if (e.key === 'ArrowRight') (e.preventDefault(), go(1));
    else if (e.key === 'ArrowLeft') (e.preventDefault(), go(-1));
  }
</script>

<svelte:window onresize={() => open && place()} />

<dialog
  bind:this={dlg}
  class="tour"
  aria-labelledby="tour-title"
  aria-describedby="tour-text"
  oncancel={(e) => (e.preventDefault(), finish())}
  onkeydown={onkey}
>
  {#if open && step}
    {#if rect}
      <div class="spot" style:left="{rect.left}px" style:top="{rect.top}px" style:width="{rect.width}px" style:height="{rect.height}px"></div>
    {:else}
      <div class="shade"></div>
    {/if}
    <div class="card" bind:this={card} style:left="{pos.left}px" style:top="{pos.top}px">
      <small class="count">{i + 1} dari {shown.length}</small>
      <h2 id="tour-title">{step.title}</h2>
      <p id="tour-text">{step.text}</p>
      <div class="dots" aria-hidden="true">
        {#each shown as _, k}<span class:on={k === i}></span>{/each}
      </div>
      <div class="actions">
        <button class="btn small ghost skip" onclick={finish}>{i === shown.length - 1 ? 'Tutup' : 'Lewati tur'}</button>
        <span class="grow"></span>
        {#if i > 0}<button class="btn small" onclick={() => go(-1)}>Kembali</button>{/if}
        <button class="btn small primary next" onclick={() => go(1)}>{i === shown.length - 1 ? 'Selesai' : i === 0 ? 'Mulai' : 'Lanjut'}</button>
      </div>
    </div>
  {/if}
</dialog>

<style>
  .tour {
    position: fixed;
    inset: 0;
    width: 100vw;
    height: 100vh;
    max-width: none;
    max-height: none;
    margin: 0;
    padding: 0;
    border: 0;
    background: transparent;
    overflow: hidden;
  }
  .tour::backdrop {
    background: transparent;
  }
  .spot,
  .shade {
    position: fixed;
    pointer-events: none;
  }
  .spot {
    border-radius: 8px;
    box-shadow:
      0 0 0 2px var(--accent),
      0 0 0 9999px rgb(10 14 20 / 0.55);
    transition:
      left 0.2s ease,
      top 0.2s ease,
      width 0.2s ease,
      height 0.2s ease;
  }
  .shade {
    inset: 0;
    background: rgb(10 14 20 / 0.55);
  }
  .card {
    position: fixed;
    width: min(360px, calc(100vw - 32px));
    background: var(--surface);
    color: var(--text);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    box-shadow: 0 12px 32px rgb(0 0 0 / 0.25);
    padding: 1rem 1.1rem 0.85rem;
    font: 0.9rem/1.5 var(--ui-font);
  }
  .count {
    color: var(--muted);
    font-size: 0.75rem;
  }
  h2 {
    margin: 0.15rem 0 0.35rem;
    font-size: 1.05rem;
  }
  p {
    margin: 0;
    color: var(--text);
  }
  .dots {
    display: flex;
    gap: 5px;
    margin: 0.8rem 0 0.7rem;
  }
  .dots span {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--line);
  }
  .dots span.on {
    background: var(--accent);
    width: 16px;
    border-radius: 3px;
  }
  .actions {
    display: flex;
    gap: 0.4rem;
    align-items: center;
  }
  .grow {
    flex: 1;
  }
  @media (prefers-reduced-motion: reduce) {
    .spot {
      transition: none;
    }
  }
</style>
