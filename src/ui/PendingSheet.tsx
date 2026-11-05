import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import type { Occ } from '../domain/types';
import { dd_mm, fmtMoney as fmt, monthLabel } from '../domain/dates';
import { cardOf, sum } from '../domain/engine';
import { useStore } from '../state/store';
import { Button, Card, Check, H2, Item, Money, T } from './kit';
import { useDialogs } from './dialogs';
import { radius, useTheme } from './theme';
import { useFlows } from './flows';
import { fixedTxt, repTxt } from './format';
import { Sheet } from './overlay';

/** Detalle de Ingresos/Gastos del mes ("full") o de lo pendiente ("Por cobrar" / "Por pagar"). */
export function PendingSheet({ ty, full, onClose }: { ty: 'in' | 'out' | null; full: boolean; onClose: () => void }) {
  const { eng, snap, cur, run, A } = useStore();
  const F = useFlows(), dlg = useDialogs(), t = useTheme();
  const [selecting, setSelecting] = useState(false), [sel, setSel] = useState<string[]>([]);
  useEffect(() => { setSelecting(false); setSel([]); }, [ty, full, cur]);
  if (!ty) return <Sheet visible={false} onClose={onClose}>{null}</Sheet>;
  const isOut = ty === 'out', S = snap;
  const L0 = eng.all().filter(o => o.i === cur && o.t.type === ty).sort((a, b) => a.t.date.slice(8).localeCompare(b.t.date.slice(8)));
  const L = isOut ? L0.filter(o => !o.t.card) : L0;
  const sts = isOut ? eng.cardNames().map(n => ({ n, ...eng.stmtN(n, cur) })).filter(q => q.due + q.adv > 0.005) : [];
  const ov = eng.overdue(cur, ty), pe = L.filter(o => !eng.P(o)), dn = L.filter(eng.P);
  const spe = sts.filter(q => q.rem > 0.005), sdn = sts.filter(q => q.rem <= 0.005);
  const ADV = isOut ? S.pay.filter(p => eng.isAdv(p) && eng.payIdx(p) === cur) : [];
  const pendTot = sum(ov, ty) + sum(pe, ty) + spe.reduce((a, q) => a + q.rem, 0);
  const doneTot = sum(dn, ty) + sdn.reduce((a, q) => a + q.due, 0) + ADV.reduce((a, p) => a + p.amt, 0);

  const bc: Record<string, number> = {};
  if (full) {
    L0.filter(o => o.t.card).forEach(o => { const c = cardOf(o.t); bc[c] = (bc[c] || 0) + o.a; });
    S.pay.filter(p => eng.isAdv(p) && p.i === cur).forEach(p => { bc[p.card] = (bc[p.card] || 0) - p.amt; });
    Object.keys(bc).forEach(c => { if (bc[c] < 0.005) delete bc[c]; });
    ADV.forEach(p => { const k = 'Adelanto · ' + p.card; bc[k] = (bc[k] || 0) + p.amt; });
  } else spe.forEach(q => { bc[q.n] = q.rem; });

  // Selección para pagar/cobrar varios juntos: solo lo pendiente (los resúmenes de tarjeta se pagan desde su resumen)
  const keyOf = (o: Occ) => `${o.t.id}:${o.i}`;
  const selectable = [...ov, ...pe], keys = selectable.map(keyOf), chosen = selectable.filter(o => sel.includes(keyOf(o)));
  const total = sum(chosen, ty), verb = isOut ? 'pagar' : 'cobrar', Verb = isOut ? 'Pagar' : 'Cobrar';
  const toggleSel = (o: Occ) => setSel(s => (s.includes(keyOf(o)) ? s.filter(k => k !== keyOf(o)) : [...s, keyOf(o)]));
  const allOn = keys.length > 0 && keys.every(k => sel.includes(k));
  const availNow = eng.availFor(eng.now);
  const availAfter = () => { const e2 = A.eng({ ...snap, paid: { ...snap.paid, ...Object.fromEntries(chosen.map(o => [keyOf(o), true])) } }); return e2.availFor(e2.now); };
  const names = (list: Occ[]) => { const n = list.map(o => o.t.note || o.t.cat); return n.length > 4 ? `${n.slice(0, 4).join(', ')} y ${n.length - 4} más` : n.length > 1 ? `${n.slice(0, -1).join(', ')} y ${n[n.length - 1]}` : n[0]; };
  async function payAll() {
    if (!chosen.length) return;
    const n = chosen.length, after = availAfter(), sg = isOut ? '−' : '+';
    const ok = await dlg.confirm({
      message: `¿${Verb} ${n} ${isOut ? (n === 1 ? 'gasto' : 'gastos') : (n === 1 ? 'ingreso' : 'ingresos')}${n > 1 ? ' juntos' : ''}?\n${names(chosen)}\nTotal: ${sg}${fmt(total)}\nDisponible ahora: ${fmt(availNow)} → ${fmt(after)}${isOut && after < -0.005 ? '\nOjo: queda por debajo de cero.' : ''}`,
      okLabel: n === 1 ? (isOut ? 'Sí, pagar' : 'Sí, cobrar') : isOut ? 'Sí, pagar todos' : 'Sí, cobrar todos',
    });
    if (!ok) return;
    if (await run(() => A.setPaidMany(chosen.map(o => ({ id: o.t.id, i: o.i })), true))) {
      setSelecting(false); setSel([]);
      dlg.saved({ title: `${n} ${isOut ? (n === 1 ? 'pago guardado' : 'pagos guardados') : (n === 1 ? 'cobro guardado' : 'cobros guardados')}`, amount: `${sg}${fmt(total)}`, tone: isOut ? 'out' : 'in', lines: [names(chosen)], effect: `Tu disponible ahora pasa de ${fmt(availNow)} a ${fmt(after)}` });
    }
  }
  const row = (o: Occ, overdueRow = false) => (
    <Item key={`${o.t.id}:${o.i}`} done={!overdueRow && eng.P(o) && !selecting}
      left={selecting && !eng.P(o) ? <Check on={sel.includes(keyOf(o))} onPress={() => toggleSel(o)} label={`Seleccionar ${o.t.note || o.t.cat}`} /> : <Check on={!overdueRow && eng.P(o)} onPress={selecting ? undefined : () => F.togglePaid(o)} label="Marcar" />}
      title={o.t.note || o.t.cat}
      sub={overdueRow ? `${o.t.cat} · de ${monthLabel(o.i, false)}${o.t.fixed ? fixedTxt(o.t) : ''}${repTxt(o.t)}` : `${o.t.cat} · ${dd_mm(o.t.date)}${o.t.fixed ? fixedTxt(o.t) : ''}${repTxt(o.t)}`}
      right={<Money v={o.a} tone={ty} />} />
  );
  const srow = (q: (typeof sts)[number]) => {
    const op = q.rem > 0.005;
    return (
      <View key={'s' + q.n} style={op && selecting ? { opacity: 0.6 } : undefined}>
        <Item done={!op} left={<Check on={!op} />} title={`Resumen ${q.n}`}
          sub={op && selecting ? 'Se paga desde el resumen' : `Compras ${fmt(q.items)}${q.carry > 0.005 ? ` + saldo anterior ${fmt(q.carry)}` : ''}${q.paid > 0 ? ` · pagado ${fmt(q.paid)}` : ''}`}
          right={<View style={{ alignItems: 'flex-end' }}><Money v={op ? q.rem : q.due} tone="out" />{op && !selecting ? <Button kind="link" label="Pagar" onPress={() => F.payMenu(q.n, cur)} style={{ paddingVertical: 2 }} /> : null}</View>} />
      </View>
    );
  };
  const arow = (p: (typeof ADV)[number]) => (
    <Item key={'a' + p.id} done left={<Check on />} title={`Adelanto de tarjeta · ${p.card}`} sub={`Resumen de ${monthLabel(p.i, false)} · adelantado el ${dd_mm(p.date)}`} right={<Money v={p.amt} tone="out" />} />
  );

  const pl = [...ov.map(o => row(o, true)), ...pe.map(o => row(o)), ...spe.map(srow)];
  const dl = [...dn.map(o => row(o)), ...sdn.map(srow), ...ADV.map(arow)];
  const title = full ? (ty === 'in' ? 'Ingresos' : 'Gastos') : ty === 'in' ? 'Por cobrar' : 'Por pagar';
  return (
    <Sheet visible onClose={onClose} footer={selecting ? (
      <View accessibilityLabel="Selección para pagar" style={{ gap: 6 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <T tone="mute" size={14}>{chosen.length === 1 ? '1 seleccionado' : `${chosen.length} seleccionados`}</T>
          <T size={22} weight="bold" tone={chosen.length ? ty : 'mute'}>{fmt(total)}</T>
        </View>
        {chosen.length ? <T tone="mute" size={13}>Tu disponible: {fmt(availNow)} → {fmt(availAfter())}</T> : <T tone="mute" size={13}>Elegí qué querés {verb}.</T>}
        {isOut && chosen.length && availAfter() < -0.005 ? <View style={{ backgroundColor: t.acc + '2b', borderRadius: radius.sm, padding: 8 }}><T size={13}>Ojo: el total supera lo que tenés disponible.</T></View> : null}
        <Button label={`${Verb} seleccionados`} onPress={payAll} disabled={!chosen.length} style={{ marginTop: 4 }} />
      </View>
    ) : <Button kind="option" center label="Cerrar" onPress={onClose} style={{ marginTop: 0 }} />}>
      <H2>{title} · {monthLabel(cur)}</H2>
      <T size={34} weight="bold" tone={ty}>{fmt(full ? sum(L0, ty) + (isOut ? eng.advNet(cur) : 0) : pendTot)}</T>
      {Object.entries(bc).map(([c, v]) => <T key={c} tone="mute" size={13}>{c}: {fmt(v)}</T>)}
      {full ? <T tone="mute" size={15} weight="semi" style={{ marginTop: 12 }}>{ty === 'in' ? 'Por cobrar' : 'Por pagar'} · {fmt(pendTot)}</T> : null}
      {keys.length ? (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginTop: full ? 6 : 12, marginBottom: 8 }}>
          {selecting ? (
            <>
              <Button key="todos" kind="option" center label={allOn ? 'Quitar todos' : 'Seleccionar todos'} onPress={() => setSel(allOn ? [] : keys)} style={{ flex: 1, marginTop: 0, paddingVertical: 10 }} />
              <Button key="cancelar" kind="option" center label="Cancelar" onPress={() => { setSelecting(false); setSel([]); }} style={{ flex: 1, marginTop: 0, paddingVertical: 10 }} />
            </>
          ) : (
            <>
              <T tone="mute" size={14}>Pendiente de {isOut ? 'pago' : 'cobro'}</T>
              <Button key="seleccionar" kind="option" center label="Seleccionar" onPress={() => { setSelecting(true); setSel([]); }} style={{ marginTop: 0, paddingVertical: 10, paddingHorizontal: 18 }} />
            </>
          )}
        </View>
      ) : null}
      <Card style={{ marginTop: keys.length ? 0 : full ? 0 : 12 }}>{pl.length ? pl : <T tone="mute" size={14}>No tienes nada pendiente este mes.</T>}</Card>
      {dl.length ? (<><T tone="mute" size={15} weight="semi" style={{ marginTop: 14 }}>{ty === 'in' ? 'Ya cobrado' : 'Ya pagado'} · {fmt(doneTot)}</T><Card>{dl}</Card></>) : null}
    </Sheet>
  );
}
