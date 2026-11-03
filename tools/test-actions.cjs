// node tools/test-actions.cjs   (TS_PATH=/ruta/a/typescript si no está instalado localmente)
const assert = require('node:assert/strict');
const req = require('./ts-run.cjs')();
const { createActions } = req('src/services/actions.js');
const { LocalRepository } = req('src/data/localRepository.js');
const { createEngine } = req('src/domain/engine.js');
const { fromLegacy } = req('src/domain/legacy.js');
const { parseBackup, countsOf } = req('src/domain/backup.js');
const { emptySnapshot } = req('src/domain/types.js');

const TODAY = new Date(2026, 9, 2, 12);
let n = 0; const t = async (name, fn) => { await fn(); n++; console.log('  ✓', name); };

(async () => {
  const mk = () => { const repo = new LocalRepository(); return { repo, A: createActions(repo, () => TODAY) }; };
  const base = { type: 'out', amt: 1000, cat: 'Comida', note: '', date: '2026-10-02', card: false, cardName: '', fixed: false, inst: 1 };

  await t('alta simple + pagado marca el mes', async () => {
    const { repo, A } = mk(); let S = await repo.load();
    assert.equal((await A.addTransaction(S, { ...base, paid: true })).ok, true);
    S = await repo.load(); assert.equal(S.tx.length, 1);
    assert.equal(createEngine(S, { y: 2026, m: 9, d: 2 }).availFor(2026 * 12 + 9), -1000);
  });
  await t('repeticiones mensuales: 3 filas, mismo grupo, fin de mes recortado', async () => {
    const { repo, A } = mk(); let S = await repo.load();
    await A.addTransaction(S, { ...base, date: '2026-01-31', repeat: { mode: 'm', times: 3 } });
    S = await repo.load();
    assert.deepEqual(S.tx.map(x => x.date), ['2026-01-31', '2026-02-28', '2026-03-31']);
    assert.equal(new Set(S.tx.map(x => x.g)).size, 1);
    assert.equal((await A.addTransaction(S, { ...base, repeat: { mode: 'm', times: 1 } })).ok, false);
  });
  await t('editar un fijo "desde este mes" corta la serie y traslada lo pagado', async () => {
    const { repo, A } = mk(); let S = await repo.load();
    await A.addTransaction(S, { ...base, type: 'in', cat: 'Sueldo', amt: 100, date: '2026-08-01', fixed: true });
    S = await repo.load(); const t0 = S.tx[0], sep = 2026 * 12 + 8;
    await A.setPaid(t0.id, sep, true); await A.setPaid(t0.id, sep + 1, true);
    S = await repo.load();
    await A.editTransaction(S, S.tx[0], sep + 1, { ...base, type: 'in', cat: 'Sueldo', amt: 200, date: '2026-09-01', fixed: true });
    S = await repo.load();
    assert.equal(S.tx.length, 2); assert.equal(S.tx[0].end, sep);
    assert.equal(S.tx[1].amt, 200); assert.equal(S.paid[`${t0.id}:${sep}`], true);
    assert.equal(S.paid[`${S.tx[1].id}:${sep + 1}`], true); assert.equal(S.paid[`${t0.id}:${sep + 1}`], undefined);
  });
  await t('editar un fijo "solo este mes": cambia ese mes, los demás quedan y se conserva lo pagado', async () => {
    const { repo, A } = mk(); let S = await repo.load();
    await A.addTransaction(S, { ...base, fixed: true, amt: 100, date: '2026-08-05' });
    S = await repo.load(); const f = S.tx[0], oct = 2026 * 12 + 9;
    await A.setPaid(f.id, oct, true); S = await repo.load();
    assert.equal((await A.editFixedMonth(S, S.tx[0], oct, { ...base, fixed: true, amt: 250, date: '2026-10-05', note: 'Extra' })).ok, true);
    S = await repo.load(); const e = A.eng(S), all = e.all();
    assert.equal(S.tx.length, 2); assert.deepEqual(S.tx[0].skip, [oct]);
    const inOct = all.filter(o => o.i === oct); assert.equal(inOct.length, 1); assert.equal(inOct[0].a, 250); assert.equal(inOct[0].t.fixed, false);
    assert.equal(all.find(o => o.i === oct + 1).a, 100); assert.equal(all.find(o => o.i === oct - 1).a, 100);
    assert.equal(e.P(inOct[0]), true, 'conserva lo pagado'); assert.equal(S.paid[`${f.id}:${oct}`], undefined);
    assert.equal((await A.editFixedMonth(S, S.tx[0], oct + 1, { ...base, amt: 0, date: '2026-11-05' })).ok, false);
  });
  await t('editar con el tilde de pagado: tildar, destildar y cambiar de mes (movimiento único)', async () => {
    const { repo, A } = mk(); let S = await repo.load();
    await A.addTransaction(S, { ...base, amt: 500, date: '2026-10-05' });
    S = await repo.load(); const id = S.tx[0].id, oct = 2026 * 12 + 9;
    assert.equal(S.paid[`${id}:${oct}`], undefined);
    await A.editTransaction(S, S.tx[0], oct, { ...base, amt: 500, date: '2026-10-05', paid: true }); S = await repo.load();
    assert.equal(S.paid[`${id}:${oct}`], true, 'tildó');
    await A.editTransaction(S, S.tx[0], oct, { ...base, amt: 500, date: '2026-10-05', paid: true }); S = await repo.load();
    assert.equal(S.paid[`${id}:${oct}`], true, 'sin cambios');
    await A.editTransaction(S, S.tx[0], oct, { ...base, amt: 500, date: '2026-11-05', paid: true }); S = await repo.load();
    assert.equal(S.paid[`${id}:${oct}`], undefined, 'no deja el mes viejo marcado'); assert.equal(S.paid[`${id}:${oct + 1}`], true, 'sigue pagado en el mes nuevo');
    await A.editTransaction(S, S.tx[0], oct + 1, { ...base, amt: 500, date: '2026-11-05', paid: false }); S = await repo.load();
    assert.deepEqual(S.paid, {}, 'destildó');
    await A.editTransaction(S, S.tx[0], oct + 1, { ...base, amt: 700, date: '2026-11-05' }); S = await repo.load();
    assert.deepEqual(S.paid, {}, 'sin dato de pagado no toca nada'); assert.equal(S.tx[0].amt, 700);
  });
  await t('editar con el tilde un fijo: "solo este mes" y "este mes y los siguientes"', async () => {
    const { repo, A } = mk(); let S = await repo.load(); const oct = 2026 * 12 + 9;
    await A.addTransaction(S, { ...base, type: 'in', cat: 'Sueldo', fixed: true, amt: 100, date: '2026-08-01' });
    S = await repo.load(); const f = S.tx[0];
    await A.editFixedMonth(S, S.tx[0], oct, { ...base, type: 'in', cat: 'Sueldo', fixed: false, amt: 130, date: '2026-10-01', paid: true }); S = await repo.load();
    const mine = S.tx.find(x => x.of === f.id);
    assert.equal(S.paid[`${mine.id}:${oct}`], true, 'solo este mes: cobrado'); assert.equal(S.paid[`${f.id}:${oct}`], undefined);
    assert.equal(A.eng(S).all().filter(o => o.i === oct + 1).every(o => !A.eng(S).P(o)), true, 'los demás meses siguen pendientes');
    await A.editFixedMonth(S, mine, oct, { ...base, type: 'in', cat: 'Sueldo', fixed: false, amt: 130, date: '2026-10-01', paid: false }); S = await repo.load();
    assert.equal(Object.keys(S.paid).length, 0, 'solo este mes: se destilda');
    const g = mk(); let G = await g.repo.load();
    await g.A.addTransaction(G, { ...base, type: 'in', cat: 'Sueldo', fixed: true, amt: 100, date: '2026-08-01' });
    G = await g.repo.load();
    await g.A.editTransaction(G, G.tx[0], oct, { ...base, type: 'in', cat: 'Sueldo', fixed: true, amt: 150, date: '2026-10-01', paid: true }); G = await g.repo.load();
    assert.equal(G.tx.length, 2); assert.equal(G.paid[`${G.tx[1].id}:${oct}`], true, 'este mes y siguientes: cobrado este mes');
    assert.equal(Object.keys(G.paid).length, 1); assert.equal(G.paid[`${G.tx[0].id}:${oct}`], undefined);
  });
  await t('editar un fijo de tarjeta "solo este mes" sigue cayendo en el mismo resumen', async () => {
    const { repo, A } = mk(); let S = await repo.load();
    await A.addTransaction(S, { ...base, fixed: true, amt: 100, date: '2026-08-28', card: true, cardName: 'Visa' });
    S = await repo.load(); const f = S.tx[0], i = A.eng(S).all()[1].i;
    await A.editFixedMonth(S, f, i, { ...base, fixed: true, amt: 300, date: `${Math.floor((i - 1) / 12)}-${String(((i - 1) % 12) + 1).padStart(2, '0')}-28`, card: true, cardName: 'Visa' });
    S = await repo.load(); const all = A.eng(S).all();
    assert.equal(all.filter(o => o.i === i).length, 1); assert.equal(all.find(o => o.i === i).a, 300);
    assert.equal(all.find(o => o.i === i + 1).a, 100);
  });
  await t('mes editado de un fijo: sigue ligado a su serie y ofrece editar/borrar este mes o este y los siguientes', async () => {
    const { repo, A } = mk(); let S = await repo.load();
    await A.addTransaction(S, { ...base, fixed: true, amt: 100, date: '2026-08-05' });
    S = await repo.load(); const f = S.tx[0], oct = 2026 * 12 + 9, nov = oct + 1;
    await A.editFixedMonth(S, f, oct, { ...base, fixed: true, amt: 250, date: '2026-10-05' });
    await A.editFixedMonth(await repo.load(), (await repo.load()).tx[0], nov, { ...base, fixed: true, amt: 400, date: '2026-11-05' });
    S = await repo.load(); const ov = S.tx.filter(x => x.of === f.id); assert.equal(ov.length, 2); assert.ok(A.seriesOf(S, ov[0]));
    const octOv = ov.find(x => x.amt === 250);
    // editar "este mes y los siguientes" desde el mes editado de octubre: rige la nueva desde octubre, el de noviembre (editado) pasa a la serie nueva
    assert.equal((await A.editFromOverride(S, octOv, oct, { ...base, fixed: true, amt: 500, date: '2026-10-05' })).ok, true);
    S = await repo.load(); const e = A.eng(S), all = e.all();
    assert.equal(S.tx.find(x => x.id === octOv.id), undefined, 'se descarta la edición puntual de octubre');
    assert.equal(all.find(o => o.i === oct).a, 500); assert.equal(all.find(o => o.i === oct).t.fixed, true);
    assert.equal(all.find(o => o.i === nov).a, 400, 'el mes editado de noviembre se conserva');
    assert.equal(all.find(o => o.i === oct - 1).a, 100, 'meses anteriores intactos');
    const newSeries = S.tx.find(x => x.fixed && x.amt === 500), novOv = S.tx.find(x => x.of && x.amt === 400);
    assert.equal(novOv.of, newSeries.id, 'el mes editado de noviembre ahora depende de la serie nueva');
    // borrar "este mes y los siguientes" desde el mes editado de noviembre: se corta la serie y no queda nada de noviembre en adelante
    assert.ok(A.seriesOf(S, novOv)); await A.deleteFromOverride(S, novOv, nov);
    S = await repo.load(); const all2 = A.eng(S).all();
    assert.equal(all2.filter(o => o.i >= nov).length, 0); assert.equal(all2.find(o => o.i === oct).a, 500);
  });
  await t('reparación: un fijo editado "solo este mes" con la versión anterior vuelve a ligarse a su serie (estricto, idempotente)', async () => {
    const { repo, A } = mk(); let S = await repo.load();
    const oct = 2026 * 12 + 9;
    await A.addTransaction(S, { ...base, fixed: true, amt: 90000, cat: 'Transporte', note: 'Seguro', date: '2026-08-05' });
    S = await repo.load(); const f = S.tx[0];
    // lo que dejaba la versión anterior: mes salteado + movimiento común sin vínculo
    await repo.setSkips(f.id, [oct]);
    await A.addTransaction(S, { ...base, amt: 108000, cat: 'Transporte', note: 'Seguro', date: '2026-10-05' });
    await A.addTransaction(S, { ...base, amt: 5000, cat: 'Transporte', note: 'Nafta', date: '2026-10-07' });   // no es el mismo movimiento
    S = await repo.load(); assert.equal(S.tx.filter(x => x.of).length, 0);
    assert.equal(await A.relinkOverrides(S), 1);
    S = await repo.load(); const ov = S.tx.filter(x => x.of); assert.equal(ov.length, 1); assert.equal(ov[0].amt, 108000); assert.equal(ov[0].of, f.id);
    assert.ok(A.seriesOf(S, ov[0])); assert.equal(await A.relinkOverrides(S), 0);
  });
  await t('borrar un fijo "este mes y los siguientes" también borra los meses editados de ahí en adelante', async () => {
    const { repo, A } = mk(); let S = await repo.load();
    await A.addTransaction(S, { ...base, fixed: true, amt: 100, date: '2026-08-05' });
    S = await repo.load(); const f = S.tx[0], oct = 2026 * 12 + 9;
    await A.editFixedMonth(S, f, oct, { ...base, fixed: true, amt: 250, date: '2026-10-05' });
    S = await repo.load(); await A.deleteFixedFrom(S, S.tx.find(x => x.fixed), oct);
    S = await repo.load(); assert.equal(S.tx.length, 1); assert.equal(A.eng(S).all().filter(o => o.i >= oct).length, 0);
    await A.deleteFixedFrom(S, S.tx[0], 2026 * 12 + 7);   // desde el primer mes: borra la serie entera
    S = await repo.load(); assert.equal(S.tx.length, 0);
  });
  await t('borrar fijo: solo este mes / este y siguientes', async () => {
    const { repo, A } = mk(); let S = await repo.load();
    await A.addTransaction(S, { ...base, fixed: true, date: '2026-08-05' });
    S = await repo.load(); const f = S.tx[0], i = 2026 * 12 + 9;
    await A.deleteFixedMonth(f, i); S = await repo.load(); assert.deepEqual(S.tx[0].skip, [i]);
    await A.deleteFixedFrom(S, S.tx[0], i); S = await repo.load(); assert.equal(S.tx[0].end, i - 1);
  });
  await t('categorías: duplicado (tildes/mayúsculas), eliminar y restaurar', async () => {
    const { repo, A } = mk(); let S = await repo.load();
    assert.equal((await A.addCategory(S, 'out', ' COMIDA ')).ok, false);
    assert.equal((await A.addCategory(S, 'out', 'Educación')).ok, true);
    S = await repo.load(); assert.equal((await A.addCategory(S, 'out', 'educacion')).ok, false);
    await A.removeCategory(S, 'out', 'Educación'); S = await repo.load();
    assert.match(A.catDup(S, 'out', 'Educacion').msg, /eliminadas/);
    await A.restoreCategory('out', 'Educación'); S = await repo.load();
    assert.equal(S.categories.out.find(c => c.name === 'Educación').hidden, false);
  });
  await t('categorías: eliminar para siempre (sin uso, con uso y ahorro con historial)', async () => {
    const { repo, A } = mk(); let S = await repo.load();
    await A.addCategory(S, 'out', 'Temporal'); S = await repo.load();
    assert.equal((await A.deleteCategoryForever(S, 'out', 'Temporal')).ok, false, 'primero hay que eliminarla');
    await A.removeCategory(S, 'out', 'Temporal'); S = await repo.load();
    assert.equal((await A.deleteCategoryForever(S, 'out', 'Temporal')).ok, true);
    S = await repo.load(); assert.equal(S.categories.out.some(c => c.name === 'Temporal'), false);
    // con movimientos: exige destino y los pasa
    await A.addTransaction(S, { ...base, cat: 'Salud', amt: 10 }); await A.addTransaction(await repo.load(), { ...base, cat: 'Salud', amt: 20 }); S = await repo.load();
    await A.removeCategory(S, 'out', 'Salud'); S = await repo.load();
    assert.equal(A.categoryUsage(S, 'out', 'Salud'), 2);
    assert.equal((await A.deleteCategoryForever(S, 'out', 'Salud')).ok, false, 'sin destino no borra');
    assert.equal((await A.deleteCategoryForever(S, 'out', 'Salud', 'Salud')).ok, false);
    assert.equal((await A.deleteCategoryForever(S, 'out', 'Salud', 'Comida')).ok, true);
    S = await repo.load(); assert.equal(S.categories.out.some(c => c.name === 'Salud'), false);
    assert.equal(S.tx.filter(x => x.cat === 'Comida' && (x.amt === 10 || x.amt === 20)).length, 2); assert.equal(S.tx.some(x => x.cat === 'Salud'), false);
    // ahorro con historial: no se borra
    await A.savMove(S, 'in', 'Acciones', 50, '2026-10-01', ''); S = await repo.load();
    await A.savMove(S, 'out', 'Acciones', 50, '2026-10-02', ''); S = await repo.load();
    await A.removeCategory(S, 'sav', 'Acciones'); S = await repo.load();
    const r = await A.deleteCategoryForever(S, 'sav', 'Acciones'); assert.equal(r.ok, false); assert.match(r.error, /historial/);
  });
  await t('ahorro programado: lo de fecha futura no mueve la cuenta ni el saldo hasta su día (depósito, retiro, transferencia, ajuste)', async () => {
    const { repo, A } = mk(); let S = await repo.load(); const oct = 2026 * 12 + 9, nov = oct + 1;
    await A.savMove(S, 'in', 'Acciones', 1000, '2026-10-01', ''); S = await repo.load();
    const av0 = A.eng(S).availFor(oct);
    // depósito del 20/11 estando a 2/10
    assert.equal((await A.savMove(S, 'in', 'Acciones', 500, '2026-11-20', '')).ok, true); S = await repo.load();
    let e = A.eng(S);
    assert.equal(e.availFor(oct), av0, 'hoy la cuenta no se descuenta');
    assert.equal(e.svBal('Acciones'), 1000, 'hoy el saldo de Ahorro no suma lo programado');
    assert.equal(e.svBalAll('Acciones'), 1500); assert.equal(e.svPending().length, 1);
    assert.equal(e.availFor(nov), av0 - 500, 'en noviembre sí descuenta (proyección)');
    assert.equal(e.svNet(nov), 500, 'el mes de noviembre lo incluye');
    // el mismo día (hoy 2/10) pero más tarde en el mes: tampoco cuenta todavía
    assert.equal((await A.savMove(S, 'in', 'Acciones', 100, '2026-10-31', '')).ok, true); S = await repo.load();
    assert.equal(A.eng(S).availFor(oct), av0, 'un depósito del 31/10 tampoco descuenta hoy');
    // llegado el día, pasa a valer: con "hoy" = 20/11
    const later = createEngine(S, { y: 2026, m: 10, d: 20 });
    assert.equal(later.svBal('Acciones'), 1600); assert.equal(later.svPending().length, 0);
    assert.equal(later.availFor(nov), av0 - 600);
    // retiro programado: valida contra el saldo de ESA fecha, no el de hoy
    assert.equal((await A.savMove(S, 'out', 'Acciones', 1400, '2026-10-15', '')).ok, false, 'el 15/10 solo habrá 1000');
    assert.equal((await A.savMove(S, 'out', 'Acciones', 1400, '2026-11-25', '')).ok, true, 'el 25/11 ya habrá 1600'); S = await repo.load();
    assert.equal(A.eng(S).svBal('Acciones'), 1000, 'hoy sigue en 1000');
    // un retiro que rompería uno programado más adelante
    const r = await A.savMove(S, 'out', 'Acciones', 900, '2026-11-01', ''); assert.equal(r.ok, false);
    // borrar el depósito del 20/11 dejaría negativo el retiro del 25/11
    const dep = S.sav.find(x => x.date === '2026-11-20'); const pl = A.savDeletePlan(S, dep); assert.equal(pl.ok, false);
    // transferencia programada
    assert.equal((await A.savTransfer(S, 'Acciones', 'Bonos', 600, '2026-12-01', '')).ok, false, 'el 1/12 solo quedan 200');
    assert.equal((await A.savTransfer(S, 'Acciones', 'Bonos', 150, '2026-12-01', '')).ok, true); S = await repo.load();
    assert.equal(A.eng(S).svBal('Bonos'), 0, 'hoy Bonos sigue en cero'); assert.equal(A.eng(S).availFor(nov + 1), A.eng(S).availFor(nov) , 'la transferencia no mueve la cuenta');
    // ajuste con fecha futura: el valor se compara contra el saldo de esa fecha
    assert.equal((await A.savAdjust(S, 'Acciones', 1500, '2026-11-21', '')).ok, false, 'una pérdida de 100 el 21/11 dejaría negativa la transferencia del 1/12');
    assert.equal((await A.savAdjust(S, 'Acciones', 1700, '2026-11-21', '')).ok, true); S = await repo.load();
    assert.equal(S.sav.find(x => x.adj).amt, 100, 'al 21/11 había 1600 y vale 1700: ganancia de 100');
    assert.equal(A.eng(S).svBal('Acciones'), 1000, 'hoy no cambia'); assert.equal(A.eng(S).svReturn('Acciones').gain, 0);
    // cambiar la fecha de un movimiento del pasado a futuro lo programa; al revés lo activa
    const d1 = S.sav.find(x => x.date === '2026-10-31'); await A.savMove(S, 'in', 'Acciones', 100, '2026-10-02', '', d1); S = await repo.load();
    assert.equal(A.eng(S).svBal('Acciones'), 1100); assert.equal(A.eng(S).availFor(oct), av0 - 100);
    // borrar un programado que no deja negativos
    const sch = S.sav.find(x => x.tid && x.cat === 'Bonos'); assert.equal(A.savDeletePlan(S, sch).ok, true);
    // no se puede borrar una categoría que solo tiene saldo programado
    assert.equal((await A.removeCategory(S, 'sav', 'Bonos')).ok, false);
  });
  await t('ahorro: ajuste de saldo (ganancia/pérdida) sin tocar el disponible', async () => {
    const { repo, A } = mk(); let S = await repo.load(); const oct = 2026 * 12 + 9;
    await A.savMove(S, 'in', 'Acciones', 1000, '2026-10-01', ''); S = await repo.load();
    const av0 = A.eng(S).availFor(oct);
    assert.equal((await A.savAdjust(S, 'Acciones', 1000, '2026-10-02', '')).ok, false, 'sin diferencia no hace nada');
    assert.equal((await A.savAdjust(S, 'Acciones', -5, '2026-10-02', '')).ok, false, 'valor negativo');
    assert.equal((await A.savAdjust(S, 'Acciones', 1250, '2026-10-02', 'sube')).ok, true); S = await repo.load();
    let e = A.eng(S), adj = S.sav.find(x => x.adj);
    assert.equal(adj.amt, 250); assert.equal(e.svBal('Acciones'), 1250); assert.equal(e.svReturn('Acciones').gain, 250);
    assert.equal(e.availFor(oct), av0, 'el disponible no cambia con un ajuste'); assert.equal(e.svNet(oct), 1000, 'la caja del mes no incluye ajustes');
    assert.equal(e.svMoves(oct).length, 1, 'el listado de depósitos/retiros no incluye ajustes');
    const r = A.eng(S).svReturn('Acciones'); assert.equal(r.value, 1250); assert.equal(r.contributed, 1000); assert.equal(r.gain, 250); assert.equal(r.pct, 25);
    // pérdida
    assert.equal((await A.savAdjust(S, 'Acciones', 900, '2026-10-02', '')).ok, true); S = await repo.load();
    assert.equal(A.eng(S).svBal('Acciones'), 900); assert.equal(A.eng(S).svReturn('Acciones').gain, -100); assert.equal(A.eng(S).svReturn('Acciones').pct, -10);
    // editar el primer ajuste: "valor resultante" descontando el propio ajuste
    adj = S.sav.find(x => x.adj && x.amt === 250);
    assert.equal((await A.savAdjust(S, 'Acciones', 1100, '2026-10-02', 'corregido', adj)).ok, true); S = await repo.load();
    assert.equal(S.sav.find(x => x.id === adj.id).amt, 450, 'el ajuste se recalcula para que la categoría quede valiendo 1100'); assert.equal(A.eng(S).svBal('Acciones'), 1100);
  });
  await t('ahorro: retirar con ganancia devuelve el valor completo al disponible; borrar un ajuste valida saldos', async () => {
    const { repo, A } = mk(); let S = await repo.load(); const oct = 2026 * 12 + 9;
    await A.savMove(S, 'in', 'Bonos', 1000, '2026-10-01', ''); S = await repo.load();
    await A.savAdjust(S, 'Bonos', 1250, '2026-10-02', ''); S = await repo.load();
    const av0 = A.eng(S).availFor(oct);
    assert.equal((await A.savMove(S, 'out', 'Bonos', 1300, '2026-10-02', '')).ok, false, 'no se retira más que el valor');
    assert.equal((await A.savMove(S, 'out', 'Bonos', 1200, '2026-10-02', '')).ok, true); S = await repo.load();
    assert.equal(A.eng(S).availFor(oct), av0 + 1200); assert.equal(A.eng(S).svBal('Bonos'), 50);
    const adj = S.sav.find(x => x.adj), plan = A.savDeletePlan(S, adj);
    assert.equal(plan.ok, false, 'borrar la ganancia dejaría la categoría en negativo');
    // transferir desde una categoría con ganancia mueve el valor (no cambia el disponible)
    await A.savAdjust(S, 'Bonos', 400, '2026-10-02', ''); S = await repo.load();
    const av1 = A.eng(S).availFor(oct); assert.equal((await A.savTransfer(S, 'Bonos', 'Otro', 400, '2026-10-02', '')).ok, true); S = await repo.load();
    assert.equal(A.eng(S).availFor(oct), av1); assert.equal(A.eng(S).svBal('Otro'), 400);
  });
  await t('ahorro: depósito/retiro/transferencia con saldos y borrado', async () => {
    const { repo, A } = mk(); let S = await repo.load();
    assert.equal((await A.savMove(S, 'in', 'USD', 1000, '2026-10-01', '')).ok, true); S = await repo.load();
    assert.equal((await A.savMove(S, 'out', 'USD', 1500, '2026-10-02', '')).ok, false);
    assert.equal((await A.savTransfer(S, 'USD', 'Bonos', 400, '2026-10-02', '')).ok, true); S = await repo.load();
    assert.equal(A.balOf(S.sav, 'USD'), 600); assert.equal(A.balOf(S.sav, 'Bonos'), 400);
    const e = createEngine(S, { y: 2026, m: 9, d: 2 }); assert.equal(e.svTo(2026 * 12 + 9), 1000); // transferir no cambia lo ahorrado total
    const dep = S.sav.find(x => !x.tid); const plan = A.savDeletePlan(S, dep); assert.equal(plan.ok, false); // dejaría USD en negativo
    const leg = S.sav.find(x => x.tid); const p2 = A.savDeletePlan(S, leg); assert.equal(p2.ok, true); assert.equal(p2.ids.length, 2);
    assert.equal((await A.removeCategory(S, 'sav', 'USD')).ok, false);
    assert.equal((await A.removeCategory(S, 'sav', 'Acciones')).ok, true);
    assert.equal((await A.setUsd(120.456)).ok, true); S = await repo.load(); assert.equal(S.categories.sav.find(c => c.name === 'USD').foreignAmount, 120.46);
  });
  await t('tarjetas: alta, duplicado, pago parcial, adelanto, deshacer, renombrar, borrar', async () => {
    const { repo, A } = mk(); let S = await repo.load();
    assert.equal((await A.addCard(S, 'Visa')).ok, true); S = await repo.load();
    assert.equal((await A.addCard(S, 'visa')).ok, false);
    await A.setClosing('Visa', 25);
    await A.addTransaction(S, { ...base, amt: 90000, date: '2026-10-01', card: true, cardName: 'Visa', inst: 3 }); S = await repo.load();
    const i = 2026 * 12 + 10; // vence en noviembre
    let q = createActions(repo, () => TODAY).eng(S).stmtD('Visa', i); assert.equal(q.due, 30000);
    const info = A.payInfo(S, 'Visa', i); assert.equal(info.open, true);        // todavía no cerró (cierra el 25/10)
    assert.equal((await A.pay(S, 'Visa', i, 50000)).ok, false);
    assert.equal((await A.pay(S, 'Visa', i, 10000)).ok, true); S = await repo.load();
    assert.equal(A.eng(S).stmtN('Visa', i).due, 20000);                         // adelanto resta del total a pagar
    await A.undoPayment(S.pay[0].id); S = await repo.load(); assert.equal(S.pay.length, 0);
    assert.equal((await A.renameCard(S, 'Visa', 'Visa ICBC')).ok, true); S = await repo.load();
    assert.equal(S.tx[0].cardName, 'Visa ICBC'); assert.equal(S.cardInfo['Visa ICBC'].close, 25);
    await A.deleteCard('Visa ICBC'); S = await repo.load(); assert.equal(S.tx.length, 0);
  });
  await t('respaldo de la app anterior: se convierte, se valida y se restaura calculando igual que el original', async () => {
    const { repo } = mk(); const json = require('../supabase/tests/legacy-sample.json');
    const pb = parseBackup(JSON.stringify(json)); assert.equal(pb.origin, 'legacy'); assert.equal(pb.counts.movimientos, 6);
    await repo.replaceAll(pb.snapshot); const S = await repo.load();
    assert.equal(S.tx.length, 6); assert.equal(S.open, 150000);
    assert.equal(S.categories.sav.find(c => c.name === 'USD').foreignAmount, 120);
    assert.equal(createEngine(fromLegacy(json), { y: 2026, m: 9, d: 2 }).availFor(2026 * 12 + 9), createEngine(S, { y: 2026, m: 9, d: 2 }).availFor(2026 * 12 + 9));
  });
  await t('respaldo de Equa: exportar → borrar todo → restaurar deja la cuenta idéntica (fijos editados, ajustes, categorías eliminadas)', async () => {
    const { repo, A } = mk(); let S = await repo.load(); const oct = 2026 * 12 + 9;
    await A.addTransaction(S, { ...base, cat: 'Casa', note: 'Alquiler', amt: 100, date: '2026-08-05', fixed: true }); S = await repo.load();
    await A.editFixedMonth(S, S.tx.find(x => x.note === 'Alquiler'), oct, { ...base, cat: 'Casa', note: 'Alquiler', amt: 250, date: '2026-10-05', fixed: true }); S = await repo.load();
    await A.addTransaction(S, { ...base, cat: 'Comida', amt: 500, card: true, cardName: 'Visa', inst: 3 }); S = await repo.load();
    await A.setClosing('Visa', 25); await A.setClosingFor('Visa', oct, 28); S = await repo.load();
    await A.savMove(S, 'in', 'Acciones', 1000, '2026-10-01', ''); S = await repo.load(); await A.savAdjust(S, 'Acciones', 1300, '2026-10-02', 'sube'); S = await repo.load();
    await A.savTransfer(S, 'Acciones', 'Bonos', 200, '2026-10-02', ''); S = await repo.load();
    await A.removeCategory(S, 'out', 'Ocio'); S = await repo.load(); await A.setUsd(120); S = await repo.load();
    const file = await A.exportBackup(); const before = await repo.load();
    // se borra todo y se restaura desde el archivo
    await repo.replaceAll(emptySnapshot()); assert.equal((await repo.load()).tx.length, 0);
    const pb = parseBackup(file); assert.equal(pb.origin, 'equa'); assert.deepEqual({ ...pb.counts, tarjetas: 0 }, { ...countsOf(before), tarjetas: 0 });
    await repo.replaceAll(pb.snapshot); const after = await repo.load();
    const strip = x => JSON.parse(JSON.stringify(x, (k, v) => (v === null || (Array.isArray(v) && !v.length) ? undefined : v)));
    assert.deepEqual(strip(after.tx), strip(before.tx)); assert.deepEqual(strip(after.sav), strip(before.sav)); assert.deepEqual(after.paid, before.paid); assert.deepEqual(after.pay, before.pay);
    assert.deepEqual(after.cardInfo, before.cardInfo); assert.deepEqual([...after.cards].sort(), createEngine(before, { y: 2026, m: 9, d: 2 }).cardNames().sort(), 'las tarjetas usadas quedan registradas'); assert.equal(after.open, before.open);
    for (const k of ['out', 'in', 'sav']) assert.deepEqual(after.categories[k].map(c => [c.name, c.hidden, c.foreignAmount ?? null]), before.categories[k].map(c => [c.name, c.hidden, c.foreignAmount ?? null]));
    assert.equal(createEngine(after, { y: 2026, m: 9, d: 2 }).availFor(oct), createEngine(before, { y: 2026, m: 9, d: 2 }).availFor(oct));
    assert.ok(after.tx.some(x => x.of), 'el fijo editado sigue ligado a su serie');
  });
  await t('respaldo: archivos inválidos se rechazan con un mensaje claro (y no tocan nada)', async () => {
    const S = emptySnapshot();
    const ok = o => JSON.stringify({ app: 'equa', version: 2, snapshot: { ...S, ...o } });
    assert.throws(() => parseBackup('esto no es json'), /no se puede leer/);
    assert.throws(() => parseBackup('{"hola":1}'), /no es un respaldo de Equa/);
    assert.throws(() => parseBackup(JSON.stringify({ app: 'equa', version: 99, snapshot: S })), /versión más nueva/);
    assert.throws(() => parseBackup(JSON.stringify({ app: 'equa', version: 2 })), /incompleto/);
    assert.throws(() => parseBackup(ok({ tx: [{ id: 'a', type: 'out', amt: -5, cat: 'Comida', date: '2026-10-01' }] })), /monto inválido/);
    assert.throws(() => parseBackup(ok({ tx: [{ id: 'a', type: 'out', amt: 5, cat: 'Comida', date: '01/10/2026' }] })), /fecha inválida/);
    assert.throws(() => parseBackup(ok({ sav: [{ id: 'a', cat: 'Bonos', amt: -50, date: '2026-10-01' }] })), /negativo/);
    assert.throws(() => parseBackup(ok({ sav: [{ id: 'a', cat: 'Bonos', amt: 50, date: '2026-10-01', tid: 't' }] })), /transferencia/);
    assert.throws(() => parseBackup(ok({ tx: [{ id: 'a', type: 'out', amt: 5, cat: 'Comida', date: '2026-10-01' }, { id: 'a', type: 'out', amt: 5, cat: 'Comida', date: '2026-10-01' }] })), /repetido/);
    // lo que falta se completa: categorías usadas, tarjetas usadas, fijo editado sin su serie
    const pb = parseBackup(ok({ tx: [{ id: 'a', type: 'out', amt: 5, cat: 'Nueva', date: '2026-10-01', card: true, cardName: 'Mastercard', of: 'no-existe' }] }));
    assert.ok(pb.snapshot.categories.out.some(c => c.name === 'Nueva' && !c.hidden)); assert.deepEqual(pb.snapshot.cards, ['Mastercard']); assert.equal(pb.snapshot.tx[0].of, undefined);
  });
  await t('Balance mensual (neto) = ingresos − gastos − ahorro del mes, sin saldo anterior; saldo anterior + neto = saldo del mes siguiente', async () => {
    const { fullScenario } = require('./fixtures.cjs'); const S = await fullScenario(req), e = createEngine(S, { y: 2026, m: 9, d: 2 });
    for (const i of [2026 * 12 + 8, 2026 * 12 + 9, 2026 * 12 + 10]) {
      const b = e.monthBalance(i), m = e.all().filter(o => o.i === i);
      assert.equal(b.inc, e.sum(m, 'in')); assert.equal(b.out, e.sum(m, 'out') + e.advNet(i)); assert.equal(b.sv, e.svNet(i)); assert.equal(b.bal, b.inc - b.out - b.sv);
      assert.ok(Math.abs(e.carryIn(i + 1) - (e.carryIn(i) + b.bal)) < 0.01, 'saldo anterior + neto = saldo anterior del mes siguiente');
    }
    const oct = e.monthBalance(2026 * 12 + 9), nov = e.monthBalance(2026 * 12 + 10);
    assert.equal(oct.inc, 400000); assert.equal(nov.inc, 0, 'noviembre: el sueldo se salteó, y el balance no arrastra lo de octubre');
    assert.ok(e.carryIn(2026 * 12 + 10) !== 0 && nov.bal === nov.inc - nov.out - nov.sv);
  });
  await t('previsión: meses encadenados (atrás y adelante), simulación de compra, mes más pesado / de menor saldo y cuotas que terminan', async () => {
    const { buildRows, applySim, pressure, endingInstallments, nextYear, phaseOf } = req('src/domain/forecast.js');
    const { fullScenario } = require('./fixtures.cjs'); const S = await fullScenario(req), e = createEngine(S, { y: 2026, m: 9, d: 2 }), now = e.now;
    const rows = buildRows(e, now - 6, now + 12);
    assert.equal(rows.length, 19); assert.equal(rows[0].carry, e.carryIn(now - 6));
    rows.forEach((r, k) => { assert.equal(r.run, r.carry + r.bal); if (k) assert.equal(r.carry, rows[k - 1].run, 'cada mes parte del saldo al cierre del anterior'); });
    assert.deepEqual([phaseOf(now - 1, now), phaseOf(now, now), phaseOf(now + 1, now)], ['past', 'now', 'future']);
    // simulación: 1.200 en 3 cuotas desde el mes siguiente
    const sim = applySim(rows, { amt: 1200, n: 3, first: now + 1 });
    sim.forEach((r, k) => { const d = r.i <= now ? 0 : Math.min(r.i - now, 3) * 400; assert.ok(Math.abs(rows[k].run - r.run - d) < 0.01, 'el saldo baja de a una cuota por mes y queda 1.200 más bajo'); assert.equal(r.baseRun, rows[k].run); });
    assert.equal(applySim(rows, null), rows); assert.equal(sim.filter(r => r.add > 0).length, 3);
    // mes más pesado (peor balance mensual) y de menor saldo, solo entre los próximos 12 y solo si son negativos
    const big = applySim(rows, { amt: 120000000, n: 12, first: now + 2 }), p = pressure(big, now), ny = nextYear(big, now);
    assert.equal(ny.length, 12); assert.ok(ny.every(r => r.i > now));
    assert.equal(p.heavy.i, ny.reduce((a, r) => (r.bal < a.bal ? r : a)).i); assert.equal(p.low.i, ny.reduce((a, r) => (r.run < a.run ? r : a)).i);
    assert.equal(p.reds, ny.filter(r => r.run < 0).length); assert.ok(p.reds > 0);
    const calm = pressure(applySim(rows.map(r => ({ ...r, bal: 5, run: 5 })), null), now); assert.equal(calm.heavy, null); assert.equal(calm.low, null);
    // cuotas que terminan: 3 cuotas de 100 desde noviembre => la última es en enero y se liberan 100 por mes
    const { repo, A } = mk(); let S2 = await repo.load();
    await A.addCard(S2, 'Visa'); S2 = await repo.load();
    await A.addTransaction(S2, { ...base, amt: 300, card: true, cardName: 'Visa', inst: 3, date: '2026-10-02' }); S2 = await repo.load();
    const e2 = createEngine(S2, { y: 2026, m: 9, d: 2 }), en = endingInstallments(e2, e2.now);
    assert.deepEqual([en.i, en.count, en.freed], [2027 * 12, 1, 100]); assert.equal(endingInstallments(createEngine(await mk().repo.load(), { y: 2026, m: 9, d: 2 }), e2.now), null);
  });
  await t('previsión: avisa los meses en que un depósito programado deja (o agranda) el negativo', async () => {
    const { buildRows, savingAlertFor, savingAlerts } = req('src/domain/forecast.js');
    const { repo, A } = mk(); let S = await repo.load();
    await A.addTransaction(S, { ...base, type: 'in', amt: 1000, cat: 'Sueldo', date: '2026-10-02' }); S = await repo.load();
    const now = 2026 * 12 + 9, nov = now + 1;
    let e = createEngine(S, { y: 2026, m: 9, d: 2 }), rows = buildRows(e, now, now + 3);
    assert.deepEqual(savingAlerts(e, rows), [], 'sin ahorro programado no hay avisos');
    await A.savMove(S, 'in', 'Acciones', 1500, '2026-11-20', ''); S = await repo.load();
    e = createEngine(S, { y: 2026, m: 9, d: 2 }); rows = buildRows(e, now, now + 3);
    const al = savingAlerts(e, rows); assert.equal(al.length, 1); assert.equal(al[0].i, nov); assert.equal(al[0].amt, 1500); assert.equal(al[0].first, '2026-11-20');
    assert.equal(al[0].run, rows[1].run); assert.equal(al[0].without, rows[1].run + 1500); assert.equal(al[0].deepens, false, 'sin el depósito el mes cerraba en positivo');
    assert.equal(savingAlertFor(e, now, rows[0].run), null, 'octubre queda en positivo: sin aviso');
    // aun sin el depósito ya estaba en negativo
    await A.addTransaction(S, { ...base, amt: 5000, date: '2026-11-03' }); S = await repo.load();
    e = createEngine(S, { y: 2026, m: 9, d: 2 }); rows = buildRows(e, now, now + 3);
    assert.equal(savingAlerts(e, rows)[0].deepens, true);
    // el mes ya llegó: con "hoy" en noviembre 25 el depósito dejó de ser programado y no avisa
    const later = createEngine(S, { y: 2026, m: 10, d: 25 }); assert.equal(savingAlertFor(later, nov, -999), null);
  });
  await t('aspecto de las tarjetas: color por orden, siguiente color libre al agregar, edición validada y guardada', async () => {
    const { lookOf, nextFreeColor, CARD_COLORS } = req('src/domain/cardLook.js');
    const { repo, A } = mk(); let S = await repo.load();
    for (const n of ['Visa', 'Master', 'Amex']) { assert.equal((await A.addCard(S, n)).ok, true); S = await repo.load(); }
    const names = ['Visa', 'Master', 'Amex'];
    assert.deepEqual(names.map(n => S.cardInfo[n].color), ['teal', 'azul', 'violeta'], 'cada tarjeta nueva toma el próximo color libre');
    assert.equal(lookOf(S.cardInfo, names, 'Amex').style, 'liso');
    assert.equal(lookOf({}, names, 'Master').color, 'azul', 'sin nada guardado: color por orden de aparición');
    assert.equal(nextFreeColor({ cardInfo: Object.fromEntries(CARD_COLORS.slice(0, 7).map((c, i) => ['t' + i, { color: c }])) }, CARD_COLORS.slice(0, 7).map((_, i) => 't' + i)), 'ciruela');
    assert.equal((await A.setCardLook('Visa', { color: 'rosa' })).ok, false);
    assert.equal((await A.setCardLook('Visa', { style: 'neon' })).ok, false);
    assert.equal((await A.setCardLook('Visa', { last4: '12a4' })).ok, false);
    assert.equal((await A.setCardLook('Visa', { color: 'bordo', style: 'fisica', last4: '4521' })).ok, true); S = await repo.load();
    assert.deepEqual([S.cardInfo.Visa.color, S.cardInfo.Visa.style, S.cardInfo.Visa.last4], ['bordo', 'fisica', '4521']);
    assert.equal((await A.setCardLook('Visa', { last4: '' })).ok, true); S = await repo.load(); assert.equal(S.cardInfo.Visa.last4, undefined, 'vaciar los números los quita');
    assert.equal((await A.renameCard(S, 'Visa', 'Visa Nueva')).ok, true); S = await repo.load();
    assert.equal(S.cardInfo['Visa Nueva'].color, 'bordo', 'renombrar conserva el aspecto');
    const { buildBackup } = req('src/domain/backup.js'), back = parseBackup(buildBackup(S));
    assert.deepEqual([back.snapshot.cardInfo['Visa Nueva'].color, back.snapshot.cardInfo['Visa Nueva'].style, back.snapshot.cardInfo.Master.color], ['bordo', 'fisica', 'azul'], 'el respaldo guarda y recupera el aspecto');
    const dirty = JSON.parse(buildBackup(S)); dirty.snapshot.cardInfo.Master.color = 'rosa'; dirty.snapshot.cardInfo.Master.last4 = 'abcd';
    const clean = parseBackup(JSON.stringify(dirty)).snapshot.cardInfo.Master || {}; assert.equal(clean.color, undefined); assert.equal(clean.last4, undefined);
  });
  console.log(`\n${n} pruebas OK`);
})().catch(e => { console.error('✗', e); process.exit(1); });
