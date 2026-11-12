<script>
  import Preview from './Preview.svelte';
  import { dismiss } from './dismiss.js';
  import { WATERMARKS } from './pdf.js';

  /**
   * pdf: objek jsPDF hasil exportPdf; pages: tata letak (cadangan bila browser tak bisa menampilkan PDF).
   * protect, watermark: pilihan saat ini; onoptions({ protect?, watermark? }) membuat ulang PDF.
   */
  let { pdf = $bindable(null), pages, filename, fontNote = '', ondownload, protect = 'none', watermark = '', part = 'all', busy = false, onoptions, onmeta, title = 'Pratinjau PDF' } = $props();

  // Watermark: '' (tanpa), salah satu WATERMARKS, atau 'custom' dengan teks bebas.
  let wmChoice = $state('');
  let wmText = $state('');
  $effect(() => {
    const w = watermark;
    const c = !w ? '' : WATERMARKS.includes(w) ? w : 'custom';
    wmChoice = c;
    if (c === 'custom') wmText = w;
  });
  let wmInput = $state();
  function chooseWatermark(v) {
    wmChoice = v;
    if (v !== 'custom') return onoptions?.({ watermark: v });
    wmText ||= '';
    queueMicrotask(() => wmInput?.focus());
    if (wmText.trim()) onoptions?.({ watermark: wmText });
  }
  const applyCustom = () => wmText.trim() !== watermark && onoptions?.({ watermark: wmText });

  const PROTECT = [
    ['none', 'Bisa disalin', 'Teks bisa diseleksi dan disalin. PDF satu RPS bisa dibuka lagi di RPS Editor untuk diedit.'],
    ['lock', 'Dikunci', 'Teks tetap tajam, tetapi PDF hanya boleh dicetak: salin dan ubah dilarang. Dipatuhi Acrobat, Chrome, dan Edge; sebagian penampil (mis. Firefox) mengabaikannya. Tidak bisa dibuka lagi di RPS Editor.'],
    ['image', 'Gambar', 'Setiap halaman menjadi gambar sehingga teks sama sekali tidak bisa diseleksi di penampil mana pun. Berkas lebih besar dan tidak bisa dibuka lagi di RPS Editor.']
  ];
  const protectInfo = $derived(PROTECT.find(([v]) => v === protect) ?? PROTECT[0]);

  let dialog;
  // Browser seluler (mis. Chrome Android) tidak bisa menampilkan PDF di dalam halaman.
  const inline = navigator.pdfViewerEnabled !== false;
  const blob = $derived(pdf ? pdf.output('blob') : null);
  const url = $derived(blob ? URL.createObjectURL(blob) : null);
  const PAPERS = { A3: [297, 420], A4: [210, 297], A5: [148, 210], Letter: [215.9, 279.4], Legal: [215.9, 355.6], F4: [215, 330] };
  const size = $derived.by(() => {
    if (!pdf) return '';
    const w = pdf.internal.pageSize.getWidth();
    const h = pdf.internal.pageSize.getHeight();
    const [a, b] = [Math.min(w, h), Math.max(w, h)];
    const name = Object.keys(PAPERS).find((k) => Math.abs(PAPERS[k][0] - a) < 1 && Math.abs(PAPERS[k][1] - b) < 1);
    const mm = `${Math.round(w)} × ${Math.round(h)} mm`;
    const n = pdf.getNumberOfPages();
    return `${name ? `${name} ${w > h ? 'landscape' : 'portrait'} (${mm})` : mm} · ${n} halaman`;
  });

  $effect(() => {
    const u = url;
    return () => u && URL.revokeObjectURL(u);
  });

  $effect(() => {
    if (pdf && !dialog.open) dialog.showModal();
    else if (!pdf && dialog.open) dialog.close();
  });

  // Nama berkas unduhan bisa diubah; diisi ulang setiap pratinjau baru dibuka (bukan saat PDF dibuat ulang).
  let name = $state('');
  let shown = false;
  $effect(() => {
    if (pdf && !shown) name = filename.replace(/\.pdf$/i, '');
    shown = !!pdf;
  });

  function download() {
    const n = name.trim().replace(/[\\/:*?"<>|]+/g, '-').replace(/\.pdf$/i, '') || filename.replace(/\.pdf$/i, '');
    pdf.save(n + '.pdf');
    ondownload?.();
    pdf = null;
  }
</script>

<dialog bind:this={dialog} class="dialog" use:dismiss onclose={() => (pdf = null)}>
  <header>
    <div>
      <h2>{title}</h2>
      <small>{size}{fontNote ? ' · ' + fontNote : ''}</small>
    </div>
    <div class="actions">
      <label class="fname" title="Nama berkas PDF yang diunduh">
        <input bind:value={name} aria-label="Nama berkas PDF" onkeydown={(e) => e.key === 'Enter' && download()} />
        <span>.pdf</span>
      </label>
      <button type="button" class="btn" onclick={() => (pdf = null)}>Kembali ke editor</button>
      <button type="button" class="btn primary" disabled={busy} onclick={download}>Unduh PDF</button>
    </div>
  </header>
  <div class="opts">
    <label title="Halaman yang ikut diekspor: RPS (sampul sampai tabel pertemuan), Lembar Kerja, atau keduanya">
      <span>Halaman</span>
      <select value={part} disabled={busy} onchange={(e) => onoptions?.({ part: e.currentTarget.value })} aria-label="Halaman yang diekspor">
        <option value="all">Semua halaman</option>
        <option value="rps">RPS tanpa Lembar Kerja</option>
        <option value="lk">Lembar Kerja saja</option>
      </select>
    </label>
    <label title={protectInfo[2]}>
      <span>Isi PDF</span>
      <select value={protect} disabled={busy} onchange={(e) => onoptions?.({ protect: e.currentTarget.value })} aria-label="Perlindungan isi PDF">
        {#each PROTECT as [v, label] (v)}<option value={v}>{label}</option>{/each}
      </select>
    </label>
    <label title="Teks miring dan samar di tengah setiap halaman">
      <span>Watermark</span>
      <select value={wmChoice} onchange={(e) => chooseWatermark(e.currentTarget.value)} aria-label="Watermark">
        <option value="">Tanpa</option>
        {#each WATERMARKS as w (w)}<option value={w}>{w}</option>{/each}
        <option value="custom">Teks lain…</option>
      </select>
    </label>
    {#if wmChoice === 'custom'}
      <input
        bind:this={wmInput}
        bind:value={wmText}
        class="wm-text"
        maxlength="60"
        placeholder="Ketik teks watermark, lalu Enter"
        aria-label="Teks watermark"
        onchange={applyCustom}
        onkeydown={(e) => e.key === 'Enter' && (e.preventDefault(), applyCustom())}
      />
    {/if}
    {#if onmeta}
      <button type="button" class="btn ghost meta" onclick={onmeta} title="Judul, penulis, subjek, dan kata kunci di metadata PDF">Properti dokumen…</button>
    {/if}
    {#if busy}<span class="busy">Membuat ulang PDF…</span>{/if}
  </div>
  {#if protect !== 'none'}
    <p class="protect-note">{protectInfo[2]}</p>
  {/if}
  {#if url}
    {#if inline}
      <iframe src={url + '#view=FitH'} title="Pratinjau PDF"></iframe>
    {:else}
      <div class="fallback">
        <p class="note">
          Browser ini tidak bisa menampilkan PDF secara langsung. Tampilan di bawah sama dengan isi PDF, atau
          <a href={url} target="_blank" rel="noopener">buka PDF di tab baru</a>.
        </p>
        <Preview {pages} editable={false} />
      </div>
    {/if}
  {/if}
</dialog>

<style>
  .dialog {
    width: min(1200px, calc(100vw - 2rem));
    height: calc(100dvh - 2rem);
    max-height: none;
    border: 0;
    border-radius: 14px;
    padding: 0;
    box-shadow: 0 20px 50px rgb(0 0 0 / 0.25);
    background: var(--surface);
    color: var(--text);
    overflow: hidden;
  }
  .dialog[open] {
    display: flex;
    flex-direction: column;
  }
  .dialog::backdrop {
    background: rgb(15 23 42 / 0.55);
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    flex-wrap: wrap;
    padding: 0.75rem 1rem;
    border-bottom: 1px solid var(--line);
  }
  h2 {
    margin: 0;
    font-size: 1.05rem;
  }
  small {
    color: var(--muted);
    font-size: 0.78rem;
  }
  .actions {
    display: flex;
    gap: 0.5rem;
  }
  .actions {
    flex-wrap: wrap;
    align-items: center;
  }
  .opts {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.5rem 1rem;
    padding: 0.5rem 1rem;
    border-bottom: 1px solid var(--line);
    font-size: 0.85rem;
  }
  .opts label {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    color: var(--muted);
  }
  .opts select {
    width: auto;
  }
  .opts .wm-text {
    width: min(18rem, 60vw);
  }
  .opts .meta {
    padding: 0.25rem 0.6rem;
    font-size: 0.85rem;
  }
  .busy {
    color: var(--muted);
    font-style: italic;
  }
  .protect-note {
    margin: 0;
    padding: 0.45rem 1rem;
    font-size: 0.8rem;
    line-height: 1.4;
    background: var(--warn-bg);
    border-bottom: 1px solid var(--warn-line);
  }
  .fname {
    display: flex;
    align-items: center;
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 0 0.5rem;
    background: var(--bg);
    font-size: 0.85rem;
  }
  .fname input {
    border: 0;
    background: none;
    color: var(--text);
    font: inherit;
    width: min(18rem, 50vw);
    padding: 0.4rem 0;
    outline: none;
  }
  .fname:focus-within {
    border-color: var(--accent, #2563eb);
  }
  .fname span {
    color: var(--muted);
  }
  iframe {
    flex: 1;
    width: 100%;
    border: 0;
    background: #525659;
  }
  .fallback {
    flex: 1;
    overflow: auto;
    background: var(--bg);
  }
  .note {
    margin: 0;
    padding: 0.6rem 1rem 0;
    font-size: 0.82rem;
    color: var(--muted);
  }
</style>
