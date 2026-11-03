import { colSum, dmy, showCell, type Cell, type Col, type Report, type Sheet } from './model';
import { concat } from './bytes';

// Helvetica estándar de PDF (no hace falta incrustar tipografías). Anchos por carácter, en milésimas de em, de ' ' (32) a '~' (126).
const W_REG = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584];
const W_BOLD = [278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584];
const PLAIN: Record<string, string> = { á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u', ü: 'u', ñ: 'n', Á: 'A', É: 'E', Í: 'I', Ó: 'O', Ú: 'U', Ü: 'U', Ñ: 'N', '·': '.' };

/** Texto apto para la codificación WinAnsi de la fuente: cambia lo que no existe en ella por un equivalente. */
function clean(s: string): string {
  return s.replace(/−/g, '-').replace(/[–—]/g, '-').replace(/…/g, '...').replace(/[→›]/g, '>').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[^\x20-\x7e¡-ÿ]/g, '?');
}
function width(s: string, size: number, bold: boolean): number {
  const T = bold ? W_BOLD : W_REG;
  let w = 0;
  for (const ch of s) { const p = PLAIN[ch] ?? ch, c = p.charCodeAt(0); w += c >= 32 && c <= 126 ? T[c - 32] : 556; }
  return (w * size) / 1000;
}
function fit(s: string, max: number, size: number, bold: boolean): string {
  if (width(s, size, bold) <= max) return s;
  let t = s;
  while (t.length > 1 && width(t + '...', size, bold) > max) t = t.slice(0, -1);
  return t + '...';
}
const hex = (s: string) => { let h = ''; for (let i = 0; i < s.length; i++) h += s.charCodeAt(i).toString(16).padStart(2, '0'); return h; };
const rgb = (c: string) => [1, 3, 5].map(i => (parseInt(c.slice(i, i + 2), 16) / 255).toFixed(3)).join(' ');
const num = (n: number) => (Math.round(n * 100) / 100).toString();

const PW = 595.28, PH = 841.89, MX = 40, TOP = 44, BOTTOM = 52;
const INK = '#12343b', MUTE = '#5d7378', LINE = '#d5e0e2', AMBER = '#e2a72e', RED = '#c2452f', GREEN = '#1f8a5b', BLUE = '#2f6fdb', ZEBRA = '#f1f5f6';
const WEIGHT = { text: 3, money: 1.7, pct: 1.1, date: 1.3, int: 1.3 };

class Doc {
  pages: string[][] = [[]];
  y = TOP;
  get ops() { return this.pages[this.pages.length - 1]; }
  newPage() { this.pages.push([]); this.y = TOP; }
  need(h: number) { if (this.y + h > PH - BOTTOM) { this.newPage(); return true; } return false; }
  rect(x: number, yTop: number, w: number, h: number, fill: string) { this.ops.push(`${rgb(fill)} rg ${num(x)} ${num(PH - yTop - h)} ${num(w)} ${num(h)} re f`); }
  line(x1: number, y1: number, x2: number, y2: number, color: string, lw = 0.6) { this.ops.push(`${rgb(color)} RG ${lw} w ${num(x1)} ${num(PH - y1)} m ${num(x2)} ${num(PH - y2)} l S`); }
  text(s: string, x: number, yBase: number, size: number, o: { bold?: boolean; color?: string; align?: 'l' | 'r' | 'c'; max?: number } = {}) {
    let t = clean(s);
    if (o.max !== undefined) t = fit(t, o.max, size, !!o.bold);
    const w = width(t, size, !!o.bold), px = o.align === 'r' ? x - w : o.align === 'c' ? x - w / 2 : x;
    this.ops.push(`BT /${o.bold ? 'F2' : 'F1'} ${size} Tf ${rgb(o.color || INK)} rg ${num(px)} ${num(PH - yBase)} Td <${hex(t)}> Tj ET`);
  }
}

function cellText(c: Cell, col: Col): { s: string; color?: string } {
  return { s: showCell(c, col.type), color: typeof c === 'number' && c < 0 && col.type !== 'int' ? RED : undefined };
}

