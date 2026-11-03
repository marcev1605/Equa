import type { Sav } from './types';

/** Saldo de una categoría de ahorro hasta una fecha (inclusive), con ajustes. */
export const balAt = (list: Sav[], cat: string, upTo: string) =>
  list.filter(x => x.cat === cat && x.date <= upTo).reduce((a, x) => a + x.amt, 0);

/**
 * Primera fecha (desde `from`) en que el saldo de la categoría queda en negativo, o null.
 * Los movimientos del mismo día se suman juntos: así el orden dentro de un día no importa.
 * Lo anterior a `from` no se mira, para no bloquear una operación por datos viejos.
 */
export function firstNegative(list: Sav[], cat: string, from: string): string | null {
  const mine = list.filter(x => x.cat === cat).sort((a, b) => a.date.localeCompare(b.date));
  let run = 0;
  for (let k = 0; k < mine.length; k++) {
    run += mine[k].amt;
    const last = k === mine.length - 1 || mine[k + 1].date !== mine[k].date;
    if (last && mine[k].date >= from && run < -0.005) return mine[k].date;
  }
  return null;
}
