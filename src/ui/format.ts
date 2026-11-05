import { monthName } from '../domain/dates';
import type { Tx } from '../domain/types';
/** " · fijo mensual" y, si el fijo tiene fecha de fin, " · hasta Octubre 2026". */
export const fixedTxt = (t: Tx) => ` · fijo mensual${t.end != null ? ` · hasta ${monthName(t.end)} ${Math.floor(t.end / 12)}` : ''}`;
/** Mes (índice año*12+mes) en que cae la última repetición, según la fecha de este movimiento y cuántas le quedan. */
function repEnd(date: string, rep: NonNullable<Tx['rep']>) {
  const y = +date.slice(0, 4), m = +date.slice(5, 7) - 1, d = +date.slice(8, 10), left = rep.n - rep.k;
  if (rep.f === 'w') { const e = new Date(Date.UTC(y, m, d + 7 * left)); return e.getUTCFullYear() * 12 + e.getUTCMonth(); }
  return y * 12 + m + left;
}
/** " · mes 3 de 7 · hasta Abril 2027" (o "semana 2 de 4 · hasta …"). */
export function repTxt(t: Tx) {
  if (!t.rep) return '';
  const e = repEnd(t.date, t.rep);
  return ` · ${t.rep.f === 'w' ? 'semana' : 'mes'} ${t.rep.k} de ${t.rep.n} · hasta ${monthName(e)} ${Math.floor(e / 12)}`;
}

const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MONTHS_LC = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const dayNum = (iso: string) => Math.floor(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86400000);
/** "Hoy · miércoles 14 de octubre", "Ayer · …", "lunes 12 de octubre" (con año si no es el actual). */
export function dayLabel(iso: string, todayIso: string): string {
  const n = dayNum(iso), base = dayNum(todayIso);
  const wd = WEEKDAYS[new Date(n * 86400000).getUTCDay()];
  const txt = `${wd} ${+iso.slice(8, 10)} de ${MONTHS_LC[+iso.slice(5, 7) - 1]}${iso.slice(0, 4) !== todayIso.slice(0, 4) ? ' de ' + iso.slice(0, 4) : ''}`;
  return n === base ? `Hoy · ${txt}` : n === base - 1 ? `Ayer · ${txt}` : txt.charAt(0).toUpperCase() + txt.slice(1);
}

/** "hoy, 5 de noviembre, a las 11:20" · "ayer, …" · "jueves 29 de octubre, a las 09:42" (con año si no es el actual). `iso` es "AAAA-MM-DDTHH:mm". */
export function backupWhen(iso: string, todayIso: string): string {
  const day = dayLabel(iso.slice(0, 10), todayIso), at = `a las ${iso.slice(11, 16)}`;
  const m = day.match(/^(Hoy|Ayer) · (.*)$/);
  return m ? `${m[1] === 'Hoy' ? 'hoy' : 'ayer'}, ${+iso.slice(8, 10)} de ${MONTHS_LC[+iso.slice(5, 7) - 1].toLowerCase()}, ${at}` : `${day.charAt(0).toLowerCase() + day.slice(1)}, ${at}`;
}
