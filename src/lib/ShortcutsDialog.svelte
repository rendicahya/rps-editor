<script>
  import Icon from './Icon.svelte';
  import { dismiss } from './dismiss.js';

  // Daftar pintasan keyboard (Ctrl+/ atau menu Bantuan). Isinya mengikuti penanganan tombol di App, RichField,
  // PageFields, CommentPanel, FacultyPane, dan Tour; perbarui di sini bila pintasannya berubah.
  let { open = $bindable(false) } = $props();
  let dialog;

  $effect(() => {
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  });

  const mac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  const keys = (s) => (mac ? s.replaceAll('Ctrl', '⌘').replaceAll('Alt', '⌥') : s);

  const GROUPS = [
    [
      'Umum',
      [
        ['Ctrl+S', 'Simpan ke tempat terakhir (Pustaka atau berkas)'],
        ['Ctrl+Shift+S', 'Simpan sebagai berkas .rps baru'],
        ['Ctrl+O', 'Buka berkas .rps (atau PDF/Word hasil ekspor)'],
        ['Alt+W', 'Tutup tab RPS'],
        ['Ctrl+Z', 'Urungkan'],
        ['Ctrl+Y · Ctrl+Shift+Z', 'Ulangi'],
        ['Ctrl+F · Ctrl+H', 'Cari dan ganti'],
        ['Ctrl+Shift+P', 'Pratinjau dan unduh PDF'],
        ['Ctrl+P', 'Cetak'],
        ['Ctrl+roda mouse', 'Perbesar atau perkecil halaman'],
        ['Esc', 'Tutup menu, panel, atau dialog'],
        ['Ctrl+/', 'Daftar pintasan ini']
      ]
    ],
    [
      'Menyunting halaman',
      [
        ['Ctrl+B · Ctrl+I · Ctrl+U', 'Tebal, miring, garis bawah'],
        ['Ctrl+Shift+7', 'Daftar bernomor (isian beberapa baris)'],
        ['Ctrl+Shift+8', 'Daftar poin (isian beberapa baris)'],
        ['Shift+F3', 'Ganti huruf besar/kecil'],
        ['Shift+Enter', 'Baris baru di dalam isian'],
        ['Tab', 'Ke isian berikutnya'],
        ['Enter', 'Daftar nama, metode, pustaka: butir baru'],
        ['Backspace', 'Di awal butir: gabung dengan butir sebelumnya'],
        ['↑ · ↓', 'Di awal/akhir butir: pindah ke butir sebelumnya/berikutnya'],
        ['Esc', 'Batalkan seret baris'],
        ['Klik kanan', 'Tambah, pindah, duplikat, atau hapus baris']
      ]
    ],
    ['Komentar', [['Ctrl+Enter', 'Kirim komentar atau balasan']]],
    [
      'Daftar Pustaka (Lokal dan Daring)',
      [
        ['Ctrl+F', 'Cari'],
        ['↑ · ↓ · Home · End', 'Pindah baris'],
        ['PageUp · PageDown', 'Lompat 10 baris'],
        ['Shift+↑ · Shift+↓', 'Pilih rentang'],
        ['Spasi', 'Pilih atau batal pilih baris'],
        ['Ctrl+A', 'Pilih semua'],
        ['Ctrl+klik · Shift+klik', 'Pilih satu per satu atau rentang'],
        ['Enter', 'Buka RPS atau folder'],
        ['Backspace · Alt+↑', 'Ke folder induk'],
        ['F2', 'Ubah nama'],
        ['Delete', 'Hapus (ke Recycle bin / Baru dihapus)'],
        ['Ctrl+X · Ctrl+V', 'Potong, lalu tempel di folder lain untuk memindahkan'],
        ['Ctrl+Z', 'Urungkan pindah, hapus, atau ubah nama terakhir'],
        ['Shift+F10', 'Menu baris'],
        ['Esc', 'Batal pilih']
      ]
    ],
    ['Tur', [['← · →', 'Langkah sebelumnya atau berikutnya']]]
  ];
</script>

<dialog bind:this={dialog} class="dialog" use:dismiss onclose={() => (open = false)} aria-labelledby="shortcuts-title">
  <header>
    <h2 id="shortcuts-title"><Icon name="keyboard" size={18} />Pintasan keyboard</h2>
    <button type="button" class="x" onclick={() => (open = false)} aria-label="Tutup"><Icon name="x" size={14} /></button>
  </header>
  <div class="cols">
    {#each GROUPS as [title, rows] (title)}
      <section>
        <h3>{title}</h3>
        <dl>
          {#each rows as [k, what] (k + what)}
            <dt>
              {#each keys(k).split(' · ') as alt, j (j)}
                {#if j}<span class="or">/</span>{/if}
                {#each alt.split(/\+(?=.)/) as part, n (n)}{#if n}<span class="plus">+</span>{/if}<kbd>{part}</kbd>{/each}
              {/each}
            </dt>
            <dd>{what}</dd>
          {/each}
        </dl>
      </section>
    {/each}
  </div>
</dialog>

<style>
  .dialog {
    width: min(880px, calc(100vw - 2rem));
    max-height: calc(100dvh - 2rem);
    border: 0;
    border-radius: 14px;
    padding: 1rem 1.2rem 1.2rem;
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
    margin-bottom: 0.6rem;
  }
  h2 {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    margin: 0;
    font-size: 1.1rem;
  }
  .x {
    border: 0;
    background: none;
    color: var(--muted);
    cursor: pointer;
  }
  .cols {
    columns: 2 360px;
    column-gap: 2rem;
  }
  section {
    break-inside: avoid;
    margin-bottom: 1rem;
  }
  h3 {
    margin: 0 0 0.35rem;
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--muted);
  }
  dl {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 0.3rem 0.9rem;
    margin: 0;
    font-size: 0.86rem;
  }
  dt {
    white-space: nowrap;
  }
  dd {
    margin: 0;
    line-height: 1.4;
  }
  kbd {
    display: inline-block;
    min-width: 1.4em;
    padding: 0.05rem 0.35rem;
    border: 1px solid var(--line);
    border-bottom-width: 2px;
    border-radius: 4px;
    background: var(--surface-2);
    font: 600 0.75rem var(--ui-font);
    text-align: center;
  }
  .plus,
  .or {
    margin: 0 0.15rem;
    color: var(--muted);
    font-size: 0.75rem;
  }
</style>
