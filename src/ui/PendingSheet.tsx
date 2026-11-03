import React from 'react';
import { View } from 'react-native';
import type { Occ } from '../domain/types';
import { dd_mm, fmtMoney as fmt, monthLabel } from '../domain/dates';
import { cardOf, sum } from '../domain/engine';
import { useStore } from '../state/store';
import { Button, Card, Check, H2, Item, Money, T } from './kit';
import { useFlows } from './flows';
import { fixedTxt, repTxt } from './format';
import { Sheet } from './overlay';

/** Detalle de Ingresos/Gastos del mes ("full") o de lo pendiente ("Por cobrar" / "Por pagar"). */
export function PendingSheet({ ty, full, onClose }: { ty: 'in' | 'out' | null; full: boolean; onClose: () => void }) {
  const { eng, snap, cur } = useStore();
  const F = useFlows();
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

  const row = (o: Occ, overdueRow = false) => (
    <Item key={`${o.t.id}:${o.i}`} done={!overdueRow && eng.P(o)}
      left={<Check on={!overdueRow && eng.P(o)} onPress={() => F.togglePaid(o)} label="Marcar" />}
      title={o.t.note || o.t.cat}
      sub={overdueRow ? `${o.t.cat} · de ${monthLabel(o.i, false)}${o.t.fixed ? fixedTxt(o.t) : ''}${repTxt(o.t)}` : `${o.t.cat} · ${dd_mm(o.t.date)}${o.t.fixed ? fixedTxt(o.t) : ''}${repTxt(o.t)}`}
      right={<Money v={o.a} tone={ty} />} />
  );
  const srow = (q: (typeof sts)[number]) => {
    const op = q.rem > 0.005;
    return (
      <Item key={'s' + q.n} done={!op} left={<Check on={!op} />} title={`Resumen ${q.n}`}
        sub={`Compras ${fmt(q.items)}${q.carry > 0.005 ? ` + saldo anterior ${fmt(q.carry)}` : ''}${q.paid > 0 ? ` · pagado ${fmt(q.paid)}` : ''}`}
        right={<View style={{ alignItems: 'flex-end' }}><Money v={op ? q.rem : q.due} tone="out" />{op ? <Button kind="link" label="Pagar" onPress={() => F.payMenu(q.n, cur)} style={{ paddingVertical: 2 }} /> : null}</View>} />
    );
  };
  const arow = (p: (typeof ADV)[number]) => (
    <Item key={'a' + p.id} done left={<Check on />} title={`Adelanto de tarjeta · ${p.card}`} sub={`Resumen de ${monthLabel(p.i, false)} · adelantado el ${dd_mm(p.date)}`} right={<Money v={p.amt} tone="out" />} />
  );

  const pl = [...ov.map(o => row(o, true)), ...pe.map(o => row(o)), ...spe.map(srow)];
  const dl = [...dn.map(o => row(o)), ...sdn.map(srow), ...ADV.map(arow)];
  const title = full ? (ty === 'in' ? 'Ingresos' : 'Gastos') : ty === 'in' ? 'Por cobrar' : 'Por pagar';
  return (
    <Sheet visible onClose={onClose} footer={<Button kind="option" center label="Cerrar" onPress={onClose} style={{ marginTop: 0 }} />}>
      <H2>{title} · {monthLabel(cur)}</H2>
      <T size={34} weight="bold" tone={ty}>{fmt(full ? sum(L0, ty) + (isOut ? eng.advNet(cur) : 0) : pendTot)}</T>
      {Object.entries(bc).map(([c, v]) => <T key={c} tone="mute" size={13}>{c}: {fmt(v)}</T>)}
      {full ? <T tone="mute" size={15} weight="semi" style={{ marginTop: 12 }}>{ty === 'in' ? 'Por cobrar' : 'Por pagar'} · {fmt(pendTot)}</T> : null}
      <Card style={{ marginTop: full ? 0 : 12 }}>{pl.length ? pl : <T tone="mute" size={14}>No tienes nada pendiente este mes.</T>}</Card>
      {dl.length ? (<><T tone="mute" size={15} weight="semi" style={{ marginTop: 14 }}>{ty === 'in' ? 'Ya cobrado' : 'Ya pagado'} · {fmt(doneTot)}</T><Card>{dl}</Card></>) : null}
    </Sheet>
  );
}
