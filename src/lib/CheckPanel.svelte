<script>
  import Icon from './Icon.svelte';
  import { review, setReviewYears, REVIEW_CHOICES } from './review.svelte.js';
  import { contributions } from './rekap.js';
  import { formatAngka } from './model.js';
  import { plainText } from './richtext.js';

  /** Daftar temuan pemeriksa dokumen dan rekap kontribusi nilai; onjump(ref) menuju isian terkait di halaman. */
  let { open = $bindable(false), issues, doc, onjump } = $props();

  let tab = $state('issues');
  const rekap = $derived(open && tab === 'rekap' ? contributions(doc) : null);
  const pct = (v) => `${formatAngka(v)}%`;
  const tip = (x) => plainText(x.teks ?? '').replace(/\s+/g, ' ').trim();
  const fromTip = (n) => (n.from.length ? n.from.map((f) => `${f.kode} ${pct(f.nilai)}`).join(' + ') : 'Tidak dinilai asesmen mana pun');

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
      <button class="icon" onclick={() => (open = false)} title="Tutup (Esc)" aria-label="Tutup"><Icon name="x" size={14} /></button>
    </div>
    <div class="tabs" role="tablist">
      <button role="tab" aria-selected={tab === 'issues'} class:on={tab === 'issues'} onclick={() => (tab = 'issues')}>Temuan ({count('error') + count('warn')})</button>
      <button role="tab" aria-selected={tab === 'rekap'} class:on={tab === 'rekap'} onclick={() => (tab = 'rekap')}>Rekap nilai</button>
    </div>
    {#if rekap}
      <p class="summary">
        Persentase nilai akhir yang mengukur tiap capaian: bobot asesmen × porsi Sub-CPMK, dijumlahkan ke CPMK dan CPL.
        {#if rekap.total !== 100}<strong class="bad">Total bobot asesmen {pct(rekap.total)}, bukan 100%.</strong>{/if}
      </p>
      {#snippet line(node, level, ref)}
        <button class="rk l{level}" class:zero={!node.value} onclick={() => onjump(ref)} title={level === 3 ? `${tip(node.item)}\n${fromTip(node)}` : tip(node.item)}>
          <span class="k">{node.item.kode || '(tanpa kode)'}</span>
          {#if level === 3}<span class="pk" title="Jumlah pertemuan yang memuat Sub-CPMK ini">{node.pekan ? `${node.pekan} pertemuan` : 'tanpa pertemuan'}</span>{/if}
          <span class="bar"><span style="width:{Math.min(100, node.value)}%"></span></span>
          <span class="v">{pct(node.value)}</span>
        </button>
      {/snippet}
      {#snippet cpmkTree(m)}
        {@render line(m, 2, `cpmk:${m.item.id}:kode`)}
        {#each m.children as s (s.item.id)}{@render line(s, 3, `subCpmk:${s.item.id}:kode`)}{/each}
      {/snippet}
      <div class="rekap">
        {#each rekap.tree as c (c.item.id)}
          {@render line(c, 1, `cpl:${c.item.id}:kode`)}
          {#each c.children as m (m.item.id)}{@render cpmkTree(m)}{/each}
          {#if !c.children.length}<p class="none">Tidak didukung CPMK mana pun.</p>{/if}
        {/each}
        {#if rekap.orphanCpmk.length}
          <p class="group">CPMK tanpa CPL</p>
          {#each rekap.orphanCpmk as m (m.item.id)}{@render cpmkTree(m)}{/each}
        {/if}
        {#if rekap.orphanSub.length}
          <p class="group">Sub-CPMK tanpa CPMK induk</p>
          {#each rekap.orphanSub as s (s.item.id)}{@render line(s, 3, `subCpmk:${s.item.id}:kode`)}{/each}
        {/if}
        {#if !rekap.tree.length && !rekap.orphanCpmk.length && !rekap.orphanSub.length}<p class="none">Belum ada CPL, CPMK, maupun Sub-CPMK.</p>{/if}
      </div>
      <p class="note">CPMK yang mendukung beberapa CPL dihitung penuh di tiap CPL. Arahkan ke Sub-CPMK untuk melihat asesmen penyumbangnya.</p>
    {:else}
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
  .tabs {
    display: flex;
    gap: 0.25rem;
    border-bottom: 1px solid var(--line);
  }
  .tabs button {
    border: 0;
    background: none;
    color: var(--muted);
    font: inherit;
    font-size: 0.8rem;
    padding: 0.3rem 0.5rem;
    border-bottom: 2px solid transparent;
    margin-bottom: -1px;
    cursor: pointer;
  }
  .tabs button.on {
    color: var(--text);
    font-weight: 600;
    border-bottom-color: var(--accent);
  }
  .bad {
    display: block;
    margin-top: 0.2rem;
    color: var(--danger, #b42318);
    font-weight: 600;
  }
  .rekap {
    overflow: auto;
    display: grid;
    gap: 1px;
  }
  .rk {
    display: grid;
    grid-template-columns: minmax(6.5rem, auto) 1fr 3.4rem;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    padding: 0.2rem 0.4rem;
    border: 0;
    border-radius: 5px;
    background: none;
    color: var(--text);
    font: inherit;
    font-size: 0.8rem;
    text-align: left;
    cursor: pointer;
  }
  .rk:hover {
    background: var(--surface-2);
  }
  .rk.l1 {
    margin-top: 0.35rem;
    font-weight: 700;
  }
  .rk.l2 {
    padding-left: 1rem;
    font-weight: 600;
  }
  .rk.l3 {
    padding-left: 1.9rem;
    grid-template-columns: minmax(5.6rem, auto) auto 1fr 3.4rem;
  }
  .k {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .pk {
    font-size: 0.7rem;
    color: var(--muted);
    white-space: nowrap;
  }
  .bar {
    height: 6px;
    border-radius: 3px;
    background: var(--surface-2);
    box-shadow: inset 0 0 0 1px var(--line);
    overflow: hidden;
  }
  .bar span {
    display: block;
    height: 100%;
    background: var(--accent);
  }
  .rk.l3 .bar span {
    opacity: 0.7;
  }
  .v {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .rk.zero .v,
  .rk.zero .k {
    color: var(--danger, #b42318);
  }
  .group {
    margin: 0.5rem 0 0;
    font-size: 0.72rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    color: var(--muted);
  }
  .none,
  .note {
    margin: 0;
    padding-left: 1rem;
    font-size: 0.75rem;
    color: var(--muted);
  }
  .note {
    padding: 0;
  }
</style>
