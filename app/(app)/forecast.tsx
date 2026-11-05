import React, { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, View } from 'react-native';
import type { Occ } from '../../src/domain/types';
import { applySim, buildRows, endingInstallments, MAX_BACK, MAX_FWD, phaseOf, pressure, RANGES, savingAlertFor, savingAlerts, simInstallment, type Phase, type RangeId, type Sim } from '../../src/domain/forecast';
import { dd_mm, fmtMoney as fmt, monthLabel, monthName } from '../../src/domain/dates';
import { cardOf } from '../../src/domain/engine';
import { useStore } from '../../src/state/store';
import { BackLink, Card, Chips, Dots, Seg, T } from '../../src/ui/kit';
import { useFlows } from '../../src/ui/flows';
import { repTxt } from '../../src/ui/format';
import { SaldoChart } from '../../src/ui/SaldoChart';
import { Screen, useUI } from '../../src/ui/Shell';
import { SimSheet } from '../../src/ui/SimSheet';
import { accentOf, catColor, radius, useLayout, useTheme } from '../../src/ui/theme';

type Filter = 'all' | 'fixed' | 'var';

const CARD_IDX = [3, 4, 2, 10, 12, 5];

/** Barra horizontal de varios tramos sobre una misma escala. */
function Bar({ parts, base }: { parts: { v: number; color: string }[]; base: number }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', height: 8, borderRadius: 5, overflow: 'hidden', backgroundColor: t.line, marginVertical: 4 }}>
      {parts.filter(p => p.v > 0.005).map((p, k) => <View key={k} style={{ width: `${Math.min((p.v / base) * 100, 100)}%`, backgroundColor: p.color }} />)}
    </View>
  );
}

/** Resumen de un mes: saldo anterior, ingresos, gastos (con tarjetas), ahorro, neto del mes y cómo se llega al previsto. */
function MonthSummary({ i, carry, run, compact, phase = 'future', add = 0 }: { i: number; carry: number; run: number; compact?: boolean; phase?: Phase; add?: number }) {
  const { eng } = useStore(), t = useTheme(), past = phase === 'past';
  const b0 = eng.monthBalance(i), inc = b0.inc, sv = b0.sv, out = b0.out + add, bal = b0.bal - add;   // `add` = cuota de una compra simulada
  const cs: [string, number][] = [];
  eng.all().filter(o => o.i === i && o.t.card && o.t.type === 'out').forEach(o => {
    const c = cardOf(o.t), f = cs.find(x => x[0] === c);
    if (f) f[1] += o.a; else cs.push([c, o.a]);
  });
  const cardTot = cs.reduce((a, x) => a + x[1], 0), rest = b0.out - cardTot;
  const colorOf = (k: number) => (k === 0 ? t.acc : catColor(t, CARD_IDX[(k - 1) % CARD_IDX.length]));
  const base = Math.max(inc, out + Math.max(sv, 0), 1);
  const good = bal >= 0, tone = good ? t.inc : t.out, alert = savingAlertFor(eng, i, run);
  const abs = Math.abs(bal);
  const cuenta = `${fmt(inc)} − ${fmt(out)}${sv > 0.005 ? ' − ' + fmt(sv) : sv < -0.005 ? ' + ' + fmt(-sv) : ''} = ${bal < 0 ? '− ' : ''}${fmt(abs)}`;
  const label = (txt: string, v: number, c: 'in' | 'out' | 'ink', col?: string) => (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 10 }}>
      <T size={13} weight="semi">{txt}</T>
      <T size={14} weight="bold" tone={c} style={col ? { color: col } : undefined}>{fmt(v)}</T>
    </View>
  );
  return (
    <View>
      <View accessibilityLabel="Saldo del mes anterior" style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', backgroundColor: t.bg, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 10 }}>
        <T size={13} tone="mute" weight="semi">Saldo del mes anterior</T>
        <T size={14} weight="bold" tone={carry < 0 ? 'out' : 'ink'}>{fmt(carry)}</T>
      </View>
      {label('Ingresos', inc, 'in')}
      <Bar base={base} parts={[{ v: inc, color: t.inc }]} />
      {label('Gastos', out, 'out')}
      <Bar base={base} parts={[{ v: rest, color: t.out }, ...cs.map((c, k) => ({ v: c[1], color: colorOf(k) })), { v: add, color: t.acc }]} />
      {cs.length || add > 0 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 12, rowGap: 2, marginTop: 5 }}>
          {rest > 0.005 ? <Legend color={t.out} text={`Gastos en efectivo ${fmt(rest)}`} /> : null}
          {cs.map((c, k) => <Legend key={c[0]} color={colorOf(k)} text={`${c[0]} ${fmt(c[1])}`} />)}
          {add > 0 ? <Legend color={t.acc} text={`Compra simulada ${fmt(add)}`} /> : null}
        </View>
      ) : null}
      {Math.abs(sv) > 0.005 ? <>{label(sv > 0 ? 'Ahorro' : 'Retiro de ahorro', Math.abs(sv), 'ink', t.sav)}<Bar base={base} parts={[{ v: Math.abs(sv), color: t.sav }]} /></> : null}
      <View accessibilityLabel="Balance mensual" style={{ marginTop: 14, gap: 4, alignItems: 'flex-start' }}>
        <View style={{ backgroundColor: tone + '22', borderRadius: radius.pill, paddingVertical: 5, paddingHorizontal: 11 }}>
          <T size={13} weight="bold" style={{ color: tone }}>{bal === 0 ? (past ? 'Ese mes quedó en $0' : 'Este mes queda en $0') : (good ? (past ? 'Te sobraron ' : 'Te sobran ') : (past ? 'Te faltaron ' : 'Te faltan ')) + fmt(abs) + (past ? ' ese mes' : ' este mes')}</T>
        </View>
        <T size={12} tone="mute">{cuenta}</T>
      </View>
      {alert ? <View accessibilityLabel="Ahorro programado en negativo" style={{ marginTop: 8 }}><T size={12.5} tone="out" weight="semi">{alertText(alert).lead}{alertText(alert).text}</T></View> : null}
      <View accessibilityLabel={past ? 'Saldo al cierre' : 'Saldo previsto al cierre'} style={{ marginTop: 10, backgroundColor: t.bg, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <T size={13} tone="mute" weight="semi">{past ? 'Saldo al cierre' : 'Saldo previsto al cierre'}</T>
          <T size={12} tone="mute">{fmt(carry)} {bal < 0 ? '−' : '+'} {fmt(abs)}</T>
        </View>
        <T size={compact ? 18 : 20} weight="bold" tone={run < 0 ? 'out' : 'ink'} style={{ flexShrink: 0 }}>{fmt(run)}</T>
      </View>
    </View>
  );
}

