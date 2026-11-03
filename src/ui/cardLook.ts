import type { CardColor, CardStyle } from '../domain/cardLook';

/** Colores concretos de cada color de tarjeta: base, tono más claro (para degradés y franjas) y acento de la barra de pago. */
export const COLOR_DEFS: { id: CardColor; name: string; b: string; b2: string; a: string }[] = [
  { id: 'teal', name: 'Verde azulado', b: '#12343b', b2: '#1f6470', a: '#e2a72e' },
  { id: 'azul', name: 'Azul noche', b: '#1b2a5e', b2: '#3157c4', a: '#8fbaff' },
  { id: 'violeta', name: 'Violeta', b: '#3a2160', b2: '#7445c4', a: '#dcb8ff' },
  { id: 'bordo', name: 'Bordó', b: '#5a1a2b', b2: '#a8334f', a: '#ffb59e' },
  { id: 'verde', name: 'Verde bosque', b: '#12432d', b2: '#228456', a: '#a7f0b4' },
  { id: 'grafito', name: 'Grafito', b: '#23272b', b2: '#545c66', a: '#e2a72e' },
  { id: 'naranja', name: 'Naranja quemado', b: '#7a3412', b2: '#d96a22', a: '#ffe0a3' },
  { id: 'ciruela', name: 'Ciruela', b: '#5f1a4e', b2: '#c0399f', a: '#ffd0f0' },
];
export const colorDef = (id: CardColor) => COLOR_DEFS.find(c => c.id === id) ?? COLOR_DEFS[0];

export const STYLE_DEFS: { id: CardStyle; name: string; desc: string }[] = [
  { id: 'liso', name: 'Liso', desc: 'Un color sólido con un círculo suave en la esquina.' },
  { id: 'degrade', name: 'Degradé', desc: 'El color se funde hacia un tono más claro.' },
  { id: 'fisica', name: 'Tarjeta física', desc: 'Con chip y los últimos números, como una tarjeta real.' },
  { id: 'franja', name: 'Franja de color', desc: 'Fondo claro y una franja de color arriba. La más sobria.' },
  { id: 'minima', name: 'Borde lateral', desc: 'Fondo claro con una marca de color a la izquierda.' },
];

/** Texto sobre los estilos oscuros (liso, degradé y tarjeta física). */
export const ON_DARK = { ink: '#e6f0f1', mute: 'rgba(230,240,241,.72)', track: 'rgba(255,255,255,.18)' };
