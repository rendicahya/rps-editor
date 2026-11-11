<script module>
  // Panel pilihan yang sedang terbuka (id isian pick); hanya satu di seluruh dokumen.
  let openPick = $state(null);
</script>

<script>
  import { tick } from 'svelte';
  import * as ui from './ask.svelte.js';
  import { asStep } from './history.js';
  import { app } from './store.svelte.js';
  import { PT } from './layout.js';
  import { newItem, removeItem, duplicateItem, formatAngka, LISTS, JENIS_PERTEMUAN, SEMESTER } from './model.js';
  import { plainText, sliceRich, getSelection, setSelection } from './richtext.js';
  import RichField from './RichField.svelte';
  import ContextMenu from './ContextMenu.svelte';

  // Lapisan isian di atas halaman: teks diketik langsung pada posisinya di dokumen. Teks isian transparan
  // sehingga yang terlihat tetap hasil render SVG (sama dengan PDF); hanya kursor dan seleksi dari isian.
  // Isian menunjuk data lewat `path` (lihat layout.js); '#id' = item daftar dengan id itu.
  let { fields, pageW = 297, pageH = 210, editable = true } = $props();

  const doc = $derived(app.doc);

  /** [objek induk, kunci] untuk path isian; null bila itemnya sudah tidak ada. */
  function resolve(path) {
    let o = app.doc;
    for (const seg of path.slice(0, -1)) {
      o = typeof seg === 'string' && seg.startsWith('#') ? o?.find?.((x) => x.id === seg.slice(1)) : o?.[seg];
      if (o == null) return null;
    }
    return [o, path.at(-1)];
  }
  const get = (path) => {
    const r = resolve(path);
    return r ? r[0][r[1]] : undefined;
  };
  function set(path, v) {
    const r = resolve(path);
    if (r) r[0][r[1]] = v;
  }

  // ---------------------------------------------------------------------------
  // Isian teks
  // ---------------------------------------------------------------------------

  const textValue = (f) => {
    const v = get(f.path);
    if (f.num) return v == null ? (f.zero ? '0' : '') : formatAngka(v);
    return v ?? '';
  };

  function setText(f, v) {
    if (!f.num) return set(f.path, v);
    const t = v.trim().replace(',', '.');
    if (t === '') {
      const r = resolve(f.path);
      if (!r) return;
      // Porsi kosong dihapus dari peta; bobot kosong menjadi null.
      if (f.zero) delete r[0][r[1]];
      else r[0][r[1]] = null;
    } else if (Number.isFinite(+t)) set(f.path, +t);
  }

  /** Fokus ke isian `id` setelah tata letak diperbarui, dengan kursor di posisi `caret`. */
  async function focusField(id, caret = null) {
    await tick();
    const el = document.querySelector(`[data-field="${id}"]`);
    if (!el) return;
    el.scrollIntoView({ block: 'nearest' });
    el.focus();
    if (caret === null) return;
    if (el.isContentEditable) setSelection(el, caret);
    else el.setSelectionRange(caret, caret);
  }

  const baseId = (f) => f.id.replace(/@\d+$/, '');
  const siblingId = (f, index) => baseId(f).replace(/:\d+$/, ':' + index);

  function onTextKey(e, f) {
    if (f.list) return onListKey(e, f);
    if (e.key === 'Enter' && !e.shiftKey && !f.multiline) e.preventDefault();
  }

  // Butir daftar (nama dosen, metode, pustaka): Enter memecah butir, Backspace di awal menggabungkan.
  function onListKey(e, f) {
    const el = e.currentTarget;
    const rich = el.isContentEditable;
    const sel = rich ? (getSelection(el) ?? { start: 0, end: 0 }) : { start: el.selectionStart, end: el.selectionEnd };
    const { start: a, end: b } = sel;
    const value = get(f.path) ?? '';
    const len = rich ? plainText(value).length : value.length;
    const cut = (s, i, j) => (rich ? sliceRich(s, i, j) : s.slice(i, j));

    if (f.list.kind === 'pustaka') {
      const list = app.doc.pustaka;
      const i = list.findIndex((p) => p.id === f.list.id);
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const p = newItem('pustaka', { jenis: f.list.jenis, teks: cut(value, b) });
        asStep(() => {
          list[i].teks = cut(value, 0, a);
          list.splice(i + 1, 0, p);
        });
        focusField(`pustaka:${p.id}:teks`, 0);
      } else if (e.key === 'Backspace' && a === 0 && b === 0 && !len) {
        e.preventDefault();
        const prev = list.slice(0, i).reverse().find((p) => p.jenis === list[i].jenis);
        asStep(() => removeItem(app.doc, 'pustaka', f.list.id));
        if (prev) focusField(`pustaka:${prev.id}:teks`, plainText(prev.teks).length);
      }
      return;
    }

    // Daftar teks (strings): path induk + indeks.
    const parent = get(f.list.path);
    if (!parent) return;
    const i = f.list.index;
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      asStep(() => {
        if (f.list.virtual && !parent.length) parent.push('');
        parent[i] = cut(value, 0, a);
        parent.splice(i + 1, 0, cut(value, b));
      });
      focusField(siblingId(f, i + 1), 0);
    } else if (e.key === 'Backspace' && a === 0 && b === 0 && i > 0) {
      e.preventDefault();
      const prev = parent[i - 1];
      const at = rich ? plainText(prev).length : prev.length;
      asStep(() => {
        parent[i - 1] = prev + value;
        parent.splice(i, 1);
      });
      focusField(siblingId(f, i - 1), at);
    } else if (e.key === 'ArrowUp' && a === 0 && i > 0) {
      e.preventDefault();
      focusField(siblingId(f, i - 1), 0);
    } else if (e.key === 'ArrowDown' && b === len && i + 1 < parent.length) {
      e.preventDefault();
      focusField(siblingId(f, i + 1), 0);
    }
  }

  // ---------------------------------------------------------------------------
  // Baris daftar: tambah, geser, duplikat, hapus
  // ---------------------------------------------------------------------------

  /** Isian pertama item baru, untuk langsung diketik. */
  const firstField = (list, id) =>
    ({ pertemuan: `pertemuan:${id}:indikator`, lembarKerja: `lk:${id}:judul`, pustaka: `pustaka:${id}:teks` })[list] ?? `${list}:${id}:kode`;

  /** Item baru setelah `ref` (atau di awal), mewarisi nilai yang masuk akal dari item itu. */
  function freshAfter(list, ref) {
    const L = app.doc[list];
    if (list === 'pertemuan') {
      // Pola kuliah → praktikum di pekan yang sama, lalu pekan berikutnya.
      if (!ref) return newItem('pertemuan', { pekan: 1 });
      const prak = ref.jenis === 'kuliah' && app.doc.identitas.sksPraktikum > 0;
      return newItem('pertemuan', { pekan: prak ? ref.pekan : ref.pekan + 1, jenis: prak ? 'praktikum' : 'kuliah', waktu: '' });
    }
    if (list === 'subCpmk') return newItem(list, { cpmk: ref?.cpmk ?? app.doc.cpmk[0]?.id ?? null });
    if (list === 'cpmk') return newItem(list, { cpl: ref ? [...ref.cpl] : app.doc.cpl.slice(0, 1).map((c) => c.id) });
    if (list === 'lembarKerja') return newItem(list, { kode: `LK-${L.length + 1}`, asesmen: ref?.asesmen ?? null, subCpmk: ref ? [...ref.subCpmk] : [] });
    return newItem(list);
  }

  function insertAt(list, at, item) {
    asStep(() => app.doc[list].splice(at, 0, item));
    focusField(firstField(list, item.id));
  }
  function addAfter(list, index) {
    const L = app.doc[list];
    const ref = L[index] ?? L.at(-1);
    insertAt(list, index < 0 ? L.length : index + 1, freshAfter(list, ref));
  }
  function addBefore(list, index) {
    insertAt(list, index, freshAfter(list, app.doc[list][index - 1]));
  }
  function move(list, index, d) {
    const L = app.doc[list];
    const j = index + d;
    if (j < 0 || j >= L.length) return;
    asStep(() => ([L[index], L[j]] = [L[j], L[index]]));
  }
  function duplicate(list, index) {
    asStep(() => app.doc[list].splice(index + 1, 0, duplicateItem($state.snapshot(app.doc[list][index]))));
  }
  function remove(list, id) {
    asStep(() => removeItem(app.doc, list, id));
  }
  function toggleJenis(p) {
    asStep(() => (p.jenis = p.jenis === 'kuliah' ? 'praktikum' : 'kuliah'));
  }
  /** Lembar Kerja baru untuk asesmen `a` (Sub-CPMK diambil dari porsinya). */
  function lkFor(a) {
    const n = app.doc.lembarKerja.length;
    const lk = newItem('lembarKerja', { kode: `LK-${n + 1}`, asesmen: a?.id ?? null, subCpmk: a ? subsOf(a) : [] });
    insertAt('lembarKerja', n, lk);
  }
  const subsOf = (a) => app.doc.subCpmk.filter((s) => (a.porsi[s.id] ?? 0) > 0).map((s) => s.id);

  // Kelompok isian yang sedang disorot/difokus (satu baris daftar): alatnya ditampilkan.
  let hover = $state(null);
  let focused = $state(null);
  const groupOf = (e) => e.target.closest?.('[data-hot]')?.dataset.hot ?? null;
  const isHot = (f) => hover === f.hot || focused === f.hot;
  /** 'r:<daftar>:<id>[:tag]' → { list, id }. */
  function rowOf(hot) {
    const m = /^r:(\w+):([^:]+)/.exec(hot ?? '');
    if (!m || m[2] === '-1') return null;
    const index = app.doc[m[1]]?.findIndex((x) => x.id === m[2]) ?? -1;
    return index < 0 ? null : { list: m[1], id: m[2], index, item: app.doc[m[1]][index] };
  }

  // ---------------------------------------------------------------------------
  // Panel pilihan (relasi, SKS, semester, pekan)
  // ---------------------------------------------------------------------------

  const pustakaUrut = $derived([...doc.pustaka.filter((p) => p.jenis === 'utama'), ...doc.pustaka.filter((p) => p.jenis !== 'utama')]);
  const short = (s, n = 70) => {
    const t = plainText(s).replace(/\s+/g, ' ').trim();
    return t.length > n ? t.slice(0, n) + '…' : t;
  };
  function sourceOf(name) {
    if (name === 'pustaka') return pustakaUrut.map((p, i) => ({ value: p.id, code: `[${i + 1}]`, label: short(p.teks) || '(kosong)' }));
    return doc[name].map((x) => ({ value: x.id, code: x.kode || '(tanpa kode)', label: short(x.teks ?? '') }));
  }
  function toggleIn(path, value, source) {
    const cur = get(path) ?? [];
    const on = cur.includes(value);
    const order = source.map((o) => o.value);
    asStep(() => set(path, order.filter((v) => (v === value ? !on : cur.includes(v)))));
  }

  function closePick(e) {
    if (openPick && !e.target.closest?.('.pop, .f-pick')) openPick = null;
  }

  // ---------------------------------------------------------------------------
  // Menu klik kanan: isinya sesuai isian yang diklik (Shift+klik kanan = menu bawaan browser).
  // ---------------------------------------------------------------------------
  let ctx = $state(null);
  const SEP = { sep: true };

  /** Potong/salin/tempel dan format untuk isian teks; fokus dan seleksinya tetap di isian. */
  function editItems(el) {
    const rich = !el.matches('textarea');
    const sel = document.getSelection();
    const hasSel = rich ? !!sel && !sel.isCollapsed && el.contains(sel.anchorNode) : el.selectionStart !== el.selectionEnd;
    const exec = (cmd) => () => {
      el.focus();
      asStep(() => document.execCommand(cmd));
    };
    async function paste() {
      let t;
      try {
        t = await navigator.clipboard.readText();
      } catch {
        ui.alert('Browser tidak mengizinkan membaca clipboard dari menu. Gunakan Ctrl+V.');
        return;
      }
      el.focus();
      asStep(() => {
        if (!rich) return document.execCommand('insertText', false, t);
        const data = new DataTransfer();
        data.setData('text/plain', t);
        el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
      });
    }
    const out = [
      { label: 'Potong', hint: 'Ctrl+X', disabled: !hasSel, run: exec('cut') },
      { label: 'Salin', hint: 'Ctrl+C', disabled: !hasSel, run: exec('copy') },
      { label: 'Tempel', hint: 'Ctrl+V', disabled: !navigator.clipboard?.readText, run: paste },
      { label: 'Pilih semua', hint: 'Ctrl+A', run: () => (el.focus(), rich ? document.execCommand('selectAll') : el.select()) }
    ];
    if (rich) {
      out.push(
        SEP,
        { label: 'Tebal', hint: 'Ctrl+B', checked: document.queryCommandState('bold'), run: exec('bold') },
        { label: 'Miring', hint: 'Ctrl+I', checked: document.queryCommandState('italic'), run: exec('italic') },
        { label: 'Garis bawah', hint: 'Ctrl+U', checked: document.queryCommandState('underline'), run: exec('underline') }
      );
    }
    return out;
  }

  function rowItems(r) {
    const { list, index, item } = r;
    const n = app.doc[list].length;
    const name = LISTS[list];
    const out = [];
    if (list === 'pertemuan') {
      out.push(
        { head: `Pekan ${item.pekan} · ${item.jenis}` },
        { label: item.jenis === 'kuliah' ? 'Jadikan praktikum' : 'Jadikan kuliah', run: () => toggleJenis(item) },
        { label: 'Pekan, Sub-CPMK, dan pustaka…', run: () => (openPick = `pk:pekan:${item.id}`) },
        SEP
      );
    } else if (list === 'asesmen') {
      out.push({ head: item.kode || 'Asesmen' }, { label: 'Buat Lembar Kerja untuk asesmen ini', run: () => lkFor(item) }, SEP);
    } else {
      out.push({ head: item.kode || item.judul || name });
    }
    if (list === 'pustaka') {
      out.push({ label: item.jenis === 'utama' ? 'Jadikan pustaka pendukung' : 'Jadikan pustaka utama', run: () => asStep(() => (item.jenis = item.jenis === 'utama' ? 'pendukung' : 'utama')) }, SEP);
    }
    out.push(
      { label: `Tambah ${name} di atas`, run: () => addBefore(list, index) },
      { label: `Tambah ${name} di bawah`, run: () => addAfter(list, index) },
      { label: 'Duplikat', run: () => duplicate(list, index) },
      { label: 'Naikkan', disabled: index === 0, run: () => move(list, index, -1) },
      { label: 'Turunkan', disabled: index === n - 1, run: () => move(list, index, 1) },
      SEP,
      { label: `Hapus ${name}`, danger: true, run: () => remove(list, item.id) }
    );
    return out;
  }

  function ctxItems(f, e) {
    const out = [];
    const el = e.target.closest?.('textarea, .f-rich');
    if (el) out.push(...editItems(el), SEP);
    if (f.list?.kind === 'pustaka') {
      const i = app.doc.pustaka.findIndex((p) => p.id === f.list.id);
      if (i >= 0) out.push(...rowItems({ list: 'pustaka', id: f.list.id, index: i, item: app.doc.pustaka[i] }));
    } else {
      const r = rowOf(f.hot);
      if (r) out.push(...rowItems(r));
    }
    return out.filter((it, i, a) => !it.sep || (i > 0 && i < a.length - 1 && !a[i - 1].sep));
  }

  function openCtx(e) {
    if (e.shiftKey || !editable) return;
    const fid = e.target.closest?.('[data-fid]')?.dataset.fid;
    const f = fid && fields.find((x) => x.id === fid);
    const list = f ? ctxItems(f, e) : [];
    if (!list.length) return;
    e.preventDefault();
    let { clientX: x, clientY: y } = e;
    if (!x && !y) {
      const r = e.target.getBoundingClientRect();
      x = r.left + 8;
      y = r.top + Math.min(r.height, 22);
    }
    ctx = { x, y, items: list };
  }

  const box = (f) =>
    `left:calc(${f.x} * var(--mm));top:calc(${f.y} * var(--mm));width:calc(${f.w} * var(--mm));height:calc(${f.h} * var(--mm));` +
    (f.size ? `font-size:calc(${f.size * PT} * var(--mm));` : '');
  /** Isi isian yang terbelah antarhalaman digeser ke atas sejumlah baris yang sudah tampil sebelumnya. */
  const inner = (f) =>
    `top:calc(${-f.skip * f.size * PT * 1.2} * var(--mm));height:calc(${f.h + f.skip * f.size * PT * 1.2} * var(--mm));` +
    (f.lead ? `text-indent:calc(${f.lead} * var(--mm));` : '');
  const popUp = (f) => f.y + f.h > pageH * 0.62;