/** Frase del aviso de ahorro programado que deja la cuenta en negativo. */
const alertText = (a: { i: number; amt: number; first: string; run: number; without: number; deepens: boolean }) => ({
  lead: `El depósito programado de ${fmt(a.amt)} (${dd_mm(a.first)})`,
  text: a.deepens ? ` agranda el faltante de ${monthName(a.i)}: aun sin él la cuenta cerraba en ${fmt(a.without)}.` : ` deja ${monthName(a.i)} en ${fmt(a.run)}; sin él cerraría en ${fmt(a.without)}.`,
});

function Legend({ color, text }: { color: string; text: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
      <View style={{ width: 9, height: 9, borderRadius: 3, backgroundColor: color }} />
      <T size={12} tone="mute">{text}</T>
    </View>
  );
}

/** Una columna (Ingresos o Gastos): categorías con su total; tocar una categoría muestra sus movimientos. */
function Column({ type, occs, extra, wide, onMenu }: { type: 'in' | 'out'; occs: Occ[]; extra: number; wide: boolean; onMenu: (o: Occ) => void }) {
  const t = useTheme(), ac = accentOf(t, type);
  const [open, setOpen] = useState<string | null>(null);
  const by = new Map<string, Occ[]>();
  occs.forEach(o => by.set(o.t.cat, [...(by.get(o.t.cat) || []), o]));
  const rows = [...by.entries()].map(([cat, os]) => ({ cat, os, tot: os.reduce((a, o) => a + o.a, 0) })).sort((a, b) => b.tot - a.tot);
  const total = rows.reduce((a, r) => a + r.tot, 0) + extra;
  const label = type === 'in' ? 'Ingresos' : 'Gastos';
  return (
    <View accessibilityLabel={'Columna ' + label} style={{ flex: 1, minWidth: 0, backgroundColor: t.card, borderColor: t.line, borderWidth: 1, borderRadius: radius.md, padding: 10 }}>
      <View style={{ borderBottomWidth: 2, borderBottomColor: ac.bg, paddingBottom: 6, marginBottom: 4 }}>
        <T size={13} tone="mute" weight="semi">{label}</T>
        <T size={18} weight="bold" tone={type}>{fmt(total)}</T>
      </View>
      {rows.length === 0 && extra === 0 ? <T tone="mute" size={13} style={{ paddingVertical: 8 }}>Sin movimientos</T> : null}
      {rows.map(r => {
        const isOpen = open === r.cat;
        return (
          <View key={r.cat} style={{ borderTopWidth: 1, borderTopColor: t.line }}>
            <Pressable accessibilityRole="button" accessibilityLabel={`${label} · ${r.cat}`} accessibilityState={{ expanded: isOpen }} onPress={() => setOpen(isOpen ? null : r.cat)} style={{ paddingVertical: 8 }}>
              <View style={{ flexDirection: wide ? 'row' : 'column', justifyContent: 'space-between', gap: wide ? 8 : 0 }}>
                <T size={14} style={{ flexShrink: 1 }}>{r.cat} <T size={12} tone="mute">{isOpen ? '▴' : '▾'}</T></T>
                <T size={14} weight="semi">{fmt(r.tot)}</T>
              </View>
            </Pressable>
            {isOpen ? (
              <View style={{ paddingBottom: 6 }}>
                {r.os.map((o, k) => (
                  <View key={k} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 5, paddingLeft: 8, borderLeftWidth: 2, borderLeftColor: ac.bg, marginBottom: 4 }}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <T size={13}>{o.t.note || o.t.cat}</T>
                      <T size={12} tone="mute">{o.t.fixed ? 'Fijo · día ' + +o.t.date.slice(8) : o.t.of ? 'Fijo · editado este mes' : dd_mm(o.t.date)}{repTxt(o.t)}{o.t.card ? ' · ' + (o.t.cardName || 'tarjeta') + (o.n > 1 ? ` ${o.k}/${o.n}` : '') : ''}</T>
                      <T size={13} weight="semi">{fmt(o.a)}</T>
                    </View>
                    <Dots label={'Opciones de ' + (o.t.note || o.t.cat)} onPress={() => onMenu(o)} />
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        );
      })}
      {extra !== 0 ? (
        <View style={{ borderTopWidth: rows.length ? 1 : 0, borderTopColor: t.line, paddingVertical: 8 }}>
          <T size={14}>Adelantos de tarjeta</T><T size={14} weight="semi">{fmt(extra)}</T>
        </View>
      ) : null}
    </View>
  );
}

/** Detalle de un mes: gastos fijos + ingresos y gastos en dos columnas por categoría, con filtro. */
function MonthDetail({ i, close, run, carry, phase, add }: { i: number; close: () => void; run: number; carry: number; phase: Phase; add: number }) {
  const { eng } = useStore(), L = useLayout(), F = useFlows(), ui = useUI();
  const [flt, setFlt] = useState<Filter>('all');
  const M = eng.all().filter(o => o.i === i);
  const pass = (o: Occ) => (flt === 'all' ? true : flt === 'fixed' ? !!(o.t.fixed || o.t.of) : !(o.t.fixed || o.t.of));
  const ins = M.filter(o => o.t.type === 'in' && pass(o)), outs = M.filter(o => o.t.type === 'out' && pass(o));
  const adv = flt === 'all' ? eng.advNet(i) : 0;
  const menu = (o: Occ) => F.txMenu(o.t, o.i, (tx, ix, scope) => ui.openTx({ t: tx, i: ix, scope }));
  return (
    <>
      <BackLink label="‹ Volver a Previsión" onPress={close} />
      <T size={26} weight="bold" style={{ letterSpacing: -0.5 }}>{monthLabel(i)}</T>
      <Card style={{ marginTop: 12 }}><MonthSummary i={i} carry={carry} run={run} phase={phase} add={add} /></Card>

      <View style={{ marginTop: 16 }}>
        <Seg value={flt} onChange={setFlt} options={[['all', 'Todos'], ['fixed', 'Solo fijos'], ['var', 'Del mes']]} />
      </View>
      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
        <Column key={'in' + flt} type="in" occs={ins} extra={0} wide={L.width >= 480} onMenu={menu} />
        <Column key={'out' + flt} type="out" occs={outs} extra={adv} wide={L.width >= 480} onMenu={menu} />
      </View>
    </>
  );
}

const GAP = 8, PEEK = 20;

/** Aviso corto de la pantalla: punto de color + una frase con el dato en negrita. */
function Notice({ tone, lead, text }: { tone: 'bad' | 'good' | 'info'; lead: string; text: string }) {
  const t = useTheme(), c = tone === 'bad' ? t.out : tone === 'good' ? t.inc : t.mute;
  return (
    <View accessibilityRole="text" style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start', borderRadius: radius.sm, paddingVertical: 10, paddingHorizontal: 12, backgroundColor: tone === 'info' ? t.card : c + '22', borderWidth: tone === 'info' ? 1 : 0, borderColor: t.line }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c, marginTop: 6 }} />
      <T size={13} style={{ flex: 1, lineHeight: 19 }}><T size={13} weight="bold">{lead}</T>{text}</T>
    </View>
  );
}

const TAGS: Record<Phase, string> = { past: 'Real', now: 'En curso', future: 'Previsto' };

function PhaseTag({ phase }: { phase: Phase }) {
  const t = useTheme(), now = phase === 'now';
  return (
    <View style={{ borderRadius: radius.pill, paddingVertical: 3, paddingHorizontal: 9, backgroundColor: now ? t.acc : 'transparent', borderWidth: now ? 0 : 1, borderColor: t.line }}>
      <T size={11} weight="bold" tone={now ? undefined : 'mute'} style={now ? { color: t.accInk } : undefined}>{TAGS[phase]}</T>
    </View>
  );
}

export default function Prevision() {
  const { eng } = useStore(), L = useLayout(), t = useTheme();
  const [sel, setSel] = useState<number | null>(null), [page, setPage] = useState(0);
  const [rid, setRid] = useState<RangeId>('f6'), [sim, setSim] = useState<Sim | null>(null), [simOpen, setSimOpen] = useState(false);
  const sc = useRef(null as any);
  const now = eng.now, av = eng.availFor(now), rg = RANGES.find(r => r.id === rid) ?? RANGES[0];
  const baseAll = buildRows(eng, now - MAX_BACK, now + MAX_FWD), allRows = applySim(baseAll, sim);
  const rows = allRows.filter(r => r.i >= now - rg.back && r.i <= now + rg.fwd);
  // ancho de cada mes: en el celular ocupa casi todo el ancho y deja asomar el siguiente; en pantallas grandes entran varios
  const pageW = L.mobile ? Math.min(L.width, L.content) - 32 - PEEK : 440, step = pageW + GAP;
  useEffect(() => { if (sel === null) sc.current?.scrollTo({ x: page * step, animated: false }); }, [sel, step, rid]); // eslint-disable-line react-hooks/exhaustive-deps
  const goTo = (k: number) => { setPage(k); sc.current?.scrollTo({ x: k * step, animated: true }); };
  const pickRange = (label: string) => { const r = RANGES.find(x => x.label === label) ?? RANGES[0]; setRid(r.id); setPage(r.back); };
  const selRow = sel === null ? undefined : allRows.find(r => r.i === sel);
  if (selRow) return <Screen><MonthDetail i={selRow.i} run={selRow.run} carry={selRow.carry} phase={phaseOf(selRow.i, now)} add={selRow.add} close={() => setSel(null)} /></Screen>;

  const pr = pressure(allRows, now), ends = endingInstallments(eng, now);
  const snap: any = Platform.OS === 'web' ? { scrollSnapType: 'x mandatory' } : null;
  return (
    <Screen title="Previsión">
      <T tone="mute" size={14}>Disponible hoy</T>
      <T size={46} weight="bold" tone={av < 0 ? 'out' : 'ink'} style={{ letterSpacing: -2, lineHeight: 52 }}>{fmt(av)}</T>
      <T tone="mute" size={13} style={{ marginTop: 6 }}>Lo cobrado menos lo pagado hasta hoy, más el saldo anterior. Cada mes parte del previsto del mes anterior.</T>

      <View style={{ marginTop: 14 }}><Chips labelPrefix="Rango: " value={rg.label} options={RANGES.map(r => r.label)} onChange={pickRange} /></View>

      {sim ? (
        <View accessibilityLabel="Simulación activa" style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap', backgroundColor: t.acc + '2b', borderRadius: radius.sm, paddingVertical: 8, paddingHorizontal: 12, marginBottom: 8 }}>
          <T size={13} style={{ flex: 1, minWidth: 160 }}><T size={13} weight="bold">Simulando </T>{fmt(sim.amt)} en {sim.n} {sim.n === 1 ? 'cuota' : 'cuotas'} de {fmt(simInstallment(sim))} desde {monthName(sim.first)}. Es una prueba, no se guardó.</T>
          <Pressable accessibilityRole="button" accessibilityLabel="Salir de la simulación" onPress={() => setSim(null)} hitSlop={6}><T size={13} weight="semi">Salir de la simulación</T></Pressable>
        </View>
      ) : null}

      <Card style={{ marginTop: 0 }}>
        <SaldoChart rows={rows} now={now} page={Math.min(page, rows.length - 1)} onSelect={goTo} simulating={!!sim} />
        {!sim ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Simular una compra" onPress={() => setSimOpen(true)} style={{ alignSelf: 'flex-start', marginTop: 12, paddingVertical: 7, paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 1, borderColor: t.line }}>
            <T size={13} weight="semi">¿Y si compro algo?</T>
          </Pressable>
        ) : null}
      </Card>

      <View accessibilityLabel="Avisos" style={{ gap: 8, marginTop: 12 }}>
        {pr.heavy ? <Notice tone="bad" lead={`${monthName(pr.heavy.i)} es el mes más pesado de los próximos 12.`} text={` Te faltan ${fmt(-pr.heavy.bal)} ese mes: es el peor balance mensual de todos.`} /> : null}
        {pr.low ? <Notice tone="bad" lead={`Ojo con ${monthName(pr.low.i)}:`} text={` el saldo llega a ${fmt(pr.low.run)}, el punto más bajo de los próximos 12.`} /> : null}
        {!pr.heavy && !pr.low ? <Notice tone="good" lead="Todo en orden." text=" Ningún mes de los próximos 12 gasta más de lo que ingresa." /> : null}
        {savingAlerts(eng, allRows).slice(0, 2).map(a => <Notice key={a.i} tone="bad" lead={alertText(a).lead} text={alertText(a).text} />)}
        {ends ? <Notice tone="info" lead={`${ends.i === now ? 'Este mes' : 'En ' + monthName(ends.i)} ${ends.count === 1 ? 'termina una compra en cuotas.' : `terminan ${ends.count} compras en cuotas.`}`} text={` Desde ${monthName(ends.i + 1)} se liberan ${fmt(ends.freed)} por mes.`} /> : null}
      </View>

      <ScrollView ref={sc} horizontal accessibilityLabel="Meses" showsHorizontalScrollIndicator={false} scrollEventThrottle={16} decelerationRate="fast" snapToInterval={step} snapToAlignment="start"
        onScroll={(e: any) => { const p = Math.max(0, Math.min(rows.length - 1, Math.round(e.nativeEvent.contentOffset.x / step))); if (p !== page) setPage(p); }}
        style={[{ marginTop: 14, flexGrow: 0 }, snap]} contentContainerStyle={{ gap: GAP, paddingRight: PEEK }}>
        {rows.map((r, k) => {
          const ph = phaseOf(r.i, now);
          return (
            <View key={r.i} style={[{ width: pageW }, Platform.OS === 'web' ? ({ scrollSnapAlign: 'start' } as any) : null]}>
              <Card style={{ flex: 1, marginTop: 0, justifyContent: 'space-between', ...(ph === 'past' ? { backgroundColor: t.bg } : null) }}>
                <View accessibilityLabel={'Resumen de ' + monthLabel(r.i)}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 10 }}>
                    <T weight="bold">{monthLabel(r.i)}</T>
                    <PhaseTag phase={ph} />
                  </View>
                  <MonthSummary i={r.i} carry={r.carry} run={r.run} compact={pageW < 300} phase={ph} add={r.add} />
                </View>
                <Pressable accessibilityRole="button" accessibilityLabel={'Mostrar detalle de ' + monthLabel(r.i)} onPress={() => { setPage(k); setSel(r.i); }} hitSlop={6} style={{ alignSelf: 'center', marginTop: 12, paddingVertical: 6, paddingHorizontal: 12 }}>
                  <T size={12.5} weight="semi" tone="mute">Mostrar detalle</T>
                </Pressable>
              </Card>
            </View>
          );
        })}
      </ScrollView>
      <View accessibilityLabel="Elegir mes" style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 4, marginTop: 10 }}>
        {rows.map((r, k) => <Dot key={r.i} on={k === page} neg={r.run < -0.005} label={'Ir a ' + monthLabel(r.i)} onPress={() => goTo(k)} />)}
      </View>
      <SimSheet visible={simOpen} onClose={() => setSimOpen(false)} base={baseAll} now={now} current={sim} onApply={setSim} />
    </Screen>
  );
}

function Dot({ on, neg, label, onPress }: { on: boolean; neg?: boolean; label: string; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: on }} onPress={onPress} hitSlop={6} style={{ paddingVertical: 6, paddingHorizontal: 3 }}>
      <View style={{ width: on ? 18 : 6, height: 6, borderRadius: 3, backgroundColor: neg ? t.out : on ? t.ink : t.line, opacity: neg && !on ? 0.55 : 1 }} />
    </Pressable>
  );
}
