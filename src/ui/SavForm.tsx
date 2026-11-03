import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import type { Sav } from '../domain/types';
import { dd_mm_yyyy, fmtMoney as fmt, isoLocal } from '../domain/dates';
import { availChange, dayTxt } from './savedMsg';
import { useStore } from '../state/store';
import { Button, DateField, Field, Select, Seg, T } from './kit';
import { useDialogs } from './dialogs';
import { Sheet } from './overlay';

export type SavDir = 'in' | 'out' | 'tr' | 'adj';
type Dir = SavDir;
const r2 = (n: number) => Math.round(n * 100) / 100;

export function SavForm({ visible, onClose, dir: dir0, editing }: { visible: boolean; onClose: () => void; dir: Dir; editing: Sav | null }) {
  const { snap, eng, A, run, repo } = useStore();
  const dlg = useDialogs();
  const [dir, setDir] = useState<Dir>('in');
  const [cat, setCat] = useState(''), [to, setTo] = useState(''), [amt, setAmt] = useState(''), [date, setDate] = useState(isoLocal(new Date())), [note, setNote] = useState('');
  const cats = snap.categories.sav.filter(c => !c.hidden).map(c => c.name);
  // Un movimiento con fecha futura queda "programado": no mueve nada hasta ese día. Los saldos se miran a la fecha elegida.
  const today = A.todayIso(), at = date || today, future = at > today;
  const bal = (list: Sav[], c: string) => A.balOf(list, c, at);
  const balTxt = (c: string, list: Sav[] = snap.sav) => (future ? `Saldo al ${dd_mm_yyyy(at).slice(0, 5)}: ` : 'Saldo: ') + fmt(bal(list, c));
  // En una transferencia solo pueden ser origen las categorías con saldo.
  const withBal = cats.filter(c => bal(snap.sav, c) > 0.005);
  // Al retirar solo se ofrecen las categorías con saldo (sin contar el movimiento que se está editando).
  const outCats = cats.filter(c => bal(snap.sav.filter(x => x.id !== editing?.id), c) > 0.005 || (editing && editing.amt < 0 && c === editing.cat));

  useEffect(() => {
    if (!visible) return;
    const first = editing ? editing.cat : (dir0 === 'tr' ? withBal[0] : dir0 === 'out' ? outCats[0] : cats[0]) || '';
    setDir(editing ? (editing.adj ? 'adj' : editing.amt > 0 ? 'in' : 'out') : dir0);
    setCat(first); setTo(cats.find(c => c !== first) || '');
    // ajuste: se parte del valor actual (al editar, del valor que dejó ese ajuste) para corregirlo
    setAmt(editing?.adj ? String(r2(A.balOf(snap.sav, editing.cat, editing.date))) : editing ? String(Math.abs(editing.amt)) : dir0 === 'adj' ? String(r2(A.balOf(snap.sav, first))) : ''); setDate(editing ? editing.date : isoLocal(new Date())); setNote(editing?.note || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, editing, dir0]);

  const adjBase = bal(snap.sav.filter(x => x.id !== editing?.id), cat), adjVal = parseFloat(amt.replace(',', '.')), adjDiff = isNaN(adjVal) ? 0 : r2(adjVal - adjBase);
  const hint = (dir === 'adj' ? `Escribe cuánto vale ${future ? 'esa fecha' : 'hoy'} esta categoría. La diferencia se registra como ganancia o pérdida y no cambia tu cuenta disponible.`
    : dir === 'tr' ? 'Mueve saldo entre categorías de Ahorro. Tu cuenta disponible no cambia.'
    : dir === 'in' ? 'Sale de tu cuenta disponible y pasa a Ahorro.' : 'Sale de Ahorro y vuelve a tu cuenta disponible.')
    + (future ? ` Con fecha futura queda programado: no mueve nada hasta el ${dd_mm_yyyy(at)}.` : '');

  function changeDir(v: Dir) {
    if (v === 'tr') {
      if (!withBal.length) { dlg.toast('Ninguna categoría tiene saldo para transferir'); return; }
      if (!withBal.includes(cat)) { setCat(withBal[0]); setTo(cats.find(c => c !== withBal[0]) || ''); }
    }
    if (v === 'out' && !editing) {
      if (!outCats.length) { dlg.toast('Ninguna categoría tiene saldo para retirar'); return; }
      if (!outCats.includes(cat)) setCat(outCats[0]);
    }
    setDir(v);
  }

  async function newCategory() {
    const n = await dlg.ask({ title: 'Nombre de la categoría de ahorro' });
    if (!n) return;
    const d = A.catDup(snap, 'sav', n);
    if (d) { dlg.toast(d.msg); if (!d.hidden) setCat(d.name); return; }
    if (await run(() => A.addCategory(snap, 'sav', n))) setCat(n.trim());
  }

  async function submit() {
    const a = parseFloat(amt.replace(',', '.'));
    if (dir === 'adj') {
      if (isNaN(a) || a < 0) { dlg.toast('Escribe un valor válido (0 o más)'); return; }
      if (!cat) { dlg.toast('Elige una categoría'); return; }
      if (Math.abs(adjDiff) < 0.005) { dlg.toast(editing ? 'Con ese valor no hay diferencia: para quitar el ajuste, bórralo' : `"${cat}" ya vale ese monto: no hay nada que ajustar`); return; }
      const what = adjDiff > 0 ? 'una ganancia' : 'una pérdida', adjAt = future ? ` al ${dd_mm_yyyy(at)}` : '';
      if (!(await dlg.confirm({ message: `¿${editing ? 'Guardar el ajuste de' : 'Actualizar'} "${cat}" de ${fmt(adjBase)} a ${fmt(a)}${adjAt}? Se registra ${what} de ${fmt(Math.abs(adjDiff))}. Tu cuenta disponible no cambia.`, okLabel: editing ? 'Guardar cambios' : 'Actualizar saldo' }))) return;
      const dAdj = date || isoLocal(new Date());
      if (await run(() => A.savAdjust(snap, cat, a, dAdj, note.trim(), editing || undefined))) {
        onClose();
        dlg.saved({ title: editing ? 'Cambios guardados' : 'Saldo actualizado', amount: `${adjDiff > 0 ? '+' : '−'}${fmt(Math.abs(adjDiff))}`, tone: adjDiff > 0 ? 'in' : 'out', lines: [`${adjDiff > 0 ? 'Ganancia' : 'Pérdida'} en Ahorro · ${cat}`, `Ahora vale ${fmt(a)}${dAdj > today ? ' al ' + dd_mm_yyyy(dAdj) : ''}`, dayTxt(dAdj, today)], effect: 'Tu cuenta disponible no cambia.' });
      }
      return;
    }
    if (!(a > 0)) { dlg.toast('Escribe un monto válido'); return; }
    if (!cat) { dlg.toast('Elige una categoría'); return; }
    const d = date || isoLocal(new Date());
    if (dir === 'tr') {
      if (!to || to === cat) { dlg.toast('Elige dos categorías distintas'); return; }
      const have = A.balOf(snap.sav, cat, d);
      if (a > have + 0.005) { dlg.toast(`En ${cat} solo ${d > today ? 'tendrás' : 'tienes'} ${fmt(Math.max(0, have))}${d > today ? ' el ' + dd_mm_yyyy(d) : ''}`); return; }
      const msgTr = d > today ? `¿Programar la transferencia de ${fmt(a)} de ${cat} a ${to} para el ${dd_mm_yyyy(d)}? Hasta ese día no cambia ningún saldo.` : `¿Transferir ${fmt(a)} de ${cat} a ${to}? Tu cuenta disponible no cambia.`;
      if (!(await dlg.confirm({ message: msgTr, okLabel: d > today ? 'Programar' : 'Transferir' }))) return;
      if (await run(() => A.savTransfer(snap, cat, to, a, d, note.trim()))) {
        onClose();
        dlg.saved({ title: d > today ? 'Transferencia programada' : 'Transferencia guardada', amount: fmt(a), tone: 'sav', lines: [`${cat} → ${to}`, dayTxt(d, today)], effect: d > today ? 'Hasta ese día no cambia ningún saldo.' : 'Tu cuenta disponible no cambia.' });
      }
      return;
    }
    const others = snap.sav.filter(x => x.id !== editing?.id), na = dir === 'in' ? a : -a;
    const nl = [...others, { id: 'tmp', cat, amt: na, date: d, note: '' }];
    const pre = A.checkSavMove(snap, dir as 'in' | 'out', cat, a, d, editing || undefined);
    if (!pre.ok) { dlg.toast(pre.error); return; }
    const sched = d > today, dFut = (e: Sav | null) => !!e && e.date > today;
    // cuenta disponible "de hoy" (lo programado todavía no cuenta); para fechas pasadas, la del mes de esa fecha
    const avAt = (list: Sav[], dt: string) => A.availWith(snap, list, dt > today ? today : dt);
    const av = avAt(others, d);
    const mv = (amount: number, c: string) => `${amount > 0 ? 'depósito' : 'retiro'} de ${fmt(Math.abs(amount))} en ${c}`;
    const msg = editing
      ? `¿Guardar los cambios? Antes: ${mv(editing.amt, editing.cat)}${dFut(editing) ? ` (programado para el ${dd_mm_yyyy(editing.date)})` : ''}. Ahora: ${mv(na, cat)}${sched ? ` (programado para el ${dd_mm_yyyy(d)})` : ''}. Tu cuenta disponible pasa de ${fmt(avAt(snap.sav, d))} a ${fmt(avAt(nl, d))}. ` +
        [...new Set([editing.cat, cat])].map(c => `Ahorro · ${c}: de ${fmt(A.balOf(snap.sav, c))} a ${fmt(A.balOf(nl, c))}`).join('; ') + '.'
      : sched ? (dir === 'in'
          ? `¿Programar un depósito de ${fmt(a)} en Ahorro · ${cat} para el ${dd_mm_yyyy(d)}? Hasta ese día no cambia tu cuenta (${fmt(A.availWith(snap, snap.sav, today))}) ni tu ahorro.${a > A.availWith(snap, others, d) ? ' Ojo: para esa fecha se prevé que no te alcance.' : ''}`
          : `¿Programar un retiro de ${fmt(a)} de Ahorro · ${cat} para el ${dd_mm_yyyy(d)}? Hasta ese día no cambia tu ahorro ni tu cuenta.`)
      : dir === 'in' ? `¿Mover ${fmt(a)} de tu cuenta a Ahorro · ${cat}? Disponible ahora: ${fmt(av)}.${a > av ? ' Ojo: supera tu disponible.' : ''}`
      : `¿Retirar ${fmt(a)} de Ahorro · ${cat} y llevarlos a tu cuenta?`;
    if (!(await dlg.confirm({ message: msg, okLabel: editing ? 'Guardar cambios' : sched ? 'Programar' : dir === 'in' ? 'Depositar' : 'Retirar' }))) return;
    const before = eng.availFor(eng.now);
    if (await run(() => A.savMove(snap, dir as 'in' | 'out', cat, a, d, note.trim(), editing || undefined))) {
      onClose();
      const S2 = await repo.load(), e2 = A.eng(S2), after = e2.availFor(e2.now), isIn = dir === 'in';
      const effect = sched ? 'Hasta ese día no cambia tu cuenta ni tu ahorro.' : [availChange(before, after), `Ahorro · ${cat}: ${fmt(e2.svBal(cat))}.`].filter(Boolean).join(' ');
      dlg.saved({ title: editing ? 'Cambios guardados' : `${isIn ? 'Depósito' : 'Retiro'} ${sched ? 'programado' : 'guardado'}`, amount: `${isIn ? '+' : '−'}${fmt(a)}`, tone: isIn ? 'in' : 'out', lines: [`Ahorro · ${cat}`, dayTxt(d, today)], effect });
    }
  }
  void eng;

  return (
    <Sheet visible={visible} onClose={onClose} footer={
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1 }}><Button kind="option" center label="Cancelar" onPress={onClose} style={{ marginTop: 0, paddingHorizontal: 6 }} /></View>
        <View style={{ flex: 1.6 }}><Button label="Continuar" onPress={submit} style={{ marginTop: 0 }} /></View>
      </View>
    }>
      {dir === 'adj'
        ? <T weight="bold" size={18} style={{ marginBottom: 4 }}>Actualizar saldo</T>
        : <Seg value={dir} onChange={changeDir} options={editing ? [['in', 'Depositar'], ['out', 'Retirar']] : [['in', 'Depositar'], ['out', 'Retirar'], ['tr', 'Transferir']]} />}
      <T tone="mute" size={13} style={{ marginBottom: 8 }}>{hint}</T>
      {dir === 'adj' ? (<>
        <Select label="Categoría" value={cat} options={cats.map(c => ({ value: c, label: c, sub: 'Figura: ' + fmt(bal(snap.sav.filter(x => x.id !== editing?.id), c)) }))}
          onChange={v => { setCat(v); if (!editing) setAmt(String(r2(A.balOf(snap.sav, v)))); }} />
      </>) : dir === 'tr' ? (<>
        <Select label="Desde" value={cat} options={withBal.map(c => ({ value: c, label: c, sub: balTxt(c) }))}
          onChange={v => { setCat(v); if (v === to) setTo(cats.find(c => c !== v) || ''); }} />
        <Select label="Hacia" value={to} options={cats.filter(c => c !== cat).map(c => ({ value: c, label: c, sub: balTxt(c) }))} onChange={setTo} />
      </>) : (<>
        <Select label="Categoría" value={cat}
          options={(dir === 'out' ? outCats : cats).map(c => ({ value: c, label: c, sub: balTxt(c) }))}
          onChange={setCat} footer={dir === 'in' ? { label: '＋ Nueva categoría', onPress: newCategory } : undefined} />
      </>)}
      <Field label={dir === 'adj' ? (future ? `¿Cuánto vale el ${dd_mm_yyyy(at).slice(0, 5)}?` : '¿Cuánto vale hoy?') : 'Monto'} value={amt} onChangeText={setAmt} keyboardType="decimal-pad" placeholder="0" autoFocus />
      {dir === 'adj' && (
        <T tone={adjDiff > 0.005 ? 'in' : adjDiff < -0.005 ? 'out' : 'mute'} size={14} weight="semi" style={{ marginBottom: 8 }}>
          {Math.abs(adjDiff) < 0.005 ? 'Sin diferencia con lo registrado' : `${adjDiff > 0 ? 'Ganancia' : 'Pérdida'}: ${adjDiff > 0 ? '+' : '−'}${fmt(Math.abs(adjDiff))}`}
        </T>
      )}
      <DateField label="Fecha" value={date} onChange={setDate} />
      <Field label="Nota (opcional)" value={note} onChangeText={setNote} />
    </Sheet>
  );
}
