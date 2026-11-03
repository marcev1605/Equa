import React from 'react';
import { Pressable, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { monthLabel, monthShort } from '../domain/dates';
import type { Row } from '../domain/forecast';
import { T } from './kit';
import { useTheme } from './theme';

const W = 340, H = 104, PT = 12, PB = 8;

/** Saldo al cierre de cada mes: línea continua para lo real, punteada para lo previsto, en rojo los meses que quedan en negativo. Tocar un mes lo selecciona. */
export function SaldoChart({ rows, now, page, onSelect, simulating }: { rows: Row[]; now: number; page: number; onSelect: (k: number) => void; simulating: boolean }) {
  const t = useTheme(), n = rows.length;
  const vals = rows.flatMap(r => (simulating ? [r.run, r.baseRun] : [r.run])).concat([0]);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  const pad = (hi - lo) * 0.1 || 1; lo -= pad; hi += pad;
  const X = (k: number) => ((k + 0.5) / n) * W, Y = (v: number) => PT + ((hi - v) / (hi - lo)) * (H - PT - PB);
  const path = (pts: [number, number][]) => pts.map((p, k) => (k ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  const real = rows.map((r, k) => [k, r] as const).filter(([, r]) => r.i <= now).map(([k, r]) => [X(k), Y(r.run)] as [number, number]);
  const fut = rows.map((r, k) => [k, r] as const).filter(([, r]) => r.i >= now).map(([k, r]) => [X(k), Y(r.run)] as [number, number]);
  const base = rows.map((r, k) => [X(k), Y(r.baseRun)] as [number, number]);
  const nowK = rows.findIndex(r => r.i === now), reds = rows.filter(r => r.run < -0.005).length;
  const line = simulating ? t.acc : t.sav, every = n > 12 ? 2 : 1;
  return (
    <View accessibilityLabel="Gráfico del saldo previsto" style={{ width: '100%', maxWidth: 640, alignSelf: 'center' }}>
      <View style={{ width: '100%', aspectRatio: W / H }}>
        <Svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`}>
          <Path d={path([[0, Y(0)], [W, Y(0)]])} stroke={t.line} strokeWidth={1} fill="none" />
          {nowK > 0 ? <Path d={path([[X(nowK), PT], [X(nowK), H - PB]])} stroke={t.mute} strokeWidth={1} strokeDasharray="2 3" fill="none" /> : null}
          {simulating ? <Path d={path(base)} stroke={t.mute} strokeWidth={1.5} strokeDasharray="3 4" fill="none" opacity={0.7} /> : null}
          {real.length > 1 ? <Path d={path(real)} stroke={line} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" fill="none" /> : null}
          {fut.length > 1 ? <Path d={path(fut)} stroke={line} strokeWidth={2.5} strokeDasharray="1 6" strokeLinecap="round" fill="none" /> : null}
          {rows.map((r, k) => {
            const on = k === page, c = r.run < -0.005 ? t.out : line;
            return <Circle key={r.i} cx={X(k)} cy={Y(r.run)} r={on ? 5.5 : 3.2} fill={on ? c : t.card} stroke={c} strokeWidth={2} />;
          })}
        </Svg>
        <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, flexDirection: 'row' }}>
          {rows.map((r, k) => (
            <Pressable key={r.i} accessibilityRole="button" accessibilityLabel={'Mes en el gráfico: ' + monthLabel(r.i)} accessibilityState={{ selected: k === page }} onPress={() => onSelect(k)} style={{ flex: 1 }} />
          ))}
        </View>
      </View>
      <View style={{ flexDirection: 'row', marginTop: 2 }}>
        {rows.map((r, k) => (
          <View key={r.i} style={{ flex: 1, alignItems: 'center' }}>
            {/* el rótulo se centra bajo su punto y puede ser más ancho que la columna (con 18 meses cada una mide ~17px) */}
            {k % every === 0 || k === page ? <View style={{ width: 0, alignItems: 'center' }}><T size={10.5} weight={k === page || r.i === now ? 'bold' : 'regular'} tone={k === page ? 'ink' : 'mute'} style={{ width: 32, textAlign: 'center', flexShrink: 0 }}>{r.i === now ? 'Hoy' : monthShort(r.i)}</T></View> : null}
          </View>
        ))}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 14, rowGap: 2, marginTop: 8 }}>
        {rows[0].i < now ? <Key color={line} dash={false} text="Real" /> : null}
        <Key color={line} dash text="Previsto" />
        {simulating ? <Key color={t.mute} dash text="Sin la compra" /> : null}
        <T size={12} weight="semi" style={{ color: reds ? t.out : t.inc }}>{reds ? (reds === 1 ? '1 mes en rojo' : reds + ' meses en rojo') : 'Sin meses en rojo'}</T>
      </View>
    </View>
  );
}

function Key({ color, dash, text }: { color: string; dash: boolean; text: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
      <Svg width={16} height={4} viewBox="0 0 16 4"><Path d="M1 2 L15 2" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeDasharray={dash ? '1 5' : undefined} fill="none" /></Svg>
      <T size={12} tone="mute">{text}</T>
    </View>
  );
}
