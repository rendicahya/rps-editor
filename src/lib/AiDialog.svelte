<script>
  import Icon from './Icon.svelte';
  import { aiPrompt, aiImportPrompt, aiRevisePrompt } from './aiPrompt.js';
  import * as ui from './ask.svelte.js';
  import { docTitle } from './model.js';
  import { app } from './store.svelte.js';
  import { dismiss } from './dismiss.js';

  /** onpaste(text, revise) → true bila jawaban berhasil dibuka. */
  let { open = $bindable(false), docKey, onpaste } = $props();

  let dialog;
  // mode: 'new' = susun RPS baru dari deskripsi; 'import' = salin RPS lama yang dilampirkan di chat AI;
  // 'revise' = ubah dokumen yang sedang dibuka sesuai instruksi.
  const blank = { mode: 'new', description: '', note: '', instruction: '', keepKop: false, answer: '' };
  function newDraft() {
    const d = $state({ ...blank });
    return d;
  }
  // Isian disimpan per dokumen: dokumen baru mulai kosong, kembali ke tab lama memulihkan drafnya.
  const drafts = new Map();
  const draft = $derived.by(() => {
    if (!drafts.has(docKey)) drafts.set(docKey, newDraft());
    return drafts.get(docKey);
  });
  let copied = $state(false);
  // Hanya dihitung saat dialog terbuka: prompt revisi memuat seluruh dokumen, dan tanggal di prompt
  // RPS baru harus tanggal saat dialog dibuka, bukan saat aplikasi dimuat.
  const prompt = $derived(
    !open
      ? ''
      : draft.mode === 'import'
        ? aiImportPrompt(draft.note, draft.keepKop)
        : draft.mode === 'revise'
          ? aiRevisePrompt($state.snapshot(app.doc), draft.instruction)
          : aiPrompt(draft.description)
  );

  $effect(() => {
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  });

  async function copy() {
    try {
      await navigator.clipboard.writeText(prompt);
      copied = true;
      setTimeout(() => (copied = false), 2000);
    } catch {
      ui.alert('Gagal menyalin otomatis. Buka "Lihat prompt" lalu salin secara manual.');
    }
  }

  async function pasteAnswer() {
    let text;
    try {
      text = await navigator.clipboard.readText();
    } catch {
      ui.alert('Browser tidak mengizinkan membaca clipboard. Klik kolom jawaban lalu tekan Ctrl+V.');
      return;
    }
    if (text.trim()) draft.answer = text;
    else ui.alert('Clipboard kosong. Salin dulu jawaban dari asisten AI.');
  }

  function load() {
    const d = draft; // onpaste bisa memindahkan dialog ke dokumen lain
    if (onpaste(d.answer, d.mode === 'revise')) {
      Object.assign(d, blank, { mode: d.mode });
      open = false;
    }
  }
</script>

