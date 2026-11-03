// Cliente falso de Supabase en memoria (subconjunto de PostgREST) para probar SupabaseRepository sin red ni dependencias.
// Imita lo que hace la base: ids por defecto, siembra de categorías al alta, cascadas por tarjeta/movimiento, upsert por clave.
const crypto = require('crypto');
const DEFAULT = { expense: ['Comida','Transporte','Casa','Salud','Ocio','Compras','Otros'], income: ['Sueldo','Ventas','Bono','Inversiones','Electricidad','Extra','Otros'], saving: ['USD','Inversiones','Acciones','Bonos','Otro'] };
const PK = { card_closing_overrides: ['card_id','month'], transaction_skips: ['transaction_id','month'], transaction_settlements: ['transaction_id','month'] };

module.exports = function createFake(userId) {
  const T = { profiles: [{ id: userId, opening_balance: 0 }], categories: [], credit_cards: [], card_closing_overrides: [], transactions: [], transaction_skips: [], transaction_settlements: [], card_payments: [], savings_movements: [] };
  Object.entries(DEFAULT).forEach(([kind, names]) => names.forEach((name, i) => T.categories.push({ id: crypto.randomUUID(), user_id: userId, kind, name, is_archived: false, sort_order: i + 1, foreign_amount: kind === 'saving' && name === 'USD' ? 0 : null })));
  const log = [];
  const cascade = (table, rows) => {
    const ids = new Set(rows.map(r => r.id));
    if (table === 'credit_cards') { ['card_closing_overrides', 'card_payments'].forEach(t => (T[t] = T[t].filter(r => !ids.has(r.card_id)))); const tx = T.transactions.filter(r => ids.has(r.card_id)); T.transactions = T.transactions.filter(r => !ids.has(r.card_id)); cascade('transactions', tx); }
    if (table === 'transactions') {
      ['transaction_skips', 'transaction_settlements'].forEach(t => (T[t] = T[t].filter(r => !ids.has(r.transaction_id))));
      const ov = T.transactions.filter(r => r.override_of && ids.has(r.override_of));   // ON DELETE CASCADE de override_of
      if (ov.length) { T.transactions = T.transactions.filter(r => !ov.includes(r)); cascade('transactions', ov); }
    }
  };
  const check = (table, row) => {
    if (table === 'categories' && T.categories.some(c => c !== row && c.kind === row.kind && c.name.trim().toLowerCase() === row.name.trim().toLowerCase())) throw new Error('duplicate key categories');
    if (table === 'credit_cards' && T.credit_cards.some(c => c !== row && c.name.trim().toLowerCase() === row.name.trim().toLowerCase())) throw new Error('duplicate key credit_cards');
    if (table === 'transactions') { if (!T.categories.some(c => c.id === row.category_id)) throw new Error('fk category'); if (row.payment_method === 'card' && !T.credit_cards.some(c => c.id === row.card_id)) throw new Error('fk card'); if (!(row.amount > 0)) throw new Error('check amount'); }
    if (table === 'savings_movements' && !T.categories.some(c => c.id === row.category_id && c.kind === 'saving')) throw new Error('fk saving category');
  };
  const savIntegrity = () => {
    const bal = {}; T.savings_movements.forEach(m => (bal[m.category_id] = (bal[m.category_id] || 0) + Number(m.amount)));
    if (Object.values(bal).some(v => v < -0.0001)) throw new Error('saldo de ahorro negativo');
    const tr = {}; T.savings_movements.filter(m => m.transfer_id).forEach(m => (tr[m.transfer_id] = [...(tr[m.transfer_id] || []), m]));
    Object.values(tr).forEach(l => { if (l.length !== 2 || Math.abs(l[0].amount + l[1].amount) > 1e-9) throw new Error('transferencia inválida'); });
  };

  function query(table) {
    let op = 'select', payload, filters = [], single = null, opts = {};
    const q = {
      select(cols) { if (op === 'select') op = 'select'; return q; },
      insert(p) { op = 'insert'; payload = p; return q; },
      update(p) { op = 'update'; payload = p; return q; },
      upsert(p) { op = 'upsert'; payload = p; return q; },
      delete() { op = 'delete'; return q; },
      eq(c, v) { filters.push(r => r[c] === v); return q; },
      in(c, vs) { filters.push(r => vs.includes(r[c])); return q; },
      gte(c, v) { filters.push(r => r[c] >= v); return q; },
      range(a, b) { opts.range = [a, b]; return q; },
      maybeSingle() { single = 'maybe'; return q; },
      single() { single = 'one'; return q; },
      then(res, rej) { return Promise.resolve().then(run).then(res, rej); },
    };
    function run() {
      try {
        const rows = T[table], match = r => filters.every(f => f(r));
        let data = null;
        if (op === 'select') { data = rows.filter(match); if (opts.range) data = data.slice(opts.range[0], opts.range[1] + 1); }
        else if (op === 'insert' || op === 'upsert') {
          const list = (Array.isArray(payload) ? payload : [payload]).map(r => ({ id: crypto.randomUUID(), ...(table === 'categories' ? { is_archived: false, sort_order: 0, foreign_amount: null } : {}), ...(table === 'transactions' ? { note: '', installments: 1, is_fixed: false } : {}), ...r }));
          const created = [];
          for (const r of list) {
            const pk = PK[table];
            if (op === 'upsert' && pk) { const ex = rows.find(x => pk.every(k => x[k] === r[k])); if (ex) { Object.assign(ex, r); continue; } }
            if (op === 'upsert' && !pk) { const ex = rows.find(x => x.id === r.id); if (ex) { Object.assign(ex, r); continue; } }
            check(table, r); rows.push(r); created.push(r);
          }
          if (table === 'savings_movements') { try { savIntegrity(); } catch (e) { created.forEach(r => rows.splice(rows.indexOf(r), 1)); throw e; } }
          data = created;
        } else if (op === 'update') {
          const hit = rows.filter(match), before = hit.map(r => ({ ...r }));
          hit.forEach(r => { Object.assign(r, payload); check(table, r); });
          if (table === 'savings_movements') { try { savIntegrity(); } catch (e) { hit.forEach((r, i) => Object.assign(r, before[i])); throw e; } }
          if (table === 'categories' && payload.is_archived) hit.forEach(c => { const b = T.savings_movements.filter(m => m.category_id === c.id).reduce((a, m) => a + Number(m.amount), 0); if (c.kind === 'saving' && Math.abs(b) > 0.0001) { Object.assign(c, { is_archived: false }); throw new Error('saldo distinto de cero'); } });
          data = hit;
        } else if (op === 'delete') {
          if (table === 'categories') rows.filter(match).forEach(c => { if (T.transactions.some(x => x.category_id === c.id) || T.savings_movements.some(x => x.category_id === c.id)) throw new Error('violates foreign key (on delete restrict)'); });
          const gone = rows.filter(match), keep = rows.filter(r => !match(r)), snapshot = rows.slice();
          T[table] = keep; cascade(table, gone);
          if (table === 'savings_movements') { try { savIntegrity(); } catch (e) { T[table] = snapshot; throw e; } }
          data = gone;
        }
        log.push(op + ' ' + table);
        if (single) { const row = data && data[0]; if (single === 'one' && !row) return { data: null, error: { message: 'no rows' } }; return { data: row || null, error: null }; }
        return { data, error: null };
      } catch (e) { return { data: null, error: { message: e.message } }; }
    }
    return q;
  }
  return { T, log, from: query, rpc: async (name) => ({ data: null, error: { message: 'rpc ' + name + ' no disponible en el cliente falso' } }) };
};
