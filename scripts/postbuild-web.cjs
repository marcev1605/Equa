// Se ejecuta después de `expo export --platform web`.
// Con `output: "single"` Expo ignora app/+html.tsx, así que acá se completa el index.html final:
// la app llega hasta los bordes del iPhone (viewport-fit=cover) y la zona de la hora/batería
// toma el mismo color de fondo que la app, en claro y en oscuro.
const fs = require('fs'), path = require('path');
const dir = process.argv[2] || path.join(__dirname, '..', 'dist');
const file = path.join(dir, 'index.html');
const theme = fs.readFileSync(path.join(__dirname, '..', 'src', 'ui', 'theme.ts'), 'utf8');
const pick = (name) => {
  const m = theme.match(new RegExp(`export const ${name}[^{]*\\{[\\s\\S]*?\\bbg:\\s*'(#[0-9a-fA-F]{3,8})'`));
  if (!m) throw new Error('No encontré bg de ' + name + ' en theme.ts');
  return m[1];
};
const L = pick('light'), D = pick('dark');
let html = fs.readFileSync(file, 'utf8');
html = html.replace(/<meta name="viewport"[^>]*>/i, '');
html = html.replace(/<meta name="theme-color"[^>]*>/gi, '').replace(/<meta name="color-scheme"[^>]*>/gi, '');
html = html.replace(/<link rel="(apple-touch-icon|icon|manifest)"[^>]*>/gi, '').replace(/<meta name="(mobile-web-app-capable|apple-mobile-web-app-capable|apple-mobile-web-app-title)"[^>]*>/gi, '').replace(/<style>html,body\{background-color[^<]*<\/style>/i, '');
const head = `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="${L}" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="${D}" media="(prefers-color-scheme: dark)">
<meta name="color-scheme" content="light dark">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="icon" type="image/png" href="/icon-192.png">
<link rel="manifest" href="/manifest.webmanifest">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Equa">
<style>html,body{background-color:${L};color-scheme:light dark}@media (prefers-color-scheme:dark){html,body{background-color:${D}}}body{overscroll-behavior:none;-webkit-text-size-adjust:100%}</style>`;
if (!/<head[^>]*>/i.test(html)) throw new Error('index.html sin <head>');
html = html.replace(/<head[^>]*>/i, (m) => m + '\n' + head);
fs.writeFileSync(file, html);
console.log('index.html listo:', L, D);
