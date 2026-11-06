// node tools/test-stats.cjs   (TS_PATH=/ruta/a/typescript si no está instalado localmente)
const assert = require('node:assert/strict');
const req = require('./ts-run.cjs')();
const { createActions } = req('src/services/actions.js');
const { LocalRepository } = req('src/data/localRepository.js');
const ST = req('src/domain/stats.js');

const TODAY = new Date(2026, 9, 2, 12), SEP = 2026 * 12 + 8, OCT = SEP + 1, NOV = OCT + 1;
let n = 0; const t = async (name, fn) => { await fn(); n++; console.log('  ✓', name); };

(async () => {
  const repo = new LocalRepository(), A = createActions(repo, () => TODAY);
  let S = await repo.load();
  const base = { type: 'out', amt: 0, cat: 'Comida', note: '', date: '2026-10-02', card: false, cardName: '', fixed: false, inst: 1 };
  const add = async x => { S = await repo.load(); const r = await A.addTransaction(S, { ...base, ...x }); assert.equal(r.ok, true, r.error); };
  await add({ type: 'in', cat: 'Sueldo', amt: 1000, date: '2026-09-01' });
  await add({ type: 'in', cat: 'Sueldo', amt: 1200, date: '2026-10-01' });
  await add({ cat: 'Comida', amt: 200, date: '2026-09-05' });
  await add({ cat: 'Comida', amt: 100, date: '2026-10-05' });
  await add({ cat: 'Casa', amt: 300, date: '2026-09-03', fixed: true });
  await add({ cat: 'Ocio', amt: 600, date: '2026-09-10', card: true, cardName: 'Visa', inst: 3 });
  S = await repo.load();
  const savs = await A.savMove(S, 'in', 'USD', 100, '2026-10-10', ''); assert.equal(savs.ok, true);
  S = await repo.load();
  const eng = A.eng(S);

  await t('resumen del mes: ingresos, gastos (= suma de categorías), ahorro y balance', async () => {
    const o = ST.monthStats(eng, OCT), s = ST.monthStats(eng, SEP);
    assert.deepEqual([o.inc, o.out, o.sav, o.bal], [1200, 600, 100, 500]);
    assert.deepEqual([s.inc, s.out, s.sav], [1000, 500, 0]);
    assert.equal(Object.values(ST.expensesByCategory(eng, OCT)).reduce((a, b) => a + b, 0), o.out);
  });
  await t('comparación con el mes anterior: sentido bueno/malo, % y pesos, sin inventar % sin base', async () => {
    assert.deepEqual(ST.delta(600, 500, 'down', 'pct'), { text: '▲ 20% más', tone: 'bad' });
    assert.deepEqual(ST.delta(1200, 1000, 'up', 'pct'), { text: '▲ 20% más', tone: 'good' });
    assert.deepEqual(ST.delta(400, 500, 'down', 'pct'), { text: '▼ 20% menos', tone: 'good' });
    assert.equal(ST.delta(100, 0, 'up', 'abs').text, '▲ $100 más');
    assert.equal(ST.delta(0, 100, 'up', 'abs').tone, 'bad');
    assert.deepEqual(ST.delta(5, 0, 'down', 'pct'), { text: 'Mes anterior: $0', tone: 'flat' });
    assert.deepEqual(ST.delta(500, 500, 'up', 'pct'), { text: 'Sin cambios', tone: 'flat' });
    assert.equal(ST.delta(1001, 1000, 'up', 'pct').text, '▲ <1% más');
  });
  await t('categorías contra el mes anterior: baja, sube, nueva e igual', async () => {
    const o = ST.expensesByCategory(eng, OCT), p = ST.expensesByCategory(eng, SEP);
    assert.deepEqual(ST.categoryBadge(o.Comida, p.Comida), { text: '▼ 50% menos', tone: 'good' });
    assert.deepEqual(ST.categoryBadge(o.Ocio, p.Ocio || 0), { text: 'Nueva', tone: 'flat' });
    assert.equal(ST.categoryBadge(o.Casa, p.Casa), null, 'el fijo no cambió');
    assert.equal(ST.categoryBadge(0, 0), null);
  });
  await t('fijos vs. variables: se excluyen entre sí y suman el gasto del mes', async () => {
    const k = ST.expenseKinds(eng, OCT);
    assert.deepEqual([k.fixed, k.card, k.month, k.total], [300, 200, 100, 600]);
  });
  await t('ritmo del mes: gasto por día y promedio de los meses anteriores con gastos', async () => {
    const p = ST.pace(eng, OCT);
    assert.equal(p.out, 600); assert.equal(Math.round(p.perDay * 100) / 100, Math.round((600 / 31) * 100) / 100);
    assert.equal(p.avg, 500); assert.equal(p.months, 1); assert.equal(p.diff, 100); assert.equal(p.state, 'now');
    assert.equal(ST.pace(eng, NOV).state, 'future');
    assert.equal(ST.pace(eng, 2020 * 12), null, 'sin gastos no hay ritmo');
    assert.equal(ST.pace(eng, SEP), null, 'sin meses anteriores con gastos no hay con qué comparar');
  });
  await t('por tarjeta: lo del mes y lo que queda en cuotas (los fijos no cuentan como cuotas)', async () => {
    let c = ST.cardStats(eng, OCT);
    assert.equal(c.cards.length, 1); assert.deepEqual([c.cards[0].name, c.cards[0].spent, c.cards[0].pending, c.cards[0].pendingMonths], ['Visa', 200, 400, 2]);
    assert.equal(c.pending, 400); assert.equal(c.end, NOV + 1, 'la última cuota es la de dos meses después');
    assert.equal(c.cards[0].plans.length, 1); assert.deepEqual([c.cards[0].plans[0].rem, c.cards[0].plans[0].left, c.cards[0].plans[0].end], [2, 400, NOV + 1], 'detalle: compra, cuotas que faltan, total y fin');
    assert.ok(c.cards[0].paid > 0 && c.cards[0].paid <= 200 * 2, 'ya pagado de esa compra');
    c = ST.cardStats(eng, NOV + 1); assert.deepEqual(c.cards.map(x => [x.spent, x.pending]), [[200, 0]], 'última cuota: nada pendiente');
    assert.deepEqual(ST.cardStats(eng, 2030 * 12).cards, [], 'sin gastos con tarjeta');
    S = await repo.load(); await A.addTransaction(S, { ...base, cat: 'Ocio', amt: 50, date: '2026-10-03', card: true, cardName: 'Visa', fixed: true });
    S = await repo.load(); c = ST.cardStats(A.eng(S), OCT); assert.equal(c.pending, 400, 'un fijo de tarjeta no es una cuota pendiente');
  });
  // ---- deuda por mes y peso de la tarjeta (escenario aparte) ----
  const r2 = new LocalRepository(), A2 = createActions(r2, () => TODAY);
  const add2 = async x => { const S2 = await r2.load(); const r = await A2.addTransaction(S2, { ...base, ...x }); assert.equal(r.ok, true, r.error); };
  await add2({ type: 'in', cat: 'Sueldo', amt: 1000, date: '2026-06-01', fixed: true });
  for (const [d, a] of [['2026-05-20', 100], ['2026-06-20', 150], ['2026-07-20', 200], ['2026-08-20', 300], ['2026-09-20', 350]]) await add2({ cat: 'Ocio', amt: a, date: d, card: true, cardName: 'Visa' });
  await add2({ cat: 'Casa', amt: 900, date: '2026-10-15', card: true, cardName: 'Visa', inst: 3 });
  await add2({ cat: 'Casa', amt: 600, date: '2026-10-16', card: true, cardName: 'Master', inst: 2 });
  await add2({ cat: 'Casa', amt: 80, date: '2026-10-17', card: true, cardName: 'Master', fixed: true });
  const e2 = A2.eng(await r2.load());

  await t('deuda por mes: cuotas por tarjeta y por mes, de mayor a menor; los fijos de tarjeta no son deuda', async () => {
    const d = ST.cardDebt(e2, NOV);
    assert.deepEqual(d.months, [NOV, NOV + 1, NOV + 2, NOV + 3, NOV + 4, NOV + 5]);
    assert.deepEqual(d.cards.map(c => [c.name, c.v.slice(0, 4)]), [['Visa', [300, 300, 300, 0]], ['Master', [300, 300, 0, 0]]]);
    assert.deepEqual(d.totals.slice(0, 4), [600, 600, 300, 0]); assert.equal(d.total, 1500); assert.equal(d.all, 1500);
    assert.equal(d.last, NOV + 2); assert.deepEqual(d.worst, { i: NOV, v: 600 });
    const antes = ST.cardDebt(e2, NOV - 1, 6, { tipo: 'cuota' });   // desde Octubre entran todas las cuotas (la primera de cada compra cae en Noviembre)
    assert.equal(antes.all, 1500, 'desde antes entra lo mismo: ninguna cuota empieza antes de Noviembre');
    assert.equal(ST.cardDebt(e2, NOV + 1).all, 900, 'lo que ya se pagó no cuenta');
    const fin = ST.cardDebt(e2, NOV + 3); assert.deepEqual(fin.cards, []); assert.equal(fin.worst, null); assert.equal(fin.last, null);
  });
  await t('deuda por mes: suma también las compras en un pago y se filtra por tarjeta y por tipo', async () => {
    const d = ST.cardDebt(e2, NOV - 1);   // Octubre: la compra de $350 del 20/09 en un pago cae en ese resumen
    assert.deepEqual(d.totals.slice(0, 5), [350, 600, 600, 300, 0]); assert.deepEqual(d.cuotas.slice(0, 4), [0, 600, 600, 300]); assert.deepEqual(d.pagos.slice(0, 2), [350, 0]);
    assert.equal(d.all, 1850); assert.equal(d.rows.length, 6);
    const un = d.rows.find(r => r.kind === 'pago'); assert.deepEqual([un.card, un.i, un.a, un.k, un.n, un.date], ['Visa', NOV - 1, 350, 1, 1, '2026-09-20']);
    const cu = d.rows.find(r => r.card === 'Master'); assert.deepEqual([cu.kind, cu.k, cu.n, cu.a], ['cuota', 1, 2, 300]);
    const m = ST.cardDebt(e2, NOV - 1, 6, { card: 'Master' }); assert.equal(m.all, 600); assert.equal(m.rows.length, 2); assert.deepEqual(m.cards.map(c => c.name), ['Master']);
    const p = ST.cardDebt(e2, NOV - 1, 6, { tipo: 'pago' }); assert.equal(p.rows.length, 1); assert.equal(p.all, 350); assert.deepEqual(p.cuotas, [0, 0, 0, 0, 0, 0]);
    const vacio = ST.cardDebt(e2, NOV - 1, 6, { card: 'Master', tipo: 'pago' }); assert.deepEqual(vacio.rows, []); assert.deepEqual(vacio.cards, []); assert.equal(vacio.worst, null); assert.equal(vacio.last, null);
    assert.equal(ST.cardDebt(e2, NOV - 1, 6, { tipo: 'todo' }).all, 1850, 'sin filtro es lo mismo que "todo"');
  });
  await t('deuda por mes: las cuotas que pasan de la ventana se cuentan en el total pero no en las barras', async () => {
    const d = ST.cardDebt(e2, NOV, 1);
    assert.equal(d.total, 600); assert.equal(d.all, 1500); assert.equal(d.last, NOV + 2);
  });
  await t('tarjeta vs. ingresos: porcentaje, nivel y puntos contra el mes anterior', async () => {
    const OCT2 = OCT, s = ST.cardShare(e2, OCT2);
    assert.equal(s.card, 350); assert.equal(s.inc, 1000); assert.equal(Math.round(s.pct), 35); assert.equal(s.level, 'high');
    assert.equal(Math.round(s.points), 5);
    assert.equal(ST.cardShare(e2, OCT2 - 2).level, 'mid', '20% ya es atención');
    assert.equal(ST.cardShare(e2, OCT2 - 3).level, 'ok', '15% es verde');
    const nov = ST.cardShare(e2, NOV); assert.equal(nov.card, 300 + 300 + 80, 'compras con cuota, y el fijo de tarjeta también cuentan como pago del mes'); assert.equal(Math.round(nov.pct), 68);
    const sinIng = ST.cardShare(e2, SEP - 4); assert.equal(sinIng.pct, null); assert.equal(sinIng.level, null); assert.equal(sinIng.points, null);
  });
  console.log(`  ${n} pruebas de estadísticas OK`);
})().catch(e => { console.error('  ✗', e.message); process.exit(1); });
