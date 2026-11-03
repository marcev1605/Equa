// node tools/test-restore-roundtrip.cjs  (necesita psql + PGHOST/PGPORT/PGUSER)
// Ida y vuelta REAL: una cuenta completa (LocalRepository) → buildBackup → parseBackup → restore_backup() en Postgres →
// se leen las tablas como el usuario (RLS) → SupabaseRepository.load() → debe ser igual al original (ids normalizados).
// También: restaurar dos veces, restaurar en otra cuenta sin mezclar, y que lo restaurado funcione con el motor.
const assert = require('node:assert/strict'), cp = require('child_process'), fs = require('fs'), path = require('path');
const req = require('./ts-run.cjs')();
const createFake = require('./fake-supabase.cjs');
const { fullScenario, TODAY } = require('./fixtures.cjs');
const { buildBackup, parseBackup } = req('src/domain/backup.js');
const { SupabaseRepository } = req('src/data/supabaseRepository.js');
const { createEngine } = req('src/domain/engine.js');
const root = path.resolve(__dirname, '..'), DB = 'equa_rt', U1 = '33333333-3333-3333-3333-333333333333', U2 = '44444444-4444-4444-4444-444444444444';
const sh = (args, input) => { const r = cp.spawnSync('psql', ['-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1', ...args], { input, encoding: 'utf8' }); if (r.status) throw new Error(r.stderr || 'psql falló'); return r.stdout; };
const q = (sql, uid) => sh(['-d', DB], `${uid ? `set role authenticated; set request.jwt.claim.sub='${uid}';` : ''}${sql}`);
let n = 0; const t = async (name, fn) => { await fn(); n++; console.log('  ✓', name); };

function prepare() {
  sh(['-d', 'postgres', '-c', `drop database if exists ${DB}`, '-c', `create database ${DB} encoding 'UTF8' template template0`]);
  const mig = fs.readdirSync(path.join(root, 'supabase/migrations')).filter(f => f.endsWith('.sql')).sort();
  sh(['-d', DB, '-f', path.join(root, 'supabase/tests/00_bootstrap_stub.sql')]);
  mig.forEach(f => sh(['-d', DB, '-f', path.join(root, 'supabase/migrations', f)]));
  [U1, U2].forEach(u => q(`insert into auth.users(id,email) values ('${u}','${u.slice(0, 4)}@x.com') on conflict do nothing;`));
}
const restore = (uid, snap) => JSON.parse(q(`select public.restore_backup($j$${JSON.stringify(snap)}$j$::jsonb);`, uid).split('\n').filter(l => l.startsWith('{')).pop());
const TABLES = ['categories', 'credit_cards', 'card_closing_overrides', 'transactions', 'transaction_skips', 'transaction_settlements', 'card_payments', 'savings_movements'];
async function loadFromDb(uid) {
  const fake = createFake(uid);
  fake.T.profiles = JSON.parse(q(`select coalesce(json_agg(p),'[]') from public.profiles p;`, uid));
  TABLES.forEach(tb => (fake.T[tb] = JSON.parse(q(`select coalesce(json_agg(x),'[]') from public.${tb} x;`, uid).trim())));
  return new SupabaseRepository(fake, uid).load();
}
// ids distintos entre origen y destino: se reemplazan por posición estable
function canon(S) {
  const key = x => [x.date, x.type, x.cat, x.note, x.amt, x.cardName, x.card, x.fixed, x.inst].join('|');
  const tx = [...S.tx].sort((a, b) => key(a).localeCompare(key(b)) || (a.of ? 1 : 0) - (b.of ? 1 : 0));
  const id = new Map(tx.map((x, i) => [x.id, 'T' + i])), grp = new Map();
  const sav = [...S.sav].sort((a, b) => (a.date + a.cat + a.amt).localeCompare(b.date + b.cat + b.amt)), tid = new Map();
  const cats = k => S.categories[k].map(c => ({ name: c.name, hidden: !!c.hidden, foreignAmount: c.foreignAmount ?? null })).sort((a, b) => a.name.localeCompare(b.name));
  return {
    open: S.open, cards: [...S.cards].sort(),
    cardInfo: Object.fromEntries(Object.entries(S.cardInfo).sort().map(([k, v]) => [k, { close: v.close ?? null, color: v.color ?? null, style: v.style ?? null, last4: v.last4 ?? null, months: v.months || {} }])),
    tx: tx.map(x => ({ ...x, id: id.get(x.id), of: x.of ? id.get(x.of) : null, g: x.g ? (grp.has(x.g) ? grp : grp.set(x.g, 'G' + grp.size)).get(x.g) : null, rep: x.rep || null, end: x.end ?? null, skip: [...(x.skip || [])].sort() })),
    sav: sav.map(x => ({ cat: x.cat, amt: x.amt, date: x.date, note: x.note, adj: !!x.adj, tid: x.tid ? (tid.has(x.tid) ? tid : tid.set(x.tid, 'X' + tid.size)).get(x.tid) : null })),
    pay: [...S.pay].map(p => ({ card: p.card, i: p.i, amt: p.amt, date: p.date })).sort((a, b) => a.i - b.i),
    paid: Object.keys(S.paid).map(k => { const [a, m] = k.split(':'); return id.get(a) + ':' + m; }).sort(),
    categories: { out: cats('out'), in: cats('in'), sav: cats('sav') },
  };
}

