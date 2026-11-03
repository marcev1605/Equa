import type { CatKind, Pay, Sav, Snapshot, Tx } from '../domain/types';

/** Campos editables de un movimiento (sin id). */
export type TxFields = Omit<Tx, 'id' | 'skip' | 'rep' | 'g' | 'of'> & { rep?: Tx['rep']; g?: string; of?: string };

/**
 * Contrato de persistencia. Dos implementaciones:
 *  - SupabaseRepository (Postgres + login)  → producción
 *  - LocalRepository (memoria/AsyncStorage) → modo demo sin servidor y tests
 * Las reglas de negocio viven en services/actions.ts y solo usan estas primitivas.
 */
export interface Repository {
  load(): Promise<Snapshot>;

  addCategory(kind: CatKind, name: string): Promise<string>;
  setCategoryHidden(kind: CatKind, name: string, hidden: boolean): Promise<void>;
  /** Borra la categoría definitivamente. Solo si ningún movimiento la usa (la base lo exige: on delete restrict). */
  deleteCategory(kind: CatKind, name: string): Promise<void>;
  setForeignAmount(catName: string, amount: number): Promise<void>;

  addCard(name: string): Promise<void>;
  renameCard(from: string, to: string): Promise<void>;
  setCardClosing(card: string, day: number | null): Promise<void>;
  setClosingOverride(card: string, month: number, day: number | null): Promise<void>;
  setCardLook(card: string, look: { color?: string; style?: string; last4?: string | null }): Promise<void>;
  deleteCard(card: string): Promise<void>;

  insertTx(list: Tx[]): Promise<void>;
  updateTx(id: string, fields: Partial<TxFields> & { end?: number | null }): Promise<void>;
  setSkips(id: string, months: number[]): Promise<void>;
  deleteTx(ids: string[]): Promise<void>;
  setSettled(id: string, month: number, settled: boolean): Promise<void>;
  moveSettlements(fromId: string, toId: string, fromMonth: number): Promise<void>;

  addPayment(p: Pay): Promise<void>;
  deletePayment(id: string): Promise<void>;

  insertSav(list: Sav[]): Promise<void>;
  updateSav(id: string, fields: Partial<Omit<Sav, 'id'>>): Promise<void>;
  deleteSav(ids: string[]): Promise<void>;

  setOpeningBalance(n: number): Promise<void>;
  /**
   * Reemplaza TODOS los datos por los de un Snapshot ya validado (domain/backup.ts). Es el único camino de restauración:
   * en Postgres, la función restore_backup() (una transacción: o se aplica todo o nada).
   */
  replaceAll(S: Snapshot): Promise<void>;
}
