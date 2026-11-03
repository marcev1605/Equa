import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { fmtMoney as fmt, monthLabel } from '../domain/dates';
import { applySim, pressure, simInstallment, type Row, type Sim } from '../domain/forecast';
import { Button, Chips, Field, Select, T } from './kit';
import { Sheet } from './overlay';
import { radius, useTheme } from './theme';

const CUOTAS = ['1', '3', '6', '12', '18', '24'];

/** "¿Y si compro algo?": prueba una compra en cuotas y muestra cómo cambian los próximos 12 meses. No guarda nada. */
export function SimSheet({ visible, onClose, base, now, current, onApply }: { visible: boolean; onClose: () => void; base: Row[]; now: number; current: Sim | null; onApply: (s: Sim) => void }) {
  const t = useTheme();
  const [amt, setAmt] = useState(''), [n, setN] = useState('12'), [first, setFirst] = useState(now + 1);
  useEffect(() => {
    if (!visible) return;
    setAmt(current ? String(Math.round(current.amt)) : ''); setN(current ? String(current.n) : '12'); setFirst(current ? current.first : now + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);
  const a = Number(amt.replace(/\./g, '').replace(',', '.')), ok = a > 0 && Number(n) >= 1;
  const sim: Sim | null = ok ? { amt: a, n: Number(n), first } : null;
  const was = pressure(base, now), will = pressure(applySim(base, sim), now);
  const months = Array.from({ length: 12 }, (_, k) => now + 1 + k);
  const lowTxt = (p: ReturnType<typeof pressure>) => (p.minRun ? `${fmt(p.minRun.run)} en ${monthLabel(p.minRun.i, false)}` : '—');
  const row = (label: string, before: string, after: string, worse: boolean) => (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, paddingVertical: 4 }}>
      <T size={13} tone="mute" style={{ flexShrink: 1 }}>{label}</T>
      <T size={13} style={{ flexShrink: 0 }}>{before} → <T size={13} weight="bold" style={{ color: worse ? t.out : t.ink }}>{after}</T></T>
    </View>
  );
  return (
    <Sheet visible={visible} onClose={onClose} footer={
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1 }}><Button kind="option" center label="Cancelar" onPress={onClose} style={{ marginTop: 0, paddingHorizontal: 6 }} /></View>
        <View style={{ flex: 1.6 }}><Button label="Ver en Previsión" disabled={!sim} onPress={() => { if (sim) { onApply(sim); onClose(); } }} style={{ marginTop: 0 }} /></View>
      </View>
    }>
      <T weight="bold" size={18}>¿Y si compro algo?</T>
      <T tone="mute" size={13} style={{ marginTop: 4, marginBottom: 10 }}>Probá una compra en cuotas y mirá cómo quedan los próximos meses. No se guarda nada.</T>
      <Field label="Monto de la compra" value={amt} onChangeText={setAmt} keyboardType="decimal-pad" placeholder="Por ejemplo 240000" />
      <T tone="mute" size={13} style={{ marginBottom: 4 }}>Cuotas</T>
      <Chips labelPrefix="Cuotas: " value={n} options={CUOTAS} onChange={setN} />
      <Select label="Primera cuota" value={String(first)} options={months.map(i => ({ value: String(i), label: monthLabel(i) }))} onChange={v => setFirst(+v)} />
      <View accessibilityLabel="Resultado de la simulación" style={{ backgroundColor: t.bg, borderRadius: radius.sm, padding: 12, marginTop: 4 }}>
        {sim ? (
          <>
            <T size={14} weight="bold">{fmt(simInstallment(sim))} por mes durante {sim.n} {sim.n === 1 ? 'mes' : 'meses'}</T>
            <View style={{ marginTop: 6 }}>
              {row('Saldo más bajo', lowTxt(was), lowTxt(will), will.minRun !== null && was.minRun !== null && will.minRun.run < was.minRun.run - 0.005)}
              {row('Meses en rojo', String(was.reds), String(will.reds), will.reds > was.reds)}
            </View>
          </>
        ) : <T size={13} tone="mute">Cargá un monto para ver cómo cambian los próximos 12 meses.</T>}
      </View>
    </Sheet>
  );
}
