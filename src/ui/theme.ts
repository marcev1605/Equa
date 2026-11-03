import { useColorScheme, useWindowDimensions } from 'react-native';

export interface Palette { bg: string; card: string; ink: string; mute: string; line: string; acc: string; accInk: string; inc: string; out: string; incInk: string; outInk: string; overlay: string; cats: string[]; catL: number; sav: string }

export const light: Palette = { bg: '#eef2f3', card: '#ffffff', ink: '#12343b', mute: '#5d7378', line: '#d5e0e2', acc: '#e2a72e', accInk: '#12343b', inc: '#1f8a5b', out: '#c2452f', incInk: '#ffffff', outInk: '#ffffff', overlay: 'rgba(0,0,0,.5)', cats: ['#2f6fdb', '#e2a72e', '#1c9a95', '#8a5cd0', '#d2578f', '#7f9524', '#e0702f', '#5d7378', '#c2452f', '#1f8a5b', '#3aa0d8', '#a0522d', '#6b4bd6', '#d9b300', '#0e7c86', '#c0399f', '#4f7a28', '#e8590c', '#7a8fa3', '#9c6ade'], catL: 46, sav: '#2f6fdb' };
export const dark: Palette = { bg: '#0e2226', card: '#163238', ink: '#e6f0f1', mute: '#93aeb3', line: '#274a51', acc: '#e2a72e', accInk: '#12343b', inc: '#4ccf95', out: '#ff8a73', incInk: '#0e2226', outInk: '#0e2226', overlay: 'rgba(0,0,0,.6)', cats: ['#6ea0ff', '#f0be4d', '#4dd0c9', '#b394ee', '#f08ab8', '#b5cf4a', '#ff9a5c', '#93aeb3', '#ff8a73', '#4ccf95', '#6cc4f0', '#d9966b', '#9a85ff', '#f2d14d', '#47c3cf', '#e873c9', '#8fc65a', '#ff8f4d', '#a9bccd', '#c4a0f5'], catL: 68, sav: '#6ea0ff' };

/** Color de la categoría número i: 20 colores elegidos a mano y, desde ahí, infinitos tonos generados (ángulo áureo) para que nunca se repitan. */
export const catColor = (t: Palette, i: number): string => (i < t.cats.length ? t.cats[i] : `hsl(${Math.round(((i - t.cats.length + 1) * 137.508) % 360)}, 58%, ${t.catL}%)`);

/** Color de acento (fondo + texto encima) para controles seleccionados. */
export interface Accent { bg: string; ink: string }
export const accentOf = (t: Palette, type: 'in' | 'out'): Accent => (type === 'out' ? { bg: t.out, ink: t.outInk } : { bg: t.inc, ink: t.incInk });

export const font = { regular: 'BricolageGrotesque_400Regular', semi: 'BricolageGrotesque_600SemiBold', bold: 'BricolageGrotesque_800ExtraBold' };
export const radius = { sm: 10, md: 14, lg: 18, pill: 999 };
export const space = { xs: 4, sm: 8, md: 14, lg: 20, xl: 28 };

export function useTheme(): Palette {
  return useColorScheme() === 'dark' ? dark : light;
}

/** Breakpoints: móvil (< 700), tablet (700–1023), escritorio (≥ 1024) */
export function useLayout() {
  const { width, height } = useWindowDimensions();
  const wide = width >= 1024, tablet = width >= 700 && width < 1024;
  return { width, height, wide, tablet, mobile: width < 700, content: wide ? 1080 : tablet ? 720 : 560 };
}
