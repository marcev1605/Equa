#!/usr/bin/env node
// node tools/run-all.cjs   → corre TODAS las pruebas que no necesitan instalar dependencias del proyecto.
// Usa solo: node, TypeScript, esbuild, Playwright+Chromium y psql (los que falten se omiten y se informa).
// Rutas por variables de entorno si no están en el PATH/node_modules: TS_PATH, ESBUILD_PATH, NODE_PATH_REACT, PLAYWRIGHT_PATH, CHROMIUM_PATH, PGHOST/PGPORT/PGUSER.
const cp = require('child_process'), path = require('path'), fs = require('fs');
const root = path.resolve(__dirname, '..'), env = { ...process.env };
const has = m => { try { require.resolve(m, { paths: [root, ...(process.env.NODE_PATH || '').split(':')] }); return true; } catch { return false; } };
const exists = p => !!p && fs.existsSync(p);
const tsPath = env.TS_PATH || (has('typescript') ? 'typescript' : '');
const tsc = tsPath && (tsPath === 'typescript' ? require.resolve('typescript/bin/tsc', { paths: [root] }) : path.join(tsPath, 'bin/tsc'));
const hasPsql = !cp.spawnSync('psql', ['--version']).error;
const hasPw = !!env.PLAYWRIGHT_PATH || has('playwright'), hasEs = !!env.ESBUILD_PATH || has('esbuild');

const steps = [
  ['Chequeo de tipos estricto (src/ + app/, con tipos mínimos de stub)', !tsc, () => [process.execPath, [tsc, '-p', 'tools/typecheck/tsconfig.json']]],
  ['Reglas de negocio (altas, fijos, pagos, ahorro, respaldo)', !tsPath, () => [process.execPath, ['tools/test-actions.cjs']]],
  ['SupabaseRepository (cliente falso) equivale a LocalRepository', !tsPath, () => [process.execPath, ['tools/test-supabase-repo.cjs']]],
  ['Motor TypeScript vs. app HTML original (Chromium)', !(tsPath && hasPw), () => [process.execPath, ['tools/diff-vs-legacy.cjs']]],
  ['Estadísticas: comparaciones, ritmo, fijos vs. variables y tarjetas', !tsPath, () => [process.execPath, ['tools/test-stats.cjs']]],
  ['Reportes: PDF y Excel generados y abiertos con herramientas externas', !tsPath, () => [process.execPath, ['tools/test-reports.cjs']]],
  ['Esquema Postgres: tablas, RLS, triggers, restore_backup (psql)', !hasPsql, () => ['bash', ['supabase/tests/run.sh']]],
  ['Restaurar respaldo: ida y vuelta contra Postgres real (psql)', !(tsPath && hasPsql), () => [process.execPath, ['tools/test-restore-roundtrip.cjs']]],
  ['Pantallas reales + flujos de punta a punta (esbuild + Chromium)', !(tsPath && hasPw && hasEs), () => [process.execPath, ['tools/ui-flows.cjs']]],
];
let failed = 0, skipped = 0;
for (const [name, skip, cmd] of steps) {
  process.stdout.write(`\n▶ ${name}\n`);
  if (skip) { console.log('  ⏭  omitido (falta una herramienta; ver variables de entorno en el encabezado)'); skipped++; continue; }
  const [bin, args] = cmd(), t0 = Date.now();
  const r = cp.spawnSync(bin, args, { cwd: root, env: { ...env, TS_PATH: tsPath }, encoding: 'utf8' });
  const out = (r.stdout || '') + (r.stderr || '');
  const tail = out.trim().split('\n').slice(-4).join('\n').replace(/^/gm, '    ');
  if (r.status === 0) console.log(`  ✅ OK (${((Date.now() - t0) / 1000).toFixed(1)}s)\n${tail}`);
  else { failed++; console.log(`  ❌ FALLÓ\n${out.trim().split('\n').slice(-25).join('\n').replace(/^/gm, '    ')}`); }
}
console.log(`\n${failed ? '❌ ' + failed + ' con fallas' : '✅ Todo OK'}${skipped ? ` · ${skipped} omitidas` : ''}`);
process.exit(failed ? 1 : 0);
