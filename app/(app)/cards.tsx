import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { dd_mm, fmtMoney as fmt, monthLabel, monthShort } from '../../src/domain/dates';
import { cardOf } from '../../src/domain/engine';
import type { Occ, Tx } from '../../src/domain/types';
import { useStore } from '../../src/state/store';
import { BackLink, Button, Card, Dots, H2, Item, Money, Row, T } from '../../src/ui/kit';
import { useFlows } from '../../src/ui/flows';
import { fixedTxt, repTxt } from '../../src/ui/format';
import { lookOf } from '../../src/domain/cardLook';
import { CardDebt } from '../../src/ui/CardDebt';
import { CardHero } from '../../src/ui/CardHero';
import { ShareStrip } from '../../src/ui/CardShare';
import { MonthNavView, Screen, Stat, useUI } from '../../src/ui/Shell';
import { radius, useLayout, useTheme } from '../../src/ui/theme';

export default function Tarjetas() {
  const { eng, snap } = useStore(), F = useFlows(), ui = useUI(), L = useLayout();
  const names = eng.cardNames();
  const [gm, setGm] = useState(eng.now); // mes de cierre que se está viendo (compartido por el listado y el detalle)
  const [sel, setSel] = useState<string | null>(null);

  const st = names.map(n => eng.stmtD(n, gm + 1));
  const total = st.reduce((a, q) => a + q.due, 0), paid = st.reduce((a, q) => a + q.paid, 0), pend = st.reduce((a, q) => a + Math.max(0, q.rem), 0);

  if (sel !== null && names.includes(sel)) return <CardDetail key={sel} n={sel} cm={gm} setGm={setGm} back={() => setSel(null)} />;

  const cardView = (n: string) => {
    const q = eng.stmtD(n, gm + 1);
    return (
      <Pressable key={n} accessibilityRole="button" accessibilityLabel={'Ver ' + n} onPress={() => setSel(n)} style={{ width: L.wide ? '48.5%' : '100%', marginTop: L.wide ? 0 : 14, marginBottom: L.wide ? 24 : 0 }}>
        <CardHero name={n} due={q.due} paid={q.paid} rem={q.rem} sub={heroSub(eng, n, gm, !!(snap.cardInfo[n] || {}).months?.[gm])} look={lookOf(snap.cardInfo, names, n)} onMenu={() => F.cardMenu(n, gm, () => ui.openCardLook(n))} />
      </Pressable>
    );
  };

  return (
    <Screen title="Tarjetas" month={<MonthNavView bar caption="Cierre de" cur={gm} onChange={setGm} />} summary={c => (
      <>
        <Stat hero flex={1.1} c={c} label="Total a abonar de todas las tarjetas" value={fmt(total)} tone={total > 0.005 ? 'out' : 'ink'} sub={names.length ? (total > 0.005 ? `Se paga en ${monthLabel(gm + 1, false)}` : 'Sin resúmenes este mes') : 'Agrega tu primera tarjeta'} />
        <Stat c={c} label="Pagado" value={fmt(paid)} tone="in" sub={`de ${fmt(total)}`} />
        <Stat c={c} label="Pendiente" value={fmt(pend)} tone={pend > 0.005 ? 'out' : 'ink'} sub={total > 0.005 ? `Se paga en ${monthLabel(gm + 1, false)}` : undefined} />
      </>
    )}>
      {L.wide ? null : (
        <>
          <MonthNavView caption="Cierre de" cur={gm} onChange={setGm} />
          <T tone="mute" size={14}>Total a abonar de todas las tarjetas</T>
          <T size={46} weight="bold" tone={total > 0.005 ? 'out' : 'ink'} style={{ letterSpacing: -2, lineHeight: 52 }}>{fmt(total)}</T>
          <T tone="mute" size={13} style={{ marginTop: 6 }}>{names.length ? (total > 0.005 ? `Se paga en ${monthLabel(gm + 1, false)} · Pagado ${fmt(paid)} · Pendiente ${fmt(pend)}` : 'Sin resúmenes este mes') : 'Agrega tu primera tarjeta o elígela al cargar un gasto.'}</T>
        </>
      )}
      {names.length ? <View style={L.wide ? { marginBottom: 24 } : undefined}><ShareStrip i={gm + 1} /></View> : null}
      {names.length ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}>{names.map(cardView)}</View> : null}
      {names.length ? <View style={{ marginTop: L.wide ? 0 : 14 }}><CardDebt from={gm + 1} /></View> : null}
      <Button kind="option" label="＋ Agregar tarjeta" onPress={() => F.addCard()} style={{ marginTop: L.wide ? 24 : 14 }} />
    </Screen>
  );
}

