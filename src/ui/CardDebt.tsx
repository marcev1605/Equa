import React, { useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { dd_mm, fmtMoney as fmt, monthName, monthShort } from '../domain/dates';
import { lookOf } from '../domain/cardLook';
import { cardDebt, type DebtFilter } from '../domain/stats';
import { useStore } from '../state/store';
import { colorDef } from './cardLook';
import { Card, H2, Item, Money, Row, T } from './kit';
import { useReveal } from './overlay';
import { radius, useTheme } from './theme';

const BAR = 96;
type Tipo = NonNullable<DebtFilter['tipo']>;
const TIPOS: { value: Tipo; label: string }[] = [{ value: 'todo', label: 'Todo' }, { value: 'cuota', label: 'Solo cuotas' }, { value: 'pago', label: 'Un pago' }];
const k = (v: number) => (v >= 1000 ? `$${Math.round(v / 1000)}k` : v > 0.005 ? `$${Math.round(v)}` : '—');

/** Campo de filtro: etiqueta chica, valor elegido y, abierto, una lista justo debajo. */
function FilterField({ label, value, open, onToggle, onPick, options, align }: {
  label: string; value: string; open: boolean; onToggle: () => void; onPick: (v: string) => void; align: 'left' | 'right';
  options: { value: string; label: string; dot?: string }[];
}) {
  const t = useTheme(), reveal = useReveal(), listRef = useRef(null as any);
  useEffect(() => { if (open && reveal) { const id = setTimeout(() => reveal(listRef.current), 150); return () => clearTimeout(id); } }, [open]);   // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <View style={{ flex: 1, minWidth: 0, zIndex: open ? 40 : 1 }}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Filtrar por ${label.toLowerCase()}`} accessibilityState={{ expanded: open }} onPress={onToggle}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: t.bg, borderColor: open ? t.acc : t.line, borderWidth: 1, borderRadius: radius.sm, paddingVertical: 7, paddingHorizontal: 10 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <T tone="mute" size={10.5}>{label}</T>
          <T weight="semi" size={14} numberOfLines={1}>{value}</T>
        </View>
        <T tone="mute" size={13}>▾</T>
      </Pressable>
      {open ? (
        <View ref={listRef} collapsable={false} accessibilityLabel={`Opciones de ${label.toLowerCase()}`}
          style={{ position: 'absolute', top: '100%', marginTop: 4, [align]: 0, width: 220, backgroundColor: t.card, borderColor: t.line, borderWidth: 1, borderRadius: radius.sm, padding: 4, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 8 }}>
          {options.map(o => {
            const on = o.label === value;
            return (
              <Pressable key={o.value} accessibilityRole="button" accessibilityLabel={`${label}: ${o.label}`} accessibilityState={{ selected: on }} onPress={() => onPick(o.value)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, paddingHorizontal: 10, borderRadius: radius.sm - 2, backgroundColor: on ? t.bg : 'transparent' }}>
                {o.dot ? <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: o.dot }} /> : null}
                <T size={14} weight={on ? 'semi' : 'regular'} style={{ flex: 1 }}>{o.label}</T>
                {on ? <T size={14} weight="bold" style={{ color: t.acc }}>✓</T> : null}
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

/**
 * "Lo que ya debés, mes a mes": lo que ya cargaste con tarjeta y queda por pagar, desde el resumen que se está viendo.
 * Cada barra suma cuotas y compras en un pago; al tocar un mes, abajo aparece cada consumo agrupado por tarjeta.
 * Se filtra por tarjeta y por tipo con dos desplegables.
 */
export function CardDebt({ from, wide }: { from: number; wide?: boolean }) {
  const { eng, snap } = useStore(), t = useTheme();
  const [card, setCard] = useState(''), [tipo, setTipo] = useState<Tipo>('todo');
  const [pick, setPick] = useState<'' | 'card' | 'tipo'>(''), [open, setOpen] = useState<number | null>(null);
  useEffect(() => { setOpen(null); setPick(''); }, [from]);
  const names = eng.cardNames(), all = cardDebt(eng, from), d = cardDebt(eng, from, 6, { card: card || undefined, tipo });
  const colorOf = (n: string) => colorDef(lookOf(snap.cardInfo, names, n).color).b2;
  const wrap = { marginTop: wide ? 0 : undefined } as const;

  if (!all.rows.length) return <Card style={wrap}><H2>Lo que ya debés, mes a mes</H2><T tone="mute" size={14}>No tenés cuotas ni compras con tarjeta pendientes.</T></Card>;

  const yy = (i: number) => (Math.floor(i / 12) !== Math.floor(from / 12) ? ` ’${String(Math.floor(i / 12)).slice(2)}` : '');
  const mx = Math.max(...d.totals, 1), first = d.totals.findIndex(v => v > 0.005);
  const sel = open !== null && d.totals[d.months.indexOf(open)] > 0.005 ? d.months.indexOf(open) : first;
  const cuotaColor = t.acc, pagoColor = t.cats[2];
  const hasP = d.pagos.some(v => v > 0.005), hasC = d.cuotas.some(v => v > 0.005);
  const what = hasC && hasP ? 'cuotas y compras ya cargadas' : hasP ? 'compras ya cargadas' : 'cuotas';
  const endTxt = d.last == null ? '' : d.last <= d.months[d.months.length - 1] ? ` Desde ${monthName(d.last + 1)} se libera todo.` : ` Las últimas cuotas terminan en ${monthName(d.last)} ${Math.floor(d.last / 12)}.`;
  const cardOpts = [{ value: '', label: 'Todas las tarjetas' }, ...names.map(n => ({ value: n, label: n, dot: colorOf(n) }))];
  const selRows = sel >= 0 ? d.rows.filter(r => r.i === d.months[sel]) : [];

  return (
    <View>
      <Card style={{ ...wrap, zIndex: pick ? 30 : 0 }}>
        {pick ? <Pressable accessibilityLabel="Cerrar lista" onPress={() => setPick('')} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 20 }} /> : null}
        <H2>Lo que ya debés, mes a mes</H2>
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 6, zIndex: 40 }}>
          <FilterField label="Tarjeta" align="left" value={cardOpts.find(o => o.value === card)?.label ?? 'Todas las tarjetas'} open={pick === 'card'} onToggle={() => setPick(pick === 'card' ? '' : 'card')}
            options={cardOpts} onPick={v => { setCard(v); setPick(''); }} />
          <FilterField label="Tipo" align="right" value={TIPOS.find(o => o.value === tipo)!.label} open={pick === 'tipo'} onToggle={() => setPick(pick === 'tipo' ? '' : 'tipo')}
            options={TIPOS} onPick={v => { setTipo(v as Tipo); setPick(''); }} />
        </View>

        {d.rows.length ? (
          <>
            <View accessibilityLabel="Deuda por mes" style={{ flexDirection: 'row', gap: 4, marginTop: 6 }}>
              {d.months.map((i, c) => {
                const on = c === sel, v = d.totals[c];
                return (
                  <Pressable key={i} accessibilityRole="button" accessibilityLabel={`Deuda ${monthShort(i)}: ${fmt(v)}`} accessibilityState={{ selected: on }} disabled={v < 0.005} onPress={() => setOpen(i)}
                    style={{ flex: 1, alignItems: 'center', paddingTop: 4, paddingBottom: 4, borderRadius: radius.sm, backgroundColor: on ? t.bg : 'transparent' }}>
                    <View style={{ height: BAR + 18, width: '100%', alignItems: 'center', justifyContent: 'flex-end', borderBottomWidth: 1, borderBottomColor: t.line }}>
                      <T size={10} weight="bold" tone={v > 0.005 ? 'ink' : 'mute'} numberOfLines={1}>{k(v)}</T>
                      <View style={{ width: '72%', height: Math.round((v / mx) * BAR), flexDirection: 'column-reverse', borderTopLeftRadius: 4, borderTopRightRadius: 4, overflow: 'hidden' }}>
                        <View style={{ height: (v ? d.cuotas[c] / v : 0) * 100 + '%', backgroundColor: cuotaColor }} />
                        <View style={{ height: (v ? d.pagos[c] / v : 0) * 100 + '%', backgroundColor: pagoColor }} />
                      </View>
                    </View>
                    <T tone={on ? 'ink' : 'mute'} weight={on ? 'bold' : 'regular'} size={10.5} numberOfLines={1} style={{ marginTop: 3 }}>{monthShort(i)}{yy(i)}</T>
                  </Pressable>
                );
              })}
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, rowGap: 2, marginTop: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}><View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: cuotaColor }} /><T tone="mute" size={12}>Cuotas</T></View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}><View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: pagoColor }} /><T tone="mute" size={12}>Un pago</T></View>
            </View>
            <View style={{ backgroundColor: t.bg, borderRadius: radius.sm, padding: 10, marginTop: 8 }}>
              <T size={13}>Tenés <T size={13} weight="bold">{fmt(d.all)}</T> comprometidos en {what}.{d.worst && d.totals.filter(v => Math.abs(v - d.worst!.v) < 0.5).length === 1 ? <> Lo más pesado es <T size={13} weight="bold">{monthName(d.worst.i)}</T> ({fmt(d.worst.v)}).</> : null}{endTxt}</T>
            </View>
          </>
        ) : <T tone="mute" size={14} style={{ marginTop: 6 }}>No hay consumos con este filtro.</T>}
      </Card>

      {sel >= 0 ? (
        <Card style={{ marginTop: 10 }}>
          <View accessibilityLabel={`Resumen de ${monthName(d.months[sel])}`}>
            <Row><H2>Resumen de {monthName(d.months[sel])}{yy(d.months[sel])}</H2><T weight="bold" style={{ marginBottom: 8 }}>{fmt(d.totals[sel])}</T></Row>
            {d.cards.filter(cd => cd.v[sel] > 0.005).map((cd, gi) => (
              <View key={cd.name} accessibilityLabel={`Consumos de ${cd.name}`}>
                <Row style={{ paddingTop: gi ? 10 : 0, paddingBottom: 2 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, flexShrink: 1 }}><View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: colorOf(cd.name) }} /><T weight="bold" size={14} numberOfLines={1} style={{ flexShrink: 1 }}>{cd.name}</T></View>
                  <T weight="bold" size={14}>{fmt(cd.v[sel])}</T>
                </Row>
                {selRows.filter(r => r.card === cd.name).map((r, ri) => (
                  <Item key={`${r.name}:${r.date}:${r.k}:${ri}`} first={ri === 0} title={r.name}
                    sub={`${r.cat} · compra ${dd_mm(r.date)}${r.n > 1 ? ` · cuota ${r.k}/${r.n}` : ''}`} right={<Money v={r.a} tone="out" />} />
                ))}
              </View>
            ))}
          </View>
        </Card>
      ) : null}
    </View>
  );
}
