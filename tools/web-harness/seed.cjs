// Genera un Snapshot de ejemplo (para el arnés) a partir del respaldo de prueba.
const req = require('../ts-run.cjs')(['src/domain']);
const { fromLegacy } = req('src/domain/legacy.js');
const raw = require('../../supabase/tests/legacy-sample.json');
module.exports = JSON.stringify(fromLegacy(raw));
if (require.main === module) process.stdout.write(module.exports);
