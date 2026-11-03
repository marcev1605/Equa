import type { YMD } from './types';

export const parseYmd = (s: string): YMD => ({ y: +s.slice(0, 4), m: +s.slice(5, 7) - 1, d: +s.slice(8, 10) });
export const idxOfYmd = (x: YMD) => x.y * 12 + x.m;
export const idxOfStr = (s: string) => idxOfYmd(parseYmd(s));
export const daysIn = (y: number, m0: number) => new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate();
const p2 = (n: number) => String(n).padStart(2, '0');
/** Fecha local de un Date como YYYY-MM-DD */
export const isoLocal = (d: Date) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
export const todayYmd = (d = new Date()): YMD => ({ y: d.getFullYear(), m: d.getMonth(), d: d.getDate() });
/** Fecha del día `day` del mes índice `i` (recortada al último día del mes) */
export const ymdOf = (i: number, day: number) => {
  const y = Math.floor(i / 12), m = i % 12;
  return `${y}-${p2(m + 1)}-${p2(Math.min(+day, daysIn(y, m)))}`;
};
export const monthDate = (i: number) => `${Math.floor(i / 12)}-${p2((i % 12) + 1)}-01`;   // para columnas date de mes
export const dd_mm = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)}`;
export const dd_mm_yyyy = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}`;

/** Repetición semanal o mensual (cada una es su propio movimiento) */
export function addRep(ds: string, k: number, f: 'w' | 'm'): string {
  const { y, m, d } = parseYmd(ds);
  if (f === 'w') return isoLocal(new Date(y, m, d + 7 * k));
  const tm = m + k, yy = y + Math.floor(tm / 12), mm = ((tm % 12) + 12) % 12;
  return `${yy}-${p2(mm + 1)}-${p2(Math.min(d, daysIn(yy, mm)))}`;
}

const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
export const monthName = (i: number) => MONTHS[((i % 12) + 12) % 12];
export const monthShort = (i: number) => monthName(i).slice(0, 3);
export const monthLabel = (i: number, withYear = true) => `${monthName(i)}${withYear ? ' de ' + Math.floor(i / 12) : ''}`;

export const fmtMoney = (n: number) => {
  const r = Math.round(n), neg = r < 0;
  return (neg ? '-$' : '$') + Math.abs(r).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
};
