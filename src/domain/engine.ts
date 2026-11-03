import type { Occ, Pay, Snapshot, Stmt, StmtN, Tx, YMD } from './types';
import { daysIn, idxOfStr, idxOfYmd, parseYmd } from './dates';

const round2 = (n: number) => Math.round(n * 100) / 100;
export const cardOf = (t: { cardName?: string }) => t.cardName || 'Tarjeta';
export const sum = (list: Occ[], type: 'in' | 'out') => list.filter(o => o.t.type === type).reduce((s, o) => s + o.a, 0);

/**
 * Motor de cálculo de Equa (traducción fiel de la app original).
 * Funciones puras sobre un Snapshot + la fecha de "hoy" inyectada (testeable).
 * Crear un motor nuevo cada vez que cambian los datos (los resultados se memorizan).
 */
export function createEngine(S: Snapshot, today: YMD) {
  const now = idxOfYmd(today);
  const cache = { all: null as Occ[] | null, stmt: new Map<string, Stmt>() };

  // ---------- cierres de tarjeta ----------
  const hasClose = (card: string) => { const ci = S.cardInfo[card] || {}; return !!(ci.close || Object.keys(ci.months || {}).length); };
  const closeDay = (card: string, i: number) => {
    const ci = S.cardInfo[card] || {}, c = (ci.months || {})[i] || ci.close;
    if (!c) return 31;
    return Math.min(c, daysIn(Math.floor(i / 12), i % 12));
  };
  // Sin cierre definido => último día del mes (la app original desbordaba al mes siguiente: corregido)
  const stmtCloseDate = (n: string, i: number): YMD => {
    const y = Math.floor((i - 1) / 12), m = (i - 1) % 12;
    return { y, m, d: Math.min(closeDay(n, i - 1), daysIn(y, m)) };
  };
  /** ¿El resumen (que se paga en el mes i) todavía no cerró? */
  const stmtOpen = (n: string, i: number) => {
    const c = stmtCloseDate(n, i);
    return idxOfYmd(today) * 100 + today.d <= idxOfYmd(c) * 100 + c.d;
  };

  // ---------- ocurrencias ----------
  const startIdx = (t: Tx) => idxOfStr(t.date) + (t.card && t.fixed ? 1 : 0);
  function occ(t: Tx): Occ[] {
    const d = parseYmd(t.date);
    let i0 = d.y * 12 + d.m;
    if (t.card && !t.fixed && d.d > closeDay(cardOf(t), i0)) i0++;
    if (t.card) i0++;
    if (t.fixed) {
      const skip = t.skip || [];
      return Array.from({ length: 36 }, (_, k) => i0 + k)
        .filter(i => (t.end == null || i <= t.end) && !skip.includes(i))
        .map(i => ({ i, k: 1, n: 1, a: t.amt, t }));
    }
    const n = t.card ? (t.inst || 1) : 1;
    return Array.from({ length: n }, (_, k) => ({ i: i0 + k, k: k + 1, n, a: t.amt / n, t }));
  }
  const all = () => cache.all || (cache.all = S.tx.flatMap(occ));

  // ---------- pagos / adelantos ----------
  const payIdx = (p: Pay) => idxOfStr(p.date);
  const payEff = (p: Pay) => Math.min(p.i, payIdx(p));
  const isAdv = (p: Pay) => payIdx(p) < p.i;
  const advIn = (i: number) => S.pay.filter(p => isAdv(p) && payIdx(p) === i).reduce((a, p) => a + p.amt, 0);
  const advFor = (i: number) => S.pay.filter(p => isAdv(p) && p.i === i).reduce((a, p) => a + p.amt, 0);
  const advNet = (i: number) => advIn(i) - advFor(i);
  const advCum = (c: number) => S.pay.filter(isAdv).reduce((a, p) => a + (payIdx(p) < c ? p.amt : 0) - (p.i < c ? p.amt : 0), 0);

  // ---------- resúmenes de tarjeta ----------
  function stmt(n: string, i: number): Stmt {
    const key = n + '|' + i, hit = cache.stmt.get(key);
    if (hit) return hit;
    const items: Record<number, number> = {}, pays: Record<number, number> = {};
    all().forEach(o => { if (o.t.card && o.t.type === 'out' && cardOf(o.t) === n) items[o.i] = (items[o.i] || 0) + o.a; });
    S.pay.forEach(p => { if (p.card === n) pays[p.i] = (pays[p.i] || 0) + p.amt; });
    const ks = [...Object.keys(items), ...Object.keys(pays)].map(Number);
    let r: Stmt = { items: 0, carry: 0, due: 0, paid: 0, rem: 0 };
    if (ks.length && i >= Math.min(...ks)) {
      let carry = 0;
      for (let k = Math.min(...ks); k <= i; k++) {
        const it = items[k] || 0, due = it + carry, pd = Math.min(pays[k] || 0, due);
        r = { items: it, carry, due, paid: pd, rem: Math.max(0, round2(due - pd)) };
        carry = r.rem;
      }
    }
    cache.stmt.set(key, r);
    return r;
  }
  /** Resumen "para mostrar": en meses futuros se oculta el arrastre del anterior */
  function stmtD(n: string, i: number): Stmt {
    const q = stmt(n, i);
    if (i <= now || q.carry <= 0.005) return q;
    const pd = Math.min(q.paid, q.items);
    return { items: q.items, carry: 0, due: q.items, paid: pd, rem: Math.max(0, round2(q.items - pd)) };
  }
  /** Resumen neto de adelantos (lo que realmente se paga al vencimiento) */
  function stmtN(n: string, i: number): StmtN {
    const q = stmtD(n, i), adv = S.pay.filter(p => p.card === n && p.i === i && isAdv(p)).reduce((a, p) => a + p.amt, 0);
    return { ...q, adv, due: q.due - adv, paid: q.paid - adv };
  }
  const cardNames = () => [...new Set([...S.cards, ...S.tx.filter(t => t.card).map(cardOf)])];

  // ---------- estado pagado / cobrado ----------
  const P = (o: Occ) => {
    if (o.t.card && o.t.type === 'out') { const q = stmt(cardOf(o.t), o.i); return q.due > 0.005 && q.rem < 0.005; }
    return !!S.paid[o.t.id + ':' + o.i];
  };
  /** Pendientes de meses anteriores (solo se muestran en el mes real actual) */
  const overdue = (cur: number, ty: 'in' | 'out') => cur !== now ? [] :
    all().filter(o => o.i < cur && o.t.type === ty && !o.t.card && !P(o))
      .sort((a, b) => b.i - a.i || b.t.date.localeCompare(a.t.date));

  // ---------- ahorro ----------
  const svMonth = (x: { date: string }) => idxOfStr(x.date);
  // Un movimiento de ahorro con fecha futura está "programado": no mueve ni la cuenta ni el saldo de Ahorro hasta su día.
  const todayIso = `${today.y}-${String(today.m + 1).padStart(2, '0')}-${String(today.d).padStart(2, '0')}`;
  const isDone = (x: { date: string }) => x.date <= todayIso;
  const svPending = () => S.sav.filter(x => !isDone(x)).sort((a, b) => a.date.localeCompare(b.date));
  // Los ajustes (ganancia/pérdida) cambian el valor de una categoría pero no mueven la cuenta disponible:
  // por eso el saldo (svBal) los cuenta y los acumulados de caja (svNet/svBefore/svTo) no.
  const sumAmt = (l: { amt: number }[]) => l.reduce((a, x) => a + x.amt, 0);
  const cash = S.sav.filter(x => !x.adj);
  /** Saldo de hoy de una categoría (sin lo programado). */
  const svBal = (c: string) => sumAmt(S.sav.filter(x => x.cat === c && isDone(x)));
  /** Saldo contando también lo programado (para saber si una categoría se puede borrar). */
  const svBalAll = (c: string) => sumAmt(S.sav.filter(x => x.cat === c));
  /** Valor actual, aportado (valor − ganancia) y rendimiento de una categoría. `pct` solo con aportado positivo y rendimiento ≠ 0. */
  const svReturn = (c: string) => {
    const mine = S.sav.filter(x => x.cat === c && isDone(x)), value = sumAmt(mine), gain = sumAmt(mine.filter(x => x.adj)), contributed = value - gain;
    return { value, contributed, gain, pct: contributed > 0.005 && Math.abs(gain) > 0.005 ? (gain / contributed) * 100 : null };
  };
  const svNet = (i: number) => sumAmt(cash.filter(x => svMonth(x) === i));
  const svBefore = (i: number) => sumAmt(cash.filter(x => svMonth(x) < i));
  const svTo = (i: number) => sumAmt(cash.filter(x => svMonth(x) <= i));
  /** Lo que ya movió la cuenta: todo hasta hoy (nada de lo programado). */
  const svToday = () => sumAmt(cash.filter(isDone));
  /** Depósitos y retiros "de verdad" de un mes (sin transferencias entre categorías ni ajustes). */
  const svMoves = (i: number) => S.sav.filter(x => !x.tid && !x.adj && svMonth(x) === i);

  // ---------- disponible ----------
  /** Dinero disponible hacia el final del mes i (cobrado − pagado − ahorrado − adelantos…). En el mes de hoy solo descuenta el ahorro que ya ocurrió: lo programado todavía no sale de la cuenta. */
  function availFor(i: number): number {
    const A = all(), M = A.filter(o => o.i === i), pr = A.filter(o => o.i < i);
    const prn = pr.filter(o => !(o.t.card && o.t.type === 'out'));
    const carry = (S.open || 0) + sum(prn.filter(P), 'in') - sum(prn.filter(P), 'out') - sum(pr.filter(o => o.t.card && o.t.type === 'out'), 'out');
    const nc = M.filter(o => !(o.t.card && o.t.type === 'out') && P(o));
    const ce = cardNames().reduce((a, n) => { const q = stmt(n, i); return a + Math.max(0, Math.min(q.items, q.paid - q.carry)); }, 0);
    const adv = S.pay.filter(p => p.i > i && payIdx(p) <= i).reduce((a, p) => a + p.amt, 0);
    return carry + sum(nc, 'in') - sum(nc, 'out') - ce - adv - (i === now ? svToday() : svTo(i));
  }
  /** Saldo que arrastra el mes `cur` desde los anteriores (para "Previsto del mes" y Previsión) */
  const carryIn = (cur: number) => {
    const A = all();
    return (S.open || 0) + sum(A.filter(o => o.i < cur), 'in') - sum(A.filter(o => o.i < cur), 'out') - svBefore(cur) - advCum(cur);
  };

  /** Balance mensual (neto): ingresos − gastos del mes (con adelantos de tarjeta) − ahorro del mes, SIN el saldo anterior. Saldo anterior + neto = previsto. */
  function monthBalance(i: number) {
    const m = all().filter(o => o.i === i), inc = sum(m, 'in'), out = sum(m, 'out') + advNet(i), sv = svNet(i);
    return { inc, out, sv, bal: inc - out - sv };
  }

  /** Ahorro del mes: depósitos − retiros (sin transferencias ni ajustes) y qué % son de los ingresos del mes (null si no ahorró o no hubo ingresos). */
  function monthSaving(i: number) {
    const dep = svMoves(i).filter(x => x.amt > 0).reduce((a, x) => a + x.amt, 0), ret = svMoves(i).filter(x => x.amt < 0).reduce((a, x) => a - x.amt, 0), net = dep - ret;
    const inc = sum(all().filter(o => o.i === i), 'in');
    return { dep, ret, net, inc, pct: inc > 0.005 && net > 0.005 ? (net / inc) * 100 : null };
  }

  return {
    now, todayIso, isDone, svPending, svBalAll, S, all, occ, startIdx, sum, closeDay, hasClose, stmtCloseDate, stmtOpen,
    payIdx, payEff, isAdv, advIn, advFor, advNet, advCum,
    stmt, stmtD, stmtN, cardNames, P, overdue,
    svMonth, svBal, svReturn, svMoves, svNet, svBefore, svTo, availFor, carryIn, monthBalance, monthSaving,
  };
}
export type Engine = ReturnType<typeof createEngine>;
