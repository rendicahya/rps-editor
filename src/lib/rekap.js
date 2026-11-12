// Rekap kontribusi nilai: berapa persen nilai akhir yang mengukur tiap Sub-CPMK, CPMK, dan CPL.
// Sub-CPMK = Σ bobot asesmen × porsi asesmen itu untuk Sub-CPMK tsb.; CPMK = jumlah Sub-CPMK-nya;
// CPL = jumlah CPMK yang mendukungnya (CPMK yang mendukung beberapa CPL dihitung penuh di tiap CPL).

const round = (n) => Math.round(n * 100) / 100;

/**
 * { total, sub, cpmk, cpl, tree, orphanCpmk, orphanSub }
 * total: jumlah bobot asesmen (seharusnya 100). sub/cpmk/cpl: Map id → persen nilai akhir.
 * sub juga punya `from` (Map id → [{ kode, nilai }] asesmen penyumbang) dan `pekan` (Map id → jumlah pertemuan).
 * tree: [{ item, value, children: [{ item, value, children: [{ item, value, from, pekan }] }] }] per CPL.
 * orphanCpmk: CPMK tanpa CPL (dengan Sub-CPMK-nya); orphanSub: Sub-CPMK tanpa CPMK induk.
 */
export function contributions(doc) {
  const total = round(doc.asesmen.reduce((t, a) => t + (a.bobot ?? 0), 0));
  const sub = new Map();
  const from = new Map();
  for (const s of doc.subCpmk) {
    let v = 0;
    const list = [];
    for (const a of doc.asesmen) {
      const n = (a.bobot ?? 0) * (a.porsi[s.id] ?? 0);
      if (n > 0) list.push({ kode: a.kode || 'Asesmen', nilai: round(n) });
      v += n;
    }
    sub.set(s.id, round(v));
    from.set(s.id, list);
  }
  const pekan = new Map(doc.subCpmk.map((s) => [s.id, doc.pertemuan.filter((p) => p.subCpmk.includes(s.id)).length]));

  const subsOf = (m) => doc.subCpmk.filter((s) => s.cpmk === m.id);
  const cpmk = new Map(doc.cpmk.map((m) => [m.id, round(subsOf(m).reduce((t, s) => t + sub.get(s.id), 0))]));
  const supporters = (c) => doc.cpmk.filter((m) => m.cpl.includes(c.id));
  const cpl = new Map(doc.cpl.map((c) => [c.id, round(supporters(c).reduce((t, m) => t + cpmk.get(m.id), 0))]));

  const subNode = (s) => ({ item: s, value: sub.get(s.id), from: from.get(s.id), pekan: pekan.get(s.id) });
  const cpmkNode = (m) => ({ item: m, value: cpmk.get(m.id), children: subsOf(m).map(subNode) });
  const known = new Set(doc.cpmk.map((m) => m.id));
  return {
    total,
    sub,
    cpmk,
    cpl,
    tree: doc.cpl.map((c) => ({ item: c, value: cpl.get(c.id), children: supporters(c).map(cpmkNode) })),
    orphanCpmk: doc.cpmk.filter((m) => !m.cpl.some((id) => doc.cpl.some((c) => c.id === id))).map(cpmkNode),
    orphanSub: doc.subCpmk.filter((s) => !s.cpmk || !known.has(s.cpmk)).map(subNode)
  };
}
