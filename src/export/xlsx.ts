import { colSum, type Cell, type ColType, type Report, type Sheet } from './model';
import { utf8 } from './bytes';
import { zipStore } from './zip';

const esc = (s: string) => s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const colName = (i: number) => { let s = ''; for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; };
const serial = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86400000 + 25569;

// estilos (índices de cellXfs)
const S_TITLE = 1, S_NOTE = 2, S_HEAD = 3, S_TEXT = 4, S_MONEY = 5, S_PCT = 6, S_DATE = 7, S_INT = 8, S_TTEXT = 9, S_TMONEY = 10, S_TPCT = 11, S_TINT = 12;
const BODY: Record<ColType, number> = { text: S_TEXT, money: S_MONEY, pct: S_PCT, date: S_DATE, int: S_INT };
const TOTAL: Record<ColType, number> = { text: S_TTEXT, money: S_TMONEY, pct: S_TPCT, date: S_TTEXT, int: S_TINT };
const DEFAULT_W: Record<ColType, number> = { text: 28, money: 16, pct: 12, date: 13, int: 10 };

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="3"><numFmt numFmtId="164" formatCode="&quot;$&quot;#,##0;[Red]\\-&quot;$&quot;#,##0"/><numFmt numFmtId="165" formatCode="0.0%;[Red]\\-0.0%"/><numFmt numFmtId="166" formatCode="dd/mm/yyyy"/></numFmts>
<fonts count="4"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="14"/><color rgb="FF12343B"/><name val="Calibri"/></font><font><sz val="10"/><color rgb="FF5D7378"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts>
<fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF12343B"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF3E3BD"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left/><right/><top style="thin"><color rgb="FF12343B"/></top><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="13">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="3" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="left"/></xf>
<xf numFmtId="1" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0" applyFill="1" applyBorder="1"/>
<xf numFmtId="164" fontId="0" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="165" fontId="0" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="1" fontId="0" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

const cStr = (ref: string, s: number, v: string) => `<c r="${ref}" s="${s}" t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
const cNum = (ref: string, s: number, v: number) => `<c r="${ref}" s="${s}"><v>${Number.isFinite(v) ? v : 0}</v></c>`;

function cell(ref: string, type: ColType, v: Cell): string {
  if (v === null || v === '') return '';
  if (type === 'date' && typeof v === 'string') return cNum(ref, S_DATE, serial(v));
  if (typeof v === 'number') return cNum(ref, BODY[type], v);
  return cStr(ref, S_TEXT, v);
}

function sheetXml(rep: Report, sh: Sheet): string {
  const n = sh.cols.length, last = colName(n - 1), rows: string[] = [];
  const HEAD_ROW = 3, first = HEAD_ROW + 1, end = HEAD_ROW + sh.rows.length;
  rows.push(`<row r="1" ht="22" customHeight="1">${cStr('A1', S_TITLE, `${rep.title} · ${rep.period}`)}</row>`);
  rows.push(`<row r="2">${cStr('A2', S_NOTE, sh.note || sh.title || sh.name)}</row>`);
  rows.push(`<row r="${HEAD_ROW}" ht="24" customHeight="1">${sh.cols.map((c, i) => cStr(colName(i) + HEAD_ROW, S_HEAD, c.label)).join('')}</row>`);
  sh.rows.forEach((r, k) => {
    const rn = first + k;
    rows.push(`<row r="${rn}">${sh.cols.map((c, i) => cell(colName(i) + rn, c.type, r[i] ?? null)).join('')}</row>`);
  });
  if (sh.totals) {
    const rn = end + 1;
    rows.push(`<row r="${rn}">${sh.cols.map((c, i) => {
      const t = sh.totals![i], ref = colName(i) + rn;
      if (t === 'sum') return sh.rows.length ? `<c r="${ref}" s="${TOTAL[c.type]}"><f>SUM(${colName(i)}${first}:${colName(i)}${end})</f><v>${colSum(sh.rows, i)}</v></c>` : cNum(ref, TOTAL[c.type], 0);
      if (typeof t === 'number') return cNum(ref, TOTAL[c.type], t);
      if (typeof t === 'string') return cStr(ref, S_TTEXT, t);
      return `<c r="${ref}" s="${S_TTEXT}"/>`;
    }).join('')}</row>`);
  }
  const cols = sh.cols.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.w ? Math.max(8, Math.round(c.w * 6)) : DEFAULT_W[c.type]}" customWidth="1"/>`).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0" showGridLines="0"><pane ySplit="${HEAD_ROW}" topLeftCell="A${first}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/><cols>${cols}</cols><sheetData>${rows.join('')}</sheetData>${sh.rows.length ? `<autoFilter ref="A${HEAD_ROW}:${last}${end}"/>` : ''}<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/><pageSetup orientation="${n > 6 ? 'landscape' : 'portrait'}" fitToHeight="0"/></worksheet>`;
}

const sheetName = (s: string, used: Set<string>) => {
  let base = s.replace(/[\[\]:*?\/\\]/g, ' ').trim().slice(0, 31) || 'Hoja', name = base, k = 2;
  while (used.has(name.toLowerCase())) name = base.slice(0, 28) + ' ' + k++;
  used.add(name.toLowerCase());
  return name;
};

/** Libro de Excel (.xlsx): una hoja por sección, encabezado fijo, filtros, formatos de pesos / % / fecha y totales con fórmulas. */
export function toXlsx(rep: Report): Uint8Array {
  const used = new Set<string>(), names = rep.sheets.map(s => sheetName(s.name, used));
  const rels = rep.sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('');
  const files = [
    { name: '[Content_Types].xml', text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>${rep.sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>` },
    { name: '_rels/.rels', text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>` },
    { name: 'docProps/core.xml', text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${esc(rep.title + ' · ' + rep.period)}</dc:title><dc:creator>Equa</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${esc(rep.generatedAt)}</dcterms:created></cp:coreProperties>` },
    { name: 'xl/workbook.xml', text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets>${names.map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>` },
    { name: 'xl/_rels/workbook.xml.rels', text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels}<Relationship Id="rId${rep.sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
    { name: 'xl/styles.xml', text: STYLES },
    ...rep.sheets.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, text: sheetXml(rep, s) })),
  ];
  return zipStore(files.map(f => ({ name: f.name, data: utf8(f.text) })));
}
