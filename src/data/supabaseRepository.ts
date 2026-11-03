import type { SupabaseClient } from '@supabase/supabase-js';
import { emptySnapshot, type CatKind, type Pay, type Sav, type Snapshot, type Tx } from '../domain/types';
import { idxOfStr, monthDate } from '../domain/dates';
import { normName } from '../domain/legacy';
import type { Repository, TxFields } from './repository';

const KIND_DB: Record<CatKind, 'income' | 'expense' | 'saving'> = { in: 'income', out: 'expense', sav: 'saving' };
const KIND_APP: Record<string, CatKind> = { income: 'in', expense: 'out', saving: 'sav' };

function must<T>(r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message);
  return r.data as T;
}
const mErr = (e: { message: string } | null) => { if (e) throw new Error(e.message); };

/** Repositorio sobre Postgres (Supabase). Toda fila lleva user_id y RLS la protege. */
export class SupabaseRepository implements Repository {
  private snap: Snapshot = emptySnapshot();
  private catIds = new Map<string, string>();   // `${kind}|${nameKey}` -> id
  private cardIds = new Map<string, string>();  // nameKey -> id

  constructor(private db: SupabaseClient, private userId: string) {}

  private async fetchAll(table: string, select = '*'): Promise<any[]> {
    const out: any[] = []; const PAGE = 1000;
    for (let from = 0; ; from += PAGE) {
      const rows = must(await this.db.from(table).select(select).range(from, from + PAGE - 1));
      out.push(...(rows as any[]));
      if ((rows as any[]).length < PAGE) break;
    }
    return out;
  }

