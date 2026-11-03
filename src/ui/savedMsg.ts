import { dd_mm_yyyy, fmtMoney as fmt } from '../domain/dates';

/** "Hoy, 02/11/2026", "Para el 20/11/2026" (fecha futura) o la fecha sola. */
export const dayTxt = (date: string, today: string) => (date > today ? `Para el ${dd_mm_yyyy(date)}` : date === today ? `Hoy, ${dd_mm_yyyy(date)}` : dd_mm_yyyy(date));

/** Cómo cambió tu disponible; null si no cambió. */
export const availChange = (before: number, after: number) => (Math.abs(after - before) < 0.005 ? null : `Tu disponible pasa de ${fmt(before)} a ${fmt(after)}.`);