function colWidths(cols: Col[], total: number): number[] {
  const ws = cols.map(c => c.w ?? WEIGHT[c.type]), sum = ws.reduce((a, b) => a + b, 0);
  return ws.map(w => (w / sum) * total);
}

function drawChart(d: Doc, ch: NonNullable<Sheet['chart']>) {
  const H = 96, W = PW - 2 * MX, n = ch.values.length;
  if (!n) return;
  d.need(H + 40);
  d.text(ch.title, MX, d.y + 10, 9, { bold: true, color: MUTE });
  const top = d.y + 20, base = top + H;
  const mx = Math.max(0, ...ch.values), mn = Math.min(0, ...ch.values), span = mx - mn || 1;
  const zero = top + (mx / span) * (H - 14), slot = W / n, bw = Math.min(26, slot * 0.62);
  d.line(MX, zero, MX + W, zero, LINE, 0.8);
  ch.values.forEach((v, k) => {
    const h = (Math.abs(v) / span) * (H - 14), x = MX + k * slot + (slot - bw) / 2;
    d.rect(x, v >= 0 ? zero - h : zero, bw, Math.max(h, 0.6), v < 0 ? RED : BLUE);
    d.text(ch.labels[k], x + bw / 2, base + 10, 7, { align: 'c', color: MUTE, max: slot + 4 });
  });
  d.y = base + 20;
}

function drawTable(d: Doc, sh: Sheet) {
  const cols = sh.cols, W = PW - 2 * MX, ws = colWidths(cols, W), fs = cols.length > 7 ? 7.5 : 8.5, RH = 16;
  // los títulos largos se parten en dos líneas en vez de cortarse
  const lines = cols.map((c, i) => {
    const max = ws[i] - 10;
    if (width(clean(c.label), fs, true) <= max || !c.label.includes(' ')) return [c.label];
    const words = c.label.split(' '); let best = [c.label], gap = Infinity;
    for (let k = 1; k < words.length; k++) { const l = [words.slice(0, k).join(' '), words.slice(k).join(' ')], g = Math.max(...l.map(x => width(clean(x), fs, true))); if (g < gap) { gap = g; best = l; } }
    return best;
  }), HH = lines.some(l => l.length > 1) ? 26 : 18;
  const header = () => {
    d.rect(MX, d.y, W, HH, INK);
    let x = MX;
    cols.forEach((c, i) => {
      const right = c.type !== 'text' && c.type !== 'date', l = lines[i], y0 = HH === 26 && l.length === 1 ? 16 : HH === 26 ? 10.5 : 12.5;
      l.forEach((t, k) => d.text(t, right ? x + ws[i] - 5 : x + 5, d.y + y0 + k * 9, fs, { bold: true, color: '#ffffff', align: right ? 'r' : 'l', max: ws[i] - 10 }));
      x += ws[i];
    });
    d.y += HH;
  };
  const rowOut = (cells: { s: string; color?: string }[], bold: boolean, fill?: string) => {
    if (fill) d.rect(MX, d.y, W, RH, fill);
    let x = MX;
    cells.forEach((c, i) => { const right = cols[i].type !== 'text' && cols[i].type !== 'date'; d.text(c.s, right ? x + ws[i] - 5 : x + 5, d.y + 11.2, fs, { bold, color: c.color, align: right ? 'r' : 'l', max: ws[i] - 10 }); x += ws[i]; });
    d.y += RH;
  };
  d.need(HH + RH * 2);
  header();
  if (!sh.rows.length) { d.text('Sin datos en el período', MX + 5, d.y + 12, 9, { color: MUTE }); d.y += 22; return; }
  sh.rows.forEach((r, k) => {
    if (d.need(RH)) header();
    rowOut(cols.map((c, i) => cellText(r[i] ?? null, c)), false, k % 2 ? ZEBRA : undefined);
  });
  if (sh.totals) {
    if (d.need(RH + 2)) header();
    d.line(MX, d.y, MX + W, d.y, INK, 0.9);
    rowOut(cols.map((c, i) => { const t = sh.totals![i]; return t === 'sum' ? cellText(colSum(sh.rows, i), c) : typeof t === 'number' ? cellText(t, c) : { s: typeof t === 'string' ? t : '' }; }), true, '#f3e3bd');
  }
  d.y += 6;
}

