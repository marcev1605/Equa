// Transpila src/**/*.ts (sin React) a /tmp y devuelve require() de los módulos. Solo para pruebas de dominio.
const ts = require(process.env.TS_PATH || 'typescript'), fs = require('fs'), path = require('path'), os = require('os');
module.exports = function load(dirs = ['src/domain', 'src/lib', 'src/data', 'src/services', 'src/export']) {
  const root = path.resolve(__dirname, '..'), out = fs.mkdtempSync(path.join(os.tmpdir(), 'equa-'));
  for (const d of dirs) {
    fs.mkdirSync(path.join(out, d), { recursive: true });
    for (const f of fs.readdirSync(path.join(root, d)).filter(f => f.endsWith('.ts') && !f.endsWith('.d.ts'))) {
      const r = ts.transpileModule(fs.readFileSync(path.join(root, d, f), 'utf8'), { compilerOptions: { module: 'commonjs', target: 'es2020' } });
      fs.writeFileSync(path.join(out, d, f.replace(/\.ts$/, '.js')), r.outputText);
    }
  }
  return rel => require(path.join(out, rel));
};
