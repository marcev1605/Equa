import { useMemo } from 'react';
import type { Occ, Pay, Sav, Tx } from '../domain/types';
import { dd_mm, dd_mm_yyyy, fmtMoney as fmt, idxOfStr, isoLocal, monthLabel, ymdOf } from '../domain/dates';
import { cardOf } from '../domain/engine';
import { useStore } from '../state/store';
import { useDialogs } from './dialogs';
import { availChange, dayTxt } from './savedMsg';

/** Flujos con confirmaciones (equivalentes a los carteles de la app original). */
export function useFlows() {
  const { snap, eng, A, run, cur, repo } = useStore();
  const dlg = useDialogs();
  const S = snap;
  const mon = (i: number) => monthLabel(i, false);

  return useMemo(() => {
    // ---------- pagado / cobrado ----------
    async function togglePaid(o: Occ) {
      const key = `${o.t.id}:${o.i}`, on = !!S.paid[key], inc = o.t.type === 'in';
      const nm = `"${o.t.note || o.t.cat}" (${fmt(o.a)})`;
      const msg = on
        ? `¿Desmarcar ${nm}? Vuelve a quedar pendiente de ${inc ? 'cobro' : 'pago'} y ${inc ? 'se descuenta de' : 'se suma a'} tu disponible.`
        : `¿Marcar ${nm} como ${inc ? 'cobrado' : 'pagado'}? ${inc ? 'Se suma a' : 'Se descuenta de'} tu disponible.`;
      if (await dlg.confirm({ message: msg, okLabel: on ? 'Desmarcar' : inc ? 'Marcar como cobrado' : 'Marcar como pagado' }))
        await run(() => A.setPaid(o.t.id, o.i, !on));
    }

    // ---------- menú de un movimiento ----------
    function txMenu(t: Tx, i: number, onEdit: (t: Tx, i: number, scope?: 'month' | 'following') => void) {
      const series = A.seriesOf(S, t);     // mes de un fijo editado "solo este mes"
      const isFixedLike = t.fixed || !!series;
      const options: { label: string; destructive?: boolean; onPress: () => void }[] = isFixedLike
        ? [
            { label: 'Editar solo este mes', onPress: () => onEdit(t, i, 'month') },
            { label: 'Editar este mes y los siguientes', onPress: () => onEdit(t, i, 'following') },
          ]
        : [{ label: t.rep ? 'Editar solo esta' : 'Editar', onPress: () => onEdit(t, i) }];
      if (isFixedLike) {
        options.push(
          { label: 'Borrar solo este mes', destructive: true, onPress: () => void run(() => (t.fixed ? A.deleteFixedMonth(t, i) : A.deleteOne(t))) },
          { label: 'Borrar este mes y los siguientes', destructive: true, onPress: () => void run(() => (t.fixed ? A.deleteFixedFrom(S, t, i) : A.deleteFromOverride(S, t, i))) },
        );
      } else {
        if (t.rep) {
          const lb = t.rep.f === 'm' ? 'la de ' + mon(idxOfStr(t.date)) : 'la del ' + dd_mm(t.date);
          options.push({ label: 'Borrar solo ' + lb, destructive: true, onPress: async () => {
            if (await dlg.confirm({ message: `¿Borrar solo ${lb}? Las demás repeticiones no cambian.`, okLabel: 'Borrar', destructive: true })) await run(() => A.deleteOne(t), 'Repetición borrada');
          } });
          const nx = A.followingInSeries(S, t).length;
          if (nx > 0) options.push({ label: `Borrar esta y las ${nx} siguientes`, destructive: true, onPress: async () => {
            if (await dlg.confirm({ message: `¿Borrar esta repetición y las ${nx} siguientes?`, okLabel: 'Borrar', destructive: true })) await run(() => A.deleteSeriesFrom(S, t), 'Repeticiones borradas');
          } });
        } else options.push({ label: 'Borrar', destructive: true, onPress: () => void run(() => A.deleteOne(t)) });
      }
      dlg.actions({ title: `${t.note || t.cat} · ${monthLabel(i)}`, options });
    }

    // ---------- tarjetas ----------
    async function doPay(n: string, i: number, a: number, adv: boolean) {
      const { q, closeDate, avail } = A.payInfo(S, n, i), left = q.rem - a;
      const cd = `${String(closeDate.d).padStart(2, '0')}/${String(closeDate.m + 1).padStart(2, '0')}`;
      const msg = adv
        ? `¿Adelantar ${fmt(a)} a "${n}"? Se debita ahora de tu disponible (${fmt(avail)})${a > avail ? ' y supera lo que tienes' : ''} y se resta del total a pagar al cierre del ${cd}.`
        : `¿Pagar ${fmt(a)} del resumen de "${n}" (cierre de ${mon(i - 1)}, se paga en ${mon(i)}) con tu saldo disponible? Disponible ahora: ${fmt(avail)}.` +
          (a > avail ? ' Ojo: el pago supera tu disponible.' : '') + (left > 0.005 ? ` Quedan ${fmt(left)} que pasan al resumen que se paga en ${mon(i + 1)}.` : '');
      if (!(await dlg.confirm({ message: msg, okLabel: adv ? 'Adelantar' : 'Pagar' }))) return;
      const before = eng.availFor(eng.now);
      if (!(await run(() => A.pay(S, n, i, a)))) return;
      const e2 = A.eng(await repo.load());
      dlg.saved({
        title: adv ? 'Adelanto guardado' : 'Pago guardado', amount: `−${fmt(a)}`, tone: 'out',
        lines: [`${n} · resumen de ${mon(i)}`, dayTxt(A.todayIso(), A.todayIso())],
        effect: [availChange(before, e2.availFor(e2.now)), left > 0.005 ? `Quedan ${fmt(left)} pendientes en ese resumen.` : 'El resumen quedó pagado.'].filter(Boolean).join(' '),
      });
    }
    async function askAmount(n: string, i: number, adv: boolean) {
      const { q } = A.payInfo(S, n, i);
      const v = await dlg.ask({ title: `${adv ? 'Monto del adelanto' : 'Monto a pagar'} (máximo ${fmt(q.rem)})`, type: 'number' });
      if (v == null) return;
      const a = parseFloat(v.replace(',', '.'));
      if (!(a > 0) || a > q.rem + 0.005) { dlg.toast('Escribe un monto entre 1 y ' + fmt(q.rem)); return; }
      await doPay(n, i, Math.min(a, q.rem), adv);
    }
    async function payMenu(n: string, i: number) {
      const { q, open, closeDate, avail } = A.payInfo(S, n, i);
      if (!(q.rem > 0.005)) { dlg.toast('Este resumen no tiene saldo pendiente'); return; }
      if (open) {
        const cd = `${String(closeDate.d).padStart(2, '0')}/${String(closeDate.m + 1).padStart(2, '0')}`;
        if (await dlg.confirm({ message: `El resumen de "${n}" todavía no cerró (cierra el ${cd}). ¿Querés hacer un adelanto de tarjeta? El monto se debita ahora de tu disponible y se resta del total a pagar al cierre.`, okLabel: 'Hacer adelanto' })) await askAmount(n, i, true);
        return;
      }
      dlg.actions({
        title: `Resumen de ${n} · cierre de ${mon(i - 1)}, se paga en ${mon(i)}. Pendiente ${fmt(q.rem)}. Tu disponible ahora: ${fmt(avail)}.`,
        options: [
          { label: `Pagar total (${fmt(q.rem)})`, onPress: () => void doPay(n, i, q.rem, false) },
          { label: 'Pagar parcial', onPress: () => void askAmount(n, i, false) },
        ],
      });
    }
    async function undoPay(p: Pay) {
      const adv = A.eng(S).isAdv(p);
      if (await dlg.confirm({ message: `¿Deshacer ${adv ? 'el adelanto' : 'el pago'} de ${fmt(p.amt)} a ${p.card}? El dinero vuelve a tu disponible y el saldo queda pendiente en el resumen.`, okLabel: 'Deshacer pago', destructive: true }))
        await run(() => A.undoPayment(p.id), 'Pago deshecho');
    }
    async function addCard() {
      const n = await dlg.ask({ title: 'Nombre de la tarjeta (ej. Visa)' });
      if (n) await run(() => A.addCard(S, n), 'Tarjeta agregada');
    }
    function cardMenu(n: string, cm: number, onLook?: () => void) {
      const mlab = monthLabel(cm), ci = S.cardInfo[n] || {}, e = eng;
      const askDay = async (title: string, initial: string): Promise<number | null> => {
        const v = await dlg.ask({ title, initial, type: 'date' });
        if (!v) return null;
        const d = parseInt(v.slice(8), 10);
        if (!(d >= 1 && d <= 31)) { dlg.toast('Elige una fecha válida'); return null; }
        return d;
      };
      const options = [
        { label: 'Editar nombre', onPress: async () => {
          const v = await dlg.ask({ title: 'Nuevo nombre de la tarjeta', initial: n });
          if (!v || v === n) return;
          if (await dlg.confirm({ message: `¿Cambiar el nombre de "${n}" a "${v}"? Se actualizan también sus compras.`, okLabel: 'Guardar cambio' })) await run(() => A.renameCard(S, n, v), 'Tarjeta actualizada');
        } },
        { label: `Editar cierre de ${mlab}`, onPress: async () => {
          const d = await askDay(`Elige en el calendario el cierre de "${n}" para ${mlab}. Solo cambia ese mes.`, ymdOf(cm, e.closeDay(n, cm)));
          if (d && await dlg.confirm({ message: `¿Cambiar el cierre de "${n}" de ${mlab} al día ${d}? Las compras hasta ese día inclusive van al resumen de ese mes y las siguientes al próximo. Se recalculan los totales.`, okLabel: 'Guardar cambio' }))
            await run(() => A.setClosingFor(n, cm, d), `Cierre de ${mlab} actualizado`);
        } },
        ...(ci.months?.[cm] ? [{ label: `Quitar cierre propio de ${mlab}`, onPress: async () => {
          if (await dlg.confirm({ message: `¿Quitar el cierre propio de ${mlab}? Ese mes vuelve a usar el cierre habitual.`, okLabel: 'Quitar', destructive: true })) await run(() => A.setClosingFor(n, cm, null), 'Cierre habitual aplicado');
        } }] : []),
        { label: 'Editar cierre habitual (todos los meses)', onPress: async () => {
          const d = await askDay(`Elige en el calendario el cierre habitual de "${n}". Se aplica a los meses sin cierre propio.`, ci.close ? ymdOf(e.now, ci.close) : isoLocal(new Date()));
          if (d && await dlg.confirm({ message: `¿Cambiar el cierre habitual de "${n}" al día ${d}? Los meses con cierre propio no cambian. Se recalculan los totales.`, okLabel: 'Guardar cambio' }))
            await run(() => A.setClosing(n, d), 'Cierre actualizado');
        } },
        ...(onLook ? [{ label: 'Color y estilo', onPress: onLook }] : []),
        { label: 'Eliminar tarjeta', destructive: true, onPress: async () => {
          const ts = S.tx.filter(t => t.card && cardOf(t) === n);
          const msg = ts.length ? `¿Eliminar la tarjeta "${n}"? También se borrará ${ts.length === 1 ? 'su compra' : 'sus ' + ts.length + ' compras'}, con las cuotas pendientes.` : `¿Eliminar la tarjeta "${n}"?`;
          if (await dlg.confirm({ message: msg, okLabel: 'Eliminar', destructive: true })) await run(() => A.deleteCard(n), 'Tarjeta eliminada');
        } },
      ];
      dlg.actions({ title: 'Tarjeta ' + n, options });
    }

    // ---------- ahorro ----------
    function savMenu(x: Sav, onEdit: (x: Sav) => void) {
      const lab = x.tid ? 'Transferencia' : x.adj ? 'Ajuste' : x.amt > 0 ? 'Depósito' : 'Retiro';
      const options: { label: string; destructive?: boolean; onPress: () => void }[] = [];
      if (!x.tid) options.push({ label: 'Editar', onPress: () => onEdit(x) });
      options.push({ label: x.tid ? 'Borrar transferencia' : 'Borrar', destructive: true, onPress: async () => {
        const plan = A.savDeletePlan(S, x);
        if (!plan.ok) { dlg.toast(plan.error); return; }
        const m = fmt(Math.abs(x.amt));
        let msg: string;
        if (x.tid) {
          const lo = S.sav.find(z => z.tid === x.tid && z.amt < 0)!, li = S.sav.find(z => z.tid === x.tid && z.amt > 0)!;
          msg = `¿Borrar esta transferencia de ${m} de ${lo.cat} a ${li.cat}? Los ${m} vuelven a Ahorro · ${lo.cat} (pasa de ${fmt(A.balOf(S.sav, lo.cat))} a ${fmt(A.balOf(plan.rest, lo.cat))}) y salen de Ahorro · ${li.cat} (pasa de ${fmt(A.balOf(S.sav, li.cat))} a ${fmt(A.balOf(plan.rest, li.cat))}). Tu cuenta disponible no cambia.`;
        } else if (x.adj) {
          msg = `¿Borrar este ajuste (${x.amt > 0 ? 'ganancia' : 'pérdida'} de ${m}) en Ahorro · ${x.cat}? El saldo pasa de ${fmt(A.balOf(S.sav, x.cat))} a ${fmt(A.balOf(plan.rest, x.cat))}. Tu cuenta disponible no cambia.`;
        } else {
          const td = A.todayIso(), dt = x.date > td ? td : x.date, A0 = A.availWith(S, S.sav, dt), A1 = A.availWith(S, plan.rest, dt), b2 = A.balOf(plan.rest, x.cat);
          msg = x.date > td
            ? `¿Borrar este ${x.amt > 0 ? 'depósito' : 'retiro'} programado de ${m} ${x.amt > 0 ? 'en' : 'de'} Ahorro · ${x.cat} (${dd_mm_yyyy(x.date)})? Todavía no movió tu cuenta ni tu ahorro, así que no cambia ningún saldo.`
            : x.amt > 0
            ? `¿Borrar este depósito de ${m} en Ahorro · ${x.cat}? Los ${m} salen de Ahorro · ${x.cat} (queda en ${fmt(b2)}) y vuelven a tu cuenta disponible (pasa de ${fmt(A0)} a ${fmt(A1)}).`
            : `¿Borrar este retiro de ${m} de Ahorro · ${x.cat}? Los ${m} dejan tu cuenta disponible (pasa de ${fmt(A0)} a ${fmt(A1)}) y vuelven a Ahorro · ${x.cat} (queda en ${fmt(b2)}).`;
        }
        if (await dlg.confirm({ message: msg, okLabel: 'Borrar', destructive: true })) await run(() => A.savDelete(plan.ids), x.tid ? 'Transferencia borrada' : 'Movimiento borrado');
      } });
      dlg.actions({ title: `${lab} · ${x.cat} · ${fmt(Math.abs(x.amt))}`, options });
    }

    return { togglePaid, txMenu, payMenu, doPay, undoPay, addCard, cardMenu, savMenu };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [S, eng, A, run, dlg, cur]);
}
