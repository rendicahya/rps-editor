<script>
  import { parseDocumentText, formatAngka } from './model.js';
  import { contributions } from './rekap.js';
  import { plainText } from './richtext.js';
  import { dismiss } from './dismiss.js';
  import Icon from './Icon.svelte';
  import * as F from './faculty.svelte.js';

  /**
   * Rekap CPL untuk sekumpulan RPS (mis. isi satu folder prodi): matriks mata kuliah × CPL berisi persentase nilai
   * akhir tiap mata kuliah yang mengukur CPL itu (lihat rekap.js). CPL dicocokkan lewat kodenya, dan bisa dibandingkan
   * dengan katalog kurikulum prodi agar CPL yang belum didukung mata kuliah mana pun terlihat.
   * items: [{ id, title, json }]; onopen(item) membuka RPS-nya.
   */
  let { open = $bindable(false), title = '', items = [], onopen, onclose } = $props();

  let dialog;
  let mode = $state('pct'); // pct | sks | check
  let catalogs = $state([]);
  let catalogId = $state('');
  let catalogState = $state('idle');

  $effect(() => {
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  });

  const norm = (k) => String(k ?? '').trim().toLowerCase().replace(/\s+/g, '');
  const short = (t, n = 160) => {
    const s = plainText(String(t ?? '')).replace(/\s+/g, ' ').trim();
    return s.length > n ? s.slice(0, n) + '…' : s;
  };
  const num = (v) => formatAngka(Math.round(v * 10) / 10);

  /** Baris mata kuliah: { item, doc, kode, nama, prodi, sks, semester, total, cpl: Map kode → % } */
  const parsed = $derived.by(() => {
    const rows = [];
    const bad = [];
    for (const it of items) {
      let doc;
      try {
        doc = parseDocumentText(it.json);
      } catch {
        bad.push(it.title || 'RPS tanpa judul');
        continue;
      }
      const r = contributions(doc);
      const cpl = new Map();
      const label = new Map();
      for (const c of doc.cpl) {
        const k = norm(c.kode);
        if (!k) continue;
        cpl.set(k, (cpl.get(k) ?? 0) + r.cpl.get(c.id));
        if (!label.has(k)) label.set(k, { kode: c.kode.trim(), teks: short(c.teks) });
      }
      const id = doc.identitas;
      rows.push({
        item: it, kode: id.kode || '', nama: id.mataKuliah || it.title || '(tanpa nama)', prodi: id.prodi || '',
        sks: (id.sksTeori ?? 0) + (id.sksPraktikum ?? 0), semester: id.semester || '', total: r.total, cpl, label
      });
    }
    return { rows, bad };
  });

  // Katalog kurikulum: dimuat sekali saat dialog dibuka; dipilih otomatis bila prodi RPS-nya cocok.
  $effect(() => {
    if (!open || catalogState !== 'idle') return;
    catalogState = 'loading';
    F.listCurricula()
      .then((list) => {
        catalogs = list;
        catalogState = 'ready';
        const prodi = new Map();
        for (const r of parsed.rows) if (r.prodi) prodi.set(norm(r.prodi), (prodi.get(norm(r.prodi)) ?? 0) + 1);
        const top = [...prodi].sort((a, b) => b[1] - a[1])[0]?.[0];
        catalogId = list.find((c) => norm(c.nama) === top)?.id ?? '';
      })
      .catch(() => (catalogState = 'error'));
  });
  const catalog = $derived(catalogs.find((c) => c.id === catalogId) ?? null);

  /** Kolom CPL: urutan katalog lebih dulu, lalu kode lain yang dipakai RPS (diurutkan alami). */
  const columns = $derived.by(() => {
    const cols = [];
    const seen = new Set();
    for (const c of catalog?.cpl ?? []) {
      const k = norm(c.kode);
      if (!k || seen.has(k)) continue;
      seen.add(k);
      cols.push({ key: k, kode: c.kode.trim(), teks: short(c.teks), inCatalog: true });
    }
    const extra = [];
    for (const r of parsed.rows) {
      for (const [k, l] of r.label) {
        if (seen.has(k)) continue;
        seen.add(k);
        extra.push({ key: k, kode: l.kode, teks: l.teks, inCatalog: false });
      }
    }
    extra.sort((a, b) => a.kode.localeCompare(b.kode, 'id', { numeric: true }));
    return [...cols, ...extra];
  });

  /** Ringkasan per CPL: jumlah mata kuliah yang menilainya, SKS-setara (Σ SKS × persen), dan rata-rata persen. */
  const totals = $derived(
    new Map(
      columns.map((c) => {
        let n = 0;
        let listed = 0;
        let sks = 0;
        for (const r of parsed.rows) {
          if (!r.cpl.has(c.key)) continue;
          listed++;
          const v = r.cpl.get(c.key);
          if (v > 0) n++;
          sks += (r.sks * v) / 100;
        }
        return [c.key, { n, listed, sks }];
      })
    )
  );
  const unsupported = $derived(columns.filter((c) => !totals.get(c.key).n));
  const thin = $derived(columns.filter((c) => totals.get(c.key).n === 1));
  const outside = $derived(catalog ? columns.filter((c) => !c.inCatalog) : []);
  const offTotal = $derived(parsed.rows.filter((r) => Math.round(r.total * 100) !== 10000));
  const maxSks = $derived(Math.max(1, ...columns.map((c) => totals.get(c.key).sks)));

  function cell(r, c) {
    if (!r.cpl.has(c.key)) return { text: '', cls: 'none' };
    const v = r.cpl.get(c.key);
    if (!v) return { text: mode === 'check' ? '○' : '0', cls: 'zero', alpha: 0 };
    if (mode === 'check') return { text: '✓', cls: 'on', alpha: 0.35 };
    if (mode === 'sks') return { text: num((r.sks * v) / 100), cls: 'on', alpha: Math.min(1, v / 100) * 0.6 + 0.08 };
    return { text: num(v), cls: 'on', alpha: Math.min(1, v / 100) * 0.6 + 0.08 };
  }
  const cellTip = (r, c) => {
    if (!r.cpl.has(c.key)) return `${r.nama} tidak mencantumkan ${c.kode}`;
    const v = r.cpl.get(c.key);
    return v ? `${r.nama}: ${num(v)}% nilai akhir mengukur ${c.kode} (≈ ${num((r.sks * v) / 100)} SKS)` : `${r.nama} mencantumkan ${c.kode}, tetapi tidak ada asesmen yang menilainya`;
  };

  /** CSV (pemisah titik koma, desimal koma) agar langsung terbuka rapi di Excel berbahasa Indonesia. */
  function downloadCsv() {
    const q = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
    const lines = [];
    lines.push(['Kode', 'Mata kuliah', 'SKS', 'Semester', ...columns.map((c) => c.kode)].map(q).join(';'));
    for (const r of parsed.rows) {
      lines.push([r.kode, r.nama, r.sks, r.semester, ...columns.map((c) => (r.cpl.has(c.key) ? num(r.cpl.get(c.key)) : ''))].map(q).join(';'));
    }
    lines.push(['', 'Jumlah mata kuliah yang menilai', '', '', ...columns.map((c) => totals.get(c.key).n)].map(q).join(';'));
    lines.push(['', 'SKS-setara', '', '', ...columns.map((c) => num(totals.get(c.key).sks))].map(q).join(';'));
    lines.push('');
    for (const c of columns) lines.push([c.kode, c.teks].map(q).join(';'));
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `Rekap-CPL-${(title || 'RPS').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '')}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
</script>

<dialog bind:this={dialog} class="dialog" use:dismiss onclose={() => ((open = false), onclose?.())}>
  {#if open}
    <header>
      <div>
        <h2>Rekap CPL</h2>
        <small>{title} · {parsed.rows.length} mata kuliah{parsed.bad.length ? ` · ${parsed.bad.length} RPS rusak dilewati` : ''}</small>
      </div>
      <span class="actions">
        <button type="button" class="btn" onclick={downloadCsv} disabled={!parsed.rows.length} title="Unduh matriks sebagai CSV (bisa dibuka di Excel)"><Icon name="download" size={15} />Unduh CSV</button>
        <button type="button" class="btn" onclick={() => (open = false)}>Tutup</button>
      </span>
    </header>
    <div class="bar">
      <label>
        <span>Katalog</span>
        <select bind:value={catalogId} aria-label="Katalog kurikulum" disabled={catalogState !== 'ready'}>
          <option value="">{catalogState === 'loading' ? 'Memuat…' : catalogState === 'error' ? 'Katalog tidak bisa dimuat' : '(tanpa katalog)'}</option>
          {#each catalogs as c (c.id)}<option value={c.id}>{c.nama}</option>{/each}
        </select>
      </label>
      <span class="seg" role="radiogroup" aria-label="Isi sel">
        <button type="button" role="radio" aria-checked={mode === 'pct'} class:on={mode === 'pct'} onclick={() => (mode = 'pct')} title="Persentase nilai akhir mata kuliah yang mengukur CPL">% nilai</button>
        <button type="button" role="radio" aria-checked={mode === 'sks'} class:on={mode === 'sks'} onclick={() => (mode = 'sks')} title="SKS mata kuliah × persentase: sumbangan mata kuliah terhadap CPL dalam SKS">SKS</button>
        <button type="button" role="radio" aria-checked={mode === 'check'} class:on={mode === 'check'} onclick={() => (mode = 'check')} title="✓ dinilai, ○ dicantumkan tetapi tidak dinilai">✓</button>
      </span>
    </div>
    <div class="body">
      {#if !parsed.rows.length}
        <p class="empty">Tidak ada RPS yang bisa direkap.</p>
      {:else}
        {#if unsupported.length || thin.length || outside.length || offTotal.length}
          <ul class="notes">
            {#if unsupported.length}
              <li class="err"><strong>{unsupported.length} CPL belum dinilai mata kuliah mana pun:</strong> {unsupported.map((c) => c.kode).join(', ')}.</li>
            {/if}
            {#if thin.length}
              <li class="warn"><strong>{thin.length} CPL hanya dinilai satu mata kuliah:</strong> {thin.map((c) => c.kode).join(', ')}.</li>
            {/if}
            {#if outside.length}
              <li class="warn"><strong>{outside.length} kode CPL tidak ada di katalog {catalog.nama}:</strong> {outside.map((c) => c.kode).join(', ')}. Mungkin salah ketik atau dari katalog lama.</li>
            {/if}
            {#if offTotal.length}
              <li class="warn"><strong>{offTotal.length} RPS bobot asesmennya tidak 100%:</strong> {offTotal.map((r) => `${r.kode || r.nama} (${num(r.total)}%)`).join(', ')}; persentasenya tidak sebanding.</li>
            {/if}
          </ul>
        {/if}
        <div class="scroll">
          <table>
            <thead>
              <tr>
                <th class="mk">Mata kuliah</th>
                <th class="n" title="SKS">SKS</th>
                {#each columns as c (c.key)}
                  <th class="cpl" class:out={!c.inCatalog && catalog} class:gap={!totals.get(c.key).n} title="{c.kode}{c.teks ? `: ${c.teks}` : ''}{!c.inCatalog && catalog ? ' (tidak ada di katalog)' : ''}">
                    <span>{c.kode}</span>
                  </th>
                {/each}
              </tr>
            </thead>
            <tbody>
              {#each parsed.rows as r (r.item.id)}
                <tr>
                  <th class="mk">
                    <button type="button" class="link" onclick={() => onopen?.(r.item)} title="Buka RPS ini">
                      {#if r.kode}<span class="kode">{r.kode}</span>{/if}
                      {r.nama}
                    </button>
                    {#if r.semester}<small>{r.semester}</small>{/if}
                  </th>
                  <td class="n">{r.sks}</td>
                  {#each columns as c (c.key)}
                    {@const v = cell(r, c)}
                    <td class="v {v.cls}" style={v.alpha ? `--a:${v.alpha}` : ''} title={cellTip(r, c)}>{v.text}</td>
                  {/each}
                </tr>
              {/each}
            </tbody>
            <tfoot>
              <tr>
                <th class="mk">Mata kuliah yang menilai</th>
                <td class="n"></td>
                {#each columns as c (c.key)}
                  {@const t = totals.get(c.key)}
                  <td class="v" class:bad={!t.n} title="{t.n} menilai, {t.listed} mencantumkan">{t.n}</td>
                {/each}
              </tr>
              <tr>
                <th class="mk" title="Σ SKS mata kuliah × persentase nilai akhirnya yang mengukur CPL">SKS-setara</th>
                <td class="n"></td>
                {#each columns as c (c.key)}
                  {@const t = totals.get(c.key)}
                  <td class="v sks" class:bad={!t.n} title="≈ {num(t.sks)} SKS">
                    {num(t.sks)}
                    <span class="mini"><span style="height:{(t.sks / maxSks) * 100}%"></span></span>
                  </td>
                {/each}
              </tr>
            </tfoot>
          </table>
        </div>
        <p class="note">
          Angka sel = persentase nilai akhir mata kuliah yang mengukur CPL itu (bobot asesmen × porsi Sub-CPMK, dijumlahkan
          lewat CPMK). <b>0</b> = CPL dicantumkan tetapi tidak dinilai; kosong = tidak dicantumkan. CPL dicocokkan lewat
          kodenya. Klik nama mata kuliah untuk membukanya.
        </p>
      {/if}
    </div>
  {/if}
</dialog>

<style>
  .dialog {
    width: min(1280px, calc(100vw - 2rem));
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
    background: rgb(15 23 42 / 0.5);
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.75rem 1rem;
    border-bottom: 1px solid var(--line);
  }
  h2 {
    margin: 0;
    font-size: 1.05rem;
  }
  header small {
    color: var(--muted);
    font-size: 0.8rem;
  }
  .actions {
    display: flex;
    gap: 0.4rem;
  }
  .bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem 1rem;
    padding: 0.55rem 1rem;
    border-bottom: 1px solid var(--line);
    font-size: 0.85rem;
  }
  .bar label {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    color: var(--muted);
  }
  .bar select {
    width: auto;
    max-width: min(22rem, 60vw);
  }
  .seg {
    display: inline-flex;
    border: 1px solid var(--line);
    border-radius: 8px;
    overflow: hidden;
  }
  .seg button {
    border: 0;
    background: none;
    color: var(--muted);
    font: inherit;
    font-size: 0.8rem;
    padding: 0.25rem 0.65rem;
    cursor: pointer;
  }
  .seg button + button {
    border-left: 1px solid var(--line);
  }
  .seg button.on {
    background: var(--accent-soft);
    color: var(--accent);
    font-weight: 600;
  }
  .body {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    padding: 0.75rem 1rem 1rem;
  }
  .notes {
    margin: 0;
    padding: 0;
    list-style: none;
    display: grid;
    gap: 0.25rem;
    font-size: 0.82rem;
  }
  .notes li {
    padding: 0.3rem 0.55rem;
    border-left: 4px solid #d98e04;
    border-radius: 6px;
    background: var(--surface-2);
  }
  .notes li.err {
    border-left-color: var(--danger, #b42318);
  }
  .scroll {
    flex: 1;
    min-height: 0;
    overflow: auto;
    border: 1px solid var(--line);
    border-radius: 8px;
  }
  table {
    border-collapse: separate;
    border-spacing: 0;
    font-size: 0.8rem;
  }
  th,
  td {
    border-bottom: 1px solid var(--line);
    border-right: 1px solid var(--line);
    padding: 0.25rem 0.4rem;
    background: var(--surface);
  }
  thead th {
    position: sticky;
    top: 0;
    z-index: 2;
    background: var(--surface-2);
    vertical-align: bottom;
  }
  tfoot th,
  tfoot td {
    position: sticky;
    z-index: 2;
    background: var(--surface-2);
    font-weight: 600;
  }
  tfoot tr:first-child > * {
    bottom: 2.1rem;
    border-top: 2px solid var(--line);
  }
  tfoot tr:last-child > * {
    bottom: 0;
    height: 2.1rem;
    box-sizing: border-box;
  }
  .mk {
    position: sticky;
    left: 0;
    z-index: 1;
    min-width: 15rem;
    max-width: 22rem;
    text-align: left;
    font-weight: 500;
  }
  thead .mk,
  tfoot .mk {
    z-index: 3;
  }
  .mk small {
    display: block;
    color: var(--muted);
    font-size: 0.7rem;
  }
  .kode {
    color: var(--muted);
    font-variant-numeric: tabular-nums;
    margin-right: 0.3rem;
  }
  .link {
    border: 0;
    background: none;
    padding: 0;
    font: inherit;
    color: var(--text);
    text-align: left;
    cursor: pointer;
  }
  .link:hover {
    color: var(--accent);
    text-decoration: underline;
  }
  .n {
    text-align: center;
    font-variant-numeric: tabular-nums;
  }
  .cpl {
    min-width: 3.4rem;
    font-weight: 600;
    white-space: nowrap;
    text-align: center;
  }
  .cpl.gap {
    color: var(--danger, #b42318);
  }
  .cpl.out span {
    border-bottom: 2px dotted #d98e04;
  }
  td.v {
    text-align: center;
    font-variant-numeric: tabular-nums;
  }
  td.on {
    background: color-mix(in srgb, var(--accent) calc(var(--a, 0.2) * 100%), var(--surface));
  }
  td.zero {
    color: var(--danger, #b42318);
  }
  td.bad {
    color: var(--danger, #b42318);
  }
  td.sks {
    position: relative;
  }
  .mini {
    display: inline-flex;
    align-items: flex-end;
    width: 5px;
    height: 0.9em;
    margin-left: 0.25rem;
    vertical-align: -0.1em;
    background: var(--line);
    border-radius: 2px;
    overflow: hidden;
  }
  .mini span {
    display: block;
    width: 100%;
    background: var(--accent);
  }
  .empty,
  .note {
    margin: 0;
    color: var(--muted);
    font-size: 0.78rem;
  }
</style>
