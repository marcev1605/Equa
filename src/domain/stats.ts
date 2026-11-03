import { daysIn, fmtMoney as fmt } from './dates';
import { cardOf, sum, type Engine } from './engine';

/** Ingresos, gastos, ahorro neto y lo que queda (ingresos − gastos − ahorro) de un mes. Los gastos son los mismos que suman las categorías. */
export interface MonthStats { inc: number; out: number; sav: number; bal: number }
export function monthStats(eng: Engine, i: number): MonthStats {
  const m = eng.all().filter(o => o.i === i), inc = sum(m, 'in'), out = sum(m, 'out'), sav = eng.monthSaving(i).net;
  return { inc, out, sav, bal: inc - out - sav };
}

export type Tone = 'good' | 'bad' | 'flat';
export interface Delta { text: string; tone: Tone }

/**
 * Comparación contra el mes anterior. `better` dice qué sentido es bueno (más ingresos = bien, más gastos = mal).
 * `mode`: en porcentaje o en pesos. Sin base de comparación (mes anterior en cero) no inventa un porcentaje.
 */
export function delta(cur: number, prev: number, better: 'up' | 'down', mode: 'pct' | 'abs'): Delta {
  const diff = cur - prev;
  if (Math.abs(diff) < 0.5) return { text: 'Sin cambios', tone: 'flat' };
  const up = diff > 0, arrow = up ? '▲' : '▼', word = up ? 'más' : 'menos';
  const tone: Tone = (up ? 'up' : 'down') === better ? 'good' : 'bad';
  if (mode === 'abs') return { text: `${arrow} ${fmt(Math.abs(diff))} ${word}`, tone };
  if (prev < 0.005) return { text: 'Mes anterior: $0', tone: 'flat' };
  const p = (Math.abs(diff) / prev) * 100;
  return { text: `${arrow} ${p < 1 ? '<1' : Math.round(p)}% ${word}`, tone };
}

/** Gasto por categoría de un mes. */
export function expensesByCategory(eng: Engine, i: number): Record<string, number> {
  const by: Record<string, number> = {};
  eng.all().filter(o => o.i === i && o.t.type === 'out').forEach(o => { by[o.t.cat] = (by[o.t.cat] || 0) + o.a; });
  return by;
}

/** Insignia de una categoría contra el mes anterior: ▲ sube (malo), ▼ baja (bueno), "Nueva" si antes no había gasto, null si no cambió. */
export function categoryBadge(cur: number, prev: number): Delta | null {
  if (prev < 0.005) return cur < 0.005 ? null : { text: 'Nueva', tone: 'flat' };
  const d = delta(cur, prev, 'down', 'pct');
  return d.tone === 'flat' ? null : d;
}

export interface Pace {
  perDay: number;          // gasto del mes dividido los días del mes
  out: number;
  avg: number;             // promedio de gastos de los 6 meses anteriores con gastos
  months: number;          // cuántos meses entraron en el promedio
  diff: number;            // gasto del mes − promedio
  state: 'past' | 'now' | 'future';
}
/** Ritmo del mes: gasto por día y comparación con el promedio de los 6 meses anteriores. null si no hay gastos o no hay con qué comparar. */
export function pace(eng: Engine, i: number): Pace | null {
  const { out } = monthStats(eng, i);
  const prev = Array.from({ length: 6 }, (_, k) => monthStats(eng, i - 6 + k).out).filter(v => v > 0.005);
  if (out < 0.005 || !prev.length) return null;
  const avg = prev.reduce((a, b) => a + b, 0) / prev.length;
  return { perDay: out / daysIn(Math.floor(i / 12), i % 12), out, avg, months: prev.length, diff: out - avg, state: i < eng.now ? 'past' : i === eng.now ? 'now' : 'future' };
}

export interface Kinds { fixed: number; card: number; month: number; total: number }
/** Gastos del mes según su naturaleza: fijos (se repiten todos los meses), compras con tarjeta (y sus cuotas) y gastos del mes. Se excluyen entre sí. */
export function expenseKinds(eng: Engine, i: number): Kinds {
  const k = { fixed: 0, card: 0, month: 0, total: 0 };
  eng.all().filter(o => o.i === i && o.t.type === 'out').forEach(o => {
    k[o.t.fixed ? 'fixed' : o.t.card ? 'card' : 'month'] += o.a; k.total += o.a;
  });
  return k;
}

