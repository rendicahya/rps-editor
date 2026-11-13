// Daftar induk RPS: satu lembar XLSX berisi daftar RPS dari Pustaka Daring (untuk audit mutu atau akreditasi).
// Dibuat dari nol (tanpa template): judul, keterangan, lalu tabel berfilter dengan baris judul kolom yang dibekukan
// dan diulang di setiap halaman cetak.
import { zipSync, strToU8 } from 'fflate';

const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
const col = (i) => {
  let s = '';
  for (i += 1; i; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s;
  return s;
};

// Gaya sel (urutan cellXfs di styles.xml).
const S = { title: 1, note: 2, head: 3, body: 4, num: 5 };

const STYLES = `${XML}<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="4"><font><sz val="10"/><name val="Arial"/></font><font><b/><sz val="14"/><name val="Arial"/></font><font><i/><sz val="9"/><color rgb="FF555555"/><name val="Arial"/></font><font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Arial"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF1F4E79"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFB0B7C3"/></left><right style="thin"><color rgb="FFB0B7C3"/></right><top style="thin"><color rgb="FFB0B7C3"/></top><bottom style="thin"><color rgb="FFB0B7C3"/></bottom><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="6">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="3" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
<xf numFmtId="1" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="top"/></xf>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

function cell(r, c, v, s) {
  const ref = col(c) + r;
  if (typeof v === 'number') return `<c r="${ref}" s="${s}"><v>${v}</v></c>`;
  if (v == null || v === '') return `<c r="${ref}" s="${s}"/>`;
  return `<c r="${ref}" s="${s}" t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
}

/**
 * columns: [{ label, width }] (lebar dalam karakter). rows: nilai per kolom (angka atau teks).
 * Hasil: Blob XLSX.
 */
export function registerXlsx({ title, note, columns, rows, author }) {
  const HEAD = 4; // baris judul kolom
  const last = col(columns.length - 1);
  const end = HEAD + rows.length;
  const xmlRows = [
    `<row r="1" ht="22" customHeight="1">${cell(1, 0, title, S.title)}</row>`,
    `<row r="2">${cell(2, 0, note, S.note)}</row>`,
    `<row r="${HEAD}" ht="30" customHeight="1">${columns.map((c, i) => cell(HEAD, i, c.label, S.head)).join('')}</row>`,
    ...rows.map((row, k) => {
      const r = HEAD + 1 + k;
      return `<row r="${r}">${row.map((v, i) => cell(r, i, v, typeof v === 'number' ? S.num : S.body)).join('')}</row>`;
    })
  ];
  const sheet =
    `${XML}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>` +
    `<dimension ref="A1:${last}${Math.max(end, HEAD)}"/>` +
    `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${HEAD}" topLeftCell="A${HEAD + 1}" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A${HEAD + 1}" sqref="A${HEAD + 1}"/></sheetView></sheetViews>` +
    `<sheetFormatPr defaultRowHeight="13"/>` +
    `<cols>${columns.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.width}" customWidth="1"/>`).join('')}</cols>` +
    `<sheetData>${xmlRows.join('')}</sheetData>` +
    (rows.length ? `<autoFilter ref="A${HEAD}:${last}${end}"/>` : '') +
    `<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.6" header="0.3" footer="0.3"/>` +
    `<pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/>` +
    `<headerFooter><oddFooter>&amp;L${esc(title)}&amp;RHalaman &amp;P dari &amp;N</oddFooter></headerFooter>` +
    `</worksheet>`;
  const sheetName = 'Daftar Induk RPS';
  const workbook =
    `${XML}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<sheets><sheet name="${sheetName}" sheetId="1" r:id="rId1"/></sheets>` +
    `<definedNames>` +
    (rows.length ? `<definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">'${sheetName}'!$A$${HEAD}:$${last}$${end}</definedName>` : '') +
    `<definedName name="_xlnm.Print_Titles" localSheetId="0">'${sheetName}'!$${HEAD}:$${HEAD}</definedName>` +
    `</definedNames></workbook>`;
  const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  const files = {
    '[Content_Types].xml': `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`,
    '_rels/.rels': `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`,
    'xl/_rels/workbook.xml.rels': `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    'xl/workbook.xml': workbook,
    'xl/styles.xml': STYLES,
    'xl/worksheets/sheet1.xml': sheet,
    'docProps/core.xml':
      `${XML}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">` +
      `<dc:title>${esc(title)}</dc:title><dc:creator>${esc(author || 'RPS Editor')}</dc:creator>` +
      `<dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created></cp:coreProperties>`
  };
  const out = {};
  for (const [k, v] of Object.entries(files)) out[k] = strToU8(v);
  return new Blob([zipSync(out, { level: 6 })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
