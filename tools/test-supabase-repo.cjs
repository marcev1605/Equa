// node tools/test-supabase-repo.cjs
// Ejecuta las mismas operaciones de negocio sobre SupabaseRepository (con cliente falso) y sobre LocalRepository,
// y verifica que ambos den resultados equivalentes (mapeo filas<->dominio, cascadas, restricciones).
const assert = require('node:assert/strict');
const req = require('./ts-run.cjs')();
const createFake = require('./fake-supabase.cjs');
const { SupabaseRepository } = req('src/data/supabaseRepository.js');
const { LocalRepository } = req('src/data/localRepository.js');
const { createActions } = req('src/services/actions.js');
const { createEngine } = req('src/domain/engine.js');
const TODAY = new Date(2026, 9, 2, 12), TD = { y: 2026, m: 9, d: 2 };
let n = 0;
const t = async (name, fn) => { await fn(); n++; console.log('  ✓', name); };

async function scenario(repo) {
  const A = createActions(repo, () => TODAY); let S = await repo.load();
  const base = { type: 'out', amt: 1000, cat: 'Comida', note: '', date: '2026-10-02', card: false, cardName: '', fixed: false, inst: 1 };
  await A.addTransaction(S, { ...base, type: 'in', cat: 'Sueldo', amt: 300000, date: '2026-08-01', fixed: true }); S = await repo.load();
  await A.setOpening(150000);
  await A.addTransaction(S, { ...base, amt: 20000, date: '2026-09-20', paid: true });
  await A.addTransaction(S, { ...base, cat: 'Ocio', amt: 500, date: '2026-09-01', repeat: { mode: 'm', times: 3 } });
  await A.addCategory(S, 'out', 'Mascotas'); S = await repo.load();
  await A.addTransaction(S, { ...base, cat: 'Mascotas', amt: 9000, date: '2026-08-05', fixed: true }); S = await repo.load();
  await A.deleteFixedMonth(S.tx.find(x => x.cat === 'Mascotas'), 2026 * 12 + 9); S = await repo.load();
  await A.addCard(S, 'Visa ICBC'); await A.addCard(S, 'Visa Bna'); S = await repo.load();
  await A.setClosing('Visa ICBC', 25); await A.setClosingFor('Visa ICBC', 2026 * 12 + 9, 28); await A.setCardLook('Visa Bna', { style: 'degrade', last4: '1207' });
  await A.addTransaction(S, { ...base, cat: 'Casa', amt: 90000, date: '2026-09-10', card: true, cardName: 'Visa ICBC', inst: 3 }); S = await repo.load();
  await A.pay(S, 'Visa ICBC', 2026 * 12 + 10, 10000); S = await repo.load();
  // editar un fijo desde un mes posterior (corta la serie)
  const sue = S.tx.find(x => x.cat === 'Sueldo'); await A.setPaid(sue.id, 2026 * 12 + 8, true); await A.setPaid(sue.id, 2026 * 12 + 9, true); S = await repo.load();
  await A.editTransaction(S, S.tx.find(x => x.cat === 'Sueldo'), 2026 * 12 + 9, { ...base, type: 'in', cat: 'Sueldo', amt: 400000, date: '2026-10-01', fixed: true }); S = await repo.load();
  await A.savMove(S, 'in', 'USD', 100000, '2026-09-15', ''); S = await repo.load();
  await A.savTransfer(S, 'USD', 'Bonos', 40000, '2026-09-16', ''); S = await repo.load();
  await A.savAdjust(S, 'Bonos', 45000, '2026-09-20', 'rendimiento'); S = await repo.load();   // ganancia +5000
  await A.savAdjust(S, 'USD', 55000, '2026-09-21', ''); S = await repo.load();                 // pérdida −5000
  await A.addCategory(S, 'sav', 'Auto'); await A.setUsd(120); S = await repo.load();
  await A.removeCategory(S, 'out', 'Salud'); S = await repo.load();
  return S;
}
// proyecta el snapshot a algo comparable (sin ids, claves y filas en orden canónico)
const canon = v => Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canon(v[k])])) : v;
const byJson = (a, b) => JSON.stringify(canon(a)).localeCompare(JSON.stringify(canon(b)));
const norm = S => canon({
  open: S.open, cards: [...S.cards].sort(),
  cardInfo: Object.fromEntries(Object.entries(S.cardInfo).filter(([, v]) => v.close || Object.keys(v.months || {}).length || v.color || v.style || v.last4).map(([k, v]) => [k, { close: v.close || null, color: v.color || null, style: v.style || null, last4: v.last4 || null, months: v.months || {} }])),
  tx: S.tx.map(x => ({ ...x, id: 0, g: x.g ? 1 : 0, of: x.of ? 1 : 0, end: x.end ?? null, skip: [...(x.skip || [])].sort(), rep: x.rep || null })).sort(byJson),
  paid: Object.keys(S.paid).map(k => k.split(':')[1]).sort(), pay: S.pay.map(p => ({ ...p, id: 0 })),
  sav: S.sav.map(x => ({ ...x, id: 0, tid: x.tid ? 1 : 0 })).sort(byJson),
  cats: Object.fromEntries(Object.entries(S.categories).map(([k, l]) => [k, l.filter(c => !c.hidden).map(c => c.name).sort()])),
  usd: S.categories.sav.find(c => c.name === 'USD').foreignAmount,
  avail: Math.round(createEngine(S, TD).availFor(2026 * 12 + 9)),
});

