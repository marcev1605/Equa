import React from 'react';
import { ScrollViewStyleReset } from 'expo-router/html';
import { dark, light } from '../src/ui/theme';

/**
 * Página base de la versión web. Hace que la app llegue hasta los bordes del celular (viewport-fit=cover)
 * y que la zona de arriba (hora, batería, cámara) y el rebote al deslizar tengan el mismo fondo que la app,
 * en claro y en oscuro. Las barras del navegador toman el color de `theme-color`.
 */
export default function Root({ children }: { children: React.ReactNode }) {
  const css = `
html,body{background-color:${light.bg};color-scheme:light dark}
@media (prefers-color-scheme:dark){html,body{background-color:${dark.bg}}}
body{overscroll-behavior:none;-webkit-text-size-adjust:100%}
input::placeholder,textarea::placeholder{color:var(--ph,#888)}`;
  return (
    <html lang="es">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="theme-color" content={light.bg} media="(prefers-color-scheme: light)" />
        <meta name="theme-color" content={dark.bg} media="(prefers-color-scheme: dark)" />
        <meta name="color-scheme" content="light dark" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="icon" type="image/png" href="/icon-192.png" />
        <link rel="manifest" href="/manifest.webmanifest" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="Equa" />
        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: css }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
