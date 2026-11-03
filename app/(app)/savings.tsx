import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import type { Sav } from '../../src/domain/types';
import { dd_mm_yyyy, fmtMoney as fmt, monthLabel, monthName } from '../../src/domain/dates';
import { useStore } from '../../src/state/store';
import { useDialogs } from '../../src/ui/dialogs';
import { Bar, Button, Card, Dots, H2, Item, Money, Row, T } from '../../src/ui/kit';
import { Icon, type IconName } from '../../src/ui/icons';
import { useFlows } from '../../src/ui/flows';
import { MonthNavView, Screen, useUI } from '../../src/ui/Shell';
import { catColor, radius, useLayout, useTheme } from '../../src/ui/theme';

export default function Ahorro() {
  const { eng, snap, A, run } = useStore(), F = useFlows(), ui = useUI(), dlg = useDialogs(), L = useLayout(), th = useTheme();
  const [filter, setFilter] = useState<string | null>(null);
  const [mi, setMi] = useState(eng.now); // mes de la lista de movimientos (lo de arriba siempre muestra el total de hoy)
  const cats = snap.categories.sav.filter(c => !c.hidden);
  const bal: Record<string, number> = {};
  cats.forEach(c => { bal[c.name] = 0; });
  snap.sav.forEach(x => { if (x.cat in bal && eng.isDone(x)) bal[x.cat] += x.amt; });   // lo programado para después todavía no cuenta
  const tot = Object.values(bal).reduce((a, b) => a + b, 0), totGain = Object.keys(bal).reduce((a, c) => a + eng.svReturn(c).gain, 0), cap = Object.values(bal).reduce((a, b) => a + Math.max(0, b), 0);
  // cada categoría conserva siempre su color (según su lugar en la lista de categorías de ahorro)
  const colorOf = (c: string) => catColor(th, Math.max(0, snap.categories.sav.findIndex(x => x.name === c)));
  const share = (v: number) => (cap > 0.005 ? (Math.max(0, v) / cap) * 100 : 0);
  const shareTxt = (v: number) => { const p = share(v); return p <= 0 ? '0%' : p < 1 ? '<1%' : `${Math.round(p)}%`; };
  const ms = eng.monthSaving(mi), rate = ms.pct == null ? null : ms.pct < 1 ? '<1' : String(Math.round(ms.pct));
  const list = snap.sav.filter(x => eng.svMonth(x) === mi && (!filter || x.cat === filter)).sort((a, b) => b.date.localeCompare(a.date));
  // Movimientos con fecha futura: todavía no mueven la cuenta ni el saldo de Ahorro.
  const pend = eng.svPending(), pDep = pend.filter(x => !x.tid && !x.adj && x.amt > 0).reduce((a, x) => a + x.amt, 0), pRet = pend.filter(x => !x.tid && !x.adj && x.amt < 0).reduce((a, x) => a - x.amt, 0);
  const usd = snap.categories.sav.find(c => c.name === 'USD')?.foreignAmount ?? 0;

  async function editUsd() {
    const v = await dlg.ask({ title: '¿Cuántos dólares llevas ahorrados? (se carga a mano, no depende de los pesos que deposites)', initial: usd || '', type: 'number' });
    if (v != null) await run(() => A.setUsd(parseFloat(v.replace(',', '.'))), 'Dólares actualizados');
  }
  async function delCat(c: string) {
    const b = eng.svBalAll(c);
    if (Math.abs(b) > 0.005) { dlg.toast(`"${c}" tiene saldo (${fmt(b)}). Solo se elimina con saldo cero`); return; }
    if (await dlg.confirm({ message: `¿Eliminar la categoría "${c}"? Sus movimientos quedan en el historial.`, okLabel: 'Eliminar', destructive: true })) {
      if (await run(() => A.removeCategory(snap, 'sav', c), 'Categoría eliminada') && filter === c) setFilter(null);
    }
  }
  async function newCat() {
    const n = await dlg.ask({ title: 'Nombre de la categoría de ahorro' });
    if (n) await run(() => A.addCategory(snap, 'sav', n), 'Categoría agregada');
  }
  const onEdit = (x: Sav) => ui.openSav('in', x);

  const categories = (
    <Card style={L.wide ? { marginTop: 0 } : undefined}>
      <H2>Por categoría</H2>
      {cap > 0.005 ? (
        <View accessibilityLabel="Distribución del capital" style={{ flexDirection: 'row', height: 10, borderRadius: 5, overflow: 'hidden', backgroundColor: th.line, marginBottom: 4 }}>
          {Object.entries(bal).filter(([, v]) => v > 0.005).map(([c, v]) => <View key={c} style={{ width: `${share(v)}%`, backgroundColor: colorOf(c) }} />)}
        </View>
      ) : null}
      {Object.entries(bal).map(([c, v]) => {
        const R = eng.svReturn(c), has = Math.abs(R.gain) > 0.005;
        return (
        <Pressable key={c} accessibilityRole="button" onPress={() => setFilter(f => (f === c ? null : c))} style={{ paddingVertical: 10 }}>
          <Row>
            <View style={{ flex: 1 }}>
              <Row style={{ justifyContent: 'flex-start', gap: 6, flexWrap: 'wrap' }}>
                <T weight="bold" style={{ flexShrink: 0 }}>{c}</T>
                <T tone="mute" size={13} weight="semi">· {shareTxt(v)}</T>
                {c === 'USD' && <Pressable accessibilityRole="button" accessibilityLabel="Editar dólares ahorrados" onPress={editUsd}><T weight="semi" tone="mute" style={{ textDecorationLine: 'underline' }}>(US$ {usd.toLocaleString('es-AR', { maximumFractionDigits: 2 })})</T></Pressable>}
                {filter === c && <T tone="mute" size={13}>· filtrando</T>}
              </Row>
              <Bar pct={share(v)} color={colorOf(c)} />
              {has ? (
                <T tone="mute" size={13}>Aportado {fmt(R.contributed)} · <T tone={R.gain > 0 ? 'in' : 'out'} size={13} weight="semi">{R.gain > 0 ? 'Ganancia +' : 'Pérdida −'}{fmt(Math.abs(R.gain))}{R.pct != null ? ` (${R.gain > 0 ? '+' : '−'}${Math.abs(R.pct).toLocaleString('es-AR', { maximumFractionDigits: 1 })}%)` : ''}</T></T>
              ) : null}
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', minWidth: 110, justifyContent: 'flex-end' }}>
              <Money v={v} />
              <Pressable accessibilityRole="button" accessibilityLabel="Quitar categoría" onPress={() => delCat(c)} hitSlop={8} style={{ paddingHorizontal: 8 }}><T tone="mute" size={20}>×</T></Pressable>
            </View>
          </Row>
        </Pressable>
        );
      })}
      <ActionRow icon="adjust" label="Actualizar saldo (ganancia o pérdida)" onPress={() => (cats.length ? ui.openSav('adj') : dlg.toast('Crea una categoría de ahorro primero'))} />
      <ActionRow icon="plus" label="Nueva categoría" onPress={newCat} />
    </Card>
  );

  const movements = (
    <Card style={L.wide ? { marginTop: 0 } : undefined}>
      <H2>Movimientos{filter ? ' · ' + filter : ''}</H2>
      <View accessibilityLabel="Ahorro del mes" style={{ marginBottom: 6 }}>
        <Row>
          <T size={15}>{ms.net < 0 ? 'Retiraste (neto)' : 'Ahorraste'}{rate != null ? <T size={15} weight="semi" style={{ color: th.sav }}>{` · ${rate}%`}</T> : null}</T>
          <T size={22} weight="bold" style={{ color: ms.net < 0 ? th.out : th.sav }}>{ms.net < 0 ? '−' : ''}{fmt(Math.abs(ms.net))}</T>
        </Row>
        {rate != null ? <T tone="mute" size={13}>Ahorraste el {rate}% de tus ingresos de {monthName(mi)} ({fmt(ms.inc)})</T> : null}
      </View>
      <MonthNavView cur={mi} onChange={setMi} />
      {filter ? <Button kind="link" label="Ver todas las categorías" onPress={() => setFilter(null)} /> : null}
      {list.length ? list.map((x, k) => (
        <Item key={x.id} first={k === 0} title={svLabel(snap.sav, x)} sub={`${dd_mm_yyyy(x.date)}${eng.isDone(x) ? '' : ' · Programado'}${x.note ? ' · ' + x.note : ''}`}
          right={<Row><Money v={Math.abs(x.amt)} tone={x.tid ? undefined : x.amt > 0 ? 'in' : 'out'} sign={x.amt > 0 ? '+' : '−'} /><Dots onPress={() => F.savMenu(x, onEdit)} /></Row>} />
      )) : <T tone="mute" size={14}>{snap.sav.length ? `Sin movimientos en ${monthLabel(mi)}${filter ? ' para ' + filter : ''}.` : 'Todavía no hay movimientos. Deposita para empezar a ahorrar.'}</T>}
    </Card>
  );

  return (
    <Screen>
      <T tone="mute" size={14}>Total ahorrado</T>
      <T size={46} weight="bold" style={{ letterSpacing: -2, lineHeight: 52 }}>{fmt(tot)}</T>
      {Math.abs(totGain) > 0.005 && <T size={14} weight="semi" tone={totGain > 0 ? 'in' : 'out'}>Rendimiento acumulado: {totGain > 0 ? '+' : '−'}{fmt(Math.abs(totGain))}</T>}
      <T tone="mute" size={13}>Se alimenta con transferencias desde tu cuenta disponible. Disponible ahora: {fmt(eng.availFor(eng.now))}</T>
      {pend.length ? (
        <View accessibilityLabel="Movimientos programados"><T tone="mute" size={13}>
          Programado: {pend.length === 1 ? '1 movimiento' : `${pend.length} movimientos`}, el próximo el {dd_mm_yyyy(pend[0].date)}{pDep > 0.005 ? ` · depósitos +${fmt(pDep)}` : ''}{pRet > 0.005 ? ` · retiros −${fmt(pRet)}` : ''}. Todavía no cambian tu cuenta ni este total.
        </T></View>
      ) : null}
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 14, maxWidth: L.wide ? 560 : undefined }}>
        <Tile icon="deposit" label="Depositar" sub="Sumar ahorro" color={th.inc} onPress={() => ui.openSav('in')} />
        <Tile icon="withdraw" label="Retirar" sub="Sacar plata" color={th.out} onPress={() => ui.openSav('out')} />
        <Tile icon="swap" label="Transferir" sub="Entre categorías" color={th.sav} onPress={() => (cats.length < 2 ? dlg.toast('Necesitas al menos dos categorías') : !cats.some(c => A.balOf(snap.sav, c.name) > 0.005) ? dlg.toast('Ninguna categoría tiene saldo para transferir') : ui.openSav('tr'))} />
      </View>
      {L.wide ? <View style={{ flexDirection: 'row', gap: 24, alignItems: 'flex-start' }}><View style={{ flex: 1 }}>{categories}</View><View style={{ flex: 1 }}>{movements}</View></View> : <>{categories}{movements}</>}
    </Screen>
  );
}