(async () => {
  const uid = '11111111-1111-1111-1111-111111111111';
  const fake = createFake(uid), sb = new SupabaseRepository(fake, uid), loc = new LocalRepository();
  let Ss, Sl;
  await t('mismo escenario de negocio sobre Supabase(fake) y Local', async () => { Ss = await scenario(sb); Sl = await scenario(loc); });
  await t('resultados equivalentes (movimientos, pagos, ahorro, categorías, disponible)', async () => assert.deepEqual(norm(Ss), norm(Sl)));
  await t('ajustes de saldo: guardados como ajuste, suman al valor y no cambian el disponible', async () => {
    const adj = Ss.sav.filter(x => x.adj); assert.deepEqual(adj.map(x => x.amt).sort((a, b) => a - b), [-5000, 5000]);
    const e = createEngine(Ss, TD); assert.equal(e.svBal('Bonos'), 45000); assert.equal(e.svReturn('Bonos').gain, 5000); assert.equal(e.svReturn('USD').gain, -5000);
    const sinAdj = createEngine({ ...Ss, sav: Ss.sav.filter(x => !x.adj) }, TD); assert.equal(e.availFor(2026 * 12 + 9), sinAdj.availFor(2026 * 12 + 9));
    assert.equal(fake.T.savings_movements.filter(r => r.is_adjustment).length, 2);
  });
  await t('la serie de fijos quedó cortada y lo pagado se trasladó', async () => {
    const sue = Ss.tx.filter(x => x.cat === 'Sueldo'); assert.equal(sue.length, 2);
    const viejo = sue.find(x => x.end != null), nuevo = sue.find(x => x.end == null);
    assert.equal(viejo.end, 2026 * 12 + 8); assert.ok(Ss.paid[`${nuevo.id}:${2026 * 12 + 9}`]);
  });
  await t('fijo editado "solo este mes": mismo resultado en Supabase(fake) y Local, ligado a su serie y borrado en cascada', async () => {
    const run = async repo => {
      const A = createActions(repo, () => TODAY);
      let S = await repo.load();
      await A.addTransaction(S, { type: 'out', amt: 100, cat: 'Casa', note: 'Alquiler', date: '2026-08-05', card: false, cardName: '', fixed: true, inst: 1 });
      S = await repo.load(); const f = S.tx.find(x => x.note === 'Alquiler'), oct = 2026 * 12 + 9;
      await A.editFixedMonth(S, f, oct, { type: 'out', amt: 250, cat: 'Casa', note: 'Alquiler', date: '2026-10-05', card: false, cardName: '', fixed: true, inst: 1 });
      S = await repo.load(); const ov = S.tx.find(x => x.of === f.id); assert.ok(ov && A.seriesOf(S, ov));
      await A.editFromOverride(S, ov, oct, { type: 'out', amt: 300, cat: 'Casa', note: 'Alquiler', date: '2026-10-05', card: false, cardName: '', fixed: true, inst: 1 });
      return repo.load();
    };
    const a = await run(sb), b = await run(loc);
    assert.deepEqual(norm(a), norm(b));
    assert.equal(a.tx.some(x => x.of), false);
    // cascada en la base: si se borra la serie se borran sus meses editados
    const A = createActions(sb, () => TODAY); let S = await sb.load(); const f = S.tx.find(x => x.note === 'Alquiler' && x.fixed);
    await A.editFixedMonth(S, f, 2026 * 12 + 11, { type: 'out', amt: 1, cat: 'Casa', note: 'Alquiler', date: '2026-12-05', card: false, cardName: '', fixed: true, inst: 1 });
    S = await sb.load(); assert.equal(S.tx.filter(x => x.of).length, 1);
    await sb.deleteTx([f.id]); S = await sb.load(); assert.equal(S.tx.filter(x => x.of).length, 0);
  });
  await t('la base rechaza lo que las reglas prohíben (saldo negativo, ahorro en categoría de gasto)', async () => {
    const A = createActions(sb, () => TODAY), S = await sb.load();
    await assert.rejects(() => sb.insertSav([{ id: 'x'.repeat(8), cat: 'Auto', amt: -1, date: '2026-10-01', note: '' }].map(z => ({ ...z, id: require('crypto').randomUUID() }))), /negativo/);
    await assert.rejects(() => sb.addCategory('out', 'COMIDA').then(() => sb.addCard('Visa ICBC')), /duplicate|Tarjeta|key/);
    const r = await A.removeCategory(S, 'sav', 'USD'); assert.equal(r.ok, false);
  });
  await t('borrar categoría para siempre: la base solo lo permite sin movimientos (restrict)', async () => {
    const A = createActions(sb, () => TODAY); let S = await sb.load();
    await A.addCategory(S, 'out', 'Efímera'); S = await sb.load(); await A.removeCategory(S, 'out', 'Efímera'); S = await sb.load();
    assert.equal((await A.deleteCategoryForever(S, 'out', 'Efímera')).ok, true);
    S = await sb.load(); assert.equal(S.categories.out.some(c => c.name === 'Efímera'), false);
    const used = S.tx.find(x => x.type === 'out' && !x.card); await A.removeCategory(S, 'out', used.cat); S = await sb.load();
    await assert.rejects(() => sb.deleteCategory('out', used.cat), /restrict|foreign/);
    assert.equal((await A.deleteCategoryForever(S, 'out', used.cat, 'Otros')).ok, true);
    S = await sb.load(); assert.equal(S.categories.out.some(c => c.name === used.cat), false); assert.equal(S.tx.some(x => x.type === 'out' && x.cat === used.cat), false);
  });
  await t('borrar una tarjeta borra sus compras, pagos y cierres (cascada)', async () => {
    const A = createActions(sb, () => TODAY); await A.deleteCard('Visa ICBC'); const S = await sb.load();
    assert.equal(S.tx.some(x => x.card), false); assert.equal(S.pay.length, 0); assert.equal(fake.T.card_closing_overrides.length, 0);
  });
  await t('toda fila escrita lleva user_id del usuario autenticado', async () => {
    for (const [tab, rows] of Object.entries(fake.T)) if (tab !== 'profiles') rows.forEach(r => { if (tab.startsWith('transaction_s') || tab === 'card_closing_overrides') assert.equal(r.user_id, uid, tab); else assert.equal(r.user_id, uid, tab); });
  });
  await t('replaceAll sin la función restore_backup lo informa como error (no pasa en silencio)', async () => { await assert.rejects(() => sb.replaceAll(req('src/domain/types.js').emptySnapshot()), /restore_backup/); });
  console.log(`\n${n} pruebas OK`);
})().catch(e => { console.error('✗', e); process.exit(1); });