<dialog bind:this={dialog} class="dialog" use:dismiss onclose={() => (open = false)}>
  <header>
    <h2>RPS dengan bantuan AI</h2>
    <button type="button" class="x" onclick={() => (open = false)} aria-label="Tutup"><Icon name="x" size={14} /></button>
  </header>
  <div class="seg" role="tablist" aria-label="Jenis">
    <button role="tab" aria-selected={draft.mode === 'new'} class:on={draft.mode === 'new'} onclick={() => (draft.mode = 'new')}><Icon name="filePlus" size={15} />Susun RPS baru</button>
    <button role="tab" aria-selected={draft.mode === 'import'} class:on={draft.mode === 'import'} onclick={() => (draft.mode = 'import')}><Icon name="upload" size={15} />Impor RPS lama</button>
    <button role="tab" aria-selected={draft.mode === 'revise'} class:on={draft.mode === 'revise'} onclick={() => (draft.mode = 'revise')}><Icon name="pencil" size={15} />Revisi RPS ini</button>
  </div>
  {#if draft.mode === 'new'}
    <p>Minta asisten AI menyusun RPS dari deskripsi mata kuliah, lalu buka hasilnya di sini untuk diperiksa, dirapikan, dan diekspor.</p>
  {:else if draft.mode === 'revise'}
    <p>
      Minta asisten AI mengubah dokumen yang sedang dibuka{docTitle(app.doc) ? ` (${docTitle(app.doc)})` : ''}, misalnya
      menambah Lembar Kerja, merapikan indikator, atau menyesuaikan bobot. Hasilnya menggantikan dokumen ini dan bisa di-Undo.
    </p>
  {:else}
    <p>
      Ubah RPS lama (PDF, Word, atau foto/pindaian) menjadi dokumen yang bisa diedit di sini. Asisten AI membaca berkasnya,
      termasuk tabel dan matriksnya, lalu menyalin isinya ke format aplikasi ini.
    </p>
  {/if}

  <section>
    <h3><span class="num">1</span><span>{#if draft.mode === 'import'}Lampirkan RPS lama ke AI{:else if draft.mode === 'revise'}Tulis instruksi revisi{:else}Tulis deskripsi mata kuliah{/if}</span></h3>
    {#if draft.mode === 'revise'}
      <label class="field">
        <textarea class="big" rows="10" aria-label="Instruksi revisi" bind:value={draft.instruction} placeholder="Contoh: tambahkan Lembar Kerja untuk CB-2; tulis ulang indikator pertemuan agar terukur; sesuaikan bobot pertemuan agar total 100%."></textarea>
      </label>
    {:else if draft.mode === 'new'}
      <label class="field">
        <textarea class="big" rows="10" aria-label="Deskripsi mata kuliah" bind:value={draft.description} placeholder="Contoh: Basis Data (COM60023), prodi Teknik Informatika, 3 SKS (2 teori, 1 praktikum), semester genap 2025/2026, wajib. Dosen: … CPL005, CPMK-061 … Pokok bahasan: model relasional, SQL, normalisasi, transaksi. Penilaian: 2 tugas case based, kuis, UTS, UAS, praktikum."></textarea>
      </label>
      <small class="hint">Sebutkan kode dan teks CPL/CPMK dari kurikulum bila ada; atau pakai tombol Kurikulum setelah hasilnya dibuka.</small>
    {:else}
      <p>Buka chat baru di asisten AI, lalu lampirkan berkas RPS lama (unggah PDF/DOCX atau foto setiap halaman).</p>
      <label class="check">
        <input type="checkbox" bind:checked={draft.keepKop} />
        <span>Salin nama universitas dan fakultas dari dokumen (bila tidak, diisi Universitas Brawijaya, FILKOM)</span>
      </label>
      <label class="field">
        <textarea rows="4" aria-label="Catatan untuk AI (opsional)" bind:value={draft.note} placeholder="Catatan untuk AI (opsional). Contoh: tahun akademik diganti 2026/2027; tanggal penyusunan diganti hari ini."></textarea>
      </label>
    {/if}
  </section>

  <section>
    <h3><span class="num">2</span><span>Salin prompt</span></h3>
    <div class="row">
      <button type="button" class="btn primary" onclick={copy}>{copied ? 'Berhasil disalin ✓' : 'Salin'}</button>
      <details>
        <summary>Lihat prompt</summary>
        <textarea class="prompt" readonly rows="10" value={prompt} onfocus={(e) => e.currentTarget.select()}></textarea>
      </details>
    </div>
  </section>

  <section>
    <h3><span class="num">3</span><span>Masukkan prompt yang sudah disalin ke AI</span></h3>
    {#if draft.mode === 'import'}
      <small class="hint">Kirim di chat yang sama dengan lampiran RPS lama.</small>
    {/if}
  </section>

  <section>
    <h3><span class="num">4</span><span>Tempel jawaban dari AI</span></h3>
    <label class="field">
      <textarea rows="5" class="mono" aria-label="Jawaban AI" bind:value={draft.answer} placeholder={'{ "format": "rps-editor", … }'}></textarea>
    </label>
    {#if navigator.clipboard?.readText}
      <button type="button" class="btn paste" onclick={pasteAnswer}><Icon name="paste" size={15} />Tempel</button>
    {/if}
    {#if draft.mode === 'revise'}
      <small class="hint">
        Bila AI memberikan berkas .json, buka berkasnya di editor teks lalu tempel isinya di sini.
      </small>
    {:else if draft.mode === 'import'}
      <small class="hint">Bandingkan hasilnya dengan dokumen asli, terutama relasi CPMK/Sub-CPMK dan bobot penilaian. Tombol Periksa membantu menemukan yang janggal.</small>
    {:else}
      <small class="hint">Bila AI memberikan berkas .json, buka berkasnya di editor teks lalu tempel isinya di sini. Jawaban yang panjang kadang terpotong: minta AI melanjutkan sampai JSON lengkap.</small>
    {/if}
  </section>

  <div class="actions">
    <h3><span class="num">5</span><span>{draft.mode === 'revise' ? 'Terapkan revisi' : 'Buka di editor'}</span></h3>
    <button type="button" class="btn primary" disabled={!draft.answer.trim()} onclick={load}>{draft.mode === 'revise' ? 'Terapkan revisi' : 'Buka di editor'}</button>
  </div>
</dialog>

<style>
  .dialog {
    width: min(820px, calc(100vw - 2rem));
    border: 0;
    border-radius: 14px;
    padding: 1.1rem 1.2rem;
    box-shadow: 0 20px 50px rgb(0 0 0 / 0.25);
    background: var(--surface);
    color: var(--text);
  }
  .dialog::backdrop {
    background: rgb(15 23 42 / 0.45);
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    margin-bottom: 0.6rem;
  }
  h2 {
    margin: 0;
    font-size: 1.1rem;
  }
  .x {
    border: 0;
    background: none;
    font-size: 1.4rem;
    line-height: 1;
    color: var(--muted);
    cursor: pointer;
  }
  h3 {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin: 0 0 0.5rem;
    font-size: 0.95rem;
  }
  .num {
    display: inline-grid;
    place-items: center;
    width: 1.4rem;
    height: 1.4rem;
    border-radius: 50%;
    background: var(--accent);
    color: #fff;
    font-size: 0.8rem;
  }
  p {
    margin: 0 0 0.9rem;
    line-height: 1.45;
    font-size: 0.9rem;
  }
  section {
    margin-bottom: 1rem;
  }
  .seg {
    display: flex;
    margin-bottom: 0.8rem;
    border: 1px solid var(--line);
    border-radius: 8px;
    overflow: hidden;
  }
  .seg button {
    flex: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    padding: 0.45rem 0.6rem;
    border: 0;
    background: var(--surface);
    color: var(--text);
    font: 600 0.85rem var(--ui-font);
    cursor: pointer;
  }
  .seg button + button {
    border-left: 1px solid var(--line);
  }
  .seg button.on {
    background: var(--accent);
    color: #fff;
  }
  .check {
    display: flex;
    gap: 0.45rem;
    align-items: flex-start;
    margin-bottom: 0.6rem;
    font-size: 0.85rem;
  }
  .check input {
    margin-top: 0.15rem;
  }
  .row {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
    flex-wrap: wrap;
  }
  details {
    flex: 1;
    min-width: 12rem;
    font-size: 0.85rem;
  }
  summary {
    cursor: pointer;
    padding: 0.4rem 0;
    color: var(--muted);
  }
  .prompt,
  .mono {
    width: 100%;
    font-family: ui-monospace, Consolas, monospace;
    font-size: 0.78rem;
  }
  .big {
    width: 100%;
    min-height: min(14rem, 35dvh);
    resize: vertical;
    line-height: 1.5;
  }
  .paste {
    display: flex;
    width: fit-content;
    margin-bottom: 0.5rem;
  }
  .actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }
  .actions h3 {
    margin: 0;
  }
</style>
