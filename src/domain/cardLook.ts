import type { CardInfo, Snapshot } from './types';

/** Colores y estilos que se pueden elegir para cada tarjeta (los colores concretos están en src/ui/cardLook.ts). */
export const CARD_COLORS = ['teal', 'azul', 'violeta', 'bordo', 'verde', 'grafito', 'naranja', 'ciruela'] as const;
export const CARD_STYLES = ['liso', 'degrade', 'fisica', 'franja', 'minima'] as const;
export type CardColor = (typeof CARD_COLORS)[number];
export type CardStyle = (typeof CARD_STYLES)[number];
export interface CardLook { color: CardColor; style: CardStyle; last4: string }

export const isColor = (x: unknown): x is CardColor => typeof x === 'string' && (CARD_COLORS as readonly string[]).includes(x);
export const isStyle = (x: unknown): x is CardStyle => typeof x === 'string' && (CARD_STYLES as readonly string[]).includes(x);
export const isLast4 = (x: unknown): x is string => typeof x === 'string' && /^[0-9]{4}$/.test(x);

/** Aspecto de una tarjeta: lo guardado, o (si no se eligió nada) un color por orden de aparición y el estilo liso. */
export function lookOf(info: Record<string, CardInfo>, names: string[], name: string): CardLook {
  const ci = info[name] || {}, idx = Math.max(0, names.indexOf(name));
  return { color: isColor(ci.color) ? ci.color : CARD_COLORS[idx % CARD_COLORS.length], style: isStyle(ci.style) ? ci.style : 'liso', last4: isLast4(ci.last4) ? ci.last4 : '' };
}

/** Primer color que ninguna tarjeta está usando (si ya se usan todos, vuelve a empezar). */
export function nextFreeColor(S: Pick<Snapshot, 'cardInfo'>, names: string[]): CardColor {
  const used = new Set(names.map(n => lookOf(S.cardInfo, names, n).color));
  return CARD_COLORS.find(c => !used.has(c)) ?? CARD_COLORS[names.length % CARD_COLORS.length];
}
