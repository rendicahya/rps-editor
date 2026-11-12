<script>
  import { review, setReviewYears, REVIEW_CHOICES } from './review.svelte.js';

  /** Daftar temuan pemeriksa dokumen; onjump(ref) menuju isian terkait di halaman. */
  let { open = $bindable(false), issues, onjump } = $props();

  let showInfo = $state(false);
  const LEVEL = { error: 'Salah', warn: 'Peringatan', info: 'Saran' };
  const count = (lv) => issues.filter((i) => i.level === lv).length;
  const shown = $derived(showInfo ? issues : issues.filter((i) => i.level !== 'info'));

  let panel = $state();
  function onKey(e) {
    if (open && e.key === 'Escape' && !document.querySelector('dialog[open]')) open = false;
  }
  // Klik di luar panel menutupnya. Tombol yang membuka panel diabaikan agar klik itu tidak menutup lalu membukanya lagi.
  function onPointer(e) {
    if (!open || !panel || panel.contains(e.target) || document.querySelector('dialog[open]')) return;
    if (e.target.closest?.('.check-btn, button.dur')) return;
    open = false;
  }
</script>

<svelte:window onkeydown={onKey} onpointerdown={onPointer} />

{#if open}
  <div class="check" role="dialog" aria-label="Periksa dokumen" bind:this={panel}>
    <div class="head">
      <strong>Periksa dokumen</strong>
      <button class="icon" onclick={() => (open = false)} title="Tutup (Esc)">✕</button>
    </div>
    <p class="summary">
      {#if !count('error') && !count('warn')}
        Tidak ada kesalahan maupun isian penting yang kosong.
      {:else}
        {count('error')} salah · {count('warn')} peringatan
      {/if}
    </p>
    <div class="opts">
      <label class="check-row"><input type="checkbox" bind:checked={showInfo} /> Tampilkan saran ({count('info')})</label>
      <label class="check-row" title="RPS yang tanggal penyusunannya lebih lama dari ini diberi peringatan agar ditinjau ulang. Juga dipakai di Pustaka Daring.">
        Tinjau ulang setiap
        <select value={review.years} onchange={(e) => setReviewYears(Number(e.currentTarget.value))} aria-label="Jangka tinjauan berkala">
          {#each REVIEW_CHOICES as y (y)}<option value={y}>{y} tahun</option>{/each}
        </select>
      </label>
    </div>
    {#if shown.length}
      <ul>
        {#each shown as it, i (i)}
          <li>
            <button class="hit {it.level}" disabled={!it.ref} onclick={() => onjump(it.ref)} title={it.ref ? 'Tampilkan di halaman' : ''}>
              <span class="lv">{LEVEL[it.level]}</span>
              <span class="msg">{it.msg}</span>
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
{/if}

<style>
  .check {
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
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }
  .summary {
    margin: 0;
    font-size: 0.82rem;
    color: var(--muted);
  }
  .opts {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 0.3rem 0.75rem;
  }
  .opts select {
    width: auto;
    padding: 0.1rem 0.3rem;
    font-size: 0.8rem;
  }
  .check-row {
    display: flex;
    align-items: center;
    gap: 0.35rem;
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
  .hit {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    text-align: left;
    border: 1px solid var(--line);
    border-left: 4px solid var(--muted);
    border-radius: 7px;
    background: var(--surface-2);
    padding: 0.35rem 0.5rem;
    cursor: pointer;
    color: var(--text);
  }
  .hit:hover:not(:disabled) {
    border-color: var(--accent);
  }
  .hit:disabled {
    cursor: default;
  }
  .hit.error {
    border-left-color: var(--danger, #b42318);
  }
  .hit.warn {
    border-left-color: #d98e04;
  }
  .lv {
    font-size: 0.7rem;
    font-weight: 600;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }
  .hit.error .lv {
    color: var(--danger, #b42318);
  }
  .msg {
    font-size: 0.82rem;
    overflow-wrap: anywhere;
  }
</style>
