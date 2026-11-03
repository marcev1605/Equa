import type { Occ } from './types';
import { cardOf, type Engine } from './engine';
import { buildRows } from './forecast';
import { idxOfStr, monthLabel, monthName, monthShort, ymdOf } from './dates';
import { money, pct1, type Cell, type Report, type Sheet } from '../export/model';

export type ReportId = 'mes' | 'per' | 'cat' | 'tar' | 'aho' | 'pre' | 'mov';
export type PeriodKind = 'month' | 'range' | 'future';
export type Format = 'pdf' | 'xlsx';
/** Período en índices de mes (año × 12 + mes). Un mes suelto es desde = hasta. */
export interface Period { from: number; to: number }

export interface ReportDef {
  id: ReportId; title: string; desc: string; ic: string; per: PeriodKind;
  formats: Format[]; best: Format;
  /** Hojas del Excel, en orden (el PDF muestra las mismas secciones). */
  sheets: string[];
}

export const REPORTS: ReportDef[] = [
  { id: 'mes', title: 'Resumen del mes', desc: 'Un mes completo: ingresos, gastos por categoría, tarjetas, ahorro y saldo.', ic: 'MES', per: 'month', formats: ['pdf', 'xlsx'], best: 'pdf', sheets: ['Resumen', 'Gastos', 'Ingresos', 'Tarjetas'] },
  { id: 'per', title: 'Período mes a mes', desc: 'Desde un mes hasta otro: una fila por mes, totales y gráfico del saldo.', ic: 'A→B', per: 'range', formats: ['pdf', 'xlsx'], best: 'pdf', sheets: ['Mes a mes'] },
  { id: 'cat', title: 'Ingresos y gastos por categoría', desc: 'A qué se va la plata, con porcentaje y comparación con el período anterior.', ic: '%', per: 'range', formats: ['pdf', 'xlsx'], best: 'pdf', sheets: ['Gastos', 'Ingresos'] },
  { id: 'tar', title: 'Tarjetas de crédito', desc: 'Resumen por tarjeta, cuotas que faltan pagar y pagos hechos.', ic: 'TC', per: 'range', formats: ['pdf', 'xlsx'], best: 'xlsx', sheets: ['Resumen', 'Cuotas pendientes', 'Pagos'] },
  { id: 'aho', title: 'Ahorros e inversiones', desc: 'Valor, aportado, ganancia y rendimiento por categoría, y sus movimientos.', ic: '$↑', per: 'range', formats: ['pdf', 'xlsx'], best: 'pdf', sheets: ['Resumen', 'Movimientos'] },
  { id: 'pre', title: 'Previsión', desc: 'Los próximos meses con saldo previsto y los que quedan en rojo.', ic: '12m', per: 'future', formats: ['pdf', 'xlsx'], best: 'pdf', sheets: ['Previsión', 'Meses en rojo'] },
  { id: 'mov', title: 'Todos los movimientos', desc: 'Listado completo para filtrar y ordenar. Solo en Excel.', ic: '≡', per: 'range', formats: ['xlsx'], best: 'xlsx', sheets: ['Movimientos'] },
];
export const reportDef = (id: ReportId) => REPORTS.find(r => r.id === id) ?? REPORTS[0];

/** "Octubre 2026", "Mayo a Octubre 2026" o "Noviembre 2025 a Octubre 2026". */
export function periodLabel(p: Period): string {
  const y = (i: number) => Math.floor(i / 12);
  if (p.from === p.to) return `${monthName(p.from)} ${y(p.from)}`;
  return y(p.from) === y(p.to) ? `${monthName(p.from)} a ${monthName(p.to)} ${y(p.to)}` : `${monthName(p.from)} ${y(p.from)} a ${monthName(p.to)} ${y(p.to)}`;
}

/** Sin tildes ni símbolos raros: así el nombre sobrevive a cualquier navegador, celular o correo. */
const plain = (s: string) => s.replace(/[áàä]/g, 'a').replace(/[éèë]/g, 'e').replace(/[íìï]/g, 'i').replace(/[óòö]/g, 'o').replace(/[úùü]/g, 'u').replace(/ñ/g, 'n').replace(/[ÁÀÄ]/g, 'A').replace(/[ÉÈË]/g, 'E').replace(/[ÍÌÏ]/g, 'I').replace(/[ÓÒÖ]/g, 'O').replace(/[ÚÙÜ]/g, 'U').replace(/Ñ/g, 'N');
export const fileName = (id: ReportId, p: Period, f: Format) => plain(`Equa - ${reportDef(id).title} - ${periodLabel(p)}.${f}`).replace(/[^A-Za-z0-9 ._-]/g, '-');

