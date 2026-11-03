import React from 'react';
import { View } from 'react-native';
import { fmtMoney as fmt, monthName } from '../domain/dates';
import { SHARE_HIGH, SHARE_MID, cardShare, type CardShare, type ShareLevel } from '../domain/stats';
import { useStore } from '../state/store';
import { Card, Row, T } from './kit';
import { useTheme } from './theme';

const SCALE = 50;   // el medidor llega hasta el 50% de los ingresos
const pctTxt = (p: number) => `${p < 1 && p > 0 ? '<1' : Math.round(p)}%`;
function useLevelColor() {
  const t = useTheme();
  return (l: ShareLevel | null) => (l === 'high' ? t.out : l === 'mid' ? t.acc : l === 'ok' ? t.inc : t.mute);
}

/** Medidor 0–50% con marcas en los cortes (20% y 35%). */
function Gauge({ s, height }: { s: CardShare; height: number }) {
  const t = useTheme(), color = useLevelColor()(s.level), at = (p: number) => `${(p / SCALE) * 100}%` as const;
  return (
    <View accessibilityLabel="Medidor de tarjeta vs. ingresos" style={{ height, borderRadius: height / 2, backgroundColor: t.line, overflow: 'hidden' }}>
      <View style={{ width: at(Math.min(SCALE, s.pct ?? 0)), height: '100%', backgroundColor: color }} />
      {[SHARE_MID, SHARE_HIGH].map(p => <View key={p} style={{ position: 'absolute', left: at(p), top: 0, bottom: 0, width: 2, backgroundColor: t.card }} />)}
    </View>
  );
}
function pointsTxt(s: CardShare, vs: string) {
  if (s.points == null) return null;
  return Math.abs(s.points) < 0.5 ? `Igual que ${vs}` : `${s.points > 0 ? '▲' : '▼'} ${Math.round(Math.abs(s.points))} ${Math.round(Math.abs(s.points)) === 1 ? 'punto' : 'puntos'} vs. ${vs}`;
}

/** Franja chica para Tarjetas: cuánto de tus ingresos se va en tarjeta el mes en que se paga el resumen que estás viendo. */
export function ShareStrip({ i }: { i: number }) {
  const { eng } = useStore(), s = cardShare(eng, i), color = useLevelColor()(s.level), pt = pointsTxt(s, monthName(i - 1).toLowerCase());
  return (
    <Card pad={12} style={{ marginTop: 14 }}>
      <View accessibilityLabel="Tarjeta vs. ingresos">
        <Row><T tone="mute" size={14} weight="semi">Tarjeta vs. ingresos</T>{s.pct != null ? <T size={18} weight="bold" style={{ color }}>{pctTxt(s.pct)}</T> : null}</Row>
        {s.pct != null ? (
          <>
            <View style={{ marginTop: 6, marginBottom: 6 }}><Gauge s={s} height={8} /></View>
            <T tone="mute" size={13}>{fmt(s.card)} de {fmt(s.inc)} de ingresos de {monthName(i).toLowerCase()}{pt ? ` · ${pt}` : ''}</T>
          </>
        ) : <T tone="mute" size={13} style={{ marginTop: 4 }}>No hay ingresos cargados en {monthName(i).toLowerCase()}, así que no se puede medir.</T>}
      </View>
    </Card>
  );
}
