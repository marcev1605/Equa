import React, { useEffect, useState } from 'react';
import { Platform, Share, View } from 'react-native';
import { lastBackup, markBackup } from '../../src/data/backupLog';
import type { CatKind } from '../../src/domain/types';
import { parseBackup } from '../../src/domain/backup';
import { dd_mm_yyyy, fmtMoney as fmt, isoLocal } from '../../src/domain/dates';
import { useAuth } from '../../src/state/auth';
import { useStore } from '../../src/state/store';
import { useDialogs } from '../../src/ui/dialogs';
import { BackLink, Button, Card, Collapsible, Field, H2, Item, Row, T } from '../../src/ui/kit';
import { ReportsView } from '../../src/ui/ReportsView';
import { backupWhen } from '../../src/ui/format';
import { Screen } from '../../src/ui/Shell';
import { radius, useLayout, useTheme } from '../../src/ui/theme';

const GROUPS: { kind: CatKind; title: string }[] = [
  { kind: 'out', title: 'Categorías de gastos' }, { kind: 'in', title: 'Categorías de ingresos' }, { kind: 'sav', title: 'Categorías de ahorro' },
];

export default function Datos() {
  const { snap, eng, A, run } = useStore(), dlg = useDialogs(), auth = useAuth(), L = useLayout(), t = useTheme();
  const [open, setOpen] = useState<Record<string, boolean>>({}), [view, setView] = useState<'main' | 'cats' | 'reports'>('main');
  const [restoring, setRestoring] = useState(false), [json, setJson] = useState(''), [lastBk, setLastBk] = useState<string | null | undefined>(undefined);   // undefined = todavía leyendo
  useEffect(() => { void lastBackup().then(setLastBk); }, []);

  async function add(kind: CatKind) {
    const n = await dlg.ask({ title: kind === 'sav' ? 'Nombre de la categoría de ahorro' : 'Nueva categoría de ' + (kind === 'in' ? 'ingresos' : 'gastos') });
    if (n) await run(() => A.addCategory(snap, kind, n), 'Categoría agregada');
  }
  async function del(kind: CatKind, name: string) {
    if (kind === 'sav') {
      const b = eng.svBal(name);
      if (Math.abs(b) > 0.005) { dlg.toast(`"${name}" tiene saldo (${fmt(b)}). Solo se elimina con saldo cero`); return; }
    }
    const msg = kind === 'sav' ? `¿Eliminar la categoría "${name}"? Sus movimientos quedan en el historial.` : `¿Eliminar la categoría "${name}"? Los movimientos que ya la usan la conservan.`;
    if (await dlg.confirm({ message: msg, okLabel: 'Eliminar', destructive: true })) await run(() => A.removeCategory(snap, kind, name), 'Categoría eliminada');
  }
  async function restore(kind: CatKind, name: string) {
    if (await dlg.confirm({ message: `¿Restaurar la categoría "${name}"?`, okLabel: 'Restaurar' })) await run(() => A.restoreCategory(kind, name), 'Categoría restaurada');
  }
  /** Borrado definitivo con aviso; si tiene movimientos de gasto/ingreso se elige a dónde pasarlos. */
  async function forever(kind: CatKind, name: string, moveTo?: string) {
    const n = A.categoryUsage(snap, kind, name);
    if (n > 0 && kind === 'sav') { dlg.toast(`"${name}" tiene ${n} movimiento${n === 1 ? '' : 's'} de ahorro: queda archivada para conservar tu historial`); return; }
    if (n > 0 && !moveTo) {
      const others = snap.categories[kind].filter(c => !c.hidden);
      if (!others.length) { dlg.toast('Crea otra categoría para poder pasar los movimientos'); return; }
      dlg.actions({ title: `"${name}" tiene ${n} movimiento${n === 1 ? '' : 's'}. ¿A qué categoría los pasamos?`, options: others.map(c => ({ label: `Pasarlos a ${c.name}`, onPress: () => { void forever(kind, name, c.name); } })) });
      return;
    }
    const msg = n > 0
      ? `Se pasan ${n} movimiento${n === 1 ? '' : 's'} de "${name}" a "${moveTo}" y la categoría se elimina para siempre. No se puede deshacer.`
      : `¿Eliminar "${name}" para siempre? No tiene movimientos. No se puede deshacer.`;
    if (await dlg.confirm({ message: msg, okLabel: 'Eliminar para siempre', destructive: true })) await run(() => A.deleteCategoryForever(snap, kind, name, moveTo), 'Categoría eliminada para siempre');
  }
  function hiddenMenu(kind: CatKind, name: string) {
    dlg.actions({ title: name, options: [
      { label: 'Restaurar', onPress: () => { void restore(kind, name); } },
      { label: 'Eliminar para siempre', destructive: true, onPress: () => { void forever(kind, name); } },
    ] });
  }
  /** Cambiar el saldo inicial: pide el monto y después una segunda confirmación que muestra qué cambia. */
  async function opening() {
    const before = snap.open || 0;
    const v = await dlg.ask({ title: 'Saldo inicial: dinero que tenías antes de tu primer movimiento', initial: before || '', type: 'number', okLabel: 'Continuar' });
    if (v == null) return;
    const n = parseFloat(v.replace(',', '.'));
    if (isNaN(n)) { dlg.toast('Escribe un monto válido'); return; }
    if (Math.abs(n - before) < 0.005) { dlg.toast(`El saldo inicial ya es ${fmt(before)}. No hay cambios`); return; }
    const diff = n - before, avail = eng.availFor(eng.now), sg = (x: number) => `${x > 0 ? '+' : '−'}${fmt(Math.abs(x))}`;
    const ok = await dlg.confirm({
      message: `¿Cambiar el saldo inicial de ${fmt(before)} a ${fmt(n)}?\nDiferencia: ${sg(diff)}\nTu disponible ahora pasa de ${fmt(avail)} a ${fmt(avail + diff)}, y lo mismo se mueve en todos los meses.\nTus movimientos no se tocan y podés volver a cambiarlo cuando quieras.`,
      okLabel: 'Sí, cambiar saldo',
    });
    if (!ok) return;
    if (await run(() => A.setOpening(n))) dlg.saved({ title: 'Saldo inicial guardado', amount: fmt(n), lines: [`Antes: ${fmt(before)} (${sg(diff)})`], effect: `Tu disponible ahora pasa de ${fmt(avail)} a ${fmt(avail + diff)}` });
  }
  async function exportBackup() {
    const data = await A.exportBackup();
    if (Platform.OS === 'web') {
      const name = `equa-respaldo-${isoLocal(new Date())}.json`, nav = navigator as any;
      // Celular (web): el menú de compartir guarda el archivo en Archivos/Drive sin abrirlo en una pantalla del navegador.
      const phone = /iPhone|iPad|iPod|Android/i.test(nav.userAgent) || (/Macintosh/.test(nav.userAgent) && nav.maxTouchPoints > 1);
      if (phone && nav.canShare && nav.share) {
        const file = new File([data], name, { type: 'application/json' });
        if (nav.canShare({ files: [file] })) {
          try { await nav.share({ files: [file], title: 'Respaldo de Equa' }); setLastBk(await markBackup()); } catch { /* cerró el menú sin guardar: no cuenta como respaldo */ }
          return;
        }
      }
      try { await nav.clipboard?.writeText(data); dlg.toast('Respaldo copiado al portapapeles'); } catch { dlg.toast('No se pudo copiar'); }
      const blob = new Blob([data], { type: 'application/json' }), a = document.createElement('a');
      // target _blank: si el navegador no descarga y abre el archivo, lo abre en otra pestaña y no en la de la app.
      a.href = URL.createObjectURL(blob); a.download = name; a.target = '_blank'; a.rel = 'noopener'; a.click();
    } else {
      const r = await Share.share({ message: data, title: 'Respaldo de Equa' });
      if (r?.action === 'dismissedAction') return;   // cerró el menú sin guardar: no cuenta como respaldo
    }
    setLastBk(await markBackup());
  }
  /** Web: elegir el archivo .json y volcarlo al cuadro de texto (en el celular se pega el contenido). */
  function pickFile() {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = '.json,application/json';
    inp.onchange = async () => { const f = inp.files?.[0]; if (f) setJson(await f.text()); };
    inp.click();
  }
  /** Revisa el respaldo (formato de Equa o de la app anterior) y pide confirmar, mostrando qué se va a restaurar. */
  function review() {
    let pb;
    try { pb = parseBackup(json); } catch (e: any) { dlg.toast(e?.message || 'El respaldo no es válido'); return; }
    const c = pb.counts, n = (x: number, one: string, many: string) => `${x} ${x === 1 ? one : many}`;
    const when = pb.exportedAt ? ` (guardado el ${dd_mm_yyyy(pb.exportedAt.slice(0, 10))})` : '';
    const go = (copy: boolean) => async () => {
      if (copy) await exportBackup();
      if (await run(() => A.restoreBackup(pb.snapshot), 'Datos restaurados')) { setRestoring(false); setJson(''); }
    };
    dlg.actions({
      title: `${pb.origin === 'legacy' ? 'Respaldo de la app anterior' : 'Respaldo de Equa'}${when}: ${n(c.movimientos, 'movimiento', 'movimientos')}, ${n(c.categorias, 'categoría', 'categorías')}, ${n(c.tarjetas, 'tarjeta', 'tarjetas')}, ${n(c.pagos, 'pago de tarjeta', 'pagos de tarjeta')} y ${n(c.ahorro, 'movimiento de ahorro', 'movimientos de ahorro')}. Reemplaza TODOS tus datos actuales.`,
      options: [{ label: 'Guardar una copia de lo actual y restaurar', onPress: go(true) }, { label: 'Restaurar sin guardar copia', destructive: true, onPress: go(false) }],
    });
  }

  const cats = GROUPS.map(g => {
    const list = snap.categories[g.kind], vis = list.filter(c => !c.hidden), hid = list.filter(c => c.hidden);
    return (
      <Card key={g.kind} style={L.wide ? { marginTop: 0, marginBottom: 14 } : undefined}>
        <Collapsible title={g.title} right={<T tone="mute" size={14}>{vis.length}</T>} open={!!open[g.kind]} onToggle={() => setOpen(s => ({ ...s, [g.kind]: !s[g.kind] }))}>
          {vis.map((c, k) => (
            <Item key={c.id} first={k === 0} title={c.name} sub={g.kind === 'sav' ? fmt(eng.svBal(c.name)) : undefined}
              right={<Button kind="link" label="×" onPress={() => del(g.kind, c.name)} style={{ paddingHorizontal: 10 }} />} />
          ))}
          {!vis.length && <T tone="mute" size={13}>No tienes categorías.</T>}
          <Button kind="option" label="＋ Agregar categoría" onPress={() => add(g.kind)} />
          {hid.length ? (
            <View style={{ marginTop: 12 }}>
              <H2>Eliminadas, toca para restaurar o borrar para siempre</H2>
              {hid.map(c => <Button key={c.id} kind="option" label={`↺ ${c.name}`} onPress={() => hiddenMenu(g.kind, c.name)} />)}
            </View>
          ) : null}
          {g.kind === 'sav' && <T tone="mute" size={13} style={{ marginTop: 8 }}>Solo se puede eliminar una categoría con saldo cero.</T>}
        </Collapsible>
      </Card>
    );
  });

  const opening$ = (
    <Card style={L.wide ? { marginTop: 0 } : undefined}>
      <H2>Saldo inicial</H2>
      <Row>
        <View style={{ flex: 1, minWidth: 0 }}>
          <T size={22} weight="bold">{fmt(snap.open || 0)}</T>
          <T tone="mute" size={13}>Dinero que tenías antes de tu primer movimiento</T>
        </View>
        <Button kind="option" center label="Cambiar" onPress={opening} style={{ marginTop: 0 }} />
      </Row>
    </Card>
  );
  const backup = (
    <Card style={L.wide ? { marginTop: 0 } : undefined}>
      <H2>Respaldo</H2>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Button label="Guardar respaldo" onPress={exportBackup} style={{ flex: 1, marginTop: 0 }} />
        <Button kind="option" center label="Restaurar" onPress={() => setRestoring(r => !r)} style={{ flex: 1, marginTop: 0 }} />
      </View>
      {lastBk === undefined ? null : <View accessibilityLabel="Último respaldo manual" style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 12, borderRadius: radius.sm, padding: 10, backgroundColor: lastBk ? t.bg : t.acc + '2b' }}>
        <View style={{ width: 10, height: 10, borderRadius: 5, marginTop: 5, backgroundColor: lastBk ? t.inc : t.acc }} />
        <T size={13.5} tone="mute" style={{ flex: 1 }}>{lastBk ? <>Último respaldo manual: <T size={13.5} weight="bold">{backupWhen(lastBk, isoLocal(new Date()))}</T></> : 'Todavía no hiciste ningún respaldo manual.'}</T>
      </View>}
      {restoring && (
        <View style={{ marginTop: 12 }}>
          <T tone="mute" size={13} style={{ marginBottom: 6 }}>Pega el contenido de un respaldo de Equa o de la app anterior{Platform.OS === 'web' ? ', o elige el archivo' : ''}. Antes de cambiar nada te muestro qué se va a restaurar.</T>
          {Platform.OS === 'web' && <Button kind="option" center label="Elegir archivo…" onPress={pickFile} style={{ marginTop: 0, marginBottom: 8 }} />}
          <Field value={json} onChangeText={setJson} placeholder='{"app":"equa",…}' multiline numberOfLines={5} style={{ minHeight: 110, textAlignVertical: 'top' }} />
          <Button label="Revisar respaldo" onPress={review} disabled={!json.trim()} />
        </View>
      )}
    </Card>
  );
  const account = (
    <Card style={L.wide ? { marginTop: 0 } : undefined}>
      <H2>Tu cuenta</H2>
      {auth.mode === 'cloud' && <T tone="mute" size={14}>Sesión: {auth.session?.user.email}. Tus datos se guardan en la nube y se sincronizan entre tus dispositivos.</T>}
      {auth.mode === 'demo' && <T tone="mute" size={14}>Modo demo: tus datos viven solo en este dispositivo. Configurá Supabase para tener cuenta y sincronización.</T>}
      {auth.mode === 'cloud' && <Button kind="link" label="Cerrar sesión" onPress={() => auth.signOut()} />}
    </Card>
  );

  const menu = (
    <Card style={L.wide ? { marginTop: 0 } : undefined}>
      <Item first title="Reportes" sub="Exportá tus números en PDF o Excel" onPress={() => setView('reports')} right={<T size={20} tone="mute">›</T>} />
      <Item title="Editor de categorías" sub="Gastos, ingresos y ahorro" onPress={() => setView('cats')} right={<T size={20} tone="mute">›</T>} />
    </Card>
  );

  if (view === 'reports') return <Screen><ReportsView onBack={() => setView('main')} /></Screen>;
  if (view === 'cats') {
    return (
      <Screen>
        <BackLink label="‹ Volver a Datos" onPress={() => setView('main')} />
        <T size={26} weight="bold" style={{ letterSpacing: -0.5, marginBottom: 4 }}>Editor de categorías</T>
        <T tone="mute" size={14} style={{ marginBottom: 6 }}>Agregá, eliminá o restaurá las categorías de gastos, ingresos y ahorro.</T>
        {cats}
      </Screen>
    );
  }
  return (
    <Screen title="Datos">
      {L.wide ? <View style={{ flexDirection: 'row', gap: 24, alignItems: 'flex-start' }}><View style={{ flex: 1, gap: 24 }}>{menu}{opening$}</View><View style={{ flex: 1, gap: 24 }}>{backup}{account}</View></View> : <>{menu}{opening$}{backup}{account}</>}
    </Screen>
  );
}
