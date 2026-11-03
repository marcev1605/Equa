import React from 'react';
import { View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { useTheme } from './theme';

export type IconName = 'home' | 'trend' | 'card' | 'coin' | 'bars' | 'sliders' | 'down' | 'up' | 'plus' | 'deposit' | 'withdraw' | 'swap' | 'adjust';

/** Íconos de línea (24×24), iguales en web, iOS y Android. */
export function Glyph({ name }: { name: IconName }) {
  switch (name) {
    case 'home': return <Path d="M3.5 10.6 12 3.5l8.5 7.1V19a1.5 1.5 0 0 1-1.5 1.5h-4v-5.8H9V20.5H5A1.5 1.5 0 0 1 3.5 19z" />;
    case 'trend': return <><Path d="M3.5 17.5 9.5 11l4 4 7-8" /><Path d="M15.5 7h5v5" /></>;
    case 'card': return <><Rect x="2.5" y="5" width="19" height="14" rx="3" /><Path d="M2.5 10h19M6.5 15h3.5" /></>;
    case 'coin': return <><Circle cx="12" cy="12" r="9" /><Path d="M12 7v10M9.3 9.6c0-1 1.1-1.6 2.7-1.6s2.7.7 2.7 1.9c0 2.5-5.4 1.3-5.4 3.9 0 1.1 1.2 1.9 2.7 1.9s2.7-.6 2.7-1.7" /></>;
    case 'bars': return <><Rect x="4" y="11" width="3.6" height="9" rx="1" /><Rect x="10.2" y="4" width="3.6" height="16" rx="1" /><Rect x="16.4" y="14" width="3.6" height="6" rx="1" /></>;
    case 'down': return <><Path d="M7 7l10 10" /><Path d="M17 8v9H8" /></>;   // (flecha hacia abajo-derecha: se usa en Gasto)
    case 'up': return <><Path d="M7 17 17 7" /><Path d="M8 7h9v9" /></>;       // (flecha hacia arriba-derecha: se usa en Ingreso)
    case 'deposit': return <Path d="M12 19V5M5 12l7-7 7 7" />;
    case 'withdraw': return <Path d="M12 5v14M5 12l7 7 7-7" />;
    case 'swap': return <Path d="M4 8h14M14 4l4 4-4 4M20 16H6M10 12l-4 4 4 4" />;
    case 'adjust': return <><Path d="M3.5 17.5 9.5 11l4 4 7-8" /><Path d="M15.5 7h5v5" /></>;
    case 'plus': return <Path d="M12 5v14M5 12h14" />;
    case 'sliders': return <><Path d="M4 7h9M17 7h3M4 17h3M11 17h9" /><Circle cx="15" cy="7" r="2.2" /><Circle cx="9" cy="17" r="2.2" /></>;
  }
}

/**
 * Ícono del menú. Activo: va dentro de un recuadro amarillo con el trazo más grueso (estilo "barra flotante").
 */
export function TabIcon({ name, active, size = 24 }: { name: IconName; active: boolean; size?: number }) {
  const t = useTheme(), color = active ? t.accInk : t.mute;
  return (
    <View style={{ width: active ? size + 12 : size, height: active ? size + 4 : size, borderRadius: 12, backgroundColor: active ? t.acc : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={active ? 2 : 1.7} strokeLinecap="round" strokeLinejoin="round">
        <Glyph name={name} />
      </Svg>
    </View>
  );
}

/** Ícono suelto (sin recuadro), para botones y menús. */
export function Icon({ name, color, size = 22, width = 2 }: { name: IconName; color: string; size?: number; width?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round">
      <Glyph name={name} />
    </Svg>
  );
}
