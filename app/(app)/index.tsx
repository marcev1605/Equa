import React, { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { dd_mm, fmtMoney as fmt, isoLocal, monthLabel, ymdOf } from '../../src/domain/dates';
import { sum } from '../../src/domain/engine';
import { useStore } from '../../src/state/store';
import { Bar, Card, Check, Dots, Field, H2, Item, Money, Row, T } from '../../src/ui/kit';
import { Icon } from '../../src/ui/icons';
import { MASK, usePrivacy } from '../../src/ui/privacy';
import { useFlows } from '../../src/ui/flows';
import { dayLabel, fixedTxt, repTxt } from '../../src/ui/format';
import { PendingSheet } from '../../src/ui/PendingSheet';
import { MonthNav, Screen, Stat, useUI } from '../../src/ui/Shell';
import { radius, useLayout, useTheme } from '../../src/ui/theme';

export default function Resumen() {
  const { eng, snap, cur } = useStore();
  const F = useFlows(), ui = useUI(), L = useLayout(), t = useTheme();
  const [pend, setPend] = useState<{ ty: 'in' | 'out'; full: boolean } | null>(null);
  const { hide } = usePrivacy();
  const m$ = (s: string) => (hide ? MASK : s);   // saldos ocultos con el ojito
  // Búsqueda en Movimientos: texto + categoría, día y tipo
  const [sOpen, setSOpen] = useState(false), [q, setQ] = useState('');
  const [fCat, setFCat] = useState(''), [fDay, setFDay] = useState(''), [fTipo, setFTipo] = useState('');
  const [pick, setPick] = useState<'' | 'cat' | 'day' | 'tipo'>('');
  useEffect(() => { setSOpen(false); setQ(''); setFCat(''); setFDay(''); setFTipo(''); setPick(''); }, [cur]);   // al cambiar de mes se limpia

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
  type Mv = { d: string; node: React.ReactElement; name: string; cat: string; kind: 'in' | 'out' | 'sv' | 'pm'; pend: boolean; amt: number };
  const moves: Mv[] = [
    ...OD.map(o => ({ d: '0', name: o.t.note || '', cat: o.t.cat, kind: o.t.type, pend: true, amt: o.t.type === 'in' ? o.a : -o.a, node: (
      <Item key={`od${o.t.id}:${o.i}`} left={<Check on={false} onPress={() => F.togglePaid(o)} label="Marcar" />} title={o.t.note || o.t.cat}
        sub={`${o.t.cat} · de ${monthLabel(o.i, false)}${o.t.fixed ? fixedTxt(o.t) : ''}${repTxt(o.t)} · pendiente`}
        right={<Row><Money v={o.a} tone={o.t.type} sign={o.t.type === 'in' ? '+' : '−'} /><Dots onPress={() => F.txMenu(o.t, o.i, (tx, i, scope) => ui.openTx({ t: tx, i, scope }))} /></Row>} />) })),
    ...M.map(o => {
      const done = eng.P(o), isCardOut = o.t.card && o.t.type === 'out';
      return { d: effDate(o), name: `${o.t.note || ''} ${o.t.cardName || ''}`, cat: o.t.cat, kind: o.t.type, pend: !done, amt: o.t.type === 'in' ? o.a : -o.a, node: (
        <Item key={`${o.t.id}:${o.i}`} done={done} left={<Check on={done} onPress={isCardOut ? undefined : () => F.togglePaid(o)} label="Marcar pagado" />} title={o.t.note || o.t.cat}
          sub={`${o.t.cat}${o.t.fixed ? fixedTxt(o.t) : o.t.of ? ' · fijo editado' : ''}${repTxt(o.t)}${o.t.card ? ' · ' + (o.t.cardName || 'tarjeta') + (o.n > 1 ? ` ${o.k}/${o.n}` : '') : ''}${done ? '' : ' · pendiente'}`}
          right={<Row><Money v={o.a} tone={o.t.type} sign={o.t.type === 'in' ? '+' : '−'} /><Dots onPress={() => F.txMenu(o.t, o.i, (tx, i, scope) => ui.openTx({ t: tx, i, scope }))} /></Row>} />) };
    }),
    ...SV.map(x => ({ d: x.date, name: x.note || '', cat: x.cat, kind: 'sv' as const, pend: false, amt: -x.amt, node: (
      <Item key={'sv' + x.id} done left={<Check on />} title={`${x.amt > 0 ? 'Depósito a Ahorro' : 'Retiro de Ahorro'} · ${x.cat}`} sub={`Ahorro${x.note ? ' · ' + x.note : ''}`}
        right={<Row><Money v={Math.abs(x.amt)} sign={x.amt > 0 ? '−' : '+'} /><Dots onPress={() => F.savMenu(x, y => ui.openSav('in', y))} /></Row>} />) })),
    ...PM.map(p => ({ d: p.date, name: p.card, cat: 'Tarjeta', kind: 'pm' as const, pend: false, amt: -p.amt, node: (
      <Item key={'pm' + p.id} done left={<Check on />} title={`${eng.isAdv(p) ? 'Adelanto de tarjeta' : 'Pago de tarjeta'} · ${p.card}`}
        sub={`${eng.isAdv(p) ? 'Resumen de ' + monthLabel(p.i, false) + ' · adelantado el' : 'Resumen · pagado el'} ${dd_mm(p.date)}`}
        right={<Row><Money v={p.amt} tone="out" sign="−" /><Dots label="Opciones del pago" onPress={() => F.undoPay(p)} /></Row>} />) })),
  ].sort((a, b) => b.d.localeCompare(a.d));

  // Movimientos agrupados por día (el más reciente primero); los atrasados de meses anteriores van al final.
  const today = isoLocal(new Date());
  const norm = (x: string) => x.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const back = (n: number) => { const [y, mo, da] = today.split('-').map(Number); return isoLocal(new Date(y, mo - 1, da - n)); };
  const dayOk = (m: Mv, v: string) => !v || (v === 'hoy' ? m.d === today : v === 'ayer' ? m.d === back(1) : v === 'semana' ? m.d !== '0' && m.d <= today && m.d >= back(6) : m.d === v);
  const tipoOk = (m: Mv, v: string) => !v || (v === 'Gastos' ? m.kind === 'out' || m.kind === 'pm' : v === 'Ingresos' ? m.kind === 'in' : v === 'Ahorro' ? m.kind === 'sv' : m.pend);
  const words = norm(q).split(/\s+/).filter(Boolean);
  const filtering = !!(q.trim() || fCat || fDay || fTipo);
  const shown = moves.filter(m => (!fCat || m.cat === fCat) && dayOk(m, fDay) && tipoOk(m, fTipo) && words.every(w => norm(`${m.name} ${m.cat}`).includes(w)));
  const shownTot = shown.reduce((a, m) => a + m.amt, 0);
  const catOpts = [...new Set(moves.map(m => m.cat))].sort((a, b) => a.localeCompare(b, 'es')).map(v => ({ v, label: v }));
  const dayOpts = [
    ...[['hoy', 'Hoy'], ['ayer', 'Ayer'], ['semana', 'Esta semana']].filter(([v]) => moves.some(m => dayOk(m, v))).map(([v, label]) => ({ v, label })),
    ...[...new Set(moves.map(m => m.d).filter(d => d !== '0'))].sort().reverse().map(d => ({ v: d, label: dd_mm(d) })),
  ];
  const tipoOpts = ['Gastos', 'Ingresos', 'Pendientes', 'Ahorro'].map(v => ({ v, label: v }));
  const optsOf = pick === 'cat' ? catOpts : pick === 'day' ? dayOpts : pick === 'tipo' ? tipoOpts : [];
  const setters = { cat: setFCat, day: setFDay, tipo: setFTipo };
  const cur$ = { cat: fCat, day: fDay, tipo: fTipo };
  const dayText = dayOpts.find(o => o.v === fDay)?.label ?? fDay;
  const clearAll = () => { setQ(''); setFCat(''); setFDay(''); setFTipo(''); setPick(''); };
  const days: { d: string; label: string; rows: React.ReactElement[] }[] = [];
  for (const m of shown) {
    let g = days[days.length - 1];
    if (!g || g.d !== m.d) { g = { d: m.d, label: m.d === '0' ? 'De meses anteriores' : dayLabel(m.d, today), rows: [] }; days.push(g); }
    g.rows.push(m.node);
  }

  const pendCard = (
      <Card style={{ marginTop: 0 }}>
        <H2>Pendiente del mes</H2>
        {pendRows.map(r => (
          <Pressable key={r.ty} accessibilityRole="button" onPress={() => setPend({ ty: r.ty, full: false })} style={{ marginBottom: 12 }}>
            <Row><T size={14}>{r.a} ›</T><Money v={r.pe} tone={r.ty} hide={hide} /></Row>
            <Bar pct={r.tot ? ((r.tot - r.pe) / r.tot) * 100 : 0} color={r.color} />
            <T tone="mute" size={13}>{r.b} {m$(fmt(r.tot - r.pe))} de {m$(fmt(r.tot))}{r.od > 0.005 ? ` · incluye ${m$(fmt(r.od))} de meses anteriores` : ''}</T>
          </Pressable>
        ))}
      </Card>
  );
  const formula = (
    <T tone="mute" size={13}>
      Ingresos {m$(fmt(inc))} − gastos {m$(fmt(out))}{net ? ` ${net > 0 ? '− ahorro' : '+ retiro de ahorro'} ${m$(fmt(Math.abs(net)))}` : ''} {carry < 0 ? '− deuda anterior' : '+ saldo anterior'} {m$(fmt(Math.abs(carry)))}
    </T>
  );
  const stats = (c: boolean) => (
    <>
      <Stat hero flex={1.1} c={c} label="Disponible ahora" value={m$(fmt(avail))} tone={avail < 0 ? 'out' : 'ink'} sub={`Previsto del mes ${m$(fmt(prev))}`} />
      <Stat c={c} label="Ingresos" value={m$(fmt(inc))} tone="in" sub={`Cobrado ${m$(fmt(pendRows[0].tot - pendRows[0].pe))} de ${m$(fmt(pendRows[0].tot))}`} onPress={() => setPend({ ty: 'in', full: true })} />
      <Stat c={c} label="Gastos" value={m$(fmt(out))} tone="out" sub={`Pagado ${m$(fmt(pendRows[1].tot - pendRows[1].pe))} de ${m$(fmt(pendRows[1].tot))}`} onPress={() => setPend({ ty: 'out', full: true })} />
    </>
  );
  const left = (
    <View style={L.wide ? { flex: 1 } : undefined}>
      <T tone="mute" size={14}>Disponible ahora</T>
      <T size={46} weight="bold" tone={avail < 0 ? 'out' : 'ink'} style={{ letterSpacing: hide ? 0 : -2, lineHeight: 52 }}>{m$(fmt(avail))}</T>
      <Row style={{ marginTop: 10 }}><T size={14}>Previsto del mes</T><Money v={prev} tone={prev < 0 ? 'out' : 'ink'} hide={hide} /></Row>
      {formula}
      <View style={{ flexDirection: 'row', gap: 10, marginVertical: 14 }}>
        {([['in', 'Ingresos ›', inc], ['out', 'Gastos ›', out]] as const).map(([ty, lb, v]) => (
          <Pressable key={ty} accessibilityRole="button" onPress={() => setPend({ ty, full: true })} style={{ flex: 1, backgroundColor: t.card, borderColor: t.line, borderWidth: 1, borderRadius: radius.md - 2, padding: 10 }}>
            <T tone="mute" size={14}>{lb}</T><Money v={v} tone={ty} size={18} hide={hide} />
          </Pressable>
        ))}
      </View>
      {pendCard}
    </View>
  );
  const right = (
    <View style={L.wide ? { flex: 1 } : undefined}>
      <Card style={{ marginTop: L.wide ? 0 : 14 }}>
        <Row>
          <H2>Movimientos</H2>
          <Pressable accessibilityRole="button" accessibilityLabel={sOpen ? 'Cerrar búsqueda' : 'Buscar movimientos'} accessibilityState={{ expanded: sOpen }} hitSlop={6}
            onPress={() => { if (sOpen) { clearAll(); } setSOpen(o => !o); }}
            style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginTop: -8, marginRight: -6, backgroundColor: sOpen || filtering ? t.bg : 'transparent' }}>
            <Icon name={sOpen ? 'close' : 'search'} color={sOpen || filtering ? t.acc : t.mute} size={21} />
          </Pressable>
        </Row>
        {sOpen ? (
          <View>
            <Field placeholder="Nombre o categoría" value={q} onChangeText={setQ} autoFocus returnKeyType="search" accessibilityLabel="Buscar movimientos por nombre o categoría" autoCorrect={false} />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
              {([['cat', 'Categoría', fCat], ['day', 'Día', dayText], ['tipo', 'Tipo', fTipo]] as const).map(([k, lb, v]) => (
                <Pressable key={k} accessibilityRole="button" accessibilityLabel={`Filtrar por ${lb.toLowerCase()}`} accessibilityState={{ expanded: pick === k, selected: !!v }} onPress={() => setPick(pick === k ? '' : k)}
                  style={{ paddingVertical: 8, paddingHorizontal: 12, borderRadius: radius.pill, borderWidth: 1, backgroundColor: v ? t.acc : t.bg, borderColor: v ? t.acc : pick === k ? t.acc : t.line }}>
                  <T size={14} weight={v ? 'semi' : 'regular'} style={v ? { color: t.accInk } : undefined}>{v ? `${lb}: ${v}` : lb} ▾</T>
                </Pressable>
              ))}
            </View>
            {pick ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                {optsOf.map(o => (
                  <Pressable key={o.v} accessibilityRole="button" accessibilityLabel={`Elegir ${o.label}`} onPress={() => { setters[pick](cur$[pick] === o.v ? '' : o.v); setPick(''); }}
                    style={{ paddingVertical: 7, paddingHorizontal: 11, borderRadius: radius.pill, borderWidth: 1, backgroundColor: cur$[pick] === o.v ? t.acc : t.bg, borderColor: cur$[pick] === o.v ? t.acc : t.line }}>
                    <T size={13.5} style={cur$[pick] === o.v ? { color: t.accInk } : undefined}>{o.label}</T>
                  </Pressable>
                ))}
                {cur$[pick] ? <Pressable accessibilityRole="button" accessibilityLabel="Quitar filtro" onPress={() => { setters[pick](''); setPick(''); }} style={{ paddingVertical: 7, paddingHorizontal: 11, borderRadius: radius.pill, borderWidth: 1, borderColor: t.line, borderStyle: 'dashed' }}><T size={13.5} tone="mute">Quitar</T></Pressable> : null}
              </View>
            ) : null}
          </View>
        ) : null}
        {filtering ? <Row style={{ marginBottom: 6 }}><T tone="mute" size={13}>{shown.length} resultado{shown.length === 1 ? '' : 's'}</T><T tone="mute" size={13}>Total {hide ? MASK : (shownTot < 0 ? '−' : '') + fmt(Math.abs(shownTot))}</T></Row> : null}
        {days.length ? days.map((g, gi) => (
          <View key={g.d} accessibilityLabel={'Día ' + g.label} style={{ marginTop: gi ? 12 : 0 }}>
            <Row style={{ paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: t.line }}>
              <T tone="mute" size={13} weight="semi" style={{ flex: 1 }}>{g.label}</T>
            </Row>
            {g.rows.map((r, k) => React.cloneElement(r, { first: k === 0 }))}
          </View>
        )) : filtering ? (
          <View style={{ alignItems: 'center', paddingVertical: 14, gap: 4 }}>
            <T tone="mute" size={14} style={{ textAlign: 'center' }}>No hay movimientos con ese filtro. Prueba con otra palabra o quita un filtro.</T>
            <Pressable accessibilityRole="button" onPress={clearAll}><T size={14} weight="semi" style={{ textDecorationLine: 'underline' }}>Limpiar búsqueda</T></Pressable>
          </View>
        ) : <T tone="mute" size={14}>Agrega tu primer movimiento con el botón +.</T>}
      </Card>
    </View>
  );

  return (
    <Screen title="Resumen" month={<MonthNav bar />} summary={stats} eye>
      {L.wide ? (
        <View style={{ flexDirection: 'row', gap: 24, alignItems: 'flex-start' }}>
          <View style={{ flex: 1, gap: 24 }}>
            <Card style={{ marginTop: 0 }}><Row><T size={14}>Previsto del mes</T><Money v={prev} tone={prev < 0 ? 'out' : 'ink'} hide={hide} /></Row>{formula}</Card>
            {pendCard}
          </View>
          {right}
        </View>
      ) : <><MonthNav />{left}{right}</>}
      <PendingSheet ty={pend?.ty ?? null} full={!!pend?.full} onClose={() => setPend(null)} />
    </Screen>
  );
}
