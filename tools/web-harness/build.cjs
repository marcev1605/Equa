// node tools/web-harness/build.cjs  → tools/web-harness/dist/{index.html,app.js}
// Compila la app real (app/ + src/) con esbuild, sustituyendo react-native/expo por shims DOM. Solo para pruebas.
const path = require('path'), fs = require('fs');
const esbuild = require(process.env.ESBUILD_PATH || 'esbuild');
const here = __dirname, S = f => path.join(here, 'shims', f);
const dist = path.join(here, 'dist'); fs.mkdirSync(dist, { recursive: true });
esbuild.buildSync({
  entryPoints: [path.join(here, 'entry.tsx')], bundle: true, resolveExtensions: ['.web.tsx', '.web.ts', '.tsx', '.ts', '.jsx', '.js', '.json'], outfile: path.join(dist, 'app.js'), format: 'iife', jsx: 'automatic', target: 'es2020', charset: 'ascii',
  nodePaths: [process.env.NODE_PATH_REACT || '/opt/npm-tools/node_modules'],
  alias: {
    'react-native': S('react-native.tsx'), 'expo-router': S('expo-router.tsx'), 'expo-status-bar': S('misc.tsx'),
    'react-native-safe-area-context': S('misc.tsx'), 'react-native-svg': S('svg.tsx'), '@expo-google-fonts/bricolage-grotesque': S('misc.tsx'),
    '@react-native-async-storage/async-storage': S('misc.tsx'), '@supabase/supabase-js': S('misc.tsx'), 'react-native-url-polyfill/auto': S('misc.tsx'),
  },
  tsconfigRaw: '{"compilerOptions":{"jsx":"react-jsx"}}', loader: { '.png': 'dataurl' }, define: { 'process.env.NODE_ENV': '"development"', 'process.env.EXPO_PUBLIC_SUPABASE_URL': 'undefined', 'process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY': 'undefined' },
  logLevel: 'warning',
});
fs.writeFileSync(path.join(dist, 'index.html'), `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#eef2f3" media="(prefers-color-scheme: light)"><meta name="theme-color" content="#0e2226" media="(prefers-color-scheme: dark)">
<style>html,body{background-color:#eef2f3}@media (prefers-color-scheme:dark){html,body{background-color:#0e2226}}html,body,#root{height:100%;margin:0}body{font-family:system-ui,sans-serif}input::placeholder,textarea::placeholder{color:var(--ph,#888)}</style>
<div id="root" style="display:flex;flex-direction:column"></div><script src="app.js"></script>`);
console.log('build ok');
