<script>
  import Icon from './Icon.svelte';
  import { dismiss } from './dismiss.js';
  // Pilihan saat menutup tab yang belum tersimpan. info: { title, where, isNew } atau null.
  // where: nama pustaka tujuan; isNew: RPS belum ada di pustaka itu.
  // onchoice menerima 'save', 'discard', atau 'cancel'.
  let { info, onchoice } = $props();
  let dialog;

  $effect(() => {
    if (info && !dialog.open) dialog.showModal();
    else if (!info && dialog.open) dialog.close();
  });
</script>

<dialog bind:this={dialog} class="dialog" use:dismiss={() => onchoice('cancel')} oncancel={() => onchoice('cancel')}>
  {#if info}
    <h2>Simpan "{info.title}" sebelum ditutup?</h2>
    {#if info.isNew}
      <p>RPS ini belum tersimpan di {info.where}. Kalau ditutup tanpa menyimpan, RPS ini tidak bisa dibuka lagi dari sana.</p>
    {:else}
      <p>Perubahan pada RPS ini belum disimpan ke {info.where}. Kalau ditutup tanpa menyimpan, perubahan itu hilang.</p>
    {/if}
    <footer>
      <button class="btn" onclick={() => onchoice('cancel')}><Icon name="x" size={15} />Tidak jadi menutup</button>
      <button class="btn" onclick={() => onchoice('discard')}><Icon name="trash" size={15} />Tutup tanpa menyimpan</button>
      <!-- svelte-ignore a11y_autofocus -->
      <button class="btn primary" autofocus onclick={() => onchoice('save')}><Icon name="save" size={15} />Simpan dan tutup</button>
    </footer>
  {/if}
</dialog>

<style>
  .dialog {
    width: min(590px, calc(100vw - 2rem));
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
    margin: 0 0 0.5rem;
    font-size: 1.05rem;
    overflow-wrap: anywhere;
  }
  p {
    margin: 0 0 1rem;
    line-height: 1.5;
    font-size: 0.9rem;
  }
  footer {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 0.4rem;
  }
</style>
