// Datos de prueba para restaurar respaldos: node tools/fixtures.cjs <carpeta>  → legacy.snapshot.json y full.snapshot.json
// legacy.snapshot.json: el respaldo de la app anterior (supabase/tests/legacy-sample.json) ya convertido y validado.
// full.snapshot.json: una cuenta con TODO (fijo + mes editado, cuotas con tarjeta, cierres, pagos, cobrados, repeticiones, ahorro con
// transferencia y ajustes, categorías eliminadas, dólares): sirve para la prueba de ida y vuelta contra Postgres.
const fs = require('fs'), path = require('path');
const TODAY = new Date(2026, 9, 2, 12);

async function fullScenario(req) {
  const { createActions } = req('src/services/actions.js'), { LocalRepository } = req('src/data/localRepository.js');
  const repo = new LocalRepository(), A = createActions(repo, () => TODAY), oct = 2026 * 12 + 9;
  const base = { type: 'out', amt: 1000, cat: 'Comida', note: '', date: '2026-10-02', card: false, cardName: '', fixed: false, inst: 1 };
  let S = await repo.load();
  await repo.setOpeningBalance(150000);
  await A.addTransaction(S, { ...base, type: 'in', cat: 'Sueldo', note: 'Sueldo', amt: 400000, date: '2026-08-01', fixed: true }); S = await repo.load();
  await A.addTransaction(S, { ...base, cat: 'Casa', note: 'Alquiler', amt: 100000, date: '2026-08-05', fixed: true }); S = await repo.load();
  await A.editFixedMonth(S, S.tx.find(x => x.note === 'Alquiler'), oct, { ...base, cat: 'Casa', note: 'Alquiler', amt: 125000, date: '2026-10-05', fixed: true }); S = await repo.load();
  await A.deleteFixedMonth(S.tx.find(x => x.note === 'Sueldo'), oct + 1); S = await repo.load();      // mes salteado
  await A.addCard(S, 'Visa ICBC'); S = await repo.load();
  await A.addTransaction(S, { ...base, cat: 'Compras', note: 'TV', amt: 90000, card: true, cardName: 'Visa ICBC', inst: 3 }); S = await repo.load();
  await A.addTransaction(S, { ...base, cat: 'Ocio', note: 'Cine', amt: 3000, repeat: { mode: 'm', times: 3 } }); S = await repo.load();
  await A.setClosing('Visa ICBC', 25); await A.setClosingFor('Visa ICBC', oct, 28); await A.setCardLook('Visa ICBC', { color: 'violeta', style: 'fisica', last4: '4521' }); S = await repo.load();
  await A.pay(S, 'Visa ICBC', oct + 1, 10000); S = await repo.load();
  const al = S.tx.find(x => x.note === 'Alquiler' && x.fixed); await A.setPaid(al.id, oct - 1, true); S = await repo.load();
  await A.savMove(S, 'in', 'Acciones', 50000, '2026-09-15', 'aporte'); S = await repo.load();
  await A.savAdjust(S, 'Acciones', 56000, '2026-09-30', 'sube'); S = await repo.load();
  await A.savTransfer(S, 'Acciones', 'Bonos', 6000, '2026-10-01', ''); S = await repo.load();
  await A.addCategory(S, 'out', 'Educación'); S = await repo.load(); await A.removeCategory(S, 'out', 'Educación'); S = await repo.load();
  await A.removeCategory(S, 'in', 'Extra'); S = await repo.load(); await A.setUsd(120); S = await repo.load();
  return S;
}
module.exports = { TODAY, fullScenario };

if (require.main === module) {
  (async () => {
    const out = process.argv[2]; if (!out) { console.error('uso: node tools/fixtures.cjs <carpeta>'); process.exit(2); }
    const req = require('./ts-run.cjs')(), { parseBackup } = req('src/domain/backup.js');
    fs.mkdirSync(out, { recursive: true });
    const legacy = fs.readFileSync(path.join(__dirname, '../supabase/tests/legacy-sample.json'), 'utf8');
    fs.writeFileSync(path.join(out, 'legacy.snapshot.json'), JSON.stringify(parseBackup(legacy).snapshot));
    fs.writeFileSync(path.join(out, 'full.snapshot.json'), JSON.stringify(parseBackup(JSON.stringify({ app: 'equa', version: 2, snapshot: await fullScenario(req) })).snapshot));
  })().catch(e => { console.error(e); process.exit(1); });
}
