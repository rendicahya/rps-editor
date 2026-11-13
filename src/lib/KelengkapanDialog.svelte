<script>
  import { parseDocumentText, formatTanggal } from './model.js';
  import { checkDocument } from './validate.js';
  import { review, isReviewDue } from './review.svelte.js';
  import { dismiss } from './dismiss.js';
  import Icon from './Icon.svelte';
  import * as F from './faculty.svelte.js';

  /**
   * Laporan kelengkapan RPS untuk sekumpulan RPS daring (mis. isi folder prodi), untuk pengelola prodi:
   * hasil Periksa tiap RPS (error/peringatan), komentar terbuka, tinjauan berkala, dan perbandingan dengan daftar
   * mata kuliah di katalog kurikulum (mata kuliah yang belum punya RPS, kode di luar katalog, SKS berbeda, RPS ganda).
   * items: [{ id, title, json, since, updatedAt, updatedByName }]; notes(item) = jumlah komentar terbuka;
   * onopen(item) membuka RPS-nya.
   */
  let { open = $bindable(false), title = '', items = [], notes = () => 0, onopen, onclose } = $props();

  let dialog;
  let only = $state(false); // hanya yang perlu ditindaklanjuti
  let catalogs = $state([]);
  let catalogId = $state('');
  let catalogState = $state('idle');

  $effect(() => {
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  });

  const norm = (k) => String(k ?? '').trim().toLowerCase().replace(/\s+/g, '');
  const day = (ms) => (ms ? formatTanggal(new Date(ms - new Date(ms).getTimezoneOffset() * 60000).toISOString().slice(0, 10)) : '');

  /** Baris per RPS: identitas, jumlah temuan Periksa per tingkat, komentar terbuka, dan tinjauan. */
  const parsed = $derived.by(() => {
    const rows = [];
    for (const it of items) {
      let doc = null;
      try {
        doc = parseDocumentText(it.json);
      } catch {}
      const id = doc?.identitas ?? {};
      const found = doc ? checkDocument(doc) : [];
      rows.push({
        item: it,
        broken: !doc,
        kode: id.kode?.trim() || '',
        nama: id.mataKuliah?.trim() || it.title || '(tanpa nama)',
        prodi: id.prodi || '',
        semester: id.semester || '',
        tahun: id.tahunAkademik || '',
        sks: (id.sksTeori ?? 0) + (id.sksPraktikum ?? 0),
        dosen: (id.dosenPengelola ?? []).map((d) => d.trim()).filter(Boolean),
        errors: found.filter((f) => f.level === 'error'),
        warns: found.filter((f) => f.level === 'warn'),
        notes: notes(it),
        due: isReviewDue(it.since, review.years)
      });
    }
    return rows.sort((a, b) => (a.kode || '~').localeCompare(b.kode || '~', 'id', { numeric: true }) || a.nama.localeCompare(b.nama, 'id'));
  });

  // Katalog kurikulum: dimuat sekali; dipilih otomatis menurut prodi yang paling banyak di RPS-nya.
  $effect(() => {
    if (!open || catalogState !== 'idle') return;
    catalogState = 'loading';
    F.listCurricula()
      .then((list) => {
        catalogs = list;
        catalogState = 'ready';
        const prodi = new Map();
        for (const r of parsed) if (r.prodi) prodi.set(norm(r.prodi), (prodi.get(norm(r.prodi)) ?? 0) + 1);
        const top = [...prodi].sort((a, b) => b[1] - a[1])[0]?.[0];
        catalogId = list.find((c) => norm(c.nama) === top)?.id ?? '';
      })
      .catch(() => (catalogState = 'error'));
  });
  const catalog = $derived(catalogs.find((c) => c.id === catalogId) ?? null);
  const catalogMk = $derived((catalog?.mk ?? []).filter((m) => norm(m.kode)));
  const mkByKode = $derived(new Map(catalogMk.map((m) => [norm(m.kode), m])));

  /** Banyaknya RPS per kode: kode yang punya lebih dari satu RPS ditandai. */
  const perKode = $derived.by(() => {
    const m = new Map();
    for (const r of parsed) if (r.kode) m.set(norm(r.kode), (m.get(norm(r.kode)) ?? 0) + 1);
    return m;
  });

  /** Catatan katalog per baris: kode ganda, di luar katalog, SKS berbeda. */
  function catalogNotes(r) {
    const out = [];
    if (!r.kode) out.push({ bad: true, text: 'Tanpa kode mata kuliah' });
    else if (perKode.get(norm(r.kode)) > 1) out.push({ bad: false, text: `${perKode.get(norm(r.kode))} RPS berkode sama` });
    if (r.kode && catalogMk.length) {
      const m = mkByKode.get(norm(r.kode));
      if (!m) out.push({ bad: false, text: 'Kode tidak ada di daftar mata kuliah katalog' });
      else if (m.sks && m.sks !== r.sks) out.push({ bad: false, text: `SKS ${r.sks}, di katalog ${m.sks}` });
    }
    return out;
  }

  const rows = $derived(
    parsed.map((r) => {
      const cat = catalogNotes(r);
      const status = r.broken || r.errors.length ? 'bad' : r.warns.length || r.notes || r.due || cat.length ? 'warn' : 'ok';
      return { ...r, cat, status };
    })
  );
  const shown = $derived(only ? rows.filter((r) => r.status !== 'ok') : rows);
  const missing = $derived(catalogMk.filter((m) => !perKode.has(norm(m.kode))).sort((a, b) => (a.semester || 99) - (b.semester || 99) || a.kode.localeCompare(b.kode, 'id', { numeric: true })));
  const count = $derived({
    ok: rows.filter((r) => r.status === 'ok').length,
    warn: rows.filter((r) => r.status === 'warn').length,
    bad: rows.filter((r) => r.status === 'bad').length
  });
  const covered = $derived(catalogMk.length - missing.length);

  const STATUS = { ok: 'Siap', warn: 'Perlu perhatian', bad: 'Belum lengkap' };
  const tip = (list) => list.map((f) => '• ' + f.msg).join('\n');

  function downloadCsv() {
    const q = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
    const lines = [['Status', 'Kode', 'Mata kuliah', 'SKS', 'Semester', 'Tahun akademik', 'Dosen pengelola', 'Error', 'Peringatan', 'Komentar terbuka', 'Perlu ditinjau', 'Diubah', 'Oleh', 'Catatan'].map(q).join(';')];
    for (const r of rows) {
      lines.push(
        [
          r.broken ? 'RPS rusak' : STATUS[r.status], r.kode, r.nama, r.sks, r.semester, r.tahun, r.dosen.join(', '),
          r.errors.length, r.warns.length, r.notes, r.due ? 'ya' : '', day(r.item.updatedAt), r.item.updatedByName ?? '',
          [...r.errors, ...r.warns].map((f) => f.msg).concat(r.cat.map((c) => c.text)).join(' | ')
        ].map(q).join(';')
      );
    }
    for (const m of missing) lines.push(['Belum ada RPS', m.kode, m.nama, m.sks || '', m.semester || '', '', '', '', '', '', '', '', '', `Ada di katalog ${catalog.nama}`].map(q).join(';'));
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `Kelengkapan-RPS-${(title || 'RPS').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '')}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
</script>

<dialog bind:this={dialog} class="dialog" use:dismiss onclose={() => ((open = false), onclose?.())}>
  {#if open}
    <header>
      <div>
        <h2>Kelengkapan RPS</h2>
        <small>{title} · {rows.length} RPS</small>
      </div>
      <span class="actions">
        <button type="button" class="btn" onclick={downloadCsv} disabled={!rows.length && !missing.length} title="Unduh laporan sebagai CSV (bisa dibuka di Excel)"><Icon name="download" size={15} />Unduh CSV</button>
        <button type="button" class="btn" onclick={() => (open = false)}>Tutup</button>
      </span>
    </header>
    <div class="bar">
      <label>
        <span>Katalog</span>
        <select bind:value={catalogId} aria-label="Katalog kurikulum" disabled={catalogState !== 'ready'}>
          <option value="">{catalogState === 'loading' ? 'Memuat…' : catalogState === 'error' ? 'Katalog tidak bisa dimuat' : '(tanpa katalog)'}</option>
          {#each catalogs as c (c.id)}<option value={c.id}>{c.nama}{c.mk?.length ? ` (${c.mk.length} MK)` : ''}</option>{/each}
        </select>
      </label>
      <label class="chk"><input type="checkbox" bind:checked={only} /> Hanya yang perlu ditindaklanjuti</label>
    </div>
    <div class="body">
      <div class="sum">
        <span class="pill ok"><b>{count.ok}</b> siap</span>
        <span class="pill warn"><b>{count.warn}</b> perlu perhatian</span>
        <span class="pill bad"><b>{count.bad}</b> belum lengkap</span>
        {#if catalog}
          {#if catalogMk.length}
            <span class="pill" class:bad={missing.length}><b>{covered}/{catalogMk.length}</b> mata kuliah katalog punya RPS</span>
          {:else}
            <span class="hint">Katalog {catalog.nama} belum punya daftar mata kuliah; isi di Katalog Kurikulum agar mata kuliah yang belum punya RPS terlihat.</span>
          {/if}
        {/if}
      </div>
      <div class="scroll">
        <table>
          <thead>
            <tr>
              <th class="st">Status</th>
              <th class="mk">Mata kuliah</th>
              <th class="n">SKS</th>
              <th>Dosen pengelola</th>
              <th class="n" title="Temuan Periksa tingkat error">Error</th>
              <th class="n" title="Temuan Periksa tingkat peringatan">Peringatan</th>
              <th class="n" title="Komentar peninjauan yang belum selesai">Komentar</th>
              <th class="n" title="Tanggal penyusunan lebih dari {review.years} tahun lalu">Tinjau</th>
              <th>Diubah</th>
              <th>Catatan</th>
            </tr>
          </thead>
          <tbody>
            {#each shown as r (r.item.id)}
              <tr>
                <td class="st"><span class="dot {r.status}"></span>{r.broken ? 'RPS rusak' : STATUS[r.status]}</td>
                <th class="mk">
                  <button type="button" class="link" onclick={() => onopen?.(r.item)} title="Buka RPS ini">
                    {#if r.kode}<span class="kode">{r.kode}</span>{/if}{r.nama}
                  </button>
                  {#if r.semester || r.tahun}<small>{[r.semester, r.tahun].filter(Boolean).join(' ')}</small>{/if}
                </th>
                <td class="n">{r.sks || ''}</td>
                <td class="dosen" title={r.dosen.join('\n')}>{r.dosen.slice(0, 2).join('; ') || '—'}{#if r.dosen.length > 2}<small> +{r.dosen.length - 2} lainnya</small>{/if}</td>
                <td class="n" class:bad={r.errors.length} title={tip(r.errors)}>{r.errors.length || ''}</td>
                <td class="n" class:warn={r.warns.length} title={tip(r.warns)}>{r.warns.length || ''}</td>
                <td class="n" class:warn={r.notes}>{r.notes || ''}</td>
                <td class="n" class:warn={r.due} title={r.due ? `Disusun ${formatTanggal(r.item.since)}` : ''}>{r.due ? '!' : ''}</td>
                <td class="when">{day(r.item.updatedAt)}{#if r.item.updatedByName}<small>{r.item.updatedByName}</small>{/if}</td>
                <td class="cat">
                  {#each r.cat as c (c.text)}<span class:bad={c.bad}>{c.text}</span>{/each}
                  {#if r.errors[0]}<span class="bad" title={tip(r.errors)}>{r.errors[0].msg}{r.errors.length > 1 ? ` (+${r.errors.length - 1})` : ''}</span>{/if}
                </td>
              </tr>
            {:else}
              <tr><td colspan="10" class="empty">{rows.length ? 'Semua RPS siap.' : 'Tidak ada RPS.'}</td></tr>
            {/each}
          </tbody>
          {#if missing.length}
            <tbody class="missing">
              <tr><th colspan="10" class="group">Belum ada RPS ({missing.length} mata kuliah di katalog {catalog.nama})</th></tr>
              {#each missing as m (m.id ?? m.kode)}
                <tr>
                  <td class="st"><span class="dot none"></span>Belum ada</td>
                  <th class="mk"><span class="kode">{m.kode}</span>{m.nama}{#if m.semester}<small>Semester {m.semester}</small>{/if}</th>
                  <td class="n">{m.sks || ''}</td>
                  <td colspan="7"></td>
                </tr>
              {/each}
            </tbody>
          {/if}
        </table>
      </div>
      <p class="note">
        Status dari Periksa: <b>Belum lengkap</b> = ada temuan error; <b>Perlu perhatian</b> = ada peringatan, komentar
        terbuka, perlu ditinjau ulang, atau catatan katalog. Arahkan kursor ke angka untuk melihat temuannya. RPS dicocokkan
        dengan katalog lewat kode mata kuliah. Klik nama mata kuliah untuk membuka RPS-nya.
      </p>
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
  .body {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    padding: 0.75rem 1rem 1rem;
  }
  .sum {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    align-items: center;
    font-size: 0.82rem;
  }
  .pill {
    padding: 0.2rem 0.6rem;
    border-radius: 999px;
    background: var(--surface-2);
    border: 1px solid var(--line);
  }
  .pill.ok {
    border-color: #2f9e44;
  }
  .pill.warn {
    border-color: #d98e04;
  }
  .pill.bad {
    border-color: var(--danger, #b42318);
  }
  .hint {
    color: var(--muted);
    font-size: 0.78rem;
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
    width: 100%;
  }
  th,
  td {
    border-bottom: 1px solid var(--line);
    padding: 0.3rem 0.45rem;
    background: var(--surface);
    text-align: left;
    vertical-align: top;
  }
  thead th {
    position: sticky;
    top: 0;
    z-index: 2;
    background: var(--surface-2);
    font-weight: 600;
    white-space: nowrap;
  }
  .mk {
    min-width: 14rem;
    font-weight: 500;
  }
  .mk small,
  .when small {
    display: block;
    color: var(--muted);
    font-size: 0.7rem;
  }
  .kode {
    color: var(--muted);
    font-variant-numeric: tabular-nums;
    margin-right: 0.35rem;
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
    white-space: nowrap;
  }
  td.bad,
  .cat .bad {
    color: var(--danger, #b42318);
    font-weight: 600;
  }
  td.warn {
    color: #b06f00;
    font-weight: 600;
  }
  .st {
    white-space: nowrap;
  }
  .dot {
    display: inline-block;
    width: 0.6rem;
    height: 0.6rem;
    border-radius: 50%;
    margin-right: 0.35rem;
    vertical-align: -0.05em;
  }
  .dot.ok {
    background: #2f9e44;
  }
  .dot.warn {
    background: #d98e04;
  }
  .dot.bad {
    background: var(--danger, #b42318);
  }
  .dot.none {
    border: 2px dashed var(--muted);
  }
  .dosen {
    max-width: 16rem;
  }
  .dosen small {
    color: var(--muted);
    white-space: nowrap;
  }
  .when {
    white-space: nowrap;
  }
  .cat {
    max-width: 22rem;
  }
  .cat span {
    display: block;
    color: var(--muted);
  }
  .group {
    background: var(--surface-2);
    font-weight: 600;
  }
  .missing td,
  .missing th:not(.group) {
    color: var(--muted);
  }
  .empty,
  .note {
    margin: 0;
    color: var(--muted);
    font-size: 0.78rem;
  }
</style>