</script>

<svelte:window onpointerdown={closePick} onkeydown={(e) => e.key === 'Escape' && (openPick = null)} />

{#snippet editor(f)}
  {#if f.rich}
    <RichField
      class="f-text"
      style={inner(f)}
      data-field={f.id}
      aria-label={f.label}
      placeholder={f.placeholder ?? ''}
      multiline={f.multiline}
      value={textValue(f)}
      oninput={(v) => setText(f, v)}
      onkeydown={(e) => onTextKey(e, f)}
    />
  {:else}
    {@const locked = f.path[1] === 'mataKuliah' && app.nameLocked}
    <textarea
      class="f-text"
      style={inner(f)}
      data-field={f.id}
      aria-label={f.label}
      placeholder={f.placeholder ?? ''}
      spellcheck="false"
      readonly={locked}
      title={locked ? 'Hanya pembuat RPS dan admin yang bisa mengubah nama mata kuliah ini' : undefined}
      value={textValue(f)}
      oninput={(e) => setText(f, e.currentTarget.value)}
      onkeydown={(e) => onTextKey(e, f)}
    ></textarea>
  {/if}
{/snippet}

<div
  class="fields"
  style:--mm="calc(100cqw / {pageW})"
  inert={!editable}
  onpointerover={(e) => (hover = groupOf(e))}
  onpointerleave={() => (hover = null)}
  onfocusin={(e) => (focused = groupOf(e))}
  onfocusout={() => (focused = null)}
  oncontextmenu={openCtx}
>
  {#each fields as f (f.id)}
    {#if f.kind === 'row-tools'}
      {@const r = rowOf(f.hot)}
      <div class="f-group" class:hot={isHot(f)} style={box(f)} data-hot={f.hot} data-fid={f.id}>
        {#if f.empty}
          <button class="f-hint add-first" onclick={() => addAfter(f.list, -1)}>+ Tambah {f.empty}</button>
        {:else if r}
          <span class="g-tools" class:g-top={f.top} class:g-left={!f.top}>
            <button tabindex="-1" title="Naikkan" aria-label="Naikkan" aria-disabled={r.index === 0} onclick={() => move(r.list, r.index, -1)}>{f.top ? '◀' : '▲'}</button>
            <button tabindex="-1" title="Turunkan" aria-label="Turunkan" aria-disabled={r.index === f.count - 1} onclick={() => move(r.list, r.index, 1)}>{f.top ? '▶' : '▼'}</button>
            <button tabindex="-1" title="Duplikat" aria-label="Duplikat" onclick={() => duplicate(r.list, r.index)}>⧉</button>
            <button tabindex="-1" title="Tambah {LISTS[r.list]} di bawah" aria-label="Tambah" onclick={() => addAfter(r.list, r.index)}>＋</button>
            {#if r.list === 'pertemuan'}
              <button tabindex="-1" title={r.item.jenis === 'kuliah' ? 'Jadikan praktikum' : 'Jadikan kuliah'} aria-label="Ganti jenis pertemuan" onclick={() => toggleJenis(r.item)}>{r.item.jenis === 'kuliah' ? 'P' : 'K'}</button>
            {/if}
            <button tabindex="-1" class="danger" title="Hapus {LISTS[r.list]}" aria-label="Hapus" onclick={() => remove(r.list, r.id)}>✕</button>
          </span>
        {/if}
      </div>
    {:else if f.kind === 'text'}
      <div class="f-wrap" class:bold={f.bold} class:center={f.align === 'center'} class:upper={f.upper} style={box(f)} data-hot={f.hot} data-fid={f.id}>
        {@render editor(f)}
      </div>
    {:else if f.kind === 'add'}
      <button class="f-hint" style={box(f)} data-fid={f.id} onclick={() => (f.list === 'pustaka' ? insertAt('pustaka', app.doc.pustaka.length, newItem('pustaka', { jenis: f.jenis })) : lkFor(null))}>
        {f.label.startsWith('+') ? f.label : '+ ' + f.label}
      </button>
    {:else if f.kind === 'pick' && f.type === 'date'}
      <!-- Input tanggal tak terlihat: hasilnya langsung tampil terformat di halaman. -->
      <span class="f-date" style={box(f)} title="Pilih tanggal">
        <input type="date" data-field={f.id} aria-label={f.label} value={get(f.path)} onchange={(e) => asStep(() => set(f.path, e.currentTarget.value))} onclick={(e) => e.currentTarget.showPicker?.()} />
      </span>
    {:else if f.kind === 'pick'}
      {@const open = openPick === f.id}
      <div class="f-pick" class:open style={box(f)} data-hot={f.hot} data-fid={f.id}>
        <button class="f-pick-btn" data-field={f.id} title={f.label} aria-label={f.label} aria-expanded={open} onclick={() => (openPick = open ? null : f.id)}></button>
        {#if open}
          <div class="pop" class:up={popUp(f)} role="dialog" aria-label={f.label}>
            <strong class="pop-title">{f.label}</strong>
            {#if f.type === 'multi'}
              {@const src = sourceOf(f.source)}
              {@const cur = get(f.path) ?? []}
              {#if !src.length}<p class="pop-empty">Belum ada {LISTS[f.source]} di dokumen ini.</p>{/if}
              <div class="opts">
                {#each src as o (o.value)}
                  <label class="opt"><input type="checkbox" checked={cur.includes(o.value)} onchange={() => toggleIn(f.path, o.value, src)} /><b>{o.code}</b><span>{o.label}</span></label>
                {/each}
              </div>
            {:else if f.type === 'single'}
              {@const src = f.options ?? sourceOf(f.source)}
              {@const cur = get(f.path)}
              <div class="opts">
                {#if f.source}
                  <label class="opt"><input type="radio" checked={!cur} onchange={() => asStep(() => set(f.path, null))} /><span>(tidak ada)</span></label>
                {/if}
                {#each src as o (o.value)}
                  <label class="opt"><input type="radio" checked={cur === o.value} onchange={() => asStep(() => set(f.path, o.value))} /><b>{o.code ?? o.label}</b>{#if o.code}<span>{o.label}</span>{/if}</label>
                {/each}
              </div>
            {:else if f.type === 'sks'}
              <div class="row2">
                <label>Teori <input type="number" min="0" max="10" value={doc.identitas.sksTeori} oninput={(e) => (doc.identitas.sksTeori = Math.max(0, +e.currentTarget.value || 0))} /></label>
                <label>Praktikum <input type="number" min="0" max="10" value={doc.identitas.sksPraktikum} oninput={(e) => (doc.identitas.sksPraktikum = Math.max(0, +e.currentTarget.value || 0))} /></label>
              </div>
            {:else if f.type === 'semester'}
              <div class="row2">
                <label>Semester
                  <select value={doc.identitas.semester} onchange={(e) => asStep(() => (doc.identitas.semester = e.currentTarget.value))}>
                    {#each SEMESTER as s (s)}<option value={s}>{s}</option>{/each}
                  </select>
                </label>
                <label>Tahun akademik <input value={doc.identitas.tahunAkademik} placeholder="2025/2026" oninput={(e) => (doc.identitas.tahunAkademik = e.currentTarget.value)} /></label>
              </div>
            {:else if f.type === 'pertemuan'}
              {@const p = resolve([...f.path, 'id'])?.[0]}
              {@const subs = sourceOf('subCpmk')}
              {@const pus = sourceOf('pustaka')}
              {#if p}
                <div class="row2">
                  <label>Pekan ke- <input type="number" min="1" max="30" value={p.pekan} oninput={(e) => (p.pekan = Math.max(1, Math.round(+e.currentTarget.value) || 1))} /></label>
                  <span class="seg" role="group" aria-label="Jenis pertemuan">
                    {#each JENIS_PERTEMUAN as j (j.value)}
                      <button class:on={p.jenis === j.value} aria-pressed={p.jenis === j.value} onclick={() => asStep(() => (p.jenis = j.value))}>{j.label}</button>
                    {/each}
                  </span>
                </div>
                <span class="pop-sub">Sub-CPMK</span>
                <div class="opts">
                  {#each subs as o (o.value)}
                    <label class="opt"><input type="checkbox" checked={p.subCpmk.includes(o.value)} onchange={() => toggleIn([...f.path, 'subCpmk'], o.value, subs)} /><b>{o.code}</b><span>{o.label}</span></label>
                  {/each}
                </div>
                <span class="pop-sub">Pustaka (dirujuk sebagai [n] di kolom materi)</span>
                {#if !pus.length}<p class="pop-empty">Belum ada pustaka di halaman identitas.</p>{/if}
                <div class="opts">
                  {#each pus as o (o.value)}
                    <label class="opt"><input type="checkbox" checked={p.pustaka.includes(o.value)} onchange={() => toggleIn([...f.path, 'pustaka'], o.value, pus)} /><b>{o.code}</b><span>{o.label}</span></label>
                  {/each}
                </div>
              {/if}
            {:else if f.type === 'lk'}
              {@const lk = resolve([...f.path, 'id'])?.[0]}
              {@const asm = sourceOf('asesmen')}
              {@const subs = sourceOf('subCpmk')}
              {#if lk}
                <span class="pop-sub">Asesmen yang dinilai</span>
                <select value={lk.asesmen ?? ''} onchange={(e) => asStep(() => (lk.asesmen = e.currentTarget.value || null))}>
                  <option value="">(tidak ada)</option>
                  {#each asm as o (o.value)}<option value={o.value}>{o.code}</option>{/each}
                </select>
                <span class="pop-sub">Sub-CPMK
                  {#if lk.asesmen}
                    {@const a = doc.asesmen.find((x) => x.id === lk.asesmen)}
                    {#if a}<button class="link" onclick={() => asStep(() => (lk.subCpmk = subsOf(a)))}>Ambil dari porsi {a.kode}</button>{/if}
                  {/if}
                </span>
                <div class="opts">
                  {#each subs as o (o.value)}
                    <label class="opt"><input type="checkbox" checked={lk.subCpmk.includes(o.value)} onchange={() => toggleIn([...f.path, 'subCpmk'], o.value, subs)} /><b>{o.code}</b><span>{o.label}</span></label>
                  {/each}
                </div>
              {/if}
            {/if}
          </div>
        {/if}
      </div>
    {/if}
  {/each}
</div>
{#if ctx}
  {#key ctx}<ContextMenu x={ctx.x} y={ctx.y} items={ctx.items} onclose={() => (ctx = null)} />{/key}
{/if}

<style>
  .fields {
    position: absolute;
    inset: 0;
    --edit: 47 102 176;
    font-family: SOPDoc, Calibri, Carlito, sans-serif;
  }
  .fields > * {
    position: absolute;
    box-sizing: border-box;
    margin: 0;
  }
  .f-wrap {
    overflow: hidden;
    line-height: 1.2;
  }
  .f-wrap.bold {
    font-weight: 700;
  }
  .f-wrap.center {
    text-align: center;
  }
  .f-wrap.upper {
    text-transform: uppercase;
  }
  .f-wrap:hover {
    background: rgb(var(--edit) / 0.06);
    box-shadow: inset 0 0 0 1px rgb(var(--edit) / 0.35);
  }
  /* Isian tetap terpotong di bagian selnya meski difokus: sel yang terbelah hanya menampilkan baris di halaman ini. */
  .f-wrap:focus-within {
    background: rgb(var(--edit) / 0.08);
    box-shadow: inset 0 0 0 1.5px rgb(var(--edit));
    z-index: 2;
  }
  .f-wrap :global(.f-text) {
    position: absolute;
    left: 0;
    width: 100%;
    box-sizing: border-box;
    margin: 0;
    padding: 0;
    border: 0;
    border-radius: 0;
    resize: none;
    overflow: hidden;
    background: transparent;
    color: transparent;
    caret-color: #000;
    font: inherit;
    text-align: inherit;
    text-transform: inherit;
    line-height: 1.2;
    white-space: pre-wrap;
    overflow-wrap: break-word;
    outline: none;
    cursor: text;
  }
  .f-wrap textarea::selection {
    background: rgb(var(--edit) / 0.3);
    color: transparent;
  }
  .f-wrap textarea::placeholder {
    color: #98a2b6;
    opacity: 0;
    font-style: italic;
    text-transform: none;
  }
  :global(.page:hover) .f-wrap textarea::placeholder,
  .f-wrap textarea:focus::placeholder {
    opacity: 1;
  }

  .f-date input {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    margin: 0;
    padding: 0;
    border: 0;
    opacity: 0;
    cursor: pointer;
  }
  .f-date:hover,
  .f-date:focus-within {
    background: rgb(var(--edit) / 0.08);
    box-shadow: inset 0 0 0 1.5px rgb(var(--edit) / 0.6);
  }

  .f-hint {
    font: 11px/1.2 var(--ui-font);
    color: rgb(var(--edit));
    background: transparent;
    border: 1px dashed rgb(var(--edit) / 0.5);
    border-radius: 5px;
    padding: 2px 8px;
    cursor: pointer;
    opacity: 0;
    text-align: left;
  }
  :global(.page:hover) .f-hint,
  .f-hint:focus-visible {
    opacity: 1;
  }
  .f-hint:hover {
    background: rgb(var(--edit) / 0.08);
  }
  .add-first {
    position: absolute;
    inset: 0;
    width: 100%;
    border-radius: 0;
  }

  .f-group {
    pointer-events: none;
  }
  .f-group > * {
    pointer-events: auto;
  }
  .f-group.hot {
    background: rgb(var(--edit) / 0.035);
  }
  .g-tools {
    position: absolute;
    display: flex;
    gap: 2px;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.12s;
    z-index: 3;
  }
  .f-group.hot .g-tools {
    opacity: 1;
    pointer-events: auto;
  }
  .g-top {
    left: 50%;
    top: 0;
    transform: translate(-50%, -110%);
  }
  .g-left {
    right: 100%;
    top: 0;
    flex-direction: column;
    padding-right: 3px;
  }
  .g-tools button {
    display: grid;
    place-items: center;
    width: 18px;
    height: 18px;
    padding: 0;
    font: 600 10px/1 var(--ui-font);
    border: 1px solid rgb(var(--edit) / 0.5);
    border-radius: 4px;
    background: #fff;
    color: rgb(var(--edit));
    cursor: pointer;
    box-shadow: 0 1px 2px rgb(0 0 0 / 0.12);
  }
  .g-tools button:hover {
    background: rgb(var(--edit));
    color: #fff;
  }
  .g-tools button.danger {
    border-color: rgb(192 57 43 / 0.5);
    color: #c0392b;
  }
  .g-tools button.danger:hover {
    background: #c0392b;
    color: #fff;
  }
  .g-tools button[aria-disabled='true'] {
    opacity: 0.35;
    cursor: not-allowed;
    background: #fff;
    color: #888;
    border-color: #bbb;
  }

  .f-pick.open {
    z-index: 6;
  }
  .f-pick-btn {
    position: absolute;
    inset: 0;
    padding: 0;
    border: 0;
    border-radius: 0;
    background: transparent;
    cursor: pointer;
  }
  .f-pick-btn:hover,
  .f-pick.open .f-pick-btn {
    background: rgb(var(--edit) / 0.07);
    box-shadow: inset 0 0 0 1.5px rgb(var(--edit) / 0.6);
  }
  .pop {
    position: absolute;
    left: 0;
    top: calc(100% + 4px);
    width: 300px;
    max-height: 340px;
    overflow: auto;
    display: grid;
    gap: 6px;
    padding: 8px 10px;
    font: 12px/1.3 var(--ui-font);
    color: #1f2633;
    background: #fff;
    border: 1px solid rgb(var(--edit) / 0.4);
    border-radius: 8px;
    box-shadow: 0 6px 20px rgb(0 0 0 / 0.18);
    text-align: left;
  }
  .pop.up {
    top: auto;
    bottom: calc(100% + 4px);
  }
  .pop-title {
    font-size: 12px;
  }
  .pop-sub {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    font-size: 11px;
    color: #5b6577;
    margin-top: 2px;
  }
  .pop-empty {
    margin: 0;
    font-size: 11px;
    color: #5b6577;
  }
  .opts {
    display: grid;
    gap: 2px;
  }
  .opt {
    display: grid;
    grid-template-columns: auto auto 1fr;
    align-items: baseline;
    gap: 6px;
    padding: 3px 4px;
    border-radius: 5px;
    cursor: pointer;
  }
  .opt:hover {
    background: rgb(var(--edit) / 0.08);
  }
  .opt b {
    white-space: nowrap;
  }
  .opt span {
    color: #5b6577;
    font-size: 11px;
  }
  .row2 {
    display: flex;
    gap: 8px;
    align-items: end;
    flex-wrap: wrap;
  }
  .row2 label {
    display: grid;
    gap: 2px;
    font-size: 11px;
    color: #5b6577;
  }
  .pop input:not([type='checkbox']):not([type='radio']),
  .pop select {
    font: 12px var(--ui-font);
    padding: 3px 5px;
    border: 1px solid #c5cbd6;
    border-radius: 5px;
    background: #fff;
    color: #1f2633;
    max-width: 130px;
  }
  .pop select {
    max-width: 100%;
  }
  .seg {
    display: flex;
    border: 1px solid rgb(var(--edit) / 0.5);
    border-radius: 6px;
    overflow: hidden;
  }
  .seg button {
    padding: 4px 8px;
    border: 0;
    background: #fff;
    color: rgb(var(--edit));
    font: 600 11px/1.1 var(--ui-font);
    cursor: pointer;
  }
  .seg button + button {
    border-left: 1px solid rgb(var(--edit) / 0.5);
  }
  .seg button.on {
    background: rgb(var(--edit));
    color: #fff;
  }
  .link {
    border: 0;
    background: none;
    padding: 0;
    color: rgb(var(--edit));
    font: 600 11px var(--ui-font);
    cursor: pointer;
    text-decoration: underline;
  }
</style>
