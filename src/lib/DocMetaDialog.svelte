<script>
  import { tick } from 'svelte';
  import { META_FIELDS, defaultMeta } from './model.js';

  /**
   * Properti dokumen (judul, penulis, subjek, kata kunci) yang masuk ke metadata PDF/DOCX/XLSX.
   * doc: dokumen aktif; open: dialog tampil; onsave(values) menyimpan isian (kosong = bawaan).
   */
  let { doc, open = $bindable(false), onsave } = $props();

  let dialog;
  let first = $state();
  let values = $state({});
  const defaults = $derived(defaultMeta(doc));

  $effect(() => {
    if (open && !dialog.open) {
      values = Object.fromEntries(META_FIELDS.map(({ key }) => [key, doc.meta?.[key] ?? '']));
      dialog.showModal();
      tick().then(() => first?.focus());
    } else if (!open && dialog.open) dialog.close();
  });

  const HINTS = {
    title: 'Muncul di judul jendela penampil PDF dan hasil pencarian.',
    author: 'Dosen atau unit yang menyusun RPS.',
    subject: 'Ringkasan isi dokumen.',
    keywords: 'Pisahkan dengan koma, mis. basis data, SQL, normalisasi.'
  };

  function save() {
    onsave?.($state.snapshot(values));
    open = false;
  }
</script>

<dialog bind:this={dialog} class="dialog" onclose={() => (open = false)}>
  {#if open}
    <form onsubmit={(e) => (e.preventDefault(), save())}>
      <h2>Properti dokumen</h2>
      <p class="hint">
        Disimpan bersama RPS ini dan dimasukkan ke metadata berkas saat diekspor ke PDF (terlihat di Properti Dokumen
        pada penampil PDF). Kolom yang dikosongkan memakai isi bawaan yang tampil samar.
      </p>
      {#each META_FIELDS as f, i (f.key)}
        <label>
          <span>{f.label}</span>
          {#if i === 0}
            <input bind:this={first} bind:value={values[f.key]} maxlength={f.max} placeholder={defaults[f.key] || '(kosong)'} />
          {:else}
            <input bind:value={values[f.key]} maxlength={f.max} placeholder={defaults[f.key] || '(kosong)'} />
          {/if}
          <small>{HINTS[f.key]}</small>
        </label>
      {/each}
      <footer>
        <button
          type="button"
          class="btn ghost reset"
          disabled={META_FIELDS.every(({ key }) => !values[key]?.trim())}
          onclick={() => (values = Object.fromEntries(META_FIELDS.map(({ key }) => [key, ''])))}
        >Pakai bawaan</button>
        <button type="button" class="btn" onclick={() => (open = false)}>Batal</button>
        <button class="btn primary">Simpan</button>
      </footer>
    </form>
  {/if}
</dialog>

<style>
  .dialog {
    width: min(520px, calc(100vw - 2rem));
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
  h2 {
    margin: 0 0 0.35rem;
    font-size: 1.05rem;
  }
  .hint {
    margin: 0 0 0.85rem;
    font-size: 0.83rem;
    line-height: 1.45;
    color: var(--muted);
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    margin-bottom: 0.7rem;
  }
  label span {
    font-size: 0.85rem;
    font-weight: 600;
  }
  label small {
    font-size: 0.75rem;
    color: var(--muted);
  }
  input {
    width: 100%;
    box-sizing: border-box;
  }
  footer {
    display: flex;
    justify-content: flex-end;
    gap: 0.4rem;
    margin-top: 0.3rem;
  }
  .reset {
    margin-right: auto;
  }
</style>