const r2 = (n: number) => Math.round(n * 100) / 100;
const sumOf = (xs: number[]) => r2(xs.reduce((a, b) => a + b, 0));
const inRange = (o: Occ, p: Period) => o.i >= p.from && o.i <= p.to;
const tone = (n: number): 'good' | 'bad' | undefined => (n > 0.005 ? 'good' : n < -0.005 ? 'bad' : undefined);

/** Total por categoría (de los movimientos que caen en el período) más los adelantos de tarjeta, que también mueven la caja. */
function byCategory(eng: Engine, type: 'in' | 'out', p: Period): { cat: string; v: number }[] {
  const m = new Map<string, number>();
  eng.all().filter(o => o.t.type === type && inRange(o, p)).forEach(o => m.set(o.t.cat, (m.get(o.t.cat) || 0) + o.a));
  const out = [...m.entries()].map(([cat, v]) => ({ cat, v: r2(v) })).sort((a, b) => b.v - a.v);
  if (type === 'out') {
    let adv = 0; for (let i = p.from; i <= p.to; i++) adv += eng.advNet(i);
    if (Math.abs(adv) > 0.005) out.push({ cat: 'Adelantos de tarjeta', v: r2(adv) });
  }
  return out;
}

function catSheet(name: string, rows: { cat: string; v: number }[], prev?: Map<string, number>): Sheet {
  const total = sumOf(rows.map(r => r.v));
  const base = { name, title: name === 'Gastos' ? 'Gastos por categoría' : 'Ingresos por categoría' };
  if (!prev) return { ...base, cols: [{ label: 'Categoría', type: 'text' }, { label: 'Monto', type: 'money' }, { label: '% del total', type: 'pct' }], rows: rows.map(r => [r.cat, r.v, total ? r.v / total : 0]), totals: ['Total', 'sum', 'sum'] };
  const totalPrev = sumOf([...prev.values()]);
  const cats = [...new Set([...rows.map(r => r.cat), ...prev.keys()])];
  const cur = new Map(rows.map(r => [r.cat, r.v]));
  const list = cats.map(c => ({ c, v: cur.get(c) || 0, a: r2(prev.get(c) || 0) })).sort((x, y) => y.v - x.v || y.a - x.a);
  return {
    ...base,
    cols: [{ label: 'Categoría', type: 'text' }, { label: 'Monto', type: 'money' }, { label: '% del total', type: 'pct' }, { label: 'Período anterior', type: 'money' }, { label: 'Variación', type: 'pct' }],
    rows: list.map(x => [x.c, x.v, total ? x.v / total : 0, x.a, x.a ? (x.v - x.a) / Math.abs(x.a) : null]),
    totals: ['Total', 'sum', 'sum', 'sum', totalPrev ? (total - totalPrev) / Math.abs(totalPrev) : null],
  };
}

