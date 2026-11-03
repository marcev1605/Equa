import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { fmtMoney as fmt, monthName, monthShort } from '../domain/dates';
import { lookOf } from '../domain/cardLook';
import { cardDebt } from '../domain/stats';
import { useStore } from '../state/store';
import { colorDef } from './cardLook';
import { Card, H2, Row, T } from './kit';
import { radius, useTheme } from './theme';

const TOP = 4, BAR = 96;
const k = (v: number) => (v >= 1000 ? `$${Math.round(v / 1000)}k` : v > 0.005 ? `$${Math.round(v)}` : '—');

/**
 * "Lo que ya debés, mes a mes": cuotas pendientes por mes y por tarjeta, desde el resumen que se está viendo.
 * Con pocas tarjetas, una columna por tarjeta; con muchas, las 4 mayores con su color y el resto junto, y cada mes se abre para ver el detalle.
 */
export function CardDebt({ from, wide }: { from: number; wide?: boolean }) {
  const { eng, snap } = useStore(), t = useTheme(), [open, setOpen] = useState<number | null>(null);
  const names = eng.cardNames(), d = cardDebt(eng, from), many = d.cards.length > 2;
  const colorOf = (n: string) => colorDef(lookOf(snap.cardInfo, names, n).color).b2;
  const top = d.cards.slice(0, TOP), rest = d.cards.slice(TOP), restV = d.months.map((_, i) => rest.reduce((a, c) => a + c.v[i], 0));
  const mx = Math.max(...d.totals, 1);
  const yy = (i: number) => (Math.floor(i / 12) !== Math.floor(from / 12) ? ` ’${String(Math.floor(i / 12)).slice(2)}` : '');
  const wrap = { marginTop: wide ? 0 : undefined } as const;

  if (!d.cards.length) return <Card style={wrap}><H2>Lo que ya debés, mes a mes</H2><T tone="mute" size={14}>No tenés cuotas pendientes.</T></Card>;

  const endTxt = d.last == null ? '' : d.last <= d.months[d.months.length - 1] ? ` Desde ${monthName(d.last + 1)} se libera todo.` : ` Las últimas cuotas terminan en ${monthName(d.last)} ${Math.floor(d.last / 12)}.`;
  return (
    <Card style={wrap}>
      <Row><H2>Lo que ya debés, mes a mes</H2><T tone="mute" size={12} style={{ marginBottom: 8 }}>solo cuotas</T></Row>
      <View accessibilityLabel="Deuda por mes" style={{ flexDirection: 'row', gap: 6, alignItems: 'flex-end', height: BAR + 18, borderBottomWidth: 1, borderBottomColor: t.line }}>
        {d.months.map((i, c) => (
          <View key={i} accessibilityLabel={`Deuda ${monthShort(i)}: ${fmt(d.totals[c])}`} style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end' }}>
            <T size={10} weight="bold" tone={d.totals[c] > 0.005 ? 'ink' : 'mute'} numberOfLines={1}>{k(d.totals[c])}</T>
            <View style={{ width: '72%', height: Math.round((d.totals[c] / mx) * BAR), flexDirection: 'column-reverse', borderTopLeftRadius: 4, borderTopRightRadius: 4, overflow: 'hidden' }}>
              {top.map(cd => <View key={cd.name} style={{ height: (cd.v[c] / d.totals[c]) * 100 + '%', backgroundColor: colorOf(cd.name) }} />)}
              {restV[c] > 0.005 ? <View style={{ height: (restV[c] / d.totals[c]) * 100 + '%', backgroundColor: t.mute, opacity: 0.55 }} /> : null}
            </View>
          </View>
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: 6, marginTop: 3 }}>
        {d.months.map(i => <View key={i} style={{ flex: 1, alignItems: 'center' }}><T tone="mute" size={10.5} numberOfLines={1}>{monthShort(i)}{yy(i)}</T></View>)}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 12, rowGap: 2, marginTop: 8 }}>
        {top.map(c => <View key={c.name} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}><View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: colorOf(c.name) }} /><T tone="mute" size={12}>{c.name}</T></View>)}
        {rest.length ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}><View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: t.mute, opacity: 0.55 }} /><T tone="mute" size={12}>Otras ({rest.length})</T></View> : null}
      </View>

      {many ? (
        <View style={{ marginTop: 10 }}>
          <T tone="mute" size={12} style={{ marginBottom: 2 }}>Tocá un mes para ver qué tarjetas lo componen</T>
          {d.months.map((i, c) => {
            if (d.totals[c] < 0.005) return null;
            const on = open === c, det = d.cards.filter(x => x.v[c] > 0.005).sort((a, b) => b.v[c] - a.v[c]);
            return (
              <View key={i} style={{ borderTopWidth: 1, borderTopColor: t.line }}>
                <Pressable accessibilityRole="button" accessibilityLabel={`Detalle de ${monthName(i)}`} accessibilityState={{ expanded: on }} onPress={() => setOpen(on ? null : c)} style={{ paddingVertical: 8 }}>
                  <Row><T size={14}>{on ? '▾' : '▸'} {monthName(i)}{yy(i)} <T tone="mute" size={12}>{det.length} {det.length === 1 ? 'tarjeta' : 'tarjetas'}</T></T><T size={14} weight="bold">{fmt(d.totals[c])}</T></Row>
                </Pressable>
                {on ? <View style={{ marginLeft: 14, marginBottom: 8 }}>{det.map(x => <Row key={x.name} style={{ paddingVertical: 2 }}><T size={13} style={{ flexShrink: 1 }}>{x.name}</T><T size={13}>{fmt(x.v[c])}</T></Row>)}</View> : null}
              </View>
            );
          })}
        </View>
      ) : (
        <View style={{ marginTop: 10 }}>
          <Row style={{ paddingBottom: 4 }}>
            <T tone="mute" size={11.5} weight="semi" style={{ width: 52 }}>Mes</T>
            {d.cards.map(c => <T key={c.name} tone="mute" size={11.5} weight="semi" numberOfLines={1} style={{ flex: 1, textAlign: 'right' }}>{c.name}</T>)}
            <T tone="mute" size={11.5} weight="semi" style={{ flex: 1, textAlign: 'right' }}>Total</T>
          </Row>
          {d.months.map((i, c) => d.totals[c] < 0.005 ? null : (
            <Row key={i} style={{ paddingVertical: 5, borderTopWidth: 1, borderTopColor: t.line }}>
              <T size={13} style={{ width: 52 }}>{monthShort(i)}{yy(i)}</T>
              {d.cards.map(cd => <T key={cd.name} size={12.5} tone={cd.v[c] > 0.005 ? 'ink' : 'mute'} style={{ flex: 1, textAlign: 'right' }}>{cd.v[c] > 0.005 ? fmt(cd.v[c]) : '—'}</T>)}
              <T size={12.5} weight="bold" style={{ flex: 1, textAlign: 'right' }}>{fmt(d.totals[c])}</T>
            </Row>
          ))}
        </View>
      )}
      <View style={{ backgroundColor: t.bg, borderRadius: radius.sm, padding: 10, marginTop: 8 }}>
        <T size={13}>Tenés <T size={13} weight="bold">{fmt(d.all)}</T> comprometidos en cuotas.{d.worst && d.totals.filter(v => Math.abs(v - d.worst!.v) < 0.5).length === 1 ? <> Lo más pesado es <T size={13} weight="bold">{monthName(d.worst.i)}</T> ({fmt(d.worst.v)}).</> : null}{endTxt}</T>
      </View>
    </Card>
  );
}
