import type { CatKind, Occ, Pay, Sav, Snapshot, Tx } from '../domain/types';
import { addRep, idxOfStr, isoLocal, ymdOf } from '../domain/dates';
import { createEngine, cardOf, type Engine } from '../domain/engine';
import { buildBackup } from '../domain/backup';
import { balAt, firstNegative } from '../domain/savingsRules';
import { isColor, isLast4, isStyle, nextFreeColor } from '../domain/cardLook';
import { normName } from '../domain/legacy';
import { newId } from '../lib/id';
import type { Repository, TxFields } from '../data/repository';

/** Resultado de una operación que puede ser rechazada por reglas de negocio */
export type Result = { ok: true } | { ok: false; error: string };
const ok: Result = { ok: true };
const fail = (error: string): Result => ({ ok: false, error });

export interface NewTxInput {
  type: 'in' | 'out'; amt: number; cat: string; note: string; date: string;
  card: boolean; cardName: string; fixed: boolean; inst: number;
  repeat?: { mode: 'w' | 'm'; times: number };   // solo no fijos, alta nueva
  paid?: boolean;                                  // "ya está pagado / cobrado"
}

/** Datos de una edición; `paid` (opcional) fija el estado pagado/cobrado del mes que se edita. */
export type EditTxInput = Omit<NewTxInput, 'repeat'>;

/**
 * Reglas de negocio de Equa sobre un Repository. Cada método recibe el
 * Snapshot actual (para validar) y escribe vía repo; la UI recarga después.
 */