/** Arma el reporte `id` para el período `p` con los datos de la cuenta. No guarda ni cambia nada. */
export function buildReport(eng: Engine, id: ReportId, p: Period, now: Date = new Date()): Report {
  const def = reportDef(id), cur = eng.now;
  const rep: Report = { id, title: def.title, period: periodLabel(p), generatedAt: now.toISOString(), kpis: [], sheets: [] };
  const rows = id === 'mes' || id === 'per' || id === 'pre' ? buildRows(eng, p.from, p.to) : [];

  if (id === 'mes') {
    const r = rows[0], net = r2(r.bal);
    rep.kpis = [{ label: 'Ingresos', value: money(r.inc), tone: 'good' }, { label: 'Gastos', value: money(r.out) }, { label: 'Neto del mes', value: money(net), tone: tone(net) }, { label: 'Saldo al cierre', value: money(r.run), tone: r.run < 0 ? 'bad' : undefined }];
    rep.sheets.push({
      name: 'Resumen', title: 'Resumen de ' + monthLabel(p.from), cols: [{ label: 'Concepto', type: 'text' }, { label: 'Monto', type: 'money' }],
      rows: [['Saldo del mes anterior', r2(r.carry)], ['Ingresos', r2(r.inc)], ['Gastos (con tarjetas)', r2(r.out)], [r.sv < 0 ? 'Retiro de ahorro' : 'Ahorro del mes', r2(r.sv)], ['Neto del mes (ingresos − gastos − ahorro)', net], [rows[0].run < 0 ? 'Saldo al cierre (en rojo)' : 'Saldo al cierre', r2(r.run)]],
    });
    rep.sheets.push(catSheet('Gastos', byCategory(eng, 'out', p)), catSheet('Ingresos', byCategory(eng, 'in', p)));
    const cards = eng.cardNames().map(n => ({ n, q: eng.stmtD(n, p.from) })).filter(x => x.q.items > 0.005 || x.q.paid > 0.005 || x.q.carry > 0.005);
    rep.sheets.push({
      name: 'Tarjetas', title: 'Resúmenes de tarjeta que se pagan en ' + monthLabel(p.from), cols: [{ label: 'Tarjeta', type: 'text' }, { label: 'Compras del mes', type: 'money' }, { label: 'Saldo anterior', type: 'money' }, { label: 'Total del resumen', type: 'money' }, { label: 'Pagado', type: 'money' }, { label: 'Falta pagar', type: 'money' }],
      rows: cards.map(x => [x.n, r2(x.q.items), r2(x.q.carry), r2(x.q.due), r2(x.q.paid), r2(x.q.rem)]), totals: ['Total', 'sum', 'sum', 'sum', 'sum', 'sum'],
    });
  }

  if (id === 'per') {
    const tot = (f: (x: (typeof rows)[number]) => number) => sumOf(rows.map(f)), net = tot(x => x.bal), last = rows[rows.length - 1];
    rep.kpis = [{ label: 'Ingresos', value: money(tot(x => x.inc)), tone: 'good' }, { label: 'Gastos', value: money(tot(x => x.out)) }, { label: 'Neto del período', value: money(net), tone: tone(net) }, { label: 'Saldo al cierre', value: money(last.run), tone: last.run < 0 ? 'bad' : undefined }];
    rep.sheets.push({
      name: 'Mes a mes', title: 'Mes a mes', cols: [{ label: 'Mes', type: 'text' }, { label: 'Saldo anterior', type: 'money' }, { label: 'Ingresos', type: 'money' }, { label: 'Gastos', type: 'money' }, { label: 'Ahorro', type: 'money' }, { label: 'Neto', type: 'money' }, { label: 'Saldo al cierre', type: 'money' }],
      rows: rows.map(x => [monthLabel(x.i), r2(x.carry), r2(x.inc), r2(x.out), r2(x.sv), r2(x.bal), r2(x.run)]), totals: ['Total', null, 'sum', 'sum', 'sum', 'sum', null],
      chart: { title: 'Saldo al cierre de cada mes', labels: rows.map(x => monthShort(x.i)), values: rows.map(x => r2(x.run)) },
    });
  }

  if (id === 'cat') {
    const n = p.to - p.from + 1, prevP: Period = { from: p.from - n, to: p.from - 1 };
    const pm = (t: 'in' | 'out') => new Map(byCategory(eng, t, prevP).map(r => [r.cat, r.v]));
    const out = byCategory(eng, 'out', p), inc = byCategory(eng, 'in', p), to = sumOf(out.map(r => r.v)), ti = sumOf(inc.map(r => r.v)), po = sumOf([...pm('out').values()]);
    const dv = po ? (to - po) / Math.abs(po) : null;
    rep.kpis = [{ label: 'Gastos', value: money(to) }, { label: 'Ingresos', value: money(ti), tone: 'good' }, { label: 'Neto', value: money(ti - to), tone: tone(ti - to) }, { label: 'Gastos vs. período anterior', value: dv === null ? 'Sin datos' : (dv > 0 ? '+' : '') + pct1(dv), tone: dv === null ? undefined : dv > 0.005 ? 'bad' : dv < -0.005 ? 'good' : undefined }];
    rep.sheets.push(catSheet('Gastos', out, pm('out')), catSheet('Ingresos', inc, pm('in')));
    rep.sheets[0].note = 'Comparado con el período anterior de igual duración: ' + periodLabel(prevP);
    rep.sheets[1].note = rep.sheets[0].note;
  }

  if (id === 'tar') {
    const names = eng.cardNames(), sr: Cell[][] = [];
    names.forEach(n => { for (let i = p.from; i <= p.to; i++) { const q = eng.stmtD(n, i); if (q.items > 0.005 || q.paid > 0.005 || q.carry > 0.005) sr.push([n, monthLabel(i), r2(q.items), r2(q.carry), r2(q.due), r2(q.paid), r2(q.rem)]); } });
    const plans: Cell[][] = [];
    eng.S.tx.filter(x => x.card && !x.fixed && (x.inst || 1) > 1).forEach(x => {
      const oc = eng.occ(x), fut = oc.filter(o => o.i > cur);
      if (fut.length) plans.push([cardOf(x), x.note || x.cat, r2(oc[0].a), oc.length, fut.length, r2(fut.reduce((a, o) => a + o.a, 0)), monthLabel(fut[fut.length - 1].i)]);
    });
    plans.sort((a, b) => (b[5] as number) - (a[5] as number));
    const pays = eng.S.pay.filter(x => x.i >= p.from && x.i <= p.to).sort((a, b) => a.date.localeCompare(b.date));
    const pend = sumOf(plans.map(r => r[5] as number)), paid = sumOf(pays.map(x => x.amt));
    rep.kpis = [{ label: 'Pagado en el período', value: money(paid), tone: 'good' }, { label: 'Cuotas que faltan pagar', value: money(pend) }, { label: 'Compras en cuotas', value: String(plans.length) }, { label: 'Tarjetas', value: String(names.length) }];
    rep.sheets.push(
      { name: 'Resumen', title: 'Resumen de cada tarjeta, mes a mes', note: 'Cada fila es el resumen que se paga ese mes.', cols: [{ label: 'Tarjeta', type: 'text' }, { label: 'Se paga en', type: 'text' }, { label: 'Compras', type: 'money' }, { label: 'Saldo anterior', type: 'money' }, { label: 'Total', type: 'money' }, { label: 'Pagado', type: 'money' }, { label: 'Falta', type: 'money' }], rows: sr, totals: ['Total', null, 'sum', null, null, 'sum', null] },
      { name: 'Cuotas pendientes', title: 'Compras en cuotas que todavía se están pagando', note: 'Cuotas de meses posteriores al actual.', cols: [{ label: 'Tarjeta', type: 'text' }, { label: 'Compra', type: 'text' }, { label: 'Cuota por mes', type: 'money' }, { label: 'Cuotas', type: 'int' }, { label: 'Restantes', type: 'int' }, { label: 'Falta pagar', type: 'money' }, { label: 'Última cuota', type: 'text' }], rows: plans, totals: ['Total', null, null, null, null, 'sum', null] },
      { name: 'Pagos', title: 'Pagos de resumen', cols: [{ label: 'Fecha', type: 'date' }, { label: 'Tarjeta', type: 'text' }, { label: 'Resumen de', type: 'text' }, { label: 'Tipo', type: 'text' }, { label: 'Monto', type: 'money' }], rows: pays.map(x => [x.date, x.card, monthLabel(x.i), eng.isAdv(x) ? 'Adelanto' : 'Pago', r2(x.amt)]), totals: ['Total', null, null, null, 'sum'] },
    );
  }

  if (id === 'aho') {
    const cats = eng.S.categories.sav.filter(c => !c.hidden || Math.abs(eng.svBal(c.name)) > 0.005).map(c => ({ c: c.name, r: eng.svReturn(c.name) }));
    const val = sumOf(cats.map(x => x.r.value)), contrib = sumOf(cats.map(x => x.r.contributed)), gain = sumOf(cats.map(x => x.r.gain)), rate = contrib > 0.005 ? gain / contrib : null;
    const mv = eng.S.sav.filter(x => idxOfStr(x.date) >= p.from && idxOfStr(x.date) <= p.to).sort((a, b) => a.date.localeCompare(b.date));
    rep.kpis = [{ label: 'Valor total hoy', value: money(val) }, { label: 'Aportado', value: money(contrib) }, { label: 'Ganancia', value: money(gain), tone: tone(gain) }, { label: 'Rendimiento', value: rate === null ? '-' : (rate > 0 ? '+' : '') + pct1(rate), tone: rate === null ? undefined : tone(rate) }];
    rep.sheets.push(
      { name: 'Resumen', title: 'Ahorros e inversiones por categoría', note: 'Valores al día de la exportación (no dependen del período).', cols: [{ label: 'Categoría', type: 'text' }, { label: 'Valor hoy', type: 'money' }, { label: 'Aportado', type: 'money' }, { label: 'Ganancia', type: 'money' }, { label: 'Rendimiento', type: 'pct' }], rows: cats.map(x => [x.c, r2(x.r.value), r2(x.r.contributed), r2(x.r.gain), x.r.pct === null ? null : x.r.pct / 100]), totals: ['Total', 'sum', 'sum', 'sum', rate] },
      { name: 'Movimientos', title: 'Movimientos de ahorro del período', note: mv.some(x => !eng.isDone(x)) ? 'Los marcados "(programado)" tienen fecha futura: todavía no cuentan en los saldos.' : undefined, cols: [{ label: 'Fecha', type: 'date' }, { label: 'Categoría', type: 'text' }, { label: 'Tipo', type: 'text' }, { label: 'Monto', type: 'money' }, { label: 'Nota', type: 'text', w: 4 }], rows: mv.map(x => [x.date, x.cat, (x.adj ? (x.amt >= 0 ? 'Ajuste: ganancia' : 'Ajuste: pérdida') : x.tid ? 'Transferencia' : x.amt >= 0 ? 'Depósito' : 'Retiro') + (eng.isDone(x) ? '' : ' (programado)'), r2(x.amt), x.note || '']), totals: ['Total', null, null, 'sum', null] },
    );
  }

  if (id === 'pre') {
    const reds = rows.filter(x => x.run < -0.005), low = rows.reduce((a, x) => (x.run < a.run ? x : a), rows[0]), av = eng.availFor(cur);
    rep.kpis = [{ label: 'Disponible hoy', value: money(av), tone: av < 0 ? 'bad' : undefined }, { label: `Saldo más bajo en ${monthName(low.i)}`, value: money(low.run), tone: low.run < 0 ? 'bad' : undefined }, { label: 'Meses en rojo', value: String(reds.length), tone: reds.length ? 'bad' : 'good' }, { label: 'Meses', value: String(rows.length) }];
    rep.sheets.push(
      { name: 'Previsión', title: 'Saldo previsto mes a mes', cols: [{ label: 'Mes', type: 'text' }, { label: 'Saldo anterior', type: 'money' }, { label: 'Ingresos', type: 'money' }, { label: 'Gastos', type: 'money' }, { label: 'Ahorro', type: 'money' }, { label: 'Balance', type: 'money' }, { label: 'Saldo al cierre', type: 'money' }, { label: 'Estado', type: 'text', w: 1.4 }], rows: rows.map(x => [monthLabel(x.i), r2(x.carry), r2(x.inc), r2(x.out), r2(x.sv), r2(x.bal), r2(x.run), x.run < -0.005 ? 'En rojo' : x.bal < -0.005 ? 'Mes pesado' : 'Bien']),
        chart: { title: 'Saldo previsto al cierre', labels: rows.map(x => monthShort(x.i)), values: rows.map(x => r2(x.run)) } },
      { name: 'Meses en rojo', title: 'Meses que quedan en rojo', note: reds.length ? undefined : 'Ningún mes del período queda en rojo.', cols: [{ label: 'Mes', type: 'text' }, { label: 'Balance', type: 'money' }, { label: 'Saldo al cierre', type: 'money' }, { label: 'Cuánto falta', type: 'money' }], rows: reds.map(x => [monthLabel(x.i), r2(x.bal), r2(x.run), r2(-x.run)]) },
    );
  }

  if (id === 'mov') {
    const list = eng.all().filter(o => inRange(o, p)).sort((a, b) => a.i - b.i || dateOf(a).localeCompare(dateOf(b)) || a.t.cat.localeCompare(b.t.cat));
    rep.kpis = [{ label: 'Movimientos', value: String(list.length) }, { label: 'Ingresos', value: money(sumOf(list.filter(o => o.t.type === 'in').map(o => o.a))), tone: 'good' }, { label: 'Gastos', value: money(sumOf(list.filter(o => o.t.type === 'out').map(o => o.a))) }];
    rep.sheets.push({
      name: 'Movimientos', title: 'Todos los movimientos', note: 'Cada fila cuenta en el mes indicado; las compras con tarjeta cuentan en el mes en que se paga el resumen.',
      cols: [{ label: 'Mes', type: 'text' }, { label: 'Fecha', type: 'date' }, { label: 'Tipo', type: 'text' }, { label: 'Categoría', type: 'text' }, { label: 'Nota', type: 'text', w: 4 }, { label: 'Medio', type: 'text' }, { label: 'Cuota', type: 'text' }, { label: 'Fijo', type: 'text' }, { label: 'Monto', type: 'money' }],
      rows: list.map(o => [monthLabel(o.i), dateOf(o), o.t.type === 'in' ? 'Ingreso' : 'Gasto', o.t.cat, o.t.note || '', o.t.card ? 'Tarjeta · ' + cardOf(o.t) : 'Efectivo', o.n > 1 ? `${o.k}/${o.n}` : '', o.t.fixed ? 'Sí' : '', r2(o.a)]),
    });
  }
  return rep;
}

/** Fecha del movimiento dentro de su mes (los fijos repiten el día en cada mes). */
function dateOf(o: Occ): string { return o.t.fixed ? ymdOf(o.i - (o.t.card ? 1 : 0), +o.t.date.slice(8)) : o.t.date; }
