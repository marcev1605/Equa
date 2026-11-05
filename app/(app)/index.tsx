import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { dd_mm, fmtMoney as fmt, isoLocal, monthLabel, ymdOf } from '../../src/domain/dates';
import { sum } from '../../src/domain/engine';
import { useStore } from '../../src/state/store';
import { Bar, Card, Check, Dots, H2, Item, Money, Row, T } from '../../src/ui/kit';
import { useFlows } from '../../src/ui/flows';
import { dayLabel, fixedTxt, repTxt } from '../../src/ui/format';
import { PendingSheet } from '../../src/ui/PendingSheet';
import { MonthNav, Screen, Stat, useUI } from '../../src/ui/Shell';
import { radius, useLayout, useTheme } from '../../src/ui/theme';

export default function Resumen() {
  const { eng, snap, cur } = useStore();
  const F = useFlows(), ui = useUI(), L = useLayout(), t = useTheme();
  const [pend, setPend] = useState<{ ty: 'in' | 'out'; full: boolean } | null>(null);

  const A = eng.all(), M = A.filter(o => o.i === cur), inc = sum(M, 'in'), out = sum(M, 'out') + eng.advNet(cur);
  const carry = eng.carryIn(cur), avail = eng.availFor(eng.now), net = eng.svNet(cur), prev = carry + inc - out - net;
  const cs = eng.cardNames().map(n => ({ n, ...eng.stmtN(n, cur) })).filter(q => q.due + q.adv > 0.005);
  const nco = M.filter(o => o.t.type === 'out' && !o.t.card);
  const outTot = sum(nco, 'out') + eng.advIn(cur) + cs.reduce((a, q) => a + q.due, 0);
  const outPend = sum(nco.filter(o => !eng.P(o)), 'out') + cs.reduce((a, q) => a + q.rem, 0);
  const OD_IN = eng.overdue(cur, 'in'), OD_OUT = eng.overdue(cur, 'out'), OD = [...OD_IN, ...OD_OUT];
  const odIn = sum(OD_IN, 'in'), odOut = sum(OD_OUT, 'out');
  const PM = snap.pay.filter(p => eng.payEff(p) === cur), SV = eng.svMoves(cur);

  const pendRows = [
    { ty: 'in' as const, a: 'Por cobrar', b: 'Cobrado', tot: inc + odIn, pe: sum(M.filter(o => !eng.P(o)), 'in') + odIn, od: odIn, color: t.inc },
    { ty: 'out' as const, a: 'Por pagar', b: 'Pagado', tot: outTot + odOut, pe: outPend + odOut, od: odOut, color: t.out },
  ];

  // Fecha efectiva de cada movimiento: los fijos caen el mismo día de cada mes
  const effDate = (o: (typeof M)[number]) => (o.t.fixed ? ymdOf(o.i - (o.t.card ? 1 : 0), +o.t.date.slice(8)) : o.t.date);
  const moves: { d: string; node: React.ReactElement }[] = [
    ...OD.map(o => ({ d: '0', node: (
      <Item key={`od${o.t.id}:${o.i}`} left={<Check on={false} onPress={() => F.togglePaid(o)} label="Marcar" />} title={o.t.note || o.t.cat}
        sub={`${o.t.cat} · de ${monthLabel(o.i, false)}${o.t.fixed ? fixedTxt(o.t) : ''}${repTxt(o.t)} · pendiente`}
        right={<Row><Money v={o.a} tone={o.t.type} sign={o.t.type === 'in' ? '+' : '−'} /><Dots onPress={() => F.txMenu(o.t, o.i, (tx, i, scope) => ui.openTx({ t: tx, i, scope }))} /></Row>} />) })),
    ...M.map(o => {
      const done = eng.P(o), isCardOut = o.t.card && o.t.type === 'out';
      return { d: effDate(o), node: (
        <Item key={`${o.t.id}:${o.i}`} done={done} left={<Check on={done} onPress={isCardOut ? undefined : () => F.togglePaid(o)} label="Marcar pagado" />} title={o.t.note || o.t.cat}
          sub={`${o.t.cat}${o.t.fixed ? fixedTxt(o.t) : o.t.of ? ' · fijo editado' : ''}${repTxt(o.t)}${o.t.card ? ' · ' + (o.t.cardName || 'tarjeta') + (o.n > 1 ? ` ${o.k}/${o.n}` : '') : ''}${done ? '' : ' · pendiente'}`}
          right={<Row><Money v={o.a} tone={o.t.type} sign={o.t.type === 'in' ? '+' : '−'} /><Dots onPress={() => F.txMenu(o.t, o.i, (tx, i, scope) => ui.openTx({ t: tx, i, scope }))} /></Row>} />) };
    }),
    ...SV.map(x => ({ d: x.date, node: (
      <Item key={'sv' + x.id} done left={<Check on />} title={`${x.amt > 0 ? 'Depósito a Ahorro' : 'Retiro de Ahorro'} · ${x.cat}`} sub={`Ahorro${x.note ? ' · ' + x.note : ''}`}
        right={<Row><Money v={Math.abs(x.amt)} sign={x.amt > 0 ? '−' : '+'} /><Dots onPress={() => F.savMenu(x, y => ui.openSav('in', y))} /></Row>} />) })),
    ...PM.map(p => ({ d: p.date, node: (
      <Item key={'pm' + p.id} done left={<Check on />} title={`${eng.isAdv(p) ? 'Adelanto de tarjeta' : 'Pago de tarjeta'} · ${p.card}`}
        sub={`${eng.isAdv(p) ? 'Resumen de ' + monthLabel(p.i, false) + ' · adelantado el' : 'Resumen · pagado el'} ${dd_mm(p.date)}`}
        right={<Row><Money v={p.amt} tone="out" sign="−" /><Dots label="Opciones del pago" onPress={() => F.undoPay(p)} /></Row>} />) })),
  ].sort((a, b) => b.d.localeCompare(a.d));

  // Movimientos agrupados por día (el más reciente primero); los atrasados de meses anteriores van al final.
  const today = isoLocal(new Date());
  const days: { d: string; label: string; rows: React.ReactElement[] }[] = [];
  for (const m of moves) {
    let g = days[days.length - 1];
    if (!g || g.d !== m.d) { g = { d: m.d, label: m.d === '0' ? 'De meses anteriores' : dayLabel(m.d, today), rows: [] }; days.push(g); }
    g.rows.push(m.node);
  }

  const pendCard = (
      <Card style={{ marginTop: 0 }}>
        <H2>Pendiente del mes</H2>
        {pendRows.map(r => (
          <Pressable key={r.ty} accessibilityRole="button" onPress={() => setPend({ ty: r.ty, full: false })} style={{ marginBottom: 12 }}>
            <Row><T size={14}>{r.a} ›</T><Money v={r.pe} tone={r.ty} /></Row>
            <Bar pct={r.tot ? ((r.tot - r.pe) / r.tot) * 100 : 0} color={r.color} />
            <T tone="mute" size={13}>{r.b} {fmt(r.tot - r.pe)} de {fmt(r.tot)}{r.od > 0.005 ? ` · incluye ${fmt(r.od)} de meses anteriores` : ''}</T>
          </Pressable>
        ))}
      </Card>
  );
  const formula = (
    <T tone="mute" size={13}>
      Ingresos {fmt(inc)} − gastos {fmt(out)}{net ? ` ${net > 0 ? '− ahorro' : '+ retiro de ahorro'} ${fmt(Math.abs(net))}` : ''} {carry < 0 ? '− deuda anterior' : '+ saldo anterior'} {fmt(Math.abs(carry))}
    </T>
  );
  const stats = (c: boolean) => (
    <>
      <Stat hero flex={1.1} c={c} label="Disponible ahora" value={fmt(avail)} tone={avail < 0 ? 'out' : 'ink'} sub={`Previsto del mes ${fmt(prev)}`} />
      <Stat c={c} label="Ingresos" value={fmt(inc)} tone="in" sub={`Cobrado ${fmt(pendRows[0].tot - pendRows[0].pe)} de ${fmt(pendRows[0].tot)}`} onPress={() => setPend({ ty: 'in', full: true })} />
      <Stat c={c} label="Gastos" value={fmt(out)} tone="out" sub={`Pagado ${fmt(pendRows[1].tot - pendRows[1].pe)} de ${fmt(pendRows[1].tot)}`} onPress={() => setPend({ ty: 'out', full: true })} />
    </>
  );
  const left = (
    <View style={L.wide ? { flex: 1 } : undefined}>
      <T tone="mute" size={14}>Disponible ahora</T>
      <T size={46} weight="bold" tone={avail < 0 ? 'out' : 'ink'} style={{ letterSpacing: -2, lineHeight: 52 }}>{fmt(avail)}</T>
      <Row style={{ marginTop: 10 }}><T size={14}>Previsto del mes</T><Money v={prev} tone={prev < 0 ? 'out' : 'ink'} /></Row>
      {formula}
      <View style={{ flexDirection: 'row', gap: 10, marginVertical: 14 }}>
        {([['in', 'Ingresos ›', inc], ['out', 'Gastos ›', out]] as const).map(([ty, lb, v]) => (
          <Pressable key={ty} accessibilityRole="button" onPress={() => setPend({ ty, full: true })} style={{ flex: 1, backgroundColor: t.card, borderColor: t.line, borderWidth: 1, borderRadius: radius.md - 2, padding: 10 }}>
            <T tone="mute" size={14}>{lb}</T><Money v={v} tone={ty} size={18} />
          </Pressable>
        ))}
      </View>
      {pendCard}
    </View>
  );
  const right = (
    <View style={L.wide ? { flex: 1 } : undefined}>
      <Card style={{ marginTop: L.wide ? 0 : 14 }}>
        <H2>Movimientos</H2>
        {days.length ? days.map((g, gi) => (
          <View key={g.d} accessibilityLabel={'Día ' + g.label} style={{ marginTop: gi ? 12 : 0 }}>
            <Row style={{ paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: t.line }}>
              <T tone="mute" size={13} weight="semi" style={{ flex: 1 }}>{g.label}</T>
            </Row>
            {g.rows.map((r, k) => React.cloneElement(r, { first: k === 0 }))}
          </View>
        )) : <T tone="mute" size={14}>Agrega tu primer movimiento con el botón +.</T>}
      </Card>
    </View>
  );

  return (
    <Screen title="Resumen" month={<MonthNav bar />} summary={stats}>
      {L.wide ? (
        <View style={{ flexDirection: 'row', gap: 24, alignItems: 'flex-start' }}>
          <View style={{ flex: 1, gap: 24 }}>
            <Card style={{ marginTop: 0 }}><Row><T size={14}>Previsto del mes</T><Money v={prev} tone={prev < 0 ? 'out' : 'ink'} /></Row>{formula}</Card>
            {pendCard}
          </View>
          {right}
        </View>
      ) : <><MonthNav />{left}{right}</>}
      <PendingSheet ty={pend?.ty ?? null} full={!!pend?.full} onClose={() => setPend(null)} />
    </Screen>
  );
}