export interface CardStat { name: string; spent: number; pending: number; pendingMonths: number }
/** Por tarjeta: lo que se paga en el mes elegido y lo que queda en cuotas después de ese mes. */
export function cardStats(eng: Engine, i: number): { cards: CardStat[]; pending: number } {
  const all = eng.all().filter(o => o.t.card && o.t.type === 'out');
  const cards = eng.cardNames().map(name => {
    const mine = all.filter(o => cardOf(o.t) === name), later = mine.filter(o => o.i > i && !o.t.fixed && o.n > 1);
    return { name, spent: mine.filter(o => o.i === i).reduce((a, o) => a + o.a, 0), pending: later.reduce((a, o) => a + o.a, 0), pendingMonths: later.length ? Math.max(...later.map(o => o.i)) - i : 0 };
  }).filter(c => c.spent > 0.005 || c.pending > 0.005);
  return { cards, pending: cards.reduce((a, c) => a + c.pending, 0) };
}

export interface CardDebt {
  months: number[];                                              // meses (de pago) que se muestran
  cards: { name: string; v: number[]; t: number }[];             // por tarjeta, de mayor a menor deuda en esos meses
  totals: number[];                                              // total de cada mes
  total: number;                                                 // suma de esos meses
  all: number;                                                   // todas las cuotas pendientes desde `from`, incluso después de esos meses
  last: number | null;                                           // último mes con cuotas
  worst: { i: number; v: number } | null;                        // mes más pesado
}
/** Cuotas ya cargadas que quedan por pagar desde el mes `from`, mes por mes y por tarjeta. Los fijos con tarjeta no son deuda: no entran. */
export function cardDebt(eng: Engine, from: number, span = 6): CardDebt {
  const inst = eng.all().filter(o => o.t.card && o.t.type === 'out' && !o.t.fixed && o.n > 1 && o.i >= from);
  const months = Array.from({ length: span }, (_, k) => from + k);
  const cards = eng.cardNames().map(name => {
    const mine = inst.filter(o => cardOf(o.t) === name), v = months.map(i => mine.filter(o => o.i === i).reduce((a, o) => a + o.a, 0));
    return { name, v, t: v.reduce((a, b) => a + b, 0) };
  }).filter(c => c.t > 0.005).sort((a, b) => b.t - a.t);
  const totals = months.map((_, k) => cards.reduce((a, c) => a + c.v[k], 0)), total = totals.reduce((a, b) => a + b, 0);
  const worstK = totals.reduce((b, v, k) => (v > (totals[b] ?? 0) ? k : b), 0);
  return {
    months, cards, totals, total, all: inst.reduce((a, o) => a + o.a, 0),
    last: inst.length ? Math.max(...inst.map(o => o.i)) : null,
    worst: total > 0.005 ? { i: months[worstK], v: totals[worstK] } : null,
  };
}

/** Cortes orientativos del peso de la tarjeta sobre los ingresos (en %). */
export const SHARE_MID = 20, SHARE_HIGH = 35;
export type ShareLevel = 'ok' | 'mid' | 'high';
export interface CardShare {
  i: number; card: number; inc: number;
  pct: number | null;            // null si el mes no tiene ingresos
  level: ShareLevel | null;
  points: number | null;         // diferencia en puntos contra el mes anterior (si ambos tienen porcentaje)
}
const levelOf = (p: number): ShareLevel => (p < SHARE_MID ? 'ok' : p < SHARE_HIGH ? 'mid' : 'high');
/** Lo que se paga con tarjeta en el mes `i` (compras, cuotas y fijos) contra los ingresos de ese mes. */
export function cardShare(eng: Engine, i: number): CardShare {
  const at = (m: number) => {
    const o = eng.all().filter(x => x.i === m), card = o.filter(x => x.t.card && x.t.type === 'out').reduce((a, x) => a + x.a, 0), inc = sum(o, 'in');
    return { card, inc, pct: inc > 0.005 ? (card / inc) * 100 : null };
  };
  const cur = at(i), prev = at(i - 1).pct;
  return { i, card: cur.card, inc: cur.inc, pct: cur.pct, level: cur.pct == null ? null : levelOf(cur.pct), points: cur.pct != null && prev != null ? cur.pct - prev : null };
}