/** Texto de abajo del nombre: cierre y mes en que se paga. */
function heroSub(eng: ReturnType<typeof useStore>['eng'], n: string, cm: number, own: boolean) {
  return `${eng.hasClose(n) ? `Cierra el día ${eng.closeDay(n, cm)}${own ? ' (este mes)' : ''} · se paga en ` : 'Cierre sin definir · se paga en '}${monthLabel(cm + 1, false)}`;
}

/** Compras en cuotas de la tarjeta que todavía tienen cuotas por pagar después del resumen que se está viendo. */
interface Plan { t: Tx; name: string; k: number; n: number; a: number; inStmt: boolean; fut: Occ[]; resta: number; at: number }

/** Detalle de una tarjeta: resumen del mes, cuotas pendientes y movimientos editables. */
function CardDetail({ n, cm, setGm, back }: { n: string; cm: number; setGm: (i: number) => void; back: () => void }) {
  const { eng, snap } = useStore(), F = useFlows(), ui = useUI(), t = useTheme();
  const [view, setView] = useState<'main' | 'cuotas'>('main');
  const now = eng.now, st = cm + 1, q = eng.stmtD(n, st), has = q.due > 0.005, owe = has && q.rem > 0.005;
  const C = eng.all().filter(o => o.t.card && cardOf(o.t) === n);
  const Cm = C.filter(o => o.i === st).sort((a, b) => a.t.date.slice(8).localeCompare(b.t.date.slice(8)));
  const pays = snap.pay.filter(p => p.card === n && p.i === st);
  const debt = Math.max(0, C.filter(o => !o.t.fixed || o.i <= now + 1).reduce((a, o) => a + o.a, 0) - snap.pay.filter(p => p.card === n).reduce((a, p) => a + p.amt, 0));
  const edit = (o: Occ) => F.txMenu(o.t, o.i, (tx, ix, scope) => ui.openTx({ t: tx, i: ix, scope }));
  const plans: Plan[] = snap.tx
    .filter(x => x.card && !x.fixed && (x.inst || 1) > 1 && cardOf(x) === n)
    .map(x => {
      const oc = eng.occ(x), cur = oc.find(o => o.i === st), fut = oc.filter(o => o.i > st), ref = cur || fut[0];
      return ref ? { t: x, name: x.note || x.cat, k: ref.k, n: ref.n, a: ref.a, inStmt: !!cur, fut, resta: fut.reduce((a, o) => a + o.a, 0), at: ref.i } : null;
    })
    .filter((x): x is Plan => !!x && x.fut.length > 0)
    .sort((a, b) => a.fut[a.fut.length - 1].i - b.fut[b.fut.length - 1].i);
  const ci = snap.cardInfo[n] || {};

  if (view === 'cuotas') {
    const tot = plans.reduce((a, p) => a + p.resta, 0), cnt = plans.reduce((a, p) => a + p.fut.length, 0);
    const byMonth = new Map<number, number>();
    plans.forEach(p => p.fut.forEach(o => byMonth.set(o.i, (byMonth.get(o.i) || 0) + o.a)));
    const last = Math.max(0, ...byMonth.keys()), months = Array.from({ length: Math.min(6, Math.max(0, last - st)) }, (_, k) => st + 1 + k);
    const mx = Math.max(1, ...months.map(i => byMonth.get(i) || 0));
    return (
      <Screen>
        <BackLink label={`‹ Volver a ${n}`} onPress={() => setView('main')} />
        <T size={26} weight="bold" style={{ letterSpacing: -0.5 }}>Cuotas pendientes</T>
        {plans.length === 0 ? <Card><T tone="mute" size={14}>No tenés compras en cuotas pendientes en esta tarjeta.</T></Card> : (
          <>
            <Card style={{ marginTop: 12 }}>
              <T tone="mute" size={13}>Te falta pagar en cuotas</T>
              <T size={30} weight="bold" tone="out" style={{ letterSpacing: -0.8 }}>{fmt(tot)}</T>
              <T tone="mute" size={13}>{cnt} {cnt === 1 ? 'cuota más' : 'cuotas más'}, sin contar las de este resumen · termina en {monthLabel(last, false)} {Math.floor(last / 12)}</T>
              <T tone="mute" size={12} style={{ marginTop: 6 }}>Deuda total de la tarjeta {fmt(debt)}</T>
            </Card>
            <H2>Cómo baja por mes</H2>
            <Card style={{ marginTop: 0 }}>
              <View accessibilityLabel="Cuotas por mes" style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, height: 110 }}>
                {months.map((i, k) => {
                  const v = byMonth.get(i) || 0;
                  return (
                    <View key={i} style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
                      <T size={10.5} tone="mute" weight="semi">{Math.round(v / 1000)}k</T>
                      <View style={{ width: '100%', height: Math.max(6, (v / mx) * 64), borderTopLeftRadius: 6, borderTopRightRadius: 6, borderBottomLeftRadius: 3, borderBottomRightRadius: 3, backgroundColor: k === 0 ? t.acc : t.line }} />
                      <T size={10.5} weight="semi" tone={k === 0 ? 'ink' : 'mute'}>{monthShort(i)}</T>
                    </View>
                  );
                })}
              </View>
              <T tone="mute" size={12} style={{ marginTop: 8 }}>Lo que se suma a cada resumen por estas cuotas.</T>
            </Card>
            <H2>Por compra</H2>
            {plans.map(p => (
              <Card key={p.t.id} style={{ marginTop: 0, marginBottom: 10 }}>
                <View accessibilityLabel={'Cuotas de ' + p.name}>
                  <Row><T weight="bold" style={{ flex: 1 }}>{p.name}</T><Money v={p.a} tone="out" /><T tone="mute" size={12}> por mes</T><Dots label={'Opciones de ' + p.name} onPress={() => edit({ t: p.t, i: p.at, k: p.k, n: p.n, a: p.a })} /></Row>
                  <View style={{ flexDirection: 'row', gap: 3, marginVertical: 8 }}>
                    {Array.from({ length: p.n }, (_, j) => <View key={j} style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: j + 1 < p.k ? t.acc : j + 1 === p.k ? t.ink : t.line }} />)}
                  </View>
                  <Row><T size={12} tone="mute">Cuota <T size={12} weight="bold">{p.k} de {p.n}</T>{p.inStmt ? ' · en este resumen' : ''}</T><T size={12} tone="mute">{p.t.cat}</T></Row>
                  <Row style={{ marginTop: 3 }}><T size={12} tone="mute">Faltan <T size={12} weight="bold">{p.fut.length}</T> · <T size={12} weight="bold">{fmt(p.resta)}</T></T><T size={12} tone="mute">Termina {monthShort(p.fut[p.fut.length - 1].i).toLowerCase()} {Math.floor(p.fut[p.fut.length - 1].i / 12)}</T></Row>
                </View>
              </Card>
            ))}
          </>
        )}
      </Screen>
    );
  }

  const day = (a: number, b: number) => `${String(a).padStart(2, '0')}/${String(b).padStart(2, '0')}`;
  return (
    <Screen>
      <BackLink label="‹ Volver a Tarjetas" onPress={back} />
      <CardHero name={n} due={q.due} paid={q.paid} rem={q.rem} sub={heroSub(eng, n, cm, !!ci.months?.[cm])} look={lookOf(snap.cardInfo, eng.cardNames(), n)} onMenu={() => F.cardMenu(n, cm, () => ui.openCardLook(n))} />
      <MonthNavView caption="Cierre de" cur={cm} onChange={setGm} />
      {owe && <Button label="Pagar resumen" onPress={() => F.payMenu(n, st)} style={{ marginTop: 14 }} />}
      <Card>
        <Row><T size={14} tone="mute">Compras del mes</T><T size={14} weight="bold">{fmt(q.items)}</T></Row>
        {q.carry > 0.005 ? <Row style={{ marginTop: 6 }}><T size={14} tone="mute">Saldo anterior</T><T size={14} weight="bold">{fmt(q.carry)}</T></Row> : null}
        {q.carry > 0.005 ? <Row style={{ marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: t.line }}><T size={14} weight="bold">Total del resumen</T><T size={14} weight="bold">{fmt(q.due)}</T></Row> : null}
        {eng.hasClose(n) ? <T tone="mute" size={12} style={{ marginTop: 6 }}>Compras del {day(eng.closeDay(n, cm - 1) + 1, ((cm - 1 + 12) % 12) + 1)} al {day(eng.closeDay(n, cm), (cm % 12) + 1)}</T> : null}
      </Card>
      {plans.length > 0 && (
        <Pressable accessibilityRole="button" accessibilityLabel="Cuotas pendientes" onPress={() => setView('cuotas')}
          style={{ marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: t.card, borderColor: t.line, borderWidth: 1, borderRadius: radius.md, paddingVertical: 12, paddingHorizontal: 14 }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <T size={14} weight="bold">Cuotas pendientes</T>
            <T size={12} tone="mute">{plans.length} {plans.length === 1 ? 'compra' : 'compras'} · {(() => { const c = plans.reduce((a, p) => a + p.fut.length, 0); return c === 1 ? 'falta 1 cuota' : `faltan ${c} cuotas`; })()} · {fmt(plans.reduce((a, p) => a + p.resta, 0))}</T>
          </View>
          <View style={{ backgroundColor: t.acc, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 2 }}><T size={12} weight="bold" style={{ color: t.accInk }}>{plans.length}</T></View>
          <T tone="mute" size={20}>›</T>
        </Pressable>
      )}
      <View style={{ marginTop: 16 }}><H2>Movimientos ({Cm.length})</H2></View>
      {Cm.length || q.carry > 0.005 ? (
        <Card style={{ marginTop: 0, paddingVertical: 4 }}>
          {Cm.map((o, k) => <Item key={`${o.t.id}:${o.k}`} first={k === 0} title={o.t.note || o.t.cat}
            sub={`${o.t.cat} · compra ${dd_mm(o.t.date)}${o.t.fixed ? fixedTxt(o.t) : ''}${repTxt(o.t)}${o.n > 1 ? ` · cuota ${o.k}/${o.n}` : ''}`}
            right={<Row><Money v={o.a} tone="out" /><Dots label={'Opciones de ' + (o.t.note || o.t.cat)} onPress={() => edit(o)} /></Row>} />)}
          {q.carry > 0.005 && <Item first={Cm.length === 0} title="Saldo del resumen anterior" sub="pendiente de pago" right={<Money v={q.carry} tone="out" />} />}
        </Card>
      ) : <T tone="mute" size={14}>Esta tarjeta no tiene movimientos este mes.</T>}
      {pays.length ? (<><View style={{ marginTop: 16 }}><H2>Pagos de este resumen</H2></View><Card style={{ marginTop: 0, paddingVertical: 4 }}>{pays.map((p, k) => <Item key={p.id} first={k === 0} title="Pago" sub={dd_mm(p.date)} right={<Row><Money v={p.amt} tone="in" /><Dots label="Eliminar pago" onPress={() => F.undoPay(p)} /></Row>} />)}</Card></>) : null}
    </Screen>
  );
}
