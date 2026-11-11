// Format teks sederhana pada isian konten (butir bagian dan sel langkah): <b>tebal</b>, <i>miring</i>,
// <u>garis bawah</u>. Dokumen tetap menyimpan string biasa; tag yang tidak berpasangan diabaikan dengan aman.
// Teks lain (mis. "< 3 hari") tetap literal karena hanya enam tag itu yang dikenali.

const TAG = /<(\/?)([biu])>/gi;
const KEYS = ['b', 'i', 'u'];

export const hasMarkup = (s) => /<\/?[biu]>/i.test(s ?? '');
export const plainText = (s) => String(s ?? '').replace(TAG, '');

/** "a <b>b</b>" → [{ text: 'a ', b: false, … }, { text: 'b', b: true, … }] */
export function parseRich(s) {
  const src = String(s ?? '');
  const depth = { b: 0, i: 0, u: 0 };
  const runs = [];
  const push = (text) => {
    if (!text) return;
    const f = { b: depth.b > 0, i: depth.i > 0, u: depth.u > 0 };
    const last = runs.at(-1);
    if (last && KEYS.every((k) => last[k] === f[k])) last.text += text;
    else runs.push({ text, ...f });
  };
  let at = 0;
  for (const m of src.matchAll(TAG)) {
    push(src.slice(at, m.index));
    const k = m[2].toLowerCase();
    depth[k] = Math.max(0, depth[k] + (m[1] ? -1 : 1));
    at = m.index + m[0].length;
  }
  push(src.slice(at));
  return runs;
}

/** Kebalikan parseRich dengan tag sesedikit mungkin; `esc` dipakai untuk HTML. */
export function serializeRuns(runs, esc = (t) => t) {
  let out = '';
  const open = [];
  for (const r of runs) {
    if (!r.text) continue;
    while (open.some((k) => !r[k])) out += `</${open.pop()}>`;
    for (const k of KEYS) if (r[k] && !open.includes(k)) open.push(k), (out += `<${k}>`);
    out += esc(r.text);
  }
  while (open.length) out += `</${open.pop()}>`;
  return out;
}

/** Bagian [start, end) teks polos, beserta formatnya. */
export function sliceRich(s, start, end = Infinity) {
  const out = [];
  let at = 0;
  for (const r of parseRich(s)) {
    const a = Math.max(start, at);
    const b = Math.min(end, at + r.text.length);
    if (b > a) out.push({ ...r, text: r.text.slice(a - at, b - at) });
    at += r.text.length;
  }
  return serializeRuns(out);
}

/** Ganti semua kecocokan `pattern` (berflag g) pada teks polos; teks pengganti mengikuti format awal kecocokan. */
export function replaceRich(s, pattern, replacement) {
  const chars = [];
  for (const r of parseRich(s)) for (const ch of r.text) chars.push({ text: ch, b: r.b, i: r.i, u: r.u });
  const plain = chars.map((c) => c.text).join('');
  const out = [];
  let at = 0;
  let n = 0;
  for (const m of plain.matchAll(pattern)) {
    // Indeks matchAll dalam satuan UTF-16; `chars` per kode titik, jadi petakan lewat panjang kumulatif.
    out.push(...charsBetween(chars, at, m.index));
    const f = charAt(chars, m.index) ?? charAt(chars, m.index - 1) ?? { b: false, i: false, u: false };
    if (replacement) out.push({ text: replacement, b: f.b, i: f.i, u: f.u });
    at = m.index + m[0].length;
    n++;
  }
  if (!n) return { value: s, n };
  out.push(...charsBetween(chars, at, Infinity));
  return { value: serializeRuns(out), n };
}

function charsBetween(chars, a, b) {
  const out = [];
  let pos = 0;
  for (const c of chars) {
    if (pos >= a && pos < b) out.push(c);
    pos += c.text.length;
  }
  return out;
}

