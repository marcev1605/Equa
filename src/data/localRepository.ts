import { emptySnapshot, type CatKind, type Pay, type Sav, type Snapshot, type Tx } from '../domain/types';
import { normName, DEFAULT_CATS } from '../domain/legacy';
import { newId } from '../lib/id';
import type { Repository, TxFields } from './repository';

export interface KV { getItem(k: string): Promise<string | null>; setItem(k: string, v: string): Promise<void> }
const KEY = 'equa-local-v1';

/** Seed con las categorías por defecto */
export function seededSnapshot(): Snapshot {
  const S = emptySnapshot();
  (['out', 'in', 'sav'] as CatKind[]).forEach(k => {
    S.categories[k] = DEFAULT_CATS[k].map(name => ({ id: newId(), name, hidden: false, foreignAmount: k === 'sav' && name === 'USD' ? 0 : undefined }));
  });
  return S;
}

/** Repositorio en memoria con persistencia opcional (AsyncStorage / localStorage). */
export class LocalRepository implements Repository {
  S: Snapshot = seededSnapshot();
  constructor(private kv?: KV) {}

  private async save() { if (this.kv) await this.kv.setItem(KEY, JSON.stringify(this.S)); }
  async load(): Promise<Snapshot> {
    if (this.kv) { const r = await this.kv.getItem(KEY); if (r) this.S = JSON.parse(r); }
    return structuredClone(this.S);
  }
  private cat(kind: CatKind, name: string) { return this.S.categories[kind].find(c => normName(c.name) === normName(name)); }

  async addCategory(kind: CatKind, name: string) {
    const ex = this.cat(kind, name);
    if (ex) { ex.hidden = false; await this.save(); return ex.id; }
    const id = newId();
    this.S.categories[kind].push({ id, name: name.trim(), hidden: false });
    await this.save(); return id;
  }
  async setCategoryHidden(kind: CatKind, name: string, hidden: boolean) {
    const c = this.cat(kind, name); if (c) c.hidden = hidden; await this.save();
  }
  async deleteCategory(kind: CatKind, name: string) {
    const used = kind === 'sav' ? this.S.sav.some(x => normName(x.cat) === normName(name)) : this.S.tx.some(x => x.type === kind && normName(x.cat) === normName(name));
    if (used) throw new Error('La categoría tiene movimientos');
    this.S.categories[kind] = this.S.categories[kind].filter(c => normName(c.name) !== normName(name)); await this.save();
  }
  async setForeignAmount(catName: string, amount: number) { const c = this.cat('sav', catName); if (c) c.foreignAmount = amount; await this.save(); }

  async addCard(name: string) { if (!this.S.cards.includes(name)) this.S.cards.push(name); await this.save(); }
  async renameCard(from: string, to: string) {
    const S = this.S;
    S.cards = S.cards.map(c => (c === from ? to : c)); if (!S.cards.includes(to)) S.cards.push(to);
    S.tx.forEach(t => { if (t.card && (t.cardName || 'Tarjeta') === from) t.cardName = to; });
    S.pay.forEach(p => { if (p.card === from) p.card = to; });
    if (S.cardInfo[from]) { S.cardInfo[to] = S.cardInfo[from]; delete S.cardInfo[from]; }
    await this.save();
  }
  async setCardClosing(card: string, day: number | null) {
    const ci = (this.S.cardInfo[card] = { ...this.S.cardInfo[card] });
    if (day == null) delete ci.close; else ci.close = day;
    await this.save();
  }
  async setClosingOverride(card: string, month: number, day: number | null) {
    const ci = (this.S.cardInfo[card] = { ...this.S.cardInfo[card] }); ci.months = { ...ci.months };
    if (day == null) delete ci.months[month]; else ci.months[month] = day;
    await this.save();
  }
  async setCardLook(card: string, look: { color?: string; style?: string; last4?: string | null }) {
    const ci = (this.S.cardInfo[card] = { ...this.S.cardInfo[card] });
    if (look.color !== undefined) ci.color = look.color;
    if (look.style !== undefined) ci.style = look.style;
    if (look.last4 !== undefined) { if (look.last4) ci.last4 = look.last4; else delete ci.last4; }
    await this.save();
  }
  async deleteCard(card: string) {
    const S = this.S, ids = new Set(S.tx.filter(t => t.card && (t.cardName || 'Tarjeta') === card).map(t => t.id));
    S.tx = S.tx.filter(t => !ids.has(t.id));
    Object.keys(S.paid).forEach(k => { if (ids.has(k.split(':')[0])) delete S.paid[k]; });
    S.cards = S.cards.filter(c => c !== card); S.pay = S.pay.filter(p => p.card !== card); delete S.cardInfo[card];
    await this.save();
  }

  async insertTx(list: Tx[]) { this.S.tx.push(...structuredClone(list)); await this.save(); }
  async updateTx(id: string, f: Partial<TxFields> & { end?: number | null }) {
    const t = this.S.tx.find(x => x.id === id); if (t) Object.assign(t, f); await this.save();
  }
  async setSkips(id: string, months: number[]) { const t = this.S.tx.find(x => x.id === id); if (t) t.skip = [...months]; await this.save(); }
  async deleteTx(ids: string[]) {
    const s = new Set(ids);
    this.S.tx.forEach(t => { if (t.of && s.has(t.of)) s.add(t.id); });   // borrar un fijo borra sus meses editados (cascade)
    this.S.tx = this.S.tx.filter(t => !s.has(t.id));
    Object.keys(this.S.paid).forEach(k => { if (s.has(k.split(':')[0])) delete this.S.paid[k]; });
    await this.save();
  }
  async setSettled(id: string, month: number, on: boolean) { const k = `${id}:${month}`; if (on) this.S.paid[k] = true; else delete this.S.paid[k]; await this.save(); }
  async moveSettlements(from: string, to: string, fromMonth: number) {
    Object.keys(this.S.paid).forEach(k => { const [id, m] = k.split(':'); if (id === from && +m >= fromMonth) { this.S.paid[`${to}:${m}`] = this.S.paid[k]; delete this.S.paid[k]; } });
    await this.save();
  }

  async addPayment(p: Pay) { this.S.pay.push({ ...p }); await this.save(); }
  async deletePayment(id: string) { this.S.pay = this.S.pay.filter(p => p.id !== id); await this.save(); }

  async insertSav(list: Sav[]) { this.S.sav.push(...structuredClone(list)); await this.save(); }
  async updateSav(id: string, f: Partial<Omit<Sav, 'id'>>) { const x = this.S.sav.find(z => z.id === id); if (x) Object.assign(x, f); await this.save(); }
  async deleteSav(ids: string[]) { const s = new Set(ids); this.S.sav = this.S.sav.filter(x => !s.has(x.id)); await this.save(); }

  async setOpeningBalance(n: number) { this.S.open = n; await this.save(); }
  async replaceAll(S: Snapshot) { this.S = structuredClone(S); await this.save(); }
}
