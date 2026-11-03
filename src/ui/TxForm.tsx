import React, { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { fmtMoney, idxOfStr, isoLocal, monthLabel, ymdOf } from '../domain/dates';
import type { Tx } from '../domain/types';
import { useStore } from '../state/store';
import { Button, Check, Chips, DateField, Field, Row, Select, Seg, T } from './kit';
import { accentOf, radius, useLayout, useTheme } from './theme';
import { useDialogs } from './dialogs';
import { availChange, dayTxt } from './savedMsg';
import { Sheet } from './overlay';
import type { TxEditing } from './Shell';

/** Qué se está cargando: un ingreso, un gasto en efectivo/débito o un gasto con tarjeta de crédito. */
export type TxKind = 'in' | 'out' | 'card';
type Freq = 'once' | 'fixed' | 'w' | 'm';
const TITLES: Record<TxKind, [string, string]> = { in: ['Nuevo ingreso', 'Editar ingreso'], out: ['Nuevo gasto', 'Editar gasto'], card: ['Nuevo gasto con tarjeta', 'Editar gasto con tarjeta'] };
const PRESETS = ['1', '3', '6', '12'];

export function TxForm({ visible, onClose, editing, kind: kind0 }: { visible: boolean; onClose: () => void; editing: TxEditing | null; kind: TxKind }) {
  const { snap, eng, A, run, repo } = useStore();
  const dlg = useDialogs(), th = useTheme(), L = useLayout();
  const [kind, setKind] = useState<TxKind>(kind0);
  const [amt, setAmt] = useState(''), [cat, setCat] = useState(''), [date, setDate] = useState(isoLocal(new Date())), [note, setNote] = useState('');
  const [freq, setFreq] = useState<Freq>('once'), [repN, setRepN] = useState('');
  const [paid, setPaid] = useState(false), [more, setMore] = useState(false);
  const [card, setCard] = useState(''), [inst, setInst] = useState('1'), [otherInst, setOtherInst] = useState(false);

  const type: 'in' | 'out' = kind === 'in' ? 'in' : 'out', isCard = kind === 'card', fixed = freq === 'fixed';
  const A0 = type === 'out' ? accentOf(th, 'out') : accentOf(th, 'in');   // rojo para gastos, verde para ingresos
  const cats = (k: 'in' | 'out') => snap.categories[k].filter(c => !c.hidden).map(c => c.name);
  const cards = eng.cardNames();

  useEffect(() => {
    if (!visible) return;
    if (editing) {
      const { t, i } = editing;
      setKind(t.type === 'in' ? 'in' : t.card ? 'card' : 'out');
      setAmt(String(t.amt)); setCat(t.cat); setNote(t.note || '');
      const isFixed = editing.scope === 'following' ? !!(t.fixed || t.of) : !!t.fixed && editing.scope !== 'month';
      setFreq(isFixed ? 'fixed' : 'once'); setRepN('');
      setDate(t.fixed ? ymdOf(i - (t.card ? 1 : 0), +t.date.slice(8)) : t.date);
      setCard(t.cardName || 'Tarjeta'); setInst(t.inst > 1 ? String(t.inst) : '1'); setOtherInst(t.inst > 1 && !PRESETS.includes(String(t.inst)));
      setPaid(!t.card && !!snap.paid[`${t.id}:${i}`]); setMore(!!(t.fixed || t.of) && editing.scope !== 'month');
    } else {
      // por comodidad arranca con lo último que usaste (categoría del mismo tipo y tarjeta); si ya no existe, la primera de la lista
      const ty = kind0 === 'in' ? 'in' : 'out', list = cats(ty);
      const lastCat = [...snap.tx].reverse().find(x => x.type === ty && list.includes(x.cat))?.cat;
      const lastCard = [...snap.tx].reverse().find(x => x.card && cards.includes(x.cardName))?.cardName;
      setKind(kind0); setAmt(''); setCat(lastCat || list[0] || ''); setNote(''); setDate(isoLocal(new Date()));
      setFreq('once'); setRepN(''); setPaid(false); setMore(false); setCard(lastCard || cards[0] || ''); setInst('1'); setOtherInst(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, editing, kind0]);

  const changeKind = (k: TxKind) => { setKind(k); if (k !== 'card') { setInst('1'); setOtherInst(false); } };
  const stackDateNote = L.width < 480;               // en celulares angostos Fecha y Nota van una debajo de la otra
  const n = parseInt(inst, 10), total = parseFloat(amt.replace(',', '.'));
  // importe de cada cuota, calculado mientras escribís el monto y las cuotas
  const cuota = !(total > 0) ? '' : n >= 2 ? `${n} cuotas de ${fmtMoney(total / n)} cada una${Math.abs(total / n - Math.round(total / n)) < 0.005 ? '' : ' (aprox.)'} · total ${fmtMoney(total)}` : `Pago único de ${fmtMoney(total)}`;
  const freqOpts = editing || isCard   // un gasto con tarjeta solo puede ser de este mes o fijo mensual (sin repeticiones sueltas)
    ? [{ value: 'once', label: 'Solo este mes' }, { value: 'fixed', label: 'Fijo mensual', sub: 'se repite todos los meses' }]
    : [{ value: 'once', label: 'Solo este mes' }, { value: 'fixed', label: 'Fijo mensual', sub: 'se repite todos los meses' }, { value: 'w', label: 'Se repite cada semana', sub: 'una cantidad de veces' }, { value: 'm', label: 'Se repite cada mes', sub: 'una cantidad de veces' }];
  const showFreq = editing?.scope !== 'month';
  const hasMore = editing ? showFreq || type === 'out' : true;

  async function newCategory() {
    const nm = await dlg.ask({ title: 'Nombre de la categoría' });
    if (!nm) return;
    const d = A.catDup(snap, type, nm);
    if (d) { dlg.toast(d.msg); if (!d.hidden) setCat(d.name); return; }
    if (await run(() => A.addCategory(snap, type, nm))) setCat(nm.trim());
  }
  async function newCard() {
    const nm = await dlg.ask({ title: 'Nombre de la tarjeta' });
    if (nm && await run(() => A.addCard(snap, nm))) setCard(nm.trim());
  }

  async function submit() {
    if (!(total > 0)) { dlg.toast('Escribe un monto válido'); return; }
    if (!cat) { dlg.toast('Elige una categoría'); return; }
    if (isCard && !card) { dlg.toast('Elige o crea una tarjeta'); return; }
    if (isCard && !fixed && !(n >= 1)) { dlg.toast('Escribe cuántas cuotas son'); return; }
    const base = { type, amt: total, cat, note, date: date || isoLocal(new Date()), card: isCard, cardName: isCard ? card : '', fixed, inst: isCard && !fixed ? Math.max(1, n || 1) : 1 };
    const before = eng.availFor(eng.now);
    const ok = editing
      ? await run(() => {
          const { t, i, scope } = editing, nb = isCard ? base : { ...base, paid };
          if (t.fixed && scope === 'month') return A.editFixedMonth(snap, t, i, nb);
          if (t.of && scope === 'following') return A.editFromOverride(snap, t, i, nb);
          return A.editTransaction(snap, t, i, nb);
        })
      : await run(() => A.addTransaction(snap, { ...base, paid: !isCard && paid, repeat: (freq === 'w' || freq === 'm') ? { mode: freq, times: parseInt(repN, 10) } : undefined }));
    if (ok) { onClose(); await announce(base, before); }
  }

  /** Ventana "Guardado": qué se guardó y qué pasó con tu disponible (se lee de lo ya guardado, no de lo que se esperaba). */
  async function announce(base: Omit<Tx, 'id' | 'note'> & { note: string }, before: number) {
    const S2 = await repo.load(), e2 = A.eng(S2), after = e2.availFor(e2.now), today = A.todayIso(), isIn = base.type === 'in';
    const lines: string[] = [];
    const nm = base.note.trim();
    lines.push(`${base.cat}${nm ? ' · ' + nm : ''}`);
    if (base.card) lines.push(`${base.cardName} · ${base.fixed ? 'fijo mensual' : base.inst > 1 ? `${base.inst} cuotas de ${fmtMoney(base.amt / base.inst)}` : 'en un pago'}`);
    else if (base.fixed) lines.push('Fijo mensual');
    else if (!editing && (freq === 'w' || freq === 'm') && parseInt(repN, 10) > 1) lines.push(`Se repite ${repN} veces, ${freq === 'w' ? 'cada semana' : 'cada mes'}`);
    if (editing?.scope === 'month' && (editing.t.fixed || editing.t.of)) lines.push(`Cambiado solo ${monthLabel(editing.i)}`);
    lines.push(dayTxt(base.date, today));
    let effect: string | undefined = availChange(before, after) ?? undefined;
    if (!effect && !editing) {
      if (base.card) { const first = e2.occ({ ...base, id: 'tmp' } as Tx)[0]; effect = `Hoy tu disponible no cambia: se paga con el resumen de ${monthLabel(first.i)}.`; }
      else if (idxOfStr(base.date) > e2.now) effect = `Es de ${monthLabel(idxOfStr(base.date))}: hoy tu disponible no cambia.`;
      else effect = `Queda pendiente de ${isIn ? 'cobro' : 'pago'}: tu disponible no cambia hasta que lo marques ${isIn ? 'cobrado' : 'pagado'}.`;
    }
    dlg.saved({ title: editing ? 'Cambios guardados' : isIn ? 'Ingreso guardado' : 'Gasto guardado', amount: `${isIn ? '+' : '−'}${fmtMoney(base.amt)}`, tone: isIn ? 'in' : 'out', lines, effect });
  }

  const title = TITLES[kind][editing ? 1 : 0];
  return (
    <Sheet visible={visible} onClose={onClose} footer={
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1 }}><Button kind="option" center label="Cancelar" onPress={onClose} style={{ marginTop: 0, paddingHorizontal: 6 }} /></View>
        <View style={{ flex: 1.6 }}><Button label={editing ? 'Guardar cambios' : 'Guardar'} onPress={submit} accent={A0} style={{ marginTop: 0 }} /></View>
      </View>
    }>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: A0.bg }} />
        <T weight="bold" size={19} style={{ flex: 1 }}>{title}</T>
        {!isCard ? (
          <Pressable accessibilityRole="checkbox" accessibilityLabel={`Ya está ${type === 'in' ? 'cobrado' : 'pagado'}`} accessibilityState={{ checked: paid }} onPress={() => setPaid(!paid)} hitSlop={6} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <T size={14} weight="semi" tone={paid ? 'ink' : 'mute'}>{type === 'in' ? 'Cobrado' : 'Pagado'}</T>
            <Check on={paid} size={24} accent={A0} />
          </Pressable>
        ) : null}
      </View>
      {(editing?.t.fixed || editing?.t.of) && editing.scope ? (
        <T size={13} tone="mute" style={{ marginBottom: 8 }}>
          {editing.scope === 'month' ? `Se cambia solo ${monthLabel(editing.i)}. Los demás meses quedan como estaban.` : `Se cambia ${monthLabel(editing.i)} y todos los meses siguientes. Los anteriores no se tocan.`}
        </T>
      ) : null}

      <Field label="Monto" value={amt} onChangeText={setAmt} keyboardType="decimal-pad" placeholder="0" autoFocus style={{ fontSize: 26, fontWeight: '700', paddingVertical: 12 }} />

      {isCard ? (
        <>
          <Select label="Tarjeta" value={card} accent={A0} options={cards.map(c => ({ value: c, label: c }))} onChange={setCard} footer={{ label: '＋ Nueva tarjeta', onPress: newCard }} />
          {!fixed && (
            <View style={{ marginBottom: 8 }}>
              <T tone="mute" size={13} style={{ marginBottom: 4 }}>Cuotas</T>
              <Chips labelPrefix="Cuotas: " value={otherInst ? 'Otra' : inst} options={[...PRESETS, 'Otra']} onChange={v => { if (v === 'Otra') { setOtherInst(true); setInst(''); } else { setOtherInst(false); setInst(v); } }} accent={A0} />
              {otherInst && <Field label="¿Cuántas cuotas?" value={inst} onChangeText={setInst} keyboardType="number-pad" placeholder="Ej. 18" />}
              {cuota ? <T size={14} weight="semi" style={{ color: A0.bg }}>{cuota}</T> : null}
            </View>
          )}
        </>
      ) : null}

      <Select label="Categoría" value={cat} accent={A0} options={cats(type).map(c => ({ value: c, label: c }))} onChange={setCat} footer={{ label: '＋ Nueva categoría', onPress: newCategory }} />
      {stackDateNote ? (
        <>
          <DateField label="Fecha" value={date} onChange={setDate} />
          <Field label="Nota (opcional)" value={note} onChangeText={setNote} />
        </>
      ) : (
        <Row style={{ gap: 8, alignItems: 'flex-start' }}>
          <DateField label="Fecha" value={date} onChange={setDate} />
          <Field label="Nota (opcional)" value={note} onChangeText={setNote} />
        </Row>
      )}

      {hasMore ? (
        <View style={{ marginTop: 2 }}>
          <Pressable accessibilityRole="button" accessibilityState={{ expanded: more }} onPress={() => setMore(m => !m)} style={{ paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <T tone="mute" size={14} weight="semi">{more ? '▾' : '▸'} Más opciones</T>
            {!more && freq !== 'once' ? <T size={12} tone="mute">· {freq === 'fixed' ? 'fijo mensual' : 'se repite'}</T> : null}
          </Pressable>
          {more && (
            <View style={{ backgroundColor: th.bg, borderRadius: radius.sm, padding: 10, marginTop: 2 }}>
              {showFreq && <Select label="¿Cada cuánto?" value={freq} accent={A0} options={freqOpts} onChange={v => setFreq(v as Freq)} />}
              {showFreq && (freq === 'w' || freq === 'm') && <Field label="Veces en total (incluye esta)" value={repN} onChangeText={setRepN} keyboardType="number-pad" placeholder="2" />}
              {editing && type === 'out' && (
                <View style={{ marginBottom: 6 }}>
                  <T tone="mute" size={13} style={{ marginBottom: 4 }}>Forma de pago</T>
                  <Seg value={isCard ? 'card' : 'out'} onChange={v => changeKind(v as TxKind)} options={[['out', 'Efectivo / débito'], ['card', 'Tarjeta de crédito']]} accent={A0} />
                </View>
              )}
            </View>
          )}
        </View>
      ) : null}
    </Sheet>
  );
}