function charAt(chars, i) {
  let pos = 0;
  for (const c of chars) {
    if (pos === i) return c;
    pos += c.text.length;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Ubah huruf besar/kecil
// ---------------------------------------------------------------------------

export const CASES = [
  ['upper', 'HURUF BESAR'],
  ['lower', 'huruf kecil'],
  ['title', 'Huruf Awal Kata'],
  ['sentence', 'Huruf awal kalimat']
];

// Kata tugas yang tetap kecil pada "Huruf Awal Kata" kecuali di awal (PUEBI).
const SMALL = new Set(
  'dan atau di ke dari yang untuk pada dengan dalam oleh serta bagi tentang sebagai terhadap secara antara kepada daripada'.split(
    ' '
  )
);
const WORDCH = /[\p{L}\p{N}'’]/u;

/** Mode berikutnya untuk Shift+F3 (seperti Word): BESAR → kecil → Awal Kata → BESAR. */
export function nextCase(text) {
  if (!/\p{L}/u.test(text)) return 'upper';
  if (text === text.toLocaleUpperCase('id')) return 'lower';
  if (text === text.toLocaleLowerCase('id')) return 'title';
  return 'upper';
}

/** Rentang kata di sekitar posisi `pos` pada teks polos (untuk perintah tanpa seleksi). */
export function wordAt(plain, pos) {
  const chars = [...plain];
  let a = pos;
  let b = pos;
  while (a > 0 && WORDCH.test(chars[a - 1])) a--;
  while (b < chars.length && WORDCH.test(chars[b])) b++;
  return { start: a, end: b };
}

/** Ubah huruf pada [start, end) teks polos `s` (posisi per kode titik); format tetap. */
export function changeCase(s, start, end, mode) {
  const chars = [];
  for (const r of parseRich(s)) for (const ch of r.text) chars.push({ text: ch, b: r.b, i: r.i, u: r.u });
  const up = (c) => c.toLocaleUpperCase('id');
  const low = (c) => c.toLocaleLowerCase('id');
  const plain = chars.map((c) => c.text);
  for (let i = start; i < end && i < chars.length; i++) {
    const c = plain[i];
    if (mode === 'upper') chars[i].text = up(c);
    else if (mode === 'lower') chars[i].text = low(c);
    else if (mode === 'title') {
      if (i > 0 && WORDCH.test(plain[i - 1])) chars[i].text = low(c);
      else {
        let j = i;
        while (j < plain.length && WORDCH.test(plain[j])) j++;
        const word = low(plain.slice(i, j).join(''));
        chars[i].text = i > start && SMALL.has(word) ? low(c) : up(c);
      }
    } else {
      // Huruf pertama kalimat: awal teks, atau huruf pertama setelah . ! ? / baris baru.
      let k = i - 1;
      while (k >= 0 && !/[\p{L}\p{N}.!?\n]/u.test(plain[k])) k--;
      const first = /\p{L}/u.test(c) && (k < 0 || /[.!?\n]/.test(plain[k]));
      chars[i].text = first ? up(c) : low(c);
    }
  }
  return serializeRuns(chars);
}

/**
 * Ubah huruf pada seleksi di isian `root` (tanpa seleksi: kata di posisi kursor). `mode` 'cycle' memilih
 * mode berikutnya seperti Shift+F3. Isian diberi event input agar nilainya tersimpan.
 */
export function applyCase(root, mode) {
  const sel = getSelection(root);
  if (!sel) return;
  const value = domToRich(root);
  const plain = plainText(value);
  let { start, end } = sel;
  if (start > end) [start, end] = [end, start];
  if (start === end) ({ start, end } = wordAt(plain, start));
  if (start === end) return;
  if (mode === 'cycle') mode = nextCase([...plain].slice(start, end).join(''));
  const next = changeCase(value, start, end, mode);
  if (next === value) return;
  setRich(root, next, start, start + (plainText(next).length - plain.length) + (end - start));
}

// ---------------------------------------------------------------------------
// Daftar poin/bernomor di dalam sel: baris yang diawali "• " atau "1. " (juga "1) ").
// Tetap teks biasa; tata letak memberi indentasi gantung agar baris lanjutan rata dengan teksnya.
// ---------------------------------------------------------------------------

export const BULLET = '• ';
const LIST = /^(?:•|\d{1,3}[.)])[ \t]+/;

/** Penanda daftar di awal baris teks polos ('' bila bukan butir daftar). */
export const listMarker = (line) => line.match(LIST)?.[0] ?? '';
export const hasList = (s) => plainText(s).split('\n').some((l) => LIST.test(l));
const numbered = (m) => /^\d/.test(m);

// Ukuran penanda dalam em (lebar sesungguhnya diisi layout.js dengan metrik font dokumen).
let markerEm = (m) => m.length * 0.5;
export const setMarkerMeasure = (fn) => (markerEm = fn);

/** Ganti penanda tiap baris (`marks[i]`, '' = tanpa penanda) lalu nomori ulang; posisi `pos` ikut bergeser. */
function remark(s, marks, pos) {
  const plain = plainText(s);
  const lines = plain.split('\n');
  const want = lines.map((l, i) => marks[i] ?? listMarker(l));
  // Nomor berurutan dalam tiap kelompok baris bernomor yang bersambung.
  let n = 0;
  want.forEach((m, i) => {
    n = numbered(m) ? n + 1 : 0;
    if (n) want[i] = m.replace(/^\d+/, n);
  });
  let out = '';
  let at = 0;
  let to = 0;
  const moved = pos.map(() => null);
  lines.forEach((l, i) => {
    const old = listMarker(l).length;
    const m = want[i];
    pos.forEach((p, k) => {
      if (moved[k] === null && p <= at + l.length) moved[k] = to + m.length + Math.max(0, p - at - old);
    });
    out += (i ? '\n' : '') + m + sliceRich(s, at + old, at + l.length);
    at += l.length + 1;
    to += m.length + l.length - old + 1;
  });
  return { value: out, pos: moved.map((p) => p ?? to - 1) };
}

/** Rentang baris yang tersentuh seleksi [start, end]. */
function linesOf(plain, start, end) {
  const lines = plain.split('\n');
  let at = 0;
  let a = -1;
  let b = -1;
  lines.forEach((l, i) => {
    if (a < 0 && start <= at + l.length) a = i;
    if (b < 0 && end <= at + l.length) b = i;
    at += l.length + 1;
  });
  const last = lines.length - 1;
  return { lines, a: a < 0 ? last : a, b: b < 0 ? last : b };
}

/** Jadikan baris terpilih butir daftar `kind` ('bullet' | 'number'), atau lepaskan bila semuanya sudah begitu. */
export function toggleList(s, start, end, kind) {
  const { lines, a, b } = linesOf(plainText(s), start, end);
  const isKind = (l) => (kind === 'number' ? numbered(listMarker(l)) : listMarker(l).startsWith('•'));
  const off = lines.slice(a, b + 1).every(isKind);
  const marks = lines.map((_, i) => (i < a || i > b ? undefined : off ? '' : kind === 'number' ? '1. ' : BULLET));
  const r = remark(s, marks, [start, end]);
  return { value: r.value, start: r.pos[0], end: r.pos[1] };
}

/**
 * Enter pada butir daftar: butir baru dengan penanda berikutnya; pada butir kosong, daftar diakhiri.
 * Mengembalikan null bila baris kursor bukan butir daftar.
 */
export function listEnter(s, start, end) {
  const plain = plainText(s);
  const { lines, a } = linesOf(plain, start, start);
  const m = listMarker(lines[a]);
  if (!m) return null;
  const lineStart = lines.slice(0, a).reduce((x, l) => x + l.length + 1, 0);
  if (start === end && lines[a].length === m.length) {
    const r = remark(s, lines.map((_, i) => (i === a ? '' : undefined)), [lineStart]);
    return { value: r.value, start: r.pos[0], end: r.pos[0] };
  }
  const next = start - lineStart < m.length ? '' : numbered(m) ? m.replace(/^\d+/, (d) => +d + 1) : m;
  const value = sliceRich(s, 0, start) + '\n' + next + sliceRich(s, end);
  const r = remark(value, [], [start + 1 + next.length]);
  return { value: r.value, start: r.pos[0], end: r.pos[0] };
}

/** Backspace tepat setelah penanda daftar melepas penandanya. Null bila tidak berlaku. */
export function listBackspace(s, start, end) {
  if (start !== end) return null;
  const { lines, a } = linesOf(plainText(s), start, start);
  const m = listMarker(lines[a]);
  const lineStart = lines.slice(0, a).reduce((x, l) => x + l.length + 1, 0);
  if (!m || start - lineStart !== m.length) return null;
  const r = remark(s, lines.map((_, i) => (i === a ? '' : undefined)), [start]);
  return { value: r.value, start: r.pos[0], end: r.pos[0] };
}

/** Jenis daftar baris kursor di isian `root`: 'bullet', 'number', atau ''. */
export function listKindAt(root) {
  const sel = getSelection(root);
  if (!sel) return '';
  const plain = plainText(domToRich(root));
  const { lines, a } = linesOf(plain, Math.min(sel.start, sel.end), 0);
  const m = listMarker(lines[a] ?? '');
  return !m ? '' : numbered(m) ? 'number' : 'bullet';
}

/** Terapkan `fn(value, start, end)` → { value, start, end } pada isian `root`. */
export function editField(root, fn) {
  const sel = getSelection(root);
  if (!sel) return false;
  const value = domToRich(root);
  const r = fn(value, Math.min(sel.start, sel.end), Math.max(sel.start, sel.end));
  if (!r) return false;
  setRich(root, r.value, r.start, r.end);
  return true;
}

/** Ganti isi isian dengan nilai baru (memicu input agar tersimpan) dan pasang seleksi. */
export function setRich(root, value, start, end = start) {
  root.innerHTML = richToHtml(value);
  root.dispatchEvent(new Event('input', { bubbles: true }));
  setSelection(root, start, end);
}

/** Tag format dari jawaban AI: <strong>/<em>/**tebal** diseragamkan ke <b>/<i>. */
export function normalizeMarkup(s) {
  return String(s ?? '')
    .replace(/<(\/?)strong>/gi, '<$1b>')
    .replace(/<(\/?)em>/gi, '<$1i>')
    .replace(/\*\*(?=\S)([^*\n]*?\S)\*\*/g, '<b>$1</b>');
}

// ---------------------------------------------------------------------------
// Isian contenteditable
// ---------------------------------------------------------------------------

const escHtml = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');

/**
 * HTML isian; baris kosong terakhir butuh <br> tambahan agar terlihat. Isian berdaftar ditulis satu
 * <div class="ln"> per baris agar butir daftar bisa diberi indentasi gantung seperti di halaman.
 */
export function richToHtml(s) {
  const plain = plainText(s);
  if (hasList(s)) {
    let at = 0;
    return plain
      .split('\n')
      .map((l) => {
        const html = serializeRuns(parseRich(sliceRich(s, at, at + l.length)), escHtml);
        at += l.length + 1;
        const m = listMarker(l);
        const attr = m ? ` class="ln li" style="--ind: ${+markerEm(m).toFixed(4)}em;"` : ' class="ln"';
        return `<div${attr}>${html || '<br>'}</div>`;
      })
      .join('');
  }
  const html = serializeRuns(parseRich(s), escHtml);
  return /\n$/.test(plain) ? html + '<br>' : html;
}

const BLOCK = new Set(['DIV', 'P', 'LI']);
const isLine = (n) => n?.nodeName === 'DIV' && n.classList.contains('ln');

/** Potongan teks berformat dalam urutan dokumen: { node, text, b, i, u, br }. */
function pieces(root) {
  const out = [];
  const walk = (node, f) => {
    for (const c of node.childNodes) {
      if (c.nodeType === 3) {
        if (c.data) out.push({ node: c, text: c.data, ...f });
      } else if (c.nodeType === 1) {
        if (c.nodeName === 'BR') {
          // <br> terakhir dalam baris <div class="ln"> hanyalah penampung baris kosong.
          if (!(isLine(node) && c === node.lastChild)) out.push({ node: c, text: '\n', ...f, br: true });
          continue;
        }
        const st = c.style;
        const w = st?.fontWeight;
        const deco = `${st?.textDecorationLine ?? ''} ${st?.textDecoration ?? ''}`;
        const g = {
          b: /^(B|STRONG)$/.test(c.nodeName) || (w ? w === 'bold' || +w >= 600 : f.b),
          i: /^(I|EM)$/.test(c.nodeName) || (st?.fontStyle ? st.fontStyle !== 'normal' : f.i),
          u: c.nodeName === 'U' || /underline/.test(deco) || f.u
        };
        if (w && (w === 'normal' || +w < 600) && !/^(B|STRONG)$/.test(c.nodeName)) g.b = false;
        if (isLine(c)) {
          if (out.length) out.push({ node: c, text: '\n', ...f, line: true });
        } else if (BLOCK.has(c.nodeName) && out.length && out.at(-1).text !== '\n') out.push({ node: c, text: '\n', ...f });
        walk(c, g);
      }
    }
  };
  walk(root, { b: false, i: false, u: false });
  return out;
}

/** Isi isian → teks bertag. <br> terakhir hanyalah penampung baris, bukan baris baru. */
export function domToRich(root) {
  const ps = pieces(root);
  if (ps.at(-1)?.br) ps.pop();
  return serializeRuns(ps);
}

const plainLength = (node) => pieces(node).reduce((a, p) => a + p.text.length, 0);

/** Posisi kursor/seleksi dalam teks polos, atau null bila seleksi di luar `root`. */
export function getSelection(root) {
  const sel = root.ownerDocument.getSelection();
  if (!sel?.rangeCount || !root.contains(sel.anchorNode)) return null;
  const r = sel.getRangeAt(0);
  const at = (node, off) => {
    const pre = root.ownerDocument.createRange();
    pre.selectNodeContents(root);
    pre.setEnd(node, off);
    return plainLength(pre.cloneContents());
  };
  return { start: at(r.startContainer, r.startOffset), end: at(r.endContainer, r.endOffset) };
}

/** Taruh kursor (atau seleksi) di posisi teks polos. */
export function setSelection(root, start, end = start) {
  const doc = root.ownerDocument;
  // Ujung baris <div class="ln">: sebelum <br> penampung bila barisnya kosong.
  const lineEnd = (div) => [div, div.lastChild?.nodeName === 'BR' ? div.childNodes.length - 1 : div.childNodes.length];
  const locate = (pos) => {
    let acc = 0;
    for (const p of pieces(root)) {
      if (p.line && pos === acc + 1) return [p.node, 0];
      if (p.line && pos === acc && isLine(p.node.previousSibling)) return lineEnd(p.node.previousSibling);
      if (pos <= acc + p.text.length && !(p.text === '\n' && pos === acc + 1)) {
        if (p.node.nodeType === 3) return [p.node, pos - acc];
        return [p.node.parentNode, [...p.node.parentNode.childNodes].indexOf(p.node)];
      }
      acc += p.text.length;
    }
    const last = root.lastChild;
    if (isLine(last)) return lineEnd(last);
    return last?.nodeName === 'BR' ? [root, root.childNodes.length - 1] : [root, root.childNodes.length];
  };
  const range = doc.createRange();
  range.setStart(...locate(start));
  range.setEnd(...locate(end));
  const sel = doc.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}

// ---------------------------------------------------------------------------
// Pemenggalan baris berformat
// ---------------------------------------------------------------------------

/**
 * Memenggal runs menjadi baris (masing-masing array runs) selebar `width`.
 * `measure(text, bold)` mengembalikan lebar teks dalam satuan yang sama.
 */
export function wrapRuns(runs, width, measure) {
  // Karakter berformat → paragraf → token (kata/spasi).
  const paras = [[]];
  for (const r of runs) {
    for (const ch of r.text.replace(/\r/g, '')) {
      if (ch === '\n') paras.push([]);
      else paras.at(-1).push({ ch, b: r.b, i: r.i, u: r.u });
    }
  }
  const W = Math.max(width, 2);
  const widthOf = (chars) => {
    let w = 0;
    let s = '';
    let bold = null;
    for (const c of chars) {
      if (c.b !== bold && s) (w += measure(s, bold)), (s = '');
      bold = c.b;
      s += c.ch;
    }
    return s ? w + measure(s, bold) : w;
  };
  const lines = [];
  for (const chars of paras) {
    // Butir daftar: baris lanjutan menjorok selebar penandanya (indentasi gantung).
    const marker = listMarker(chars.map((c) => c.ch).join(''));
    const ind = marker ? widthOf(chars.slice(0, marker.length)) : 0;
    let lim = W;
    const tokens = [];
    for (const c of chars) {
      const space = c.ch === ' ';
      const last = tokens.at(-1);
      if (last && last.space === space) last.chars.push(c);
      else tokens.push({ space, chars: [c] });
    }
    let line = [];
    let lw = 0;
    const flush = () => {
      while (line.length && line.at(-1).ch === ' ') line.pop();
      if (lim < W) line.indent = ind;
      lines.push(line);
      line = [];
      lw = 0;
      lim = Math.max(W - ind, 2);
    };
    for (const t of tokens) {
      const tw = widthOf(t.chars);
      if (t.space) {
        if (line.length) (line.push(...t.chars), (lw += tw));
        continue;
      }
      if (line.length && lw + tw > lim) flush();
      if (tw <= lim) {
        line.push(...t.chars);
        lw += tw;
        continue;
      }
      // Kata lebih lebar dari kolom: dipenggal per huruf.
      for (const c of t.chars) {
        const cw = widthOf([c]);
        if (line.length && lw + cw > lim) flush();
        line.push(c);
        lw += cw;
      }
    }
    flush();
  }
  return lines.map((chars) => {
    const out = [];
    for (const c of chars) {
      const last = out.at(-1);
      if (last && last.b === c.b && last.i === c.i && last.u === c.u) last.text += c.ch;
      else out.push({ text: c.ch, b: c.b, i: c.i, u: c.u });
    }
    if (chars.indent) out.indent = chars.indent;
    return out;
  });
}

/** Teks satu baris tata letak (string biasa atau array runs). */
export const lineText = (line) => (typeof line === 'string' ? line : line.map((r) => r.text).join(''));