(async () => {
  prepare();
  const orig = await fullScenario(req);
  const backup = buildBackup(orig, new Date(2026, 9, 2)), parsed = parseBackup(backup);
  await t('el respaldo se lee y se validó sin cambiar nada', () => assert.deepEqual(canon(parsed.snapshot), canon(orig)));
  let counts;
  await t('restore_backup informa lo restaurado', () => {
    counts = restore(U1, parsed.snapshot);
    assert.equal(counts.transactions, orig.tx.length); assert.equal(counts.savings_movements, orig.sav.length); assert.equal(counts.cards, orig.cards.length);
  });
  await t('lo leído de Postgres es igual a la cuenta original', async () => assert.deepEqual(canon(await loadFromDb(U1)), canon(orig)));
  await t('el motor da los mismos números antes y después', async () => {
    const back = await loadFromDb(U1), a = createEngine(orig, { y: 2026, m: 9, d: 2 }), b = createEngine(back, { y: 2026, m: 9, d: 2 });
    for (const i of [2026 * 12 + 8, 2026 * 12 + 9, 2026 * 12 + 10, 2026 * 12 + 11]) {
      assert.equal(JSON.stringify(a.availFor(i)), JSON.stringify(b.availFor(i)), 'disponible mes ' + i);
    }
    orig.categories.sav.forEach(c => assert.deepEqual(a.svReturn(c.name), b.svReturn(c.name), 'ahorro ' + c.name));
  });
  await t('restaurar dos veces deja lo mismo (no duplica)', async () => { restore(U1, parsed.snapshot); assert.deepEqual(canon(await loadFromDb(U1)), canon(orig)); });
  await t('restaurar en otra cuenta no toca la primera', async () => {
    restore(U2, parseBackup(fs.readFileSync(path.join(root, 'supabase/tests/legacy-sample.json'), 'utf8')).snapshot);
    assert.equal((await loadFromDb(U2)).tx.length, 6);
    assert.deepEqual(canon(await loadFromDb(U1)), canon(orig));
  });
  await t('un respaldo roto no deja la cuenta a medias', async () => {
    const broken = JSON.parse(JSON.stringify(parsed.snapshot)); broken.tx[0].cat = null;
    assert.throws(() => restore(U1, broken));
    assert.deepEqual(canon(await loadFromDb(U1)), canon(orig));
  });
  console.log(`${n} pruebas de ida y vuelta OK`);
})().catch(e => { console.error(e); process.exit(1); });
