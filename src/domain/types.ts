/**
 * Modelo de dominio de Equa. Es el MISMO modelo que usaba la app HTML anterior
 * (nombres cortos incluidos) para que el motor de cálculo sea una traducción
 * fiel y se pueda probar contra la versión original. La capa de datos
 * (src/data) traduce filas de Postgres <-> este Snapshot.
 *
 * Meses: índice = año*12 + mes0 (ene = 0).  Fechas: "YYYY-MM-DD".
 */
export type TxType = 'in' | 'out';

export interface Tx {
  id: string;
  type: TxType;
  amt: number;            // total (con tarjeta en cuotas: total de la compra)
  cat: string;            // nombre de la categoría
  note: string;
  date: string;
  card: boolean;
  cardName: string;
  fixed: boolean;         // se repite todos los meses
  inst: number;           // cuotas (solo tarjeta, no fijos)
  end?: number | null;    // último mes (índice) de un fijo
  skip?: number[];        // meses salteados de un fijo
  rep?: { k: number; n: number; f: 'w' | 'm' };  // repetición k de n
  g?: string;             // id del grupo de repeticiones
  of?: string;            // fijo editado "solo este mes": id del fijo (serie) al que reemplaza en ese mes
}

export interface CardInfo { close?: number; months?: Record<number, number>; color?: string; style?: string; last4?: string }

/** Pago de resumen. i = mes de VENCIMIENTO del resumen. */
export interface Pay { id: string; card: string; i: number; amt: number; date: string }

/**
 * Movimiento de ahorro: amt>0 depósito, <0 retiro. tid = transferencia entre categorías.
 * adj = ajuste de saldo (ganancia amt>0 / pérdida amt<0): cambia el valor de la categoría pero NO mueve la cuenta disponible.
 */
export interface Sav { id: string; cat: string; amt: number; date: string; note: string; tid?: string; adj?: boolean }

export type CatKind = 'in' | 'out' | 'sav';
export interface Category { id: string; name: string; hidden: boolean; foreignAmount?: number | null }

export interface Snapshot {
  tx: Tx[];
  cards: string[];
  cardInfo: Record<string, CardInfo>;
  pay: Pay[];
  paid: Record<string, boolean>;       // "<txId>:<mes>" -> true
  open: number;                        // saldo inicial
  sav: Sav[];
  categories: Record<CatKind, Category[]>;
}

export interface Occ { i: number; k: number; n: number; a: number; t: Tx }
export interface Stmt { items: number; carry: number; due: number; paid: number; rem: number }
export interface StmtN extends Stmt { adv: number }
export interface YMD { y: number; m: number; d: number }   // m: 0-11

export const emptySnapshot = (): Snapshot => ({
  tx: [], cards: [], cardInfo: {}, pay: [], paid: {}, open: 0, sav: [],
  categories: { in: [], out: [], sav: [] },
});
