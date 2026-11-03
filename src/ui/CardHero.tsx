import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { fmtMoney as fmt } from '../domain/dates';
import type { CardLook } from '../domain/cardLook';
import { colorDef, ON_DARK } from './cardLook';
import { Dots, Row, T } from './kit';
import { radius, useTheme } from './theme';

/** Fondo en degradé en diagonal (de `from` a `to`). */
export function Grad({ from, to, id }: { from: string; to: string; id: string }) {
  const gid = 'cg' + id.replace(/[^A-Za-z0-9]/g, '');
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width="100%" height="100%" preserveAspectRatio="none">
        <Defs><LinearGradient id={gid} x1="0" y1="0" x2="1" y2="1"><Stop offset="0" stopColor={from} /><Stop offset="1" stopColor={to} /></LinearGradient></Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${gid})`} />
      </Svg>
    </View>
  );
}

/**
 * Pieza de una tarjeta de crédito: nombre, cuánto falta pagar, cierre y barra de lo ya pagado.
 * Se usa igual en la lista de Tarjetas, arriba del detalle y en la vista previa de "Color y estilo".
 * Los tres puntitos (si hay `onMenu`) abren el editor de la tarjeta.
 */
export function CardHero({ name, due, paid, rem, sub, look, onMenu }: { name: string; due: number; paid: number; rem: number; sub: string; look: CardLook; onMenu?: () => void }) {
  const t = useTheme(), c = colorDef(look.color), st = look.style, light = st === 'franja' || st === 'minima';
  const has = due > 0.005, owe = has && rem > 0.005, pct = has ? Math.max(0, Math.min(100, (paid / due) * 100)) : 0;
  const ink = light ? t.ink : ON_DARK.ink, mute = light ? t.mute : ON_DARK.mute, track = light ? t.line : ON_DARK.track, fill = light ? c.b2 : c.a;
  const box = {
    borderRadius: radius.lg, padding: 16, overflow: 'hidden' as const, gap: 12,
    backgroundColor: light ? t.card : c.b,
    ...(light ? { borderWidth: 1, borderColor: t.line } : null),
    ...(st === 'franja' ? { paddingTop: 26 } : null),
    ...(st === 'minima' ? { paddingLeft: 22 } : null),
  };
  return (
    <View accessibilityLabel={'Tarjeta ' + name} style={box}>
      {st === 'liso' ? <View pointerEvents="none" style={{ position: 'absolute', right: -30, top: -30, width: 120, height: 120, borderRadius: 60, backgroundColor: c.a, opacity: 0.18 }} /> : null}
      {st === 'degrade' || st === 'fisica' ? <Grad from={c.b} to={c.b2} id={name + st} /> : null}
      {st === 'degrade' ? <View pointerEvents="none" style={{ position: 'absolute', right: -40, bottom: -60, width: 170, height: 170, borderRadius: 85, backgroundColor: '#ffffff', opacity: 0.07 }} /> : null}
      {st === 'franja' ? <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 10, overflow: 'hidden' }}><Grad from={c.b} to={c.b2} id={name + 'band'} /></View> : null}
      {st === 'minima' ? <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 8, backgroundColor: c.b2 }} /> : null}
      <Row>
        <T weight="bold" size={15} style={{ color: ink, flex: 1 }}>{name}</T>
        {onMenu ? <Dots label={'Opciones de ' + name} color={light ? undefined : ink} onPress={onMenu} /> : null}
      </Row>
      {st === 'fisica' ? (
        <Row>
          <View style={{ width: 34, height: 26, borderRadius: 6, backgroundColor: '#d9ad4a' }} />
          {look.last4 ? <T size={14} weight="semi" style={{ color: ink, letterSpacing: 2.5 }}>•••• {look.last4}</T> : null}
        </Row>
      ) : null}
      <View>
        <T size={11} weight="semi" style={{ color: mute, letterSpacing: 0.8 }}>{owe ? 'FALTA PAGAR' : has ? 'RESUMEN PAGADO ✓' : 'SIN GASTOS ESTE MES'}</T>
        <T size={st === 'fisica' ? 30 : 38} weight="bold" style={{ color: ink, letterSpacing: -1.5, lineHeight: st === 'fisica' ? 36 : 44 }}>{fmt(owe ? rem : 0)}</T>
        <T size={12} style={{ color: mute }}>{sub}</T>
      </View>
      <View>
        <View style={{ height: 8, borderRadius: 5, overflow: 'hidden', backgroundColor: track }}>
          <View style={{ height: '100%', width: `${pct}%`, backgroundColor: fill }} />
        </View>
        <Row style={{ marginTop: 6 }}>
          <T size={12} style={{ color: mute }}>Pagado <T size={12} weight="bold" style={{ color: ink }}>{fmt(paid)}</T></T>
          <T size={12} style={{ color: mute }}>Resumen <T size={12} weight="bold" style={{ color: ink }}>{fmt(due)}</T></T>
        </Row>
      </View>
    </View>
  );
}