export function createActions(repo: Repository, today: () => Date = () => new Date()) {
  const eng = (S: Snapshot): Engine => createEngine(S, { y: today().getFullYear(), m: today().getMonth(), d: today().getDate() });

  // ---------------- movimientos ----------------
  async function addTransaction(S: Snapshot, x: NewTxInput): Promise<Result> {
    if (!(x.amt > 0)) return fail('Escribe un monto válido');
    const base: Tx = {
      id: newId(), type: x.type, amt: x.amt, cat: x.cat, note: x.note.trim(), date: x.date,
      card: x.card, cardName: x.card ? x.cardName : '', fixed: x.fixed, inst: x.card && !x.fixed ? Math.max(1, x.inst || 1) : 1,
    };
    const N = !x.fixed && x.repeat ? x.repeat.times : 1;
    if (x.repeat && !x.fixed) {
      const mx = x.repeat.mode === 'w' ? 104 : 60;
      if (!(N >= 2 && N <= mx)) return fail(`Escribe entre 2 y ${mx} veces`);
    }
    const list: Tx[] = [];
    for (let k = 0; k < N; k++) {
      const t: Tx = { ...base, id: k === 0 ? base.id : newId() };
      if (x.repeat && !x.fixed) { t.date = addRep(base.date, k, x.repeat.mode); t.rep = { k: k + 1, n: N, f: x.repeat.mode }; t.g = base.id; }
      list.push(t);
    }
    await repo.insertTx(list);
    if (x.paid && !(x.card && x.type === 'out')) {
      const first = eng({ ...S, tx: [...S.tx, list[0]] }).occ(list[0])[0];
      await repo.setSettled(list[0].id, first.i, true);
    }
    return ok;
  }

  /** Edición. Para un fijo editado "desde este mes" se corta la serie y se crea una nueva. */
  async function editTransaction(S: Snapshot, t: Tx, i: number, nt: EditTxInput): Promise<Result> {
    if (!(nt.amt > 0)) return fail('Escribe un monto válido');
    const e = eng(S), i0 = e.startIdx(t), os = t.skip || [], oe = t.end;
    const f: TxFields = {
      type: nt.type, amt: nt.amt, cat: nt.cat, note: nt.note.trim(), date: nt.date,
      card: nt.card, cardName: nt.card ? nt.cardName : '', fixed: nt.fixed, inst: nt.card && !nt.fixed ? Math.max(1, nt.inst || 1) : 1,
    };
    if (t.fixed && i > i0) {
      const created: Tx = { ...f, id: newId(), skip: [] };
      if (f.fixed) {
        created.date = ymdOf(i - (f.card ? 1 : 0), +f.date.slice(8));
        if (oe != null) created.end = oe;
        created.skip = os.filter(m => m >= i);
      }
      await repo.updateTx(t.id, { end: i - 1 });
      await repo.insertTx([created]);
      if (created.skip?.length) await repo.setSkips(created.id, created.skip);
      await repo.moveSettlements(t.id, created.id, i);
      if (nt.paid !== undefined && !f.card) {
        const mo = f.fixed ? i : idxOfStr(f.date);
        if (mo !== i) await repo.setSettled(created.id, i, false);
        await repo.setSettled(created.id, mo, nt.paid);
      }
      // los meses ya editados de esta serie, de este mes en adelante, pasan a depender de la serie nueva
      for (const x of S.tx.filter(y => y.of === t.id && e.occ(y)[0].i >= i)) await repo.updateTx(x.id, { of: created.id });
    } else {
      const keepEnd = t.fixed && f.fixed;
      await repo.updateTx(t.id, { ...f, end: keepEnd ? (oe ?? null) : null });
      await repo.setSkips(t.id, keepEnd ? os : []);
      if (nt.paid !== undefined && !f.card) {
        const mo = f.fixed ? i : idxOfStr(f.date);
        if (mo !== i) await repo.setSettled(t.id, i, false);
        await repo.setSettled(t.id, mo, nt.paid);
      }
    }
    return ok;
  }

  /**
   * Edición de un fijo "solo este mes": el mes se saltea en la serie original (el resto de los meses queda igual)
   * y se crea un movimiento puntual con los datos nuevos. Conserva el estado pagado/cobrado del mes.
   */
  async function editFixedMonth(S: Snapshot, t: Tx, i: number, nt: EditTxInput): Promise<Result> {
    if (!(nt.amt > 0)) return fail('Escribe un monto válido');
    const e = eng(S);
    const created: Tx = {
      id: newId(), type: nt.type, amt: nt.amt, cat: nt.cat, note: nt.note.trim(), date: nt.date,
      card: nt.card, cardName: nt.card ? nt.cardName : '', fixed: false, inst: nt.card ? Math.max(1, nt.inst || 1) : 1, skip: [], of: t.id,
    };
    if (created.card) {
      // que el gasto con tarjeta siga cayendo en el mismo resumen (mes i) si el día no se cambió
      const o = e.occ(created)[0];
      const cd = e.closeDay(cardOf(created), idxOfStr(created.date));
      const orig = ymdOf(i - 1, +t.date.slice(8));
      if (o && o.i > i && cd >= 1 && nt.date === orig) created.date = ymdOf(idxOfStr(created.date), Math.min(+created.date.slice(8), cd));
    }
    const wasPaid = !!S.paid[`${t.id}:${i}`];
    await repo.setSkips(t.id, [...(t.skip || []), i]);
    await repo.insertTx([created]);
    if (wasPaid) await repo.setSettled(t.id, i, false);
    if ((nt.paid ?? wasPaid) && !created.card) await repo.setSettled(created.id, e.occ(created)[0].i, true);
    return ok;
  }

  const deleteFixedMonth = (t: Tx, i: number) => repo.setSkips(t.id, [...(t.skip || []), i]);
  async function deleteFixedFrom(S: Snapshot, t: Tx, i: number) {
    const e = eng(S);
    const ovr = S.tx.filter(x => x.of === t.id && e.occ(x)[0].i >= i).map(x => x.id);   // meses editados de aquí en adelante
    if (i <= e.startIdx(t)) await repo.deleteTx([t.id, ...ovr]); else { await repo.updateTx(t.id, { end: i - 1 }); if (ovr.length) await repo.deleteTx(ovr); }
  }

  // ---- meses editados de un fijo ("solo este mes"): siguen ofreciendo las mismas opciones que el fijo ----
  const seriesOf = (S: Snapshot, o: Tx) => (o.of ? S.tx.find(x => x.id === o.of && x.fixed) : undefined);
  /**
   * Reparación de datos: antes de existir `of`, un fijo editado "solo este mes" quedaba como un movimiento común.
   * Si un movimiento puntual coincide con el mes salteado de un fijo (mismo tipo, categoría, nota y medio de pago),
   * se lo vuelve a ligar a su serie. Es estricto a propósito: ante la duda no toca nada. Se puede correr las veces que sea.
   */
  async function relinkOverrides(S: Snapshot): Promise<number> {
    const e = eng(S), key = (x: Tx) => [x.type, x.card ? 'c:' + (x.cardName || '') : 'k', normName(x.cat), normName(x.note || '')].join('|');
    const fixed = S.tx.filter(t => t.fixed);
    const orphans = S.tx.filter(x => !x.fixed && !x.of && !x.rep && !x.g && (x.inst || 1) === 1);
    const claims = new Map<string, { t: Tx; x: Tx[] }>();      // serie+mes -> huérfanos candidatos
    for (const x of orphans) {
      const m = e.occ(x)[0]?.i; if (m == null) continue;
      const hits = fixed.filter(t => key(t) === key(x) && (t.skip || []).includes(m) && m >= e.startIdx(t) && (t.end == null || m <= t.end));
      if (hits.length !== 1) continue;                         // ninguna o ambigua
      const k = hits[0].id + ':' + m, c = claims.get(k) || { t: hits[0], x: [] }; c.x.push(x); claims.set(k, c);
    }
    let n = 0;
    for (const { t, x } of claims.values()) if (x.length === 1) { await repo.updateTx(x[0].id, { of: t.id }); n++; }
    return n;
  }

  /** Editar "este mes y los siguientes" desde un mes ya editado: se descarta la edición puntual y rige la nueva desde este mes. */
  async function editFromOverride(S: Snapshot, o: Tx, i: number, nt: EditTxInput): Promise<Result> {
    const series = seriesOf(S, o);
    if (!series) return fail('No se encontró el gasto fijo original');
    if (!(nt.amt > 0)) return fail('Escribe un monto válido');
    const wasPaid = !!S.paid[`${o.id}:${i}`];
    const S2: Snapshot = { ...S, tx: S.tx.filter(x => x.id !== o.id) };
    const t2: Tx = { ...series, skip: (series.skip || []).filter(m => m !== i) };
    await repo.deleteTx([o.id]);
    await repo.setSkips(series.id, t2.skip!);
    if (wasPaid) await repo.setSettled(series.id, i, true);   // editTransaction lo traslada a la serie nueva
    return editTransaction(S2, t2, i, { ...nt, fixed: true });
  }
  /** Borrar "este mes y los siguientes" desde un mes ya editado. */
  async function deleteFromOverride(S: Snapshot, o: Tx, i: number) {
    const series = seriesOf(S, o);
    await repo.deleteTx([o.id]);
    if (series) await deleteFixedFrom({ ...S, tx: S.tx.filter(x => x.id !== o.id) }, series, i);
  }
  const deleteOne = (t: Tx) => repo.deleteTx([t.id]);
  const followingInSeries = (S: Snapshot, t: Tx) => t.rep ? S.tx.filter(x => x.g === t.g && x.date > t.date) : [];
  const deleteSeriesFrom = (S: Snapshot, t: Tx) => repo.deleteTx(S.tx.filter(x => x.g === t.g && x.date >= t.date).map(x => x.id));
  const setPaid = (txId: string, month: number, on: boolean) => repo.setSettled(txId, month, on);
  /** Marca varios movimientos (id + mes) como pagados/cobrados, o los desmarca. */
  async function setPaidMany(items: { id: string; i: number }[], on: boolean): Promise<Result> {
    if (!items.length) return fail('No hay movimientos seleccionados');
    for (const x of items) await repo.setSettled(x.id, x.i, on);
    return ok;
  }

  // ---------------- categorías ----------------
  const catList = (S: Snapshot, kind: CatKind) => S.categories[kind];
  /** Duplicados por nombre (sin tildes/mayúsculas): visible o eliminada (restaurable) */
  function catDup(S: Snapshot, kind: CatKind, name: string): { name: string; hidden: boolean; msg: string } | null {
    const c = catList(S, kind).find(x => normName(x.name) === normName(name));
    if (!c) return null;
    return c.hidden
      ? { name: c.name, hidden: true, msg: `"${c.name}" ya existe entre las eliminadas: restaurala desde la lista` }
      : { name: c.name, hidden: false, msg: `Ya existe una categoría llamada "${c.name}"` };
  }
  async function addCategory(S: Snapshot, kind: CatKind, name: string): Promise<Result> {
    const n = name.trim(); if (!n) return fail('Escribe un nombre');
    const d = catDup(S, kind, n); if (d) return fail(d.msg);
    await repo.addCategory(kind, n); return ok;
  }
  async function removeCategory(S: Snapshot, kind: CatKind, name: string): Promise<Result> {
    if (kind === 'sav') {
      const b = eng(S).svBalAll(name);
      if (Math.abs(b) > 0.005) return fail(`"${name}" tiene saldo. Solo se elimina con saldo cero`);
    }
    await repo.setCategoryHidden(kind, name, true); return ok;
  }
  const restoreCategory = (kind: CatKind, name: string) => repo.setCategoryHidden(kind, name, false);
  /** Cuántos movimientos usan una categoría (para avisar antes de borrarla). */
  function categoryUsage(S: Snapshot, kind: CatKind, name: string): number {
    const k = normName(name);
    return kind === 'sav' ? S.sav.filter(x => normName(x.cat) === k).length : S.tx.filter(x => x.type === kind && normName(x.cat) === k).length;
  }
  /**
   * Borrado definitivo (la categoría tiene que estar ya eliminada/archivada).
   * - Sin movimientos: se borra.
   * - Con movimientos de gasto/ingreso: hay que indicar a qué categoría pasarlos (`moveTo`).
   * - Con movimientos de ahorro: no se borra, para no perder el historial (queda archivada).
   */
  async function deleteCategoryForever(S: Snapshot, kind: CatKind, name: string, moveTo?: string): Promise<Result> {
    const c = catList(S, kind).find(x => normName(x.name) === normName(name));
    if (!c) return fail('La categoría no existe');
    if (!c.hidden) return fail('Primero elimina la categoría; después podrás borrarla para siempre');
    const n = categoryUsage(S, kind, name);
    if (n > 0) {
      if (kind === 'sav') return fail(`"${name}" tiene ${n} movimiento${n === 1 ? '' : 's'} de ahorro: queda archivada para conservar tu historial`);
      const to = moveTo ? catList(S, kind).find(x => normName(x.name) === normName(moveTo) && !x.hidden) : undefined;
      if (!to || normName(to.name) === normName(name)) return fail(`Elige a qué categoría pasar los movimientos de "${name}"`);
      for (const x of S.tx.filter(x => x.type === kind && normName(x.cat) === normName(name))) await repo.updateTx(x.id, { cat: to.name });
    }
    await repo.deleteCategory(kind, name); return ok;
  }
  async function setUsd(v: number): Promise<Result> {
    if (isNaN(v) || v < 0) return fail('Escribe un monto válido');
    await repo.setForeignAmount('USD', Math.round(v * 100) / 100); return ok;
  }

  // ---------------- tarjetas ----------------
  async function addCard(S: Snapshot, name: string): Promise<Result> {
    const n = name.trim(); if (!n) return fail('Escribe un nombre');
    if (eng(S).cardNames().some(c => normName(c) === normName(n))) return fail('Ya existe una tarjeta con ese nombre');
    const names = eng(S).cardNames();
    await repo.addCard(n); await repo.setCardLook(n, { color: nextFreeColor(S, names) }); return ok;
  }
  async function renameCard(S: Snapshot, from: string, to: string): Promise<Result> {
    const n = to.trim(); if (!n || n === from) return ok;
    if (eng(S).cardNames().some(c => c !== from && normName(c) === normName(n))) return fail('Ya existe una tarjeta con ese nombre');
    await repo.renameCard(from, n); return ok;
  }
  const setClosing = (card: string, day: number) => repo.setCardClosing(card, day);
  const setClosingFor = (card: string, month: number, day: number | null) => repo.setClosingOverride(card, month, day);
  async function setCardLook(card: string, look: { color?: string; style?: string; last4?: string }): Promise<Result> {
    if (look.color !== undefined && !isColor(look.color)) return fail('Elige un color de la lista');
    if (look.style !== undefined && !isStyle(look.style)) return fail('Elige un estilo de la lista');
    const l4 = look.last4 === undefined ? undefined : look.last4.trim();
    if (l4 && !isLast4(l4)) return fail('Los últimos números son 4 dígitos');
    await repo.setCardLook(card, { color: look.color, style: look.style, last4: l4 }); return ok;
  }
  const deleteCard = (card: string) => repo.deleteCard(card);

  /** ¿Qué pasa si pago `amt` del resumen n/i? (para los carteles de confirmación) */
  function payInfo(S: Snapshot, n: string, i: number) {
    const e = eng(S), q = e.stmtD(n, i);
    return { q, open: e.stmtOpen(n, i), closeDate: e.stmtCloseDate(n, i), avail: e.availFor(Math.min(i, e.now)) };
  }
  async function pay(S: Snapshot, n: string, i: number, amt: number): Promise<Result> {
    const q = eng(S).stmtD(n, i);
    if (!(amt > 0) || amt > q.rem + 0.005) return fail('Escribe un monto entre 1 y ' + Math.round(q.rem));
    const p: Pay = { id: newId(), card: n, i, amt: Math.min(amt, q.rem), date: isoLocal(today()) };
    await repo.addPayment(p); return ok;
  }
  const undoPayment = (id: string) => repo.deletePayment(id);

  // ---------------- ahorro ----------------
  const todayIso = () => isoLocal(today());
  /** Saldo de una categoría a una fecha (por defecto hoy): lo programado para después no cuenta. */
  const balOf = (list: Sav[], c: string, upTo: string = todayIso()) => balAt(list, c, upTo);
  const availWith = (S: Snapshot, list: Sav[], date: string) => eng({ ...S, sav: list }).availFor(idxOfStr(date));
  const money = (n: number) => `$${Math.max(0, Math.round(n))}`;
  const dmy = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
  /** Revisa que ninguna de esas categorías quede en negativo desde `from` en adelante (hoy ni en fechas programadas). */
  function negativeError(list: Sav[], cats: string[], from: string, text: (c: string, when: string | null) => string): string | null {
    for (const c of new Set(cats)) {
      const d = firstNegative(list, c, from);
      if (d) return text(c, d > todayIso() ? dmy(d) : null);
    }
    return null;
  }

  /** Reglas de un depósito o retiro (nuevo o editado), sin guardar: se usa antes de confirmar y al guardar. */
  function checkSavMove(S: Snapshot, dir: 'in' | 'out', cat: string, a: number, date: string, editing?: Sav): Result {
    if (!(a > 0)) return fail('Escribe un monto válido');
    const others = S.sav.filter(x => x !== editing && x.id !== editing?.id);
    const next = [...others, { id: 'tmp', cat, amt: dir === 'in' ? a : -a, date, note: '' }];
    const from = editing && editing.date < date ? editing.date : date;
    if (editing) {
      const e = negativeError(next, [cat, editing.cat], from, (c, w) => `Esa edición dejaría ${c} en negativo${w ? ' el ' + w : ''}`);
      return e ? fail(e) : ok;
    }
    if (dir === 'out') {
      const at = balOf(others, cat, date);
      if (a > at + 0.005) return fail(`En ${cat} solo ${date > todayIso() ? 'tendrás' : 'tienes'} ${money(at)}${date > todayIso() ? ' el ' + dmy(date) : ''}`);
      const e = negativeError(next, [cat], date, (c, w) => `Ese retiro dejaría ${c} en negativo${w ? ' el ' + w : ''}`);
      if (e) return fail(e);
    }
    return ok;
  }
  async function savMove(S: Snapshot, dir: 'in' | 'out', cat: string, a: number, date: string, note: string, editing?: Sav): Promise<Result> {
    const chk = checkSavMove(S, dir, cat, a, date, editing);
    if (!chk.ok) return chk;
    const na = dir === 'in' ? a : -a;
    if (editing) await repo.updateSav(editing.id, { cat, amt: na, date, note });
    else await repo.insertSav([{ id: newId(), cat, amt: na, date, note }]);
    return ok;
  }
  async function savTransfer(S: Snapshot, from: string, to: string, a: number, date: string, note: string): Promise<Result> {
    if (!(a > 0)) return fail('Escribe un monto válido');
    if (!to || to === from) return fail('Elige dos categorías distintas');
    const at = balOf(S.sav, from, date);
    if (a > at + 0.005) return fail(`En ${from} solo ${date > todayIso() ? 'tendrás' : 'tienes'} ${money(at)}${date > todayIso() ? ' el ' + dmy(date) : ''}`);
    const tid = newId();
    const legs: Sav[] = [{ id: newId(), tid, cat: from, amt: -a, date, note }, { id: newId(), tid, cat: to, amt: a, date, note }];
    const e = negativeError([...S.sav, ...legs], [from], date, (c, w) => `Esa transferencia dejaría ${c} en negativo${w ? ' el ' + w : ''}`);
    if (e) return fail(e);
    await repo.insertSav(legs);
    return ok;
  }
  /**
   * Ajuste de saldo: el usuario dice cuánto vale la categoría en esa fecha (hoy, normalmente) y se guarda la
   * diferencia como ganancia (+) o pérdida (−). No toca la cuenta disponible. Editando, `value` es el nuevo
   * valor resultante de la categoría descontando el propio ajuste.
   */
  async function savAdjust(S: Snapshot, cat: string, value: number, date: string, note: string, editing?: Sav): Promise<Result> {
    if (!cat) return fail('Elige una categoría');
    if (!(value >= 0) || !isFinite(value)) return fail('Escribe un valor válido (0 o más)');
    const others = S.sav.filter(x => x.id !== editing?.id);
    const delta = Math.round((value - balOf(others, cat, date)) * 100) / 100;
    if (Math.abs(delta) < 0.005) return fail(editing ? 'Con ese valor no hay diferencia: para quitar el ajuste, bórralo' : `"${cat}" ya vale ese monto: no hay nada que ajustar`);
    const next = [...others, { id: 'tmp', cat, amt: delta, date, note: '', adj: true }];
    const from = editing && editing.date < date ? editing.date : date;
    const e = negativeError(next, [cat, ...(editing ? [editing.cat] : [])], from, (c, w) => `Esa edición dejaría ${c} en negativo${w ? ' el ' + w : ''}`);
    if (e) return fail(e);
    if (editing) await repo.updateSav(editing.id, { cat, amt: delta, date, note });
    else await repo.insertSav([{ id: newId(), cat, amt: delta, date, note, adj: true }]);
    return ok;
  }
  /** Quitar un movimiento (o una transferencia completa) validando saldos, también los de fechas programadas */
  function savDeletePlan(S: Snapshot, x: Sav): { ok: false; error: string } | { ok: true; rest: Sav[]; ids: string[] } {
    const gone = x.tid ? S.sav.filter(z => z.tid === x.tid) : [x];
    const rest = S.sav.filter(z => !gone.includes(z));
    const from = gone.reduce((m, z) => (z.date < m ? z.date : m), gone[0].date);
    const e = negativeError(rest, gone.map(z => z.cat), from, (c, w) => `No se puede borrar: dejaría ${c} en negativo${w ? ' el ' + w : ''}`);
    if (e) return { ok: false, error: e };
    return { ok: true, rest, ids: gone.map(z => z.id) };
  }
  const savDelete = (ids: string[]) => repo.deleteSav(ids);

  const setOpening = (n: number) => repo.setOpeningBalance(n);

  // ---------------- respaldo ----------------
  const exportBackup = async () => buildBackup(await repo.load());
  /** Reemplaza todos los datos por los de un respaldo ya validado con parseBackup(). */
  const restoreBackup = (S: Snapshot) => repo.replaceAll(S);

  return {
    eng, addTransaction, editTransaction, editFixedMonth, editFromOverride, deleteFromOverride, seriesOf, relinkOverrides, deleteFixedMonth, deleteFixedFrom, deleteOne, followingInSeries, deleteSeriesFrom, setPaid, setPaidMany,
    catDup, addCategory, removeCategory, restoreCategory, categoryUsage, deleteCategoryForever, setUsd,
    addCard, renameCard, setClosing, setClosingFor, setCardLook, deleteCard, payInfo, pay, undoPayment,
    balOf, todayIso, availWith, checkSavMove, savMove, savAdjust, savTransfer, savDeletePlan, savDelete, setOpening, exportBackup, restoreBackup,
  };
}
export type Actions = ReturnType<typeof createActions>;
export { cardOf };
export type { Occ };
