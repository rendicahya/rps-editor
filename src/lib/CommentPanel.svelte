<script>
  import { tick, untrack } from 'svelte';
  import { notes, describeAnchor, currentRef } from './comments.svelte.js';
  import * as Faculty from './faculty.svelte.js';
  import { faculty, COMMENT_MAX } from './faculty.svelte.js';
  import * as ui from './ask.svelte.js';
  import Icon from './Icon.svelte';

  /**
   * Komentar peninjauan RPS daring di tab aktif. doc: isi tab aktif; remote: tab.remote (null: bukan RPS daring).
   * onjump(ref) menuju isian di halaman; onupload() menyimpan RPS ini ke Pustaka Daring.
   */
  let { open = $bindable(false), doc, remote, onjump, onupload } = $props();

  let tab = $state('open');
  let draft = $state('');
  let anchor = $state(null); // isian yang dikomentari (data-field); null = Seluruh RPS
  let pinned = $state(false); // dipilih dari menu klik kanan atau dihapus: tidak lagi mengikuti isian yang diklik
  let busy = $state(false);
  let replyTo = $state(null);
  let replyText = $state('');
  let editing = $state(null);
  let editText = $state('');
  let input = $state();
  let list = $state();

  const me = $derived(faculty.user?.uid);
  const roots = $derived(notes.list.filter((c) => !c.parent).sort((a, b) => b.at - a.at));
  const openRoots = $derived(roots.filter((c) => !c.resolved));
  const doneRoots = $derived(roots.filter((c) => c.resolved));
  const shown = $derived(tab === 'open' ? openRoots : doneRoots);
  const replies = $derived.by(() => {
    const m = new Map();
    for (const c of notes.list) if (c.parent) (m.get(c.parent) ?? m.set(c.parent, []).get(c.parent)).push(c);
    for (const l of m.values()) l.sort((a, b) => a.at - b.at);
    return m;
  });
  const target = $derived(describeAnchor(doc, anchor) ?? describeAnchor(doc, null));

  // Komentar baru menunjuk isian yang terakhir diklik di halaman, selama belum mulai diketik.
  $effect(() => {
    const f = notes.focus;
    untrack(() => {
      if (!pinned && !draft.trim()) anchor = f;
    });
  });

  // Permintaan dari menu klik kanan "Komentari…".
  $effect(() => {
    const r = notes.request;
    if (!r) return;
    untrack(() => {
      notes.request = null;
      open = true;
      tab = 'open';
      anchor = r.ref;
      pinned = true;
      tick().then(() => input?.focus());
    });
  });

  // Komentar yang isiannya sedang diklik disorot dan digulir ke tampilan.
  const hit = (c) => !!c.anchor && notes.focus && currentRef(doc, c) === notes.focus;
  $effect(() => {
    if (!open || !notes.focus) return;
    const f = notes.focus;
    tick().then(() => list?.querySelector(`[data-ref="${CSS.escape(f)}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
  });

  let now = $state(Date.now());
  $effect(() => {
    if (!open) return;
    now = Date.now();
    const t = setInterval(() => (now = Date.now()), 60000);
    return () => clearInterval(t);
  });
  function ago(t) {
    if (!t) return '';
    const s = (now - t) / 1000;
    if (s < 60) return 'baru saja';
    if (s < 3600) return `${Math.floor(s / 60)} menit lalu`;
    if (s < 86400) return `${Math.floor(s / 3600)} jam lalu`;
    return new Date(t).toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
  const full = (t) => (t ? new Date(t).toLocaleString('id-ID', { dateStyle: 'full', timeStyle: 'short' }) : '');

  /** Letak komentar `c` pada dokumen saat ini. */
  function where(c) {
    if (!c.anchor) return { label: 'Seluruh RPS', ref: null };
    const ref = currentRef(doc, c);
    const cur = ref && describeAnchor(doc, ref);
    if (!cur) return { label: c.label || 'Isian', gone: true };
    return { label: cur.label, ref, changed: !!c.quote && cur.quote !== c.quote };
  }

  const canDelete = (c) => c.by === me || !!remote?.manage || Faculty.isAdmin();

  async function run(fn) {
    if (busy) return false;
    busy = true;
    try {
      await fn();
      return true;
    } catch (e) {
      ui.alert(e.message);
      return false;
    } finally {
      busy = false;
    }
  }

  async function send() {
    const text = draft.trim();
    if (!text) return;
    const info = anchor && describeAnchor(doc, anchor);
    const ok = await run(() =>
      Faculty.addComment(remote.id, { anchor: info ? anchor : null, label: info?.label ?? '', quote: info?.quote ?? '', text })
    );
    if (ok) {
      draft = '';
      pinned = false;
      tab = 'open';
    }
  }

  function startReply(c) {
    editing = null;
    replyTo = c.id;
    replyText = '';
    tick().then(() => list?.querySelector('.reply-box textarea')?.focus());
  }
  async function sendReply(c) {
    const text = replyText.trim();
    if (!text) return;
    if (await run(() => Faculty.addComment(remote.id, { parent: c.id, text }))) replyTo = null;
  }

  function startEdit(c) {
    replyTo = null;
    editing = c.id;
    editText = c.text;
    tick().then(() => list?.querySelector('.edit-box textarea')?.focus());
  }
  async function saveEdit(c) {
    const text = editText.trim();
    if (!text || text === c.text) return void (editing = null);
    if (await run(() => Faculty.editComment(remote.id, c.id, text))) editing = null;
  }

  async function remove(c) {
    const kids = c.parent ? [] : (replies.get(c.id) ?? []);
    const msg = c.parent ? 'Hapus balasan ini?' : kids.length ? `Hapus komentar ini beserta ${kids.length} balasannya?` : 'Hapus komentar ini?';
    if (!(await ui.confirm(msg, { title: 'Hapus komentar', ok: 'Hapus', danger: true }))) return;
    run(() => Faculty.deleteComment(remote.id, c.id, kids.map((r) => r.id)));
  }

  const resolve = (c, done) => run(() => Faculty.resolveComment(remote.id, c.id, done));

  /** Ctrl+Enter mengirim, Esc membatalkan. */
  function keys(e, submit, cancel) {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      submit();
    } else if (e.key === 'Escape' && cancel) {
      e.preventDefault();
      e.stopPropagation();
      cancel();
    }
  }

  function onKey(e) {
    if (open && e.key === 'Escape' && !document.querySelector('dialog[open]') && !e.defaultPrevented) {
      if (e.target.closest?.('.notes') || !e.target.closest?.('input, textarea, [contenteditable]')) open = false;
    }
  }
</script>

<svelte:window onkeydown={onKey} />

{#snippet body(c)}
  {#if editing === c.id}
    <div class="edit-box">
      <textarea bind:value={editText} rows="3" maxlength={COMMENT_MAX} onkeydown={(e) => keys(e, () => saveEdit(c), () => (editing = null))}></textarea>
      <span class="row end">
        <button class="btn small ghost" onclick={() => (editing = null)}>Batal</button>
        <button class="btn small primary" disabled={busy || !editText.trim()} onclick={() => saveEdit(c)}>Simpan</button>
      </span>
    </div>
  {:else}
    <p class="text">{c.text}</p>
  {/if}
{/snippet}

{#snippet byline(c)}
  <div class="by">
    <strong>{c.byName}</strong>
    <span class="time" title={full(c.at)}>{c.pending ? 'mengirim…' : ago(c.at)}{c.editedAt ? ' · diubah' : ''}</span>
    {#if editing !== c.id && (c.by === me || canDelete(c))}
      <span class="acts">
        {#if c.by === me}<button class="link" onclick={() => startEdit(c)}>Ubah</button>{/if}
        {#if canDelete(c)}<button class="link danger" onclick={() => remove(c)}>Hapus</button>{/if}
      </span>
    {/if}
  </div>
{/snippet}

{#if open}
  <div class="notes" role="dialog" aria-label="Komentar">
    <div class="head">
      <strong>Komentar</strong>
      <button class="icon" onclick={() => (open = false)} title="Tutup (Esc)">✕</button>
    </div>

    {#if !remote}
      <div class="intro">
        <p>
          Komentar disimpan di Pustaka Daring supaya bisa dibaca, dibalas, dan ditandai selesai oleh siapa pun yang punya
          akses ke RPS ini. Simpan RPS ini ke Pustaka Daring dulu, lalu bagikan kepada peninjau.
        </p>
        <button class="btn small primary" onclick={onupload}>Simpan ke Pustaka Daring</button>
      </div>
    {:else if faculty.status !== 'in'}
      <p class="intro">Pustaka Daring sedang tidak bisa dihubungi, jadi komentar belum bisa dimuat.</p>
    {:else}
      <div class="compose">
        <div class="on">
          <span>Pada</span>
          {#if anchor && target.label !== 'Seluruh RPS'}
            <button class="chip" onclick={() => onjump(anchor)} title="Tampilkan di halaman">{target.label}</button>
            <button class="icon tiny" title="Komentari Seluruh RPS" aria-label="Komentari Seluruh RPS" onclick={() => ((anchor = null), (pinned = true))}>✕</button>
          {:else}
            <span class="chip plain">Seluruh RPS</span>
          {/if}
        </div>
        <textarea
          bind:this={input}
          bind:value={draft}
          rows="3"
          maxlength={COMMENT_MAX}
          placeholder="Tulis komentar…"
          onkeydown={(e) => keys(e, send, draft ? null : () => (open = false))}
        ></textarea>
        <div class="row">
          <small class="hint">Klik isian di halaman untuk mengomentarinya · Ctrl+Enter mengirim</small>
          <button class="btn small primary" disabled={busy || !draft.trim()} onclick={send}>Kirim</button>
        </div>
      </div>

      <div class="tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'open'} class:on={tab === 'open'} onclick={() => (tab = 'open')}>Terbuka ({openRoots.length})</button>
        <button role="tab" aria-selected={tab === 'done'} class:on={tab === 'done'} onclick={() => (tab = 'done')}>Selesai ({doneRoots.length})</button>
      </div>

      <div class="list" bind:this={list}>
        {#if notes.status === 'loading'}
          <p class="empty">Memuat komentar…</p>
        {:else if notes.status === 'error'}
          <p class="empty err">{notes.error}</p>
        {:else if !shown.length}
          <p class="empty">{tab === 'open' ? 'Belum ada komentar yang terbuka.' : 'Belum ada komentar yang ditandai selesai.'}</p>
        {/if}
        {#each shown as c (c.id)}
          {@const w = where(c)}
          {@const kids = replies.get(c.id) ?? []}
          <article class="thread" class:done={c.resolved} class:hit={hit(c)} data-ref={w.ref ?? ''}>
            <div class="where">
              {#if w.ref}
                <button class="chip" onclick={() => onjump(w.ref)} title="Tampilkan di halaman">{w.label}</button>
              {:else}
                <span class="chip plain" title={w.gone ? 'Isian ini sudah dihapus dari RPS' : ''}>{w.label}{w.gone ? ' (sudah dihapus)' : ''}</span>
              {/if}
              {#if w.changed}<span class="tag" title="Isinya sudah berubah sejak dikomentari">diubah</span>{/if}
              {#if c.resolved}
                <button class="btn small ghost res" disabled={busy} onclick={() => resolve(c, false)}>Buka lagi</button>
              {:else}
                <button class="btn small ghost res" disabled={busy || c.pending} onclick={() => resolve(c, true)} title="Tandai selesai"><Icon name="check" size={14} /> Selesai</button>
              {/if}
            </div>
            {#if c.quote}<blockquote title="Isi saat dikomentari">{c.quote}</blockquote>{/if}
            {@render byline(c)}
            {@render body(c)}
            {#each kids as r (r.id)}
              <div class="reply">
                {@render byline(r)}
                {@render body(r)}
              </div>
            {/each}
            {#if c.resolved}
              <small class="resolved" title={full(c.resolvedAt)}><Icon name="check" size={12} /> Diselesaikan oleh {c.resolvedByName} · {ago(c.resolvedAt)}</small>
            {/if}
            {#if replyTo === c.id}
              <div class="reply-box">
                <textarea bind:value={replyText} rows="2" maxlength={COMMENT_MAX} placeholder="Tulis balasan…" onkeydown={(e) => keys(e, () => sendReply(c), () => (replyTo = null))}></textarea>
                <span class="row end">
                  <button class="btn small ghost" onclick={() => (replyTo = null)}>Batal</button>
                  <button class="btn small primary" disabled={busy || !replyText.trim()} onclick={() => sendReply(c)}>Balas</button>
                </span>
              </div>
            {:else if !c.pending}
              <button class="link reply-btn" onclick={() => startReply(c)}><Icon name="reply" size={13} /> Balas</button>
            {/if}
          </article>
        {/each}
      </div>
    {/if}
  </div>
{/if}

<style>
  /* Di dalam area kerja (di bawah bilah tab), di samping halaman; lihat .with-notes di app.css. */
  .notes {
    position: absolute;
    top: 0.75rem;
    right: 1rem;
    z-index: 15;
    width: min(380px, calc(100vw - 2rem));
    max-height: calc(100% - 1.5rem);
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0.75rem 0.85rem;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: 12px;
    box-shadow: 0 16px 40px rgb(0 0 0 / 0.2);
  }
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .intro {
    margin: 0;
    display: grid;
    gap: 0.5rem;
    justify-items: start;
    font-size: 0.85rem;
    color: var(--muted);
  }
  .intro p {
    margin: 0;
  }
  .compose {
    display: grid;
    gap: 0.35rem;
    padding: 0.5rem;
    border: 1px solid var(--line);
    border-radius: 9px;
    background: var(--surface-2);
  }
  .on {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    font-size: 0.78rem;
    color: var(--muted);
    min-width: 0;
  }
  textarea {
    width: 100%;
    resize: vertical;
    font: inherit;
    font-size: 0.85rem;
    box-sizing: border-box;
  }
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }
  .row.end {
    justify-content: flex-end;
  }
  .hint {
    font-size: 0.72rem;
    color: var(--muted);
  }
  .chip {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 0.75rem;
    font-weight: 600;
    padding: 0.08rem 0.45rem;
    border-radius: 999px;
    border: 1px solid rgb(217 142 4 / 0.5);
    background: rgb(250 204 21 / 0.16);
    color: var(--text);
    cursor: pointer;
  }
  .chip.plain {
    cursor: default;
    border-color: var(--line);
    background: var(--surface);
    font-weight: 500;
  }
  button.chip:hover {
    border-color: var(--accent);
  }
  .icon.tiny {
    font-size: 0.7rem;
    padding: 0 0.2rem;
  }
  .tabs {
    display: flex;
    gap: 0.25rem;
    border-bottom: 1px solid var(--line);
  }
  .tabs button {
    border: 0;
    background: none;
    color: var(--muted);
    font: inherit;
    font-size: 0.8rem;
    padding: 0.3rem 0.5rem;
    border-bottom: 2px solid transparent;
    margin-bottom: -1px;
    cursor: pointer;
  }
  .tabs button.on {
    color: var(--text);
    font-weight: 600;
    border-bottom-color: var(--accent);
  }
  .list {
    overflow: auto;
    display: grid;
    align-content: start;
    gap: 0.45rem;
    min-height: 3rem;
  }
  .empty {
    margin: 0.5rem 0;
    font-size: 0.82rem;
    color: var(--muted);
  }
  .empty.err {
    color: var(--danger, #b42318);
  }
  .thread {
    display: grid;
    gap: 0.3rem;
    padding: 0.5rem 0.55rem;
    border: 1px solid var(--line);
    border-left: 4px solid #d98e04;
    border-radius: 8px;
    background: var(--surface-2);
  }
  .thread.done {
    border-left-color: #16a34a;
  }
  .thread.done > :not(.where):not(.resolved) {
    opacity: 0.75;
  }
  .thread.hit {
    border-color: var(--accent);
    box-shadow: 0 0 0 1px var(--accent);
  }
  .where {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    min-width: 0;
  }
  .res {
    margin-left: auto;
    flex: none;
    display: inline-flex;
    align-items: center;
    gap: 0.2rem;
  }
  .tag {
    font-size: 0.68rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    color: var(--muted);
  }
  blockquote {
    margin: 0;
    padding: 0.1rem 0.45rem;
    border-left: 2px solid var(--line);
    font-size: 0.78rem;
    font-style: italic;
    color: var(--muted);
    overflow-wrap: anywhere;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .by {
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: 0.1rem 0.4rem;
    font-size: 0.78rem;
  }
  .time {
    color: var(--muted);
    font-size: 0.72rem;
  }
  .acts {
    margin-left: auto;
    display: flex;
    gap: 0.5rem;
  }
  .text {
    margin: 0;
    font-size: 0.85rem;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .reply {
    display: grid;
    gap: 0.15rem;
    margin-left: 0.6rem;
    padding: 0.3rem 0 0 0.6rem;
    border-left: 2px solid var(--line);
  }
  .reply-box,
  .edit-box {
    display: grid;
    gap: 0.3rem;
  }
  .resolved {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    font-size: 0.74rem;
    color: #16a34a;
  }
  .link {
    border: 0;
    background: none;
    padding: 0;
    font: inherit;
    font-size: 0.75rem;
    color: var(--accent);
    cursor: pointer;
  }
  .link.danger {
    color: var(--danger, #b42318);
  }
  .reply-btn {
    justify-self: start;
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
  }
</style>
