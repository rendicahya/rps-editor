<script>
  // Pilihan saat penyimpanan ke Pustaka Daring bertabrakan. info: { canOverwrite, by, at, message } atau null.
  let { info, onchoice } = $props();
  let dialog;

  $effect(() => {
    if (info && !dialog.open) dialog.showModal();
    else if (!info && dialog.open) dialog.close();
  });

  const when = (ms) => new Date(ms).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
</script>

<dialog bind:this={dialog} class="dialog" oncancel={() => onchoice('cancel')}>
  {#if info}
    <h2>{info.canOverwrite ? 'RPS sudah diubah orang lain' : 'RPS tidak bisa disimpan lagi'}</h2>
    {#if info.canOverwrite}
      <p>
        {info.by} mengubah RPS ini pada {when(info.at)}, setelah Anda membukanya. Kalau Anda menimpanya, versi {info.by} tetap
        tersimpan di Riwayat dan masih bisa dikembalikan.
      </p>
    {:else}
      <p>{info.message} Pekerjaan Anda tidak hilang, karena masih bisa disimpan sebagai salinan milik Anda.</p>
    {/if}
    <footer>
      <button class="btn" onclick={() => onchoice('cancel')}>Batal</button>
      <button class="btn" class:primary={!info.canOverwrite} onclick={() => onchoice('copy')}>Simpan sebagai salinan</button>
      {#if info.canOverwrite}<button class="btn primary" onclick={() => onchoice('overwrite')}>Timpa dengan versi saya</button>{/if}
    </footer>
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
    margin: 0 0 0.5rem;
    font-size: 1.05rem;
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
