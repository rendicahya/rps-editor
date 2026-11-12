<script>
  import Preview from './Preview.svelte';
  import { dismiss } from './dismiss.js';

  /** pdf: objek jsPDF hasil exportPdf; pages: tata letak (cadangan bila browser tak bisa menampilkan PDF). */
  let { pdf = $bindable(null), pages, filename, fontNote = '', ondownload } = $props();

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

  // Nama berkas unduhan bisa diubah; diisi ulang setiap pratinjau baru dibuka.
  let name = $state('');
  $effect(() => {
    if (pdf) name = filename.replace(/\.pdf$/i, '');
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
      <h2>Pratinjau PDF</h2>
      <small>{size}{fontNote ? ' · ' + fontNote : ''}</small>
    </div>
    <div class="actions">
      <label class="fname" title="Nama berkas PDF yang diunduh">
        <input bind:value={name} aria-label="Nama berkas PDF" onkeydown={(e) => e.key === 'Enter' && download()} />
        <span>.pdf</span>
      </label>
      <button type="button" class="btn" onclick={() => (pdf = null)}>Kembali ke editor</button>
      <button type="button" class="btn primary" onclick={download}>Unduh PDF</button>
    </div>
  </header>
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