  async load(): Promise<Snapshot> {
    const [prof, cats, cards, over, txs, skips, sett, pays, sav] = await Promise.all([
      this.db.from('profiles').select('opening_balance').eq('id', this.userId).maybeSingle(),
      this.fetchAll('categories'), this.fetchAll('credit_cards'), this.fetchAll('card_closing_overrides'),
      this.fetchAll('transactions'), this.fetchAll('transaction_skips'), this.fetchAll('transaction_settlements'),
      this.fetchAll('card_payments'), this.fetchAll('savings_movements'),
    ]);
    const S = emptySnapshot();
    S.open = Number((prof.data as any)?.opening_balance ?? 0);

    const catName = new Map<string, string>(); this.catIds.clear();
    [...cats].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)).forEach(c => {
      const k = KIND_APP[c.kind as string];
      catName.set(c.id, c.name); this.catIds.set(`${c.kind}|${normName(c.name)}`, c.id);
      S.categories[k].push({ id: c.id, name: c.name, hidden: !!c.is_archived, foreignAmount: c.foreign_amount == null ? undefined : Number(c.foreign_amount) });
    });

    const cardName = new Map<string, string>(); this.cardIds.clear();
    cards.forEach(c => {
      cardName.set(c.id, c.name); this.cardIds.set(normName(c.name), c.id); S.cards.push(c.name);
      S.cardInfo[c.name] = { close: c.closing_day ?? undefined, months: {}, ...(c.color ? { color: c.color } : {}), ...(c.style ? { style: c.style } : {}), ...(c.last4 ? { last4: c.last4 } : {}) };
    });
    over.forEach(o => { const n = cardName.get(o.card_id); if (n) (S.cardInfo[n].months as Record<number, number>)[idxOfStr(o.month)] = o.closing_day; });

    const skipBy = new Map<string, number[]>();
    skips.forEach(s => skipBy.set(s.transaction_id, [...(skipBy.get(s.transaction_id) || []), idxOfStr(s.month)]));
    S.tx = txs.map((t): Tx => ({
      id: t.id, type: t.type === 'income' ? 'in' : 'out', amt: Number(t.amount), cat: catName.get(t.category_id) || '',
      note: t.note || '', date: t.occurred_on, card: t.payment_method === 'card', cardName: t.card_id ? cardName.get(t.card_id) || '' : '',
      fixed: !!t.is_fixed, inst: t.installments || 1,
      end: t.recurrence_end_month ? idxOfStr(t.recurrence_end_month) : null, skip: skipBy.get(t.id) || [],
      rep: t.series_id ? { k: t.series_index, n: t.series_total, f: t.series_frequency === 'week' ? 'w' : 'm' } : undefined,
      g: t.series_id || undefined,
      of: t.override_of || undefined,
    }));
    sett.forEach(s => { S.paid[`${s.transaction_id}:${idxOfStr(s.month)}`] = true; });
    S.pay = pays.map((p): Pay => ({ id: p.id, card: cardName.get(p.card_id) || '', i: idxOfStr(p.statement_month), amt: Number(p.amount), date: p.paid_on }));
    S.sav = sav.map((x): Sav => ({ id: x.id, cat: catName.get(x.category_id) || '', amt: Number(x.amount), date: x.occurred_on, note: x.note || '', tid: x.transfer_id || undefined, ...(x.is_adjustment ? { adj: true } : {}) }));
    this.snap = S;
    return structuredClone(S);
  }

  // ---- resolución de nombres -> ids ----
  private cat(kind: CatKind, name: string): string {
    const id = this.catIds.get(`${KIND_DB[kind]}|${normName(name)}`);
    if (!id) throw new Error(`Categoría inexistente: ${name}`);
    return id;
  }
  private card(name: string): string {
    const id = this.cardIds.get(normName(name || 'Tarjeta'));
    if (!id) throw new Error(`Tarjeta inexistente: ${name}`);
    return id;
  }
  private txRow(t: Tx) {
    return {
      id: t.id, user_id: this.userId, type: t.type === 'in' ? 'income' : 'expense', amount: t.amt,
      category_id: this.cat(t.type === 'in' ? 'in' : 'out', t.cat), note: t.note || '', occurred_on: t.date,
      is_fixed: t.fixed, payment_method: t.card && t.type === 'out' ? 'card' : 'cash',
      card_id: t.card && t.type === 'out' ? this.card(t.cardName) : null, installments: t.fixed ? 1 : t.inst || 1,
      recurrence_end_month: t.end != null ? monthDate(t.end) : null,
      series_id: t.rep ? t.g : null, series_index: t.rep?.k ?? null, series_total: t.rep?.n ?? null,
      series_frequency: t.rep ? (t.rep.f === 'w' ? 'week' : 'month') : null,
      override_of: t.of ?? null,
    };
  }

  // ---- categorías ----
  async addCategory(kind: CatKind, name: string) {
    const key = `${KIND_DB[kind]}|${normName(name)}`;
    const ex = this.catIds.get(key);
    if (ex) { mErr((await this.db.from('categories').update({ is_archived: false }).eq('id', ex)).error); return ex; }
    const row = must(await this.db.from('categories').insert({ user_id: this.userId, kind: KIND_DB[kind], name: name.trim() }).select('id').single()) as any;
    this.catIds.set(key, row.id); return row.id as string;
  }
  async setCategoryHidden(kind: CatKind, name: string, hidden: boolean) {
    mErr((await this.db.from('categories').update({ is_archived: hidden }).eq('id', this.cat(kind, name))).error);
  }
  async deleteCategory(kind: CatKind, name: string) {
    const id = this.cat(kind, name);
    mErr((await this.db.from('categories').delete().eq('id', id)).error);
    this.catIds.delete(`${KIND_DB[kind]}|${normName(name)}`);
  }
  async setForeignAmount(catName: string, amount: number) {
    mErr((await this.db.from('categories').update({ foreign_currency: 'USD', foreign_amount: amount }).eq('id', this.cat('sav', catName))).error);
  }

  // ---- tarjetas ----
  async addCard(name: string) {
    const row = must(await this.db.from('credit_cards').insert({ user_id: this.userId, name: name.trim() }).select('id').single()) as any;
    this.cardIds.set(normName(name), row.id);
  }
  async renameCard(from: string, to: string) { mErr((await this.db.from('credit_cards').update({ name: to.trim() }).eq('id', this.card(from))).error); }
  async setCardClosing(card: string, day: number | null) { mErr((await this.db.from('credit_cards').update({ closing_day: day }).eq('id', this.card(card))).error); }
  async setClosingOverride(card: string, month: number, day: number | null) {
    const id = this.card(card), m = monthDate(month);
    if (day == null) mErr((await this.db.from('card_closing_overrides').delete().eq('card_id', id).eq('month', m)).error);
    else mErr((await this.db.from('card_closing_overrides').upsert({ card_id: id, user_id: this.userId, month: m, closing_day: day })).error);
  }
  async setCardLook(card: string, look: { color?: string; style?: string; last4?: string | null }) {
    const row: Record<string, unknown> = {};
    if (look.color !== undefined) row.color = look.color;
    if (look.style !== undefined) row.style = look.style;
    if (look.last4 !== undefined) row.last4 = look.last4 || null;
    if (Object.keys(row).length) mErr((await this.db.from('credit_cards').update(row).eq('id', this.card(card))).error);
  }
  async deleteCard(card: string) { mErr((await this.db.from('credit_cards').delete().eq('id', this.card(card))).error); }

  // ---- movimientos ----
  async insertTx(list: Tx[]) { mErr((await this.db.from('transactions').insert(list.map(t => this.txRow(t)))).error); }
  async updateTx(id: string, f: Partial<TxFields> & { end?: number | null }) {
    const cur = this.snap.tx.find(t => t.id === id);
    const row: Record<string, unknown> = {};
    if (f.type !== undefined) row.type = f.type === 'in' ? 'income' : 'expense';
    if (f.amt !== undefined) row.amount = f.amt;
    if (f.note !== undefined) row.note = f.note;
    if (f.date !== undefined) row.occurred_on = f.date;
    if (f.fixed !== undefined) row.is_fixed = f.fixed;
    if (f.inst !== undefined) row.installments = f.fixed ? 1 : f.inst;
    if (f.of !== undefined) row.override_of = f.of;
    if (f.end !== undefined) row.recurrence_end_month = f.end == null ? null : monthDate(f.end);
    const type = f.type ?? cur?.type;
    if (f.cat !== undefined && type) row.category_id = this.cat(type === 'in' ? 'in' : 'out', f.cat);
    if (f.card !== undefined) {
      const isCard = f.card && type === 'out';
      row.payment_method = isCard ? 'card' : 'cash';
      row.card_id = isCard ? this.card(f.cardName ?? cur?.cardName ?? '') : null;
    }
    if (Object.keys(row).length) mErr((await this.db.from('transactions').update(row).eq('id', id)).error);
  }
  async setSkips(id: string, months: number[]) {
    mErr((await this.db.from('transaction_skips').delete().eq('transaction_id', id)).error);
    if (months.length) mErr((await this.db.from('transaction_skips').insert(months.map(m => ({ transaction_id: id, user_id: this.userId, month: monthDate(m) })))).error);
  }
  async deleteTx(ids: string[]) { if (ids.length) mErr((await this.db.from('transactions').delete().in('id', ids)).error); }
  async setSettled(id: string, month: number, on: boolean) {
    if (on) mErr((await this.db.from('transaction_settlements').upsert({ transaction_id: id, user_id: this.userId, month: monthDate(month) })).error);
    else mErr((await this.db.from('transaction_settlements').delete().eq('transaction_id', id).eq('month', monthDate(month))).error);
  }
  async moveSettlements(from: string, to: string, fromMonth: number) {
    mErr((await this.db.from('transaction_settlements').update({ transaction_id: to }).eq('transaction_id', from).gte('month', monthDate(fromMonth))).error);
  }

  // ---- pagos de tarjeta ----
  async addPayment(p: Pay) {
    mErr((await this.db.from('card_payments').insert({ id: p.id, user_id: this.userId, card_id: this.card(p.card), statement_month: monthDate(p.i), amount: p.amt, paid_on: p.date })).error);
  }
  async deletePayment(id: string) { mErr((await this.db.from('card_payments').delete().eq('id', id)).error); }

  // ---- ahorro ----
  async insertSav(list: Sav[]) {
    // una sola sentencia: el saldo no negativo y las transferencias se validan al final
    mErr((await this.db.from('savings_movements').insert(list.map(x => ({
      id: x.id, user_id: this.userId, category_id: this.cat('sav', x.cat), amount: x.amt, occurred_on: x.date, note: x.note || '', transfer_id: x.tid ?? null, is_adjustment: !!x.adj,
    })))).error);
  }
  async updateSav(id: string, f: Partial<Omit<Sav, 'id'>>) {
    const row: Record<string, unknown> = {};
    if (f.cat !== undefined) row.category_id = this.cat('sav', f.cat);
    if (f.amt !== undefined) row.amount = f.amt;
    if (f.date !== undefined) row.occurred_on = f.date;
    if (f.note !== undefined) row.note = f.note;
    if (f.adj !== undefined) row.is_adjustment = f.adj;
    mErr((await this.db.from('savings_movements').update(row).eq('id', id)).error);
  }
  async deleteSav(ids: string[]) { if (ids.length) mErr((await this.db.from('savings_movements').delete().in('id', ids)).error); }

  // ---- perfil / restauración ----
  async setOpeningBalance(n: number) { mErr((await this.db.from('profiles').update({ opening_balance: n }).eq('id', this.userId)).error); }
  async replaceAll(S: Snapshot) { mErr((await this.db.rpc('restore_backup', { p: S })).error); }
}
