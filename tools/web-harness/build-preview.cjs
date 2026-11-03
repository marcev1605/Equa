// node tools/web-harness/build-preview.cjs → dist/preview.html (una sola página con la app real + datos de ejemplo)
const path = require('path'), fs = require('fs');
const esbuild = require(process.env.ESBUILD_PATH || 'esbuild');
const here = __dirname, S = f => path.join(here, 'shims', f), dist = path.join(here, 'dist'); fs.mkdirSync(dist, { recursive: true });
const seed = require('./seed.cjs');
const r = esbuild.buildSync({
  entryPoints: [path.join(here, 'entry.tsx')], bundle: true, resolveExtensions: ['.web.tsx', '.web.ts', '.tsx', '.ts', '.jsx', '.js', '.json'], write: false, format: 'iife', jsx: 'automatic', target: 'es2019', minify: true, charset: 'ascii',
  nodePaths: [process.env.NODE_PATH_REACT || '/opt/npm-tools/node_modules'],
  alias: { 'react-native': S('react-native.tsx'), 'expo-router': S('expo-router.tsx'), 'expo-status-bar': S('misc.tsx'), 'react-native-safe-area-context': S('misc.tsx'), 'react-native-svg': S('svg.tsx'), '@expo-google-fonts/bricolage-grotesque': S('misc.tsx'), '@react-native-async-storage/async-storage': S('misc.tsx'), '@supabase/supabase-js': S('misc.tsx'), 'react-native-url-polyfill/auto': S('misc.tsx') },
  tsconfigRaw: '{"compilerOptions":{"jsx":"react-jsx"}}', loader: { '.png': 'dataurl' },
  define: { 'process.env.NODE_ENV': '"production"', 'process.env.EXPO_PUBLIC_SUPABASE_URL': 'undefined', 'process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY': 'undefined', __SEED__: JSON.stringify(seed) }, logLevel: 'warning',
});
const js = r.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const html = `<title>Equa React</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@400;600;800&display=swap" rel="stylesheet">
<style>
:root{--bg:#eef2f3}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#0e2226;color-scheme:dark}}
:root[data-theme="dark"]{--bg:#0e2226;color-scheme:dark}
html,body{height:100%}
body{background:var(--bg);margin:0;overflow:hidden;font-family:'Bricolage Grotesque',system-ui,sans-serif}
#root{height:100%;display:flex;flex-direction:column}
input::placeholder,textarea::placeholder{color:var(--ph,#888)}
</style>
<div id="root"></div>
<script>${js}</script>`;
fs.writeFileSync(path.join(dist, 'preview.html'), html); console.log('preview.html', (html.length / 1024) | 0, 'KB');
