import type { Engine } from './engine';

/** Rangos que se pueden mirar en Previsión. `back` = meses hacia atrás, `fwd` = meses hacia adelante (el mes en curso cuenta como el primero). */
export type RangeId = 'f6' | 'f12' | 'b3' | 'b6';
export const RANGES: { id: RangeId; label: string; back: number; fwd: number }[] = [
  { id: 'f6', label: '6 adelante', back: 0, fwd: 5 },
  { id: 'f12', label: '12 adelante', back: 0, fwd: 11 },
  { id: 'b3', label: '3 atrás', back: 3, fwd: 5 },
  { id: 'b6', label: '6 atrás', back: 6, fwd: 11 },
];
export const MAX_BACK = 6, MAX_FWD = 12;

/** Un mes de la previsión: saldo que trae, lo que entra, sale y se ahorra, balance del mes y saldo al cierre. */
export interface Row {
  i: number; carry: number; inc: number; out: number; sv: number; bal: number; run: number;
  /** Solo con una simulación: la cuota hipotética de este mes y cuánto valdría el saldo sin ella. */
  add: number; baseRun: number;
}
export type Phase = 'past' | 'now' | 'future';
export const phaseOf = (i: number, now: number): Phase => (i < now ? 'past' : i === now ? 'now' : 'future');

/** Meses desde `from` hasta `to`, encadenando el saldo: cada mes parte del saldo al cierre del anterior. */
export function buildRows(eng: Engine, from: number, to: number): Row[] {
  let run = eng.carryIn(from);
  const rows: Row[] = [];
  for (let i = from; i <= to; i++) {
    const m = eng.monthBalance(i), carry = run;
    run += m.bal;
    rows.push({ i, carry, inc: m.inc, out: m.out, sv: m.sv, bal: m.bal, run, add: 0, baseRun: run });
  }
  return rows;
}

/** Compra hipotética: `amt` en `n` cuotas iguales, la primera en el mes `first`. Nada se guarda. */
export interface Sim { amt: number; n: number; first: number }
export const simInstallment = (s: Sim) => s.amt / Math.max(1, s.n);

export function applySim(rows: Row[], s: Sim | null): Row[] {
  if (!s || !(s.amt > 0)) return rows;
  const cuota = simInstallment(s);
  let cum = 0;
  return rows.map(r => {
    const add = r.i >= s.first && r.i < s.first + Math.max(1, s.n) ? cuota : 0;
    cum += add;
    return { ...r, out: r.out + add, bal: r.bal - add, run: r.run - cum, add, baseRun: r.run, carry: r.carry - (cum - add) };
  });
}

/** Los próximos 12 meses (sin el actual): sobre ellos se buscan los meses complicados. */
export const nextYear = (rows: Row[], now: number) => rows.filter(r => r.i > now && r.i <= now + 12);

/** Mes que más pesa (peor balance mensual, solo si es negativo) y mes con menos saldo al cierre (solo si es negativo). */
export function pressure(rows: Row[], now: number) {
  const ny = nextYear(rows, now);
  const worst = (f: (r: Row) => number) => ny.reduce<Row | null>((a, r) => (a === null || f(r) < f(a) ? r : a), null);
  const heavy = worst(r => r.bal), low = worst(r => r.run);
  return { heavy: heavy && heavy.bal < -0.005 ? heavy : null, low: low && low.run < -0.005 ? low : null, reds: ny.filter(r => r.run < -0.005).length, minRun: low };
}

/** Primer mes (desde hoy, dentro de un año) en que terminan compras en cuotas, y cuánto se libera por mes desde el siguiente. */
export function endingInstallments(eng: Engine, now: number) {
  const by = new Map<number, { txs: Set<string>; freed: number }>();
  eng.all().forEach(o => {
    if (!o.t.card || o.t.type !== 'out' || o.n <= 1 || o.k !== o.n || o.i < now || o.i > now + 12) return;
    const e = by.get(o.i) || { txs: new Set<string>(), freed: 0 };
    e.txs.add(o.t.id); e.freed += o.a; by.set(o.i, e);
  });
  const first = [...by.keys()].sort((a, b) => a - b)[0];
  return first === undefined ? null : { i: first, count: by.get(first)!.txs.size, freed: by.get(first)!.freed };
}

export interface SavingAlert {
  i: number; amt: number; first: string;   // mes, suma de depósitos programados y fecha del primero
  run: number; without: number;            // saldo al cierre con y sin esos depósitos
  deepens: boolean;                        // true si, aun sin ellos, el mes ya cerraba en negativo
}
/** Un mes cuyo saldo previsto queda en negativo y tiene depósitos de ahorro programados (fecha futura) entre sus movimientos. */
export function savingAlertFor(eng: Engine, i: number, run: number): SavingAlert | null {
  if (i < eng.now || run >= -0.005) return null;
  const dep = eng.svPending().filter(x => eng.svMonth(x) === i && !x.tid && !x.adj && x.amt > 0);
  if (!dep.length) return null;
  const amt = dep.reduce((a, x) => a + x.amt, 0), without = run + amt;
  return { i, amt, first: dep[0].date, run, without, deepens: without < -0.005 };
}
export const savingAlerts = (eng: Engine, rows: Row[]) => rows.map(r => savingAlertFor(eng, r.i, r.run)).filter((a): a is SavingAlert => !!a);
