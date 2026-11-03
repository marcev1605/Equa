// node tools/test-reports.cjs   → genera los 7 reportes en PDF y Excel con datos reales de prueba y los valida con herramientas externas
// (openpyxl lee el .xlsx, LibreOffice lo abre, qpdf/pdfinfo/pdftotext revisan el PDF). Lo que falte se omite y se informa.
const assert = require('node:assert/strict'), cp = require('child_process'), fs = require('fs'), os = require('os'), path = require('path');
const req = require('./ts-run.cjs')();
const { createEngine } = req('src/domain/engine.js');
const { REPORTS, buildReport, periodLabel, fileName } = req('src/domain/reports.js');
const { toXlsx } = req('src/export/xlsx.js'), { toPdf } = req('src/export/pdf.js');
const { colSum } = req('src/export/model.js');
const { fullScenario } = require('./fixtures.cjs');
const have = c => !cp.spawnSync('which', [c]).error && cp.spawnSync('which', [c]).status === 0;
const run = (bin, args, opt = {}) => cp.spawnSync(bin, args, { encoding: 'utf8', timeout: 120000, ...opt });
let n = 0; const t = async (name, fn) => { await fn(); n++; console.log('  ✓', name); };

(async () => {
  const S = await fullScenario(req), e = createEngine(S, { y: 2026, m: 9, d: 2 }), now = e.now, NOW = new Date(2026, 9, 2, 12);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'equa-rep-'));
  const per = { mes: { from: now, to: now }, per: { from: now - 5, to: now }, cat: { from: now - 2, to: now }, tar: { from: now - 2, to: now + 3 }, aho: { from: now - 2, to: now }, pre: { from: now + 1, to: now + 12 }, mov: { from: now - 2, to: now + 2 } };
  const R = {}; for (const d of REPORTS) R[d.id] = buildReport(e, d.id, per[d.id], NOW);

  await t('cada reporte trae las hojas que anuncia el catálogo y todas las filas tienen una celda por columna', async () => {
    for (const d of REPORTS) {
      assert.deepEqual(R[d.id].sheets.map(s => s.name), d.sheets, d.id);
      for (const s of R[d.id].sheets) { assert.ok(s.rows.every(r => r.length === s.cols.length), d.id + '/' + s.name); if (s.totals) assert.equal(s.totals.length, s.cols.length); }
    }
  });
  await t('Resumen del mes: ingresos, gastos y saldo coinciden con la Previsión; las categorías suman el total', async () => {
    const r = R.mes, b = e.monthBalance(now), res = r.sheets[0].rows;
    assert.equal(res[1][1], Math.round(b.inc * 100) / 100); assert.equal(res[2][1], Math.round(b.out * 100) / 100);
    assert.ok(Math.abs(colSum(r.sheets[1].rows, 1) - b.out) < 0.01, 'gastos por categoría suman el gasto del mes');
    assert.ok(Math.abs(colSum(r.sheets[2].rows, 1) - b.inc) < 0.01);
    assert.ok(Math.abs(res[5][1] - (e.carryIn(now) + b.bal)) < 0.01, 'saldo al cierre = saldo anterior + neto');
  });
  await t('Mes a mes: cada mes parte del cierre del anterior y los totales suman', async () => {
    const s = R.per.sheets[0]; assert.equal(s.rows.length, 6);
    s.rows.forEach((x, k) => { if (k) assert.equal(x[1], s.rows[k - 1][6]); assert.ok(Math.abs(x[1] + x[5] - x[6]) < 0.02); });
    assert.ok(Math.abs(colSum(s.rows, 5) - (s.rows[5][6] - s.rows[0][1])) < 0.05, 'el neto total es la diferencia de saldo');
    assert.equal(s.chart.values.length, 6);
  });
  await t('Categorías: porcentajes suman 100 % y compara con el período anterior de igual duración', async () => {
    const g = R.cat.sheets[0]; assert.ok(Math.abs(colSum(g.rows, 2) - 1) < 1e-9);
    const prev = buildReport(e, 'cat', { from: per.cat.from - 3, to: per.cat.to - 3 }, NOW).sheets[0];
    assert.ok(Math.abs(colSum(g.rows, 3) - colSum(prev.rows, 1)) < 0.02, 'la columna "Período anterior" es el total del período previo');
  });
  await t('Tarjetas: cuotas pendientes (TV en 3 cuotas) y pagos del período', async () => {
    const q = R.tar.sheets[1]; assert.ok(q.rows.some(r => r[1] === 'TV' && r[3] === 3 && r[2] === 30000));
    assert.equal(R.tar.sheets[2].rows.length, 1); assert.equal(R.tar.sheets[2].rows[0][4], 10000);
  });
  await t('Ahorros: valor, aportado y ganancia por categoría; movimientos solo del período', async () => {
    const s = R.aho.sheets[0], acc = s.rows.find(r => r[0] === 'Acciones');
    assert.ok(acc && acc[3] === 6000 + 0 || acc[3] > 0, 'Acciones tiene ganancia por el ajuste'); assert.ok(Math.abs(s.rows.reduce((a, r) => a + r[1], 0) - colSum(s.rows, 1)) < 1e-6);
    assert.ok(R.aho.sheets[1].rows.length >= 3 && R.aho.sheets[1].rows.every(r => r[0] >= '2026-08-01'));
  });
  await t('Previsión: 12 meses desde el siguiente y los meses en rojo salen de los saldos', async () => {
    const s = R.pre.sheets[0]; assert.equal(s.rows.length, 12);
    assert.equal(R.pre.sheets[1].rows.length, s.rows.filter(r => r[6] < 0).length);
  });
  await t('Movimientos: una fila por ocurrencia del período, monto positivo con su tipo, cuotas como k/n', async () => {
    const s = R.mov.sheets[0], tv = s.rows.filter(r => r[4] === 'TV'); assert.ok(tv.length >= 1 && tv.every(r => /^\d\/3$/.test(r[6]) && r[8] === 30000));
    assert.equal(s.rows.length, e.all().filter(o => o.i >= per.mov.from && o.i <= per.mov.to).length);
  });
  await t('nombre de archivo y período legibles', async () => {
    assert.equal(periodLabel({ from: now, to: now }), 'Octubre 2026'); assert.equal(periodLabel({ from: now - 5, to: now }), 'Mayo a Octubre 2026'); assert.equal(periodLabel({ from: now - 11, to: now }), 'Noviembre 2025 a Octubre 2026');
    assert.equal(fileName('mes', { from: now, to: now }, 'pdf'), 'Equa - Resumen del mes - Octubre 2026.pdf');
    assert.equal(fileName('tar', { from: now - 5, to: now }, 'xlsx'), 'Equa - Tarjetas de credito - Mayo a Octubre 2026.xlsx', 'sin tildes'); assert.equal(fileName('cat', { from: now, to: now }, 'pdf'), 'Equa - Ingresos y gastos por categoria - Octubre 2026.pdf');
  });

  const ext = { xl: have('python3') && !run('python3', ['-c', 'import openpyxl']).status, so: have('soffice'), qpdf: have('qpdf'), pi: have('pdfinfo'), pt: have('pdftotext') };
  console.log('  herramientas externas:', JSON.stringify(ext));
  for (const d of REPORTS) {
    const base = path.join(tmp, d.id);
    if (d.formats.includes('xlsx')) {
      fs.writeFileSync(base + '.xlsx', toXlsx(R[d.id]));
      assert.equal(fs.readFileSync(base + '.xlsx').subarray(0, 2).toString(), 'PK');
      if (ext.xl) await t(`Excel «${d.title}»: openpyxl lo lee; hojas, encabezados, fórmulas de total y valores coinciden`, async () => {
        const py = `import openpyxl,json,sys
f=sys.argv[1];wf=openpyxl.load_workbook(f);wv=openpyxl.load_workbook(f,data_only=True)
out=[]
for ws in wf.worksheets:
    v=wv[ws.title];out.append({'n':ws.title,'rows':[[c.value for c in r] for r in v.iter_rows()],'f':[[c.value for c in r] for r in ws.iter_rows()],'freeze':ws.freeze_panes})
print(json.dumps(out,default=str))`;
        const r = run('python3', ['-c', py, base + '.xlsx']); assert.equal(r.status, 0, r.stderr);
        const sheets = JSON.parse(r.stdout); assert.deepEqual(sheets.map(s => s.n), d.sheets);
        sheets.forEach((s, k) => {
          const m = R[d.id].sheets[k]; assert.equal(s.rows[0][0], `${R[d.id].title} · ${R[d.id].period}`); assert.deepEqual(s.rows[2].slice(0, m.cols.length), m.cols.map(c => c.label)); assert.equal(s.freeze, 'A4');
          m.rows.forEach((row, i) => row.forEach((c, j) => { const got = s.rows[3 + i][j]; if (c === null || c === '') assert.ok(got === null || got === ''); else if (m.cols[j].type === 'date') assert.equal(String(got).slice(0, 10), c); else assert.equal(got, c, `${d.id}/${m.name} fila ${i} col ${j}`); }));
          if (m.totals) m.totals.forEach((tt, j) => { const fv = s.f[3 + m.rows.length][j]; if (tt === 'sum' && m.rows.length) assert.match(String(fv), /^=SUM\([A-Z]+4:[A-Z]+\d+\)$/); });
        });
      });
      if (ext.so) await t(`Excel «${d.title}»: LibreOffice lo abre y lo convierte sin errores`, async () => {
        const r = run('soffice', ['--headless', '--convert-to', 'pdf', '--outdir', path.join(tmp, 'lo'), base + '.xlsx'], { env: { ...process.env, HOME: tmp } });
        assert.equal(r.status, 0, r.stderr); assert.ok(fs.existsSync(path.join(tmp, 'lo', d.id + '.pdf')));
      });
    }
    if (d.formats.includes('pdf')) {
      fs.writeFileSync(base + '.pdf', toPdf(R[d.id]));
      if (ext.qpdf) await t(`PDF «${d.title}»: estructura válida (qpdf --check)`, async () => { const r = run('qpdf', ['--check', base + '.pdf']); assert.equal(r.status, 0, r.stdout + r.stderr); });
      if (ext.pt) await t(`PDF «${d.title}»: el texto trae título, período, datos clave y pie de página`, async () => {
        const txt = run('pdftotext', ['-layout', base + '.pdf', '-']).stdout.replace(/\s+/g, ' ');
        assert.ok(txt.includes(R[d.id].title) && txt.includes(R[d.id].period) && /Página 1 de \d+/.test(txt), d.id);
        R[d.id].kpis.forEach(k => assert.ok(txt.includes(k.value.replace('−', '-')), 'KPI ' + k.label + ' = ' + k.value));
        const first = R[d.id].sheets.find(s => s.rows.length), cell = first.rows[0][0]; assert.ok(txt.includes(String(cell).slice(0, 12)), 'primera fila: ' + cell);
      });
    }
  }
  // paginación: un reporte largo ocupa varias hojas y repite el encabezado
  const big = { ...R.mov, sheets: [{ ...R.mov.sheets[0], rows: Array.from({ length: 260 }, (_, i) => ['Octubre 2026', '2026-10-02', 'Gasto', 'Comida', 'Compra ' + i, 'Efectivo', '', '', 1000 + i]) }] };
  fs.writeFileSync(path.join(tmp, 'big.pdf'), toPdf(big));
  if (ext.pi && ext.pt) await t('PDF largo: varias páginas, numeradas, con el encabezado de la tabla en cada una', async () => {
    const pages = +/Pages:\s+(\d+)/.exec(run('pdfinfo', [path.join(tmp, 'big.pdf')]).stdout)[1]; assert.ok(pages >= 6, 'páginas ' + pages);
    const txt = run('pdftotext', ['-layout', path.join(tmp, 'big.pdf'), '-']).stdout;
    assert.equal((txt.match(/Categor[ií]a/g) || []).length, pages, 'encabezado en cada página'); assert.ok(txt.includes(`Página ${pages} de ${pages}`)); assert.ok(txt.includes('Compra 259'));
  });
  await t('caracteres especiales: acentos, ñ y signos fuera del alfabeto Latin-1 no rompen ni el PDF ni el Excel', async () => {
    const odd = { ...R.mes, title: 'Educación – ñandú “prueba” … → 5 € ≠ x', sheets: [{ name: 'A/B:C*?[x]'.repeat(5), cols: [{ label: 'Año', type: 'text' }, { label: 'Monto', type: 'money' }], rows: [['Línea <1> & "2"', -1234.5]], totals: ['Total', 'sum'] }] };
    fs.writeFileSync(path.join(tmp, 'odd.pdf'), toPdf(odd)); fs.writeFileSync(path.join(tmp, 'odd.xlsx'), toXlsx(odd));
    if (ext.qpdf) assert.equal(run('qpdf', ['--check', path.join(tmp, 'odd.pdf')]).status, 0);
    if (ext.xl) { const r = run('python3', ['-c', 'import openpyxl,sys;wb=openpyxl.load_workbook(sys.argv[1]);ws=wb.worksheets[0];print(len(ws.title),ws["A4"].value)', path.join(tmp, 'odd.xlsx')]); assert.equal(r.status, 0, r.stderr); assert.match(r.stdout, /^31 Línea <1> & "2"/); }
  });
  console.log(`  ${n} pruebas OK`);
  fs.rmSync(tmp, { recursive: true, force: true });
})().catch(e => { console.error(e); process.exit(1); });
