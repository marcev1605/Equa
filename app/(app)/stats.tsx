import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { dd_mm, fmtMoney as fmt, monthName, monthShort } from '../../src/domain/dates';
import { sum } from '../../src/domain/engine';
import { cardStats, categoryBadge, delta, expenseKinds, expensesByCategory, monthStats, pace, type Delta } from '../../src/domain/stats';
import type { Occ } from '../../src/domain/types';
import { useStore } from '../../src/state/store';
import { Bar, Card, H2, Item, Money, Row, T } from '../../src/ui/kit';
import { fixedTxt } from '../../src/ui/format';
import { MonthNav, Screen } from '../../src/ui/Shell';
import { catColor, radius, useLayout, useTheme } from '../../src/ui/theme';

export default function Estadisticas() {
  const { eng, cur, snap } = useStore(), L = useLayout(), t = useTheme();
  const [openCat, setOpenCat] = useState<string[]>([]), [openSav, setOpenSav] = useState(false);
  const A = eng.all(), M = A.filter(o => o.i === cur);
  const ms = Array.from({ length: 6 }, (_, k) => cur - 5 + k), d = ms.map(i => { const m = A.filter(o => o.i === i); return [sum(m, 'in'), sum(m, 'out'), Math.max(0, eng.svMoves(i).reduce((a, x) => a + x.amt, 0))]; });   // [ingresos, gastos, ahorro neto del mes]
  const mx = Math.max(...d.flat(), 1);

  // ahorro del mes (sin transferencias entre categorías ni ajustes de saldo)
  const SL = eng.svMoves(cur).sort((a, b) => b.date.localeCompare(a.date));
  const { dep, ret, net, inc, pct } = eng.monthSaving(cur), rate = pct == null ? null : pct < 1 ? '<1' : String(Math.round(pct));   // % de ahorro sobre los ingresos del mes
  const by: Record<string, number> = {};
  SL.forEach(x => { by[x.cat] = (by[x.cat] || 0) + x.amt; });

  // gastos por categoría
  const cat: Record<string, number> = {}, its: Record<string, Occ[]> = {};
  M.filter(o => o.t.type === 'out').forEach(o => { cat[o.t.cat] = (cat[o.t.cat] || 0) + o.a; (its[o.t.cat] = its[o.t.cat] || []).push(o); });
  const total = Object.values(cat).reduce((a, b) => a + b, 0), rows = Object.entries(cat).sort((a, b) => b[1] - a[1]);
  const prevCat = expensesByCategory(eng, cur - 1);
  const cs = monthStats(eng, cur), ps = monthStats(eng, cur - 1), pc = pace(eng, cur), kinds = expenseKinds(eng, cur), cardSt = cardStats(eng, cur);
  const toneColor = (d: Delta) => (d.tone === 'good' ? t.inc : d.tone === 'bad' ? t.out : t.mute);

  const summary = (
    <Card style={L.wide ? { marginTop: 0 } : undefined}>
      <Row><H2>Resumen del mes</H2><T tone="mute" size={12} style={{ marginBottom: 8 }}>vs. {monthName(cur - 1).toLowerCase()}</T></Row>
      <View accessibilityLabel="Resumen del mes" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {([['Ingresos', cs.inc, ps.inc, 'up', 'pct', t.inc], ['Gastos', cs.out, ps.out, 'down', 'pct', t.out], ['Ahorro', cs.sav, ps.sav, 'up', 'abs', t.sav], ['Balance', cs.bal, ps.bal, 'up', 'abs', cs.bal < 0 ? t.out : t.ink]] as const).map(([label, v, pv, better, mode, color]) => {
          const d = delta(v, pv, better, mode);
          return (
            <View key={label} accessibilityLabel={'Resumen ' + label} style={{ width: '48%', flexGrow: 1, backgroundColor: t.bg, borderRadius: radius.sm, padding: 10 }}>
              <T tone="mute" size={13}>{label}</T>
              <T size={19} weight="bold" style={{ color }} numberOfLines={1}>{v < 0 ? '−' : ''}{fmt(Math.abs(v))}</T>
              <T size={12} weight="semi" style={{ color: toneColor(d) }}>{d.text}</T>
            </View>
          );
        })}
      </View>
    </Card>
  );

  const pacing = pc ? (
    <Card style={L.wide ? { marginTop: 0 } : undefined}>
      <H2>Ritmo del mes</H2>
      <Row><T size={14}>Gastás por día</T><T size={15} weight="bold">{fmt(pc.perDay)}</T></Row>
      <View style={{ backgroundColor: t.bg, borderRadius: radius.sm, padding: 10, marginTop: 8 }}>
        <T size={13}>
          {pc.state === 'past' ? 'Este mes cerraste en ' : pc.state === 'now' ? 'Este mes vas a cerrar en ' : 'Este mes se prevé cerrar en '}
          <T size={13} weight="bold">{fmt(pc.out)}</T>
          {Math.abs(pc.diff) < 0.5 ? ', igual que ' : <>, <T size={13} weight="bold" style={{ color: pc.diff > 0 ? t.out : t.inc }}>{fmt(Math.abs(pc.diff))} {pc.diff > 0 ? 'más' : 'menos'}</T> que </>}
          {pc.months === 6 ? 'el promedio de tus últimos 6 meses' : pc.months === 1 ? 'tu único mes anterior con gastos' : `el promedio de tus últimos ${pc.months} meses con gastos`} ({fmt(pc.avg)}).
        </T>
      </View>
    </Card>
  ) : null;

  const kindRows = [['Fijos', kinds.fixed, t.cats[0]], ['Tarjeta', kinds.card, t.cats[3]], ['Del mes', kinds.month, t.cats[1]]] as const;
  const fv = kinds.total > 0.005 ? (
    <Card style={L.wide ? { marginTop: 0 } : undefined}>
      <H2>Fijos vs. variables</H2>
      <View accessibilityLabel="Fijos vs. variables" style={{ flexDirection: 'row', height: 12, borderRadius: 6, overflow: 'hidden', backgroundColor: t.line }}>
        {kindRows.filter(([, v]) => v > 0.005).map(([n, v, c]) => <View key={n} style={{ width: `${(v / kinds.total) * 100}%`, backgroundColor: c }} />)}
      </View>
      <View style={{ marginTop: 8 }}>
        {kindRows.map(([n, v, c]) => (
          <Row key={n} style={{ paddingVertical: 2 }}>
            <Row style={{ justifyContent: 'flex-start', gap: 6, flexShrink: 1 }}><View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: c }} /><T size={14}>{n} · {Math.round((v / kinds.total) * 100)}%</T></Row>
            <T size={14}>{fmt(v)}</T>
          </Row>
        ))}
      </View>
      {kinds.fixed > 0.005 ? <View style={{ backgroundColor: t.bg, borderRadius: radius.sm, padding: 10, marginTop: 8 }}><T size={13}>El {Math.round((kinds.fixed / kinds.total) * 100)}% de tus gastos se repite todos los meses: es lo que ya tenés comprometido.</T></View> : null}
    </Card>
  ) : null;

  const byCard = (
    <Card style={L.wide ? { marginTop: 0 } : undefined}>
      <H2>Por tarjeta</H2>
      {cardSt.cards.length ? (
        <>
          {cardSt.cards.map((c, k) => (
            <View key={c.name} accessibilityLabel={'Tarjeta ' + c.name} style={{ paddingVertical: 6, borderTopWidth: k ? 1 : 0, borderTopColor: t.line }}>
              <Row><T size={14} weight="semi" style={{ flexShrink: 1 }}>{c.name}</T><T size={15} weight="bold">{fmt(c.spent)}</T></Row>
              {c.pending > 0.005 ? <T tone="mute" size={13}>Cuotas pendientes: {fmt(c.pending)} en {c.pendingMonths} {c.pendingMonths === 1 ? 'mes' : 'meses'}</T> : null}
            </View>
          ))}
          {cardSt.pending > 0.005 ? <View style={{ backgroundColor: t.bg, borderRadius: radius.sm, padding: 10, marginTop: 6 }}><T size={13}>Tenés <T size={13} weight="bold">{fmt(cardSt.pending)}</T> comprometidos en cuotas de aquí en adelante.</T></View> : null}
        </>
      ) : <T tone="mute" size={14}>Sin gastos con tarjeta este mes ni cuotas pendientes.</T>}
    </Card>
  );

  const chart = (
    <Card style={L.wide ? { marginTop: 0 } : undefined}>
      <H2>Ingresos y gastos, últimos 6 meses</H2>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, height: 130, marginTop: 8 }}>
        {ms.map((i, k) => (
          <View key={i} style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: 100, width: '100%', justifyContent: 'center' }}>
              <View style={{ width: '28%', height: `${Math.max(2, (d[k][0] / mx) * 100)}%`, backgroundColor: t.inc, borderTopLeftRadius: 4, borderTopRightRadius: 4 }} />
              <View style={{ width: '28%', height: `${Math.max(2, (d[k][1] / mx) * 100)}%`, backgroundColor: t.out, borderTopLeftRadius: 4, borderTopRightRadius: 4 }} />
              {d[k][2] > 0 ? <View accessibilityLabel={'Ahorro ' + monthShort(i)} style={{ width: '28%', height: `${Math.max(2, (d[k][2] / mx) * 100)}%`, backgroundColor: t.sav, borderTopLeftRadius: 4, borderTopRightRadius: 4 }} /> : null}
            </View>
            <T tone="mute" size={11}>{monthShort(i)}</T>
          </View>
        ))}
      </View>
      <T tone="mute" size={13} style={{ marginTop: 6 }}>Verde: ingresos · Rojo: gastos · Azul: ahorro del mes</T>
    </Card>
  );

  const savings = (
    <Card style={L.wide ? { marginTop: 0 } : undefined}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: openSav }} onPress={() => setOpenSav(o => !o)}>
        <H2>Ahorro del mes</H2>
        <Row>
          <T size={15}>{openSav ? '▾' : '▸'} {net < 0 ? 'Retiraste (neto)' : 'Ahorraste'}{rate != null ? <T size={15} weight="semi" style={{ color: t.sav }}>{` · ${rate}%`}</T> : null}</T>
          <T size={22} weight="bold" style={{ color: net < 0 ? t.out : t.sav }}>{net < 0 ? '−' : ''}{fmt(Math.abs(net))}</T>
        </Row>
        {rate != null ? <T tone="mute" size={13}>Ahorraste el {rate}% de tus ingresos del mes ({fmt(inc)})</T> : null}
        <T tone="mute" size={13}>Depósitos {fmt(dep)} · Retiros {fmt(ret)}</T>
      </Pressable>
      {openSav && (SL.length ? (
        <View style={{ marginTop: 8 }}>
          {Object.entries(by).map(([c, v]) => <Row key={c}><T size={14}>{c}</T><Money v={Math.abs(v)} tone={v < 0 ? 'out' : 'in'} sign={v < 0 ? '−' : '+'} /></Row>)}
          <View style={{ marginTop: 8 }}>{SL.map((x, k) => <Item key={x.id} first={k === 0} title={`${x.amt > 0 ? 'Depósito' : 'Retiro'} · ${x.cat}`} sub={`${dd_mm(x.date)}${x.note ? ' · ' + x.note : ''}`} right={<Money v={Math.abs(x.amt)} tone={x.amt > 0 ? 'in' : 'out'} sign={x.amt > 0 ? '+' : '−'} />} />)}</View>
        </View>
      ) : <T tone="mute" size={14} style={{ marginTop: 8 }}>No hay movimientos de ahorro este mes.</T>)}
    </Card>
  );

  const cats = (
    <Card style={L.wide ? { marginTop: 0 } : undefined}>
      <Row><H2>Gastos por categoría</H2><T tone="mute" size={12} style={{ marginBottom: 8 }}>vs. {monthName(cur - 1).toLowerCase()}</T></Row>
      {rows.length ? rows.map(([c, v]) => {
        const op = openCat.includes(c);
        return (
          <View key={c}>
            <Pressable accessibilityRole="button" accessibilityState={{ expanded: op }} onPress={() => setOpenCat(s => (s.includes(c) ? s.filter(x => x !== c) : [...s, c]))}>
              <Row>
                <T size={14} style={{ flexShrink: 1 }}>{op ? '▾' : '▸'} {c} · {Math.round((v / total) * 100)}%{(() => { const b = categoryBadge(v, prevCat[c] || 0); return b ? <T size={12} weight="semi" style={{ color: toneColor(b) }}>{'  ' + b.text}</T> : null; })()}</T>
                <T size={14}>{fmt(v)}</T>
              </Row>
              <Bar pct={(v / total) * 100} color={catColor(t, Math.max(0, snap.categories.out.findIndex(x => x.name === c)))} />
            </Pressable>
            {op && <View style={{ marginLeft: 14, marginBottom: 10 }}>
              {[...its[c]].sort((x, y) => y.a - x.a).map((o, k) => (
                <Item key={`${o.t.id}:${o.i}`} first={k === 0} title={o.t.note || o.t.cat} sub={`${dd_mm(o.t.date)}${o.t.fixed ? fixedTxt(o.t) : ''}${o.t.card ? ' · tarjeta' : ''}${o.n > 1 ? ` · cuota ${o.k}/${o.n}` : ''}`} right={<Money v={o.a} tone="out" />} />
              ))}
            </View>}
          </View>
        );
      }) : <T tone="mute" size={14}>Todavía no hay gastos este mes.</T>}
    </Card>
  );

  return (
    <Screen title="Estadísticas" month={<MonthNav bar />}>
      {L.wide ? (
        <View style={{ flexDirection: 'row', gap: 24, alignItems: 'flex-start' }}>
          <View style={{ flex: 1, gap: 24 }}>{summary}{chart}{pacing}{savings}</View><View style={{ flex: 1, gap: 24 }}>{fv}{cats}{byCard}</View>
        </View>
      ) : <><MonthNav />{summary}{chart}{pacing}{fv}{byCard}{savings}{cats}</>}
    </Screen>
  );
}