/** PDF A4 con título, datos clave, gráfico (si hay) y una tabla por sección. Sin dependencias: sirve igual en web y en el celular. */
export function toPdf(rep: Report): Uint8Array {
  const d = new Doc();
  d.text('Equa', MX, d.y + 12, 13, { bold: true, color: INK });
  d.text('Generado el ' + dmy(rep.generatedAt.slice(0, 10)), PW - MX, d.y + 12, 8.5, { align: 'r', color: MUTE });
  d.y += 24;
  d.text(rep.title, MX, d.y + 16, 20, { bold: true, max: PW - 2 * MX });
  d.text(rep.period, MX, d.y + 34, 11, { color: MUTE, max: PW - 2 * MX });
  d.y += 44;
  d.rect(MX, d.y, PW - 2 * MX, 2, AMBER);
  d.y += 14;
  if (rep.kpis.length) {
    const n = Math.min(4, rep.kpis.length), gap = 8, bw = (PW - 2 * MX - gap * (n - 1)) / n;
    rep.kpis.slice(0, 4).forEach((k, i) => {
      const x = MX + i * (bw + gap);
      d.rect(x, d.y, bw, 44, ZEBRA);
      d.text(k.label, x + 8, d.y + 15, 8, { color: MUTE, max: bw - 16 });
      d.text(k.value, x + 8, d.y + 34, 13, { bold: true, color: k.tone === 'bad' ? RED : k.tone === 'good' ? GREEN : INK, max: bw - 16 });
    });
    d.y += 58;
  }
  rep.sheets.forEach(sh => {
    d.need(60);
    d.text(sh.title || sh.name, MX, d.y + 12, 12, { bold: true });
    d.y += 20;
    if (sh.note) { d.text(sh.note, MX, d.y + 8, 8.5, { color: MUTE, max: PW - 2 * MX }); d.y += 14; }
    if (sh.chart) drawChart(d, sh.chart);
    drawTable(d, sh);
    d.y += 8;
  });
  // pie de página en todas las hojas
  d.pages.forEach((_, p) => {
    d.pages[p].push(`${rgb(LINE)} RG 0.6 w ${num(MX)} ${num(PH - (PH - 34))} m ${num(PW - MX)} ${num(PH - (PH - 34))} l S`);
    const put = (s: string, x: number, align: 'l' | 'r') => { const t = clean(s), w = width(t, 8, false); d.pages[p].push(`BT /F1 8 Tf ${rgb(MUTE)} rg ${num(align === 'r' ? x - w : x)} 22 Td <${hex(t)}> Tj ET`); };
    put('Equa · ' + rep.title + ' · ' + rep.period, MX, 'l');
    put(`Página ${p + 1} de ${d.pages.length}`, PW - MX, 'r');
  });

  // estructura del archivo
  const objs: string[] = [];
  const N = d.pages.length, first = 5;      // 1 catálogo, 2 páginas, 3-4 fuentes, luego (página, contenido) por hoja
  objs[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objs[2] = `<< /Type /Pages /Kids [${d.pages.map((_, i) => `${first + i * 2} 0 R`).join(' ')}] /Count ${N} >>`;
  objs[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
  objs[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';
  d.pages.forEach((ops, i) => {
    const stream = ops.join('\n');
    objs[first + i * 2] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PW} ${PH}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${first + i * 2 + 1} 0 R >>`;
    objs[first + i * 2 + 1] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  });
  const asc = (s: string) => { const b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 255; return b; };
  const parts: Uint8Array[] = [asc('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n')], offsets: number[] = [];
  let pos = parts[0].length;
  for (let i = 1; i < objs.length; i++) {
    const b = asc(`${i} 0 obj\n${objs[i]}\nendobj\n`);
    offsets[i] = pos; pos += b.length; parts.push(b);
  }
  const xref = `xref\n0 ${objs.length}\n0000000000 65535 f \n` + offsets.slice(1).map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('');
  parts.push(asc(xref + `trailer\n<< /Size ${objs.length} /Root 1 0 R >>\nstartxref\n${pos}\n%%EOF\n`));
  return concat(parts);
}
