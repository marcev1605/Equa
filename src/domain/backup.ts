import type { CatKind, Category, Snapshot } from './types';
import { emptySnapshot } from './types';
import { isColor, isLast4, isStyle } from './cardLook';
import { fromLegacy, normName } from './legacy';

/**
 * Respaldo de Equa: un JSON `{ app: "equa", version, exportedAt, counts, snapshot }` con una foto completa de la cuenta.
 * Restaurar es UN solo camino: el archivo (nuevo o de la app HTML anterior) se valida y se convierte en un Snapshot,
 * y el repositorio lo aplica con `replaceAll` (en Postgres: la función restore_backup(), una sola transacción).
 */
export const BACKUP_VERSION = 2;

export interface BackupCounts { movimientos: number; categorias: number; tarjetas: number; pagos: number; ahorro: number }
export interface ParsedBackup { snapshot: Snapshot; counts: BackupCounts; origin: 'equa' | 'legacy'; exportedAt?: string }

export const countsOf = (S: Snapshot): BackupCounts => ({
  movimientos: S.tx.length, categorias: S.categories.out.length + S.categories.in.length + S.categories.sav.length,
  tarjetas: S.cards.length, pagos: S.pay.length, ahorro: S.sav.length,
});

export function buildBackup(S: Snapshot, now: Date = new Date()): string {
  return JSON.stringify({ app: 'equa', version: BACKUP_VERSION, exportedAt: now.toISOString(), counts: countsOf(S), snapshot: S });
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const bad = (msg: string): never => { throw new Error(msg); };
const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const isStr = (x: unknown): x is string => typeof x === 'string';
const isObj = (x: unknown): x is Record<string, any> => !!x && typeof x === 'object' && !Array.isArray(x);

/** Lee el texto de un respaldo (formato Equa o de la app anterior). Lanza un Error con un mensaje claro si no sirve. */
export function parseBackup(text: string): ParsedBackup {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return bad('El archivo no es un respaldo válido: no se puede leer'); }
  if (isObj(raw) && raw.app === 'equa') {
    if (!isNum(raw.version) || raw.version > BACKUP_VERSION) bad('Este respaldo es de una versión más nueva de Equa: actualiza la app para restaurarlo');
    if (raw.version < 2) bad('Este respaldo es de una versión que ya no se puede restaurar');
    const snapshot = validate(raw.snapshot);
    return { snapshot, counts: countsOf(snapshot), origin: 'equa', exportedAt: isStr(raw.exportedAt) ? raw.exportedAt : undefined };
  }
  if (isObj(raw) && Array.isArray(raw.tx)) {
    let S: Snapshot;
    try { S = fromLegacy(raw); } catch { return bad('El respaldo de la app anterior no es válido'); }
    const snapshot = validate(S);
    return { snapshot, counts: countsOf(snapshot), origin: 'legacy' };
  }
  return bad('El archivo no es un respaldo de Equa');
}

