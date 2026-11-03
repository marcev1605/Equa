/** Modelo neutro de un reporte: lo arma `domain/reports.ts` y lo dibujan `pdf.ts` y `xlsx.ts`. */
export type ColType = 'text' | 'money' | 'pct' | 'date' | 'int';
export interface Col { label: string; type: ColType; /** peso relativo del ancho (por defecto según el tipo) */ w?: number }
/** Celda: texto, número (pesos / fracción para %), fecha ISO (YYYY-MM-DD) o vacío. */
export type Cell = string | number | null;
/** Fila de totales: 'sum' suma la columna (en Excel queda como fórmula), un número es un valor ya calculado, un texto es un rótulo. */
export type TotalCell = 'sum' | string | number | null;
export interface Sheet {
  name: string;
  title?: string;
  note?: string;
  cols: Col[];
  rows: Cell[][];
  totals?: TotalCell[];
  /** Barras para el PDF (el Excel no lo usa). Los valores negativos se pintan en rojo. */
  chart?: { title: string; labels: string[]; values: number[] };
}
export interface Kpi { label: string; value: string; tone?: 'good' | 'bad' }
export interface Report {
  id: string;
  title: string;
  period: string;
  /** Fecha y hora de generación (ISO). */
  generatedAt: string;
  kpis: Kpi[];
  sheets: Sheet[];
}

/** Formato de pesos para mostrar: $1.234.567 / -$1.234 */
export function money(n: number): string {
  const r = Math.round(n), neg = r < 0;
  return (neg ? '-$' : '$') + Math.abs(r).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}
export const pct1 = (f: number) => (Math.round(f * 1000) / 10).toString().replace('.', ',') + '%';
export const dmy = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/** Valor de una columna 'sum' (para el total del PDF y el valor guardado de la fórmula en Excel). */
export function colSum(rows: Cell[][], c: number): number {
  return rows.reduce((a, r) => a + (typeof r[c] === 'number' ? (r[c] as number) : 0), 0);
}

/** Texto de una celda tal como se ve en pantalla y en el PDF. */
export function showCell(c: Cell, type: ColType): string {
  if (c === null || c === '') return '';
  if (typeof c === 'number') return type === 'pct' ? pct1(c) : type === 'int' ? String(Math.round(c)) : money(c);
  return type === 'date' ? dmy(c) : c;
}
