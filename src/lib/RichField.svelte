<script>
  import {
    richToHtml, domToRich, getSelection, setSelection, plainText, applyCase, hasList, editField, listEnter, listBackspace,
    toggleList, sliceRich
  } from './richtext.js';
  import { asStep, undo, redo } from './history.js';

  // Isian teks berformat (contenteditable). Nilainya string bertag <b>/<i>/<u>; seperti textarea biasa,
  // teksnya transparan sehingga yang terlihat tetap hasil render halaman.
  let { value, oninput, onkeydown, multiline = false, placeholder = '', class: cls = '', ...rest } = $props();

  let el;
  let last = null; // nilai terakhir yang sudah ada di DOM (dari ketikan sendiri atau render terakhir)

  // Perubahan dari luar (undo, cari & ganti): DOM diganti, kursor dipertahankan.
  $effect(() => {
    const v = value ?? '';
    if (v === last) return;
    const sel = document.activeElement === el ? getSelection(el) : null;
    el.innerHTML = richToHtml(v);
    last = v;
    if (sel) {
      const n = plainText(v).length;
      setSelection(el, Math.min(sel.start, n), Math.min(sel.end, n));
    }
  });

  const empty = $derived(!plainText(value));

  // Isian berdaftar ditulis satu <div class="ln"> per baris (lihat richToHtml).
  const lineMode = () => !!el.querySelector(':scope > .ln');

  // HTML yang dihasilkan richToHtml, dinormalkan oleh browser, untuk dibandingkan dengan isi isian.
  const tpl = document.createElement('template');
  function canonical(v) {
    tpl.innerHTML = richToHtml(v);
    return tpl.innerHTML === el.innerHTML;
  }

  function input(e) {
    last = domToRich(el);
    // Penanda daftar diketik/dihapus, atau browser memecah/menggabungkan baris: tulis ulang agar
    // setiap baris tetap satu <div> dengan indentasi yang benar.
    if (!e?.isComposing && (hasList(last) || lineMode()) && !canonical(last)) {
      const sel = getSelection(el);
      el.innerHTML = richToHtml(last);
      if (sel) setSelection(el, sel.start, sel.end);
    }
    oninput(last);
  }

  /** Sisipkan teks polos menggantikan seleksi. */
  const insertPlain = (t) => editField(el, (v, a, b) => ({ value: sliceRich(v, 0, a) + t + sliceRich(v, b), start: a + t.length, end: a + t.length }));

  const SHORTCUT = { b: 'bold', i: 'italic', u: 'underline' };
  const LIST_KEY = { 7: 'number', 8: 'bullet' };

  function keydown(e) {
    const mod = (e.ctrlKey || e.metaKey) && !e.altKey;
    const cmd = mod && !e.shiftKey && SHORTCUT[e.key.toLowerCase()];
    if (cmd) {
      e.preventDefault();
      asStep(() => document.execCommand(cmd));
      return;
    }
    // Undo/redo memakai riwayat dokumen (per langkah), bukan riwayat bawaan browser untuk isian ini.
    const k = mod && e.key.toLowerCase();
    if (k === 'z' || k === 'y') {
      e.preventDefault();
      if (k === 'y' || e.shiftKey) redo();
      else undo();
      return;
    }
    // Ctrl+Shift+7 / Ctrl+Shift+8: daftar bernomor / poin (seperti Google Dokumen).
    const kind = multiline && mod && e.shiftKey && LIST_KEY[e.code?.replace('Digit', '')];
    if (kind) {
      e.preventDefault();
      asStep(() => editField(el, (v, a, b) => toggleList(v, a, b, kind)));
      return;
    }
    if (e.key === 'F3' && e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      asStep(() => applyCase(el, 'cycle'));
      return;
    }
    onkeydown?.(e);
    if (e.defaultPrevented || e.isComposing) return;
    if (multiline && e.key === 'Backspace' && editField(el, listBackspace)) {
      e.preventDefault();
      return;
    }
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (!multiline && !e.shiftKey) return;
    if (multiline && !e.shiftKey && editField(el, listEnter)) return;
    if (lineMode()) insertPlain('\n');
    else document.execCommand('insertLineBreak');
  }

  function beforeinput(e) {
    if (e.inputType === 'historyUndo' || e.inputType === 'historyRedo') {
      e.preventDefault();
      if (e.inputType === 'historyUndo') undo();
      else redo();
    }
  }

  // Tempel sebagai teks polos agar format dari sumber lain tidak terbawa.
  function paste(e) {
    e.preventDefault();
    let t = e.clipboardData?.getData('text/plain') ?? '';
    t = t.replace(/\r\n?/g, '\n');
    if (!multiline) t = t.replace(/\n+/g, ' ');
    if (lineMode() || (multiline && t.includes('\n'))) insertPlain(t);
    else document.execCommand('insertText', false, t);
  }
</script>

<div
  bind:this={el}
  class="f-rich {cls}"
  class:empty
  contenteditable="true"
  role="textbox"
  tabindex="0"
  aria-multiline={multiline}
  data-placeholder={placeholder}
  spellcheck="false"
  oninput={input}
  onbeforeinput={beforeinput}
  onkeydown={keydown}
  onpaste={paste}
  ondrop={(e) => e.preventDefault()}
  {...rest}
></div>

<style>
  .f-rich {
    outline: none;
    overflow: hidden;
    white-space: pre-wrap;
    overflow-wrap: break-word;
    line-height: 1.2;
    color: transparent;
    caret-color: #000;
    cursor: text;
  }
  .f-rich :global(*) {
    color: transparent;
  }
  /* Butir daftar: indentasi gantung selebar penandanya, sama dengan tata letak halaman. */
  .f-rich :global(.li) {
    padding-left: var(--ind);
    text-indent: calc(-1 * var(--ind));
  }
  .f-rich::selection,
  .f-rich :global(*::selection) {
    background: rgb(var(--edit) / 0.3);
    color: transparent;
  }
  .f-rich.empty::before {
    content: attr(data-placeholder);
    position: absolute;
    color: #98a2b6;
    font-style: italic;
    opacity: 0;
    pointer-events: none;
  }
  :global(.page:hover) .f-rich.empty::before,
  .f-rich.empty:focus::before {
    opacity: 1;
  }
</style>