/** Valida y deja el Snapshot completo y consistente (categorías y tarjetas que faltan se crean; lo imposible se rechaza). */
function validate(input: unknown): Snapshot {
  if (!isObj(input)) bad('El respaldo está incompleto: falta la información de la cuenta');
  const r = input as Record<string, any>, S = emptySnapshot();
  const arr = (k: string): any[] => (r[k] === undefined ? [] : Array.isArray(r[k]) ? r[k] : bad(`El respaldo está dañado: "${k}" no es una lista`));
  S.open = r.open === undefined ? 0 : isNum(r.open) ? r.open : bad('El saldo inicial del respaldo no es un número');

  const ids = new Set<string>();
  const uniq = (id: unknown, what: string): string => {
    if (!isStr(id) || !id) bad(`${what} sin identificador`);
    if (ids.has(`${what}:${id}`)) bad(`${what} repetido en el respaldo`);
    ids.add(`${what}:${id}`); return id as string;
  };
  const date = (d: unknown, what: string): string => (isStr(d) && DATE.test(d) ? d : bad(`${what} con fecha inválida`));

  S.tx = arr('tx').map((t, n) => {
    if (!isObj(t)) bad(`Movimiento ${n + 1} inválido`);
    if (t.type !== 'in' && t.type !== 'out') bad(`Movimiento ${n + 1}: tipo inválido`);
    if (!isNum(t.amt) || !(t.amt > 0)) bad(`Movimiento ${n + 1}: monto inválido`);
    if (!isStr(t.cat) || !t.cat.trim()) bad(`Movimiento ${n + 1}: sin categoría`);
    return {
      id: uniq(t.id, 'Movimiento'), type: t.type, amt: t.amt, cat: t.cat.trim(), note: isStr(t.note) ? t.note : '', date: date(t.date, `Movimiento ${n + 1}`),
      card: !!t.card, cardName: isStr(t.cardName) ? t.cardName : '', fixed: !!t.fixed, inst: isNum(t.inst) && t.inst >= 1 ? Math.floor(t.inst) : 1,
      end: isNum(t.end) ? t.end : null, skip: Array.isArray(t.skip) ? t.skip.filter(isNum) : [],
      rep: isObj(t.rep) && isNum(t.rep.k) && isNum(t.rep.n) && (t.rep.f === 'w' || t.rep.f === 'm') ? { k: t.rep.k, n: t.rep.n, f: t.rep.f } : undefined,
      g: t.g != null ? String(t.g) : undefined, of: t.of != null ? String(t.of) : undefined,
    };
  });
  // un fijo editado "solo este mes" cuyo fijo ya no está pasa a ser un movimiento común
  const txIds = new Set(S.tx.map(t => t.id));
  S.tx.forEach(t => { if (t.of && (!txIds.has(t.of) || t.of === t.id)) t.of = undefined; });

  S.sav = arr('sav').map((x, n) => {
    if (!isObj(x) || !isStr(x.cat) || !x.cat.trim()) bad(`Movimiento de ahorro ${n + 1} inválido`);
    if (!isNum(x.amt) || x.amt === 0) bad(`Movimiento de ahorro ${n + 1}: monto inválido`);
    const s = { id: uniq(x.id, 'Movimiento de ahorro'), cat: x.cat.trim(), amt: x.amt, date: date(x.date, `Movimiento de ahorro ${n + 1}`), note: isStr(x.note) ? x.note : '' } as Snapshot['sav'][number];
    if (x.tid != null) s.tid = String(x.tid);
    if (x.adj) s.adj = true;
    return s;
  });
  const legs = new Map<string, number[]>();
  S.sav.forEach(x => { if (x.tid) legs.set(x.tid, [...(legs.get(x.tid) || []), x.amt]); });
  legs.forEach(l => { if (l.length !== 2 || Math.abs(l[0] + l[1]) > 0.005) bad('Hay una transferencia de ahorro incompleta en el respaldo'); });
  S.sav.forEach(x => { if (x.adj && x.tid) bad('Un ajuste de ahorro no puede ser parte de una transferencia'); });

  S.pay = arr('pay').map((p, n) => {
    if (!isObj(p) || !isStr(p.card) || !p.card.trim() || !isNum(p.i) || !isNum(p.amt) || !(p.amt > 0)) bad(`Pago de tarjeta ${n + 1} inválido`);
    return { id: uniq(p.id, 'Pago'), card: p.card.trim(), i: Math.floor(p.i), amt: p.amt, date: date(p.date, `Pago de tarjeta ${n + 1}`) };
  });
  if (r.paid !== undefined && !isObj(r.paid)) bad('El respaldo está dañado: "paid" no es válido');
  Object.entries((r.paid || {}) as Record<string, unknown>).forEach(([k, v]) => { if (v === true && txIds.has(k.split(':')[0])) S.paid[k] = true; });

  // tarjetas: las listadas + las usadas
  const cards: string[] = [], addCard = (n: string) => { const t = n.trim(); if (t && !cards.some(c => normName(c) === normName(t))) cards.push(t); };
  arr('cards').forEach(c => isStr(c) && addCard(c));
  Object.keys(isObj(r.cardInfo) ? r.cardInfo : {}).forEach(addCard);
  S.tx.filter(t => t.card && t.type === 'out').forEach(t => addCard(t.cardName || 'Tarjeta'));
  S.pay.forEach(p => addCard(p.card));
  S.cards = cards;
  const info = isObj(r.cardInfo) ? r.cardInfo : {};
  cards.forEach(c => {
    const key = Object.keys(info).find(k => normName(k) === normName(c)), ci = key ? info[key] : undefined;
    const months: Record<number, number> = {};
    if (isObj(ci) && isObj(ci.months)) Object.entries(ci.months).forEach(([m, d]) => { if (isNum(d) && d >= 1 && d <= 31) months[+m] = d; });
    const look = isObj(ci) ? { ...(isColor(ci.color) ? { color: ci.color } : {}), ...(isStyle(ci.style) ? { style: ci.style } : {}), ...(isLast4(ci.last4) ? { last4: ci.last4 } : {}) } : {};
    if (isObj(ci) && ((isNum(ci.close) && ci.close >= 1 && ci.close <= 31) || Object.keys(months).length || Object.keys(look).length)) S.cardInfo[c] = { close: isNum(ci.close) && ci.close >= 1 && ci.close <= 31 ? ci.close : undefined, months, ...look };
  });

  // categorías: las del respaldo + las que usan los movimientos (sin repetir por nombre)
  const cr = isObj(r.categories) ? r.categories : {};
  (['out', 'in', 'sav'] as CatKind[]).forEach(kind => {
    const list: Category[] = [], add = (name: string, hidden: boolean, foreign?: number | null) => {
      const n = name.trim(); if (!n) return;
      const ex = list.find(c => normName(c.name) === normName(n));
      if (ex) { ex.hidden = ex.hidden && hidden; return; }
      list.push({ id: `${kind}:${list.length}`, name: n, hidden, foreignAmount: kind === 'sav' && isNum(foreign) && foreign >= 0 ? foreign : undefined });
    };
    (Array.isArray(cr[kind]) ? cr[kind] : []).forEach((c: unknown) => { if (isObj(c) && isStr(c.name)) add(c.name, !!c.hidden, c.foreignAmount); });
    // una categoría que usan los movimientos pero no figura en el respaldo se crea (visible); si figura, queda como estaba
    const used = kind === 'sav' ? S.sav.map(x => x.cat) : S.tx.filter(t => t.type === kind).map(t => t.cat);
    used.forEach(n => { if (!list.some(c => normName(c.name) === normName(n))) add(n, false); });
    S.categories[kind] = list;
  });
  // el saldo de una categoría de ahorro nunca puede quedar negativo
  S.categories.sav.forEach(c => {
    const bal = S.sav.filter(x => normName(x.cat) === normName(c.name)).reduce((a, x) => a + x.amt, 0);
    if (bal < -0.005) bad(`El saldo de ahorro "${c.name}" queda negativo en el respaldo`);
  });
  return S;
}