function svLabel(all: Sav[], x: Sav) {
  if (x.tid) {
    const o = all.find(z => z.tid === x.tid && z !== x);
    return x.amt < 0 ? `Transferencia · ${x.cat} → ${o ? o.cat : '?'}` : `Transferencia · ${o ? o.cat : '?'} → ${x.cat}`;
  }
  if (x.adj) return `Ajuste · ${x.amt > 0 ? 'ganancia' : 'pérdida'} · ${x.cat}`;
  return `${x.amt > 0 ? 'Depósito' : 'Retiro'} · ${x.cat}`;
}

/** Acción principal de Ahorro: tarjeta con ícono de color (mismo estilo que Ingresos / Gastos en Resumen). */
function Tile({ icon, label, sub, color, onPress }: { icon: IconName; label: string; sub: string; color: string; onPress: () => void }) {
  const t = useTheme(), narrow = useLayout().width < 360; // en pantallas muy angostas se achica el texto y se omite la leyenda para que el nombre entre completo
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress}
      style={({ pressed }: { pressed: boolean }) => ({ flex: 1, minWidth: 0, backgroundColor: t.card, borderColor: t.line, borderWidth: 1, borderRadius: radius.md - 2, padding: narrow ? 8 : 10, opacity: pressed ? 0.85 : 1 })}>
      <View style={{ width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: color + '29', marginBottom: 8 }}><Icon name={icon} color={color} size={16} width={2.4} /></View>
      <T weight="bold" size={narrow ? 13.5 : 15} numberOfLines={1}>{label}</T>
      {narrow ? null : <T tone="mute" size={11.5} numberOfLines={1}>{sub}</T>}
    </Pressable>
  );
}

/** Fila de acción dentro de una tarjeta: ícono, texto y flecha. */
function ActionRow({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }: { pressed: boolean }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderTopWidth: 1, borderTopColor: t.line, opacity: pressed ? 0.7 : 1 })}>
      <Icon name={icon} color={t.mute} size={18} width={2} />
      <T weight="semi" size={14.5} style={{ flex: 1 }}>{label}</T>
      <T tone="mute" size={18}>›</T>
    </Pressable>
  );
}
