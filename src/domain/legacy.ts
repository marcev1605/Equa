import type { Category, Snapshot } from './types';
import { emptySnapshot } from './types';

export const DEFAULT_CATS = {
  out: ['Comida', 'Transporte', 'Casa', 'Salud', 'Ocio', 'Compras', 'Otros'],
  in: ['Sueldo', 'Ventas', 'Bono', 'Inversiones', 'Electricidad', 'Extra', 'Otros'],
  sav: ['USD', 'Inversiones', 'Acciones', 'Bonos', 'Otro'],
};

/** Clave de comparación de nombres (igual que normalize_name() en Postgres) */
export const normName = (x: string) => String(x).trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

/**
 * Convierte el respaldo JSON de la app HTML anterior (clave "fin-v1") en un Snapshot.
 * Es el primer paso de «Restaurar respaldo» (ver backup.ts): el resultado se valida y se aplica con repo.replaceAll()
 * tanto en modo demo como en Supabase.
 */
export function fromLegacy(raw: any): Snapshot {
  if (!raw || !Array.isArray(raw.tx)) throw new Error('Respaldo inválido');
  const S = emptySnapshot();
  const sid = (x: unknown) => String(x);
  S.tx = raw.tx.map((t: any) => ({
    id: sid(t.id), type: t.type, amt: +t.amt, cat: t.cat, note: t.note || '', date: t.date,
    card: !!t.card, cardName: t.cardName || '', fixed: !!t.fixed, inst: t.inst || 1,
    end: t.end ?? null, skip: t.skip || [], rep: t.rep || undefined, g: t.g != null ? sid(t.g) : undefined,
  }));
  S.cards = [...(raw.cards || [])];
  S.cardInfo = raw.cardInfo || {};
  const payFix = raw.payVer === 2 ? 0 : 1;   // formato viejo: i era mes de cierre
  S.pay = (raw.pay || []).map((p: any) => ({ id: sid(p.id), card: p.card, i: p.i + payFix, amt: +p.amt, date: p.date }));
  S.paid = raw.paid || {};
  S.open = +raw.open || 0;
  S.sav = (raw.sav || []).map((x: any) => ({ id: sid(x.id), cat: x.cat, amt: +x.amt, date: x.date, note: x.note || '', tid: x.tid != null ? sid(x.tid) : undefined }));
  const mk = (kind: 'in' | 'out' | 'sav', used: string[]): Category[] => {
    const hid: string[] = (raw.hid || {})[kind] || [], custom: string[] = (raw.cats || {})[kind] || [];
    const names: string[] = [];
    [...DEFAULT_CATS[kind], ...custom, ...hid, ...used].forEach(n => { if (n && !names.some(x => normName(x) === normName(n))) names.push(n); });
    return names.map((name, k) => ({
      id: `${kind}:${k}`, name, hidden: hid.some(h => normName(h) === normName(name)),
      foreignAmount: kind === 'sav' && normName(name) === 'usd' ? +raw.usd || 0 : undefined,
    }));
  };
  S.categories = {
    out: mk('out', S.tx.filter(t => t.type === 'out').map(t => t.cat)),
    in: mk('in', S.tx.filter(t => t.type === 'in').map(t => t.cat)),
    sav: mk('sav', S.sav.map(x => x.cat)),
  };
  return S;
}
