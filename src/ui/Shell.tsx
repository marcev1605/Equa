import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Image, Pressable, ScrollView, View } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Sav, Tx } from '../domain/types';
import { monthName, monthShort } from '../domain/dates';
import { useStore } from '../state/store';
import { T } from './kit';
import { accentOf, useLayout, useTheme, radius } from './theme';
import { CardLookSheet } from './CardLookSheet';
import { SavForm, type SavDir } from './SavForm';
import { TxForm, type TxKind } from './TxForm';
import { Icon, TabIcon, type IconName } from './icons';

export const NAV: { path: string; label: string; icon: IconName }[] = [
  { path: '/', label: 'Resumen', icon: 'home' },
  { path: '/forecast', label: 'Previsión', icon: 'trend' },
  { path: '/cards', label: 'Tarjetas', icon: 'card' },
  { path: '/savings', label: 'Ahorro', icon: 'coin' },
  { path: '/stats', label: 'Estadísticas', icon: 'bars' },
  { path: '/data', label: 'Datos', icon: 'sliders' },
];

const KINDS: { kind: TxKind; label: string; sub: string; icon: IconName; tone: 'in' | 'out' }[] = [
  { kind: 'in', label: 'Ingreso', sub: 'Sueldo, ventas, cobros', icon: 'up', tone: 'in' },
  { kind: 'out', label: 'Gasto', sub: 'Efectivo o débito', icon: 'down', tone: 'out' },
  { kind: 'card', label: 'Gasto con tarjeta', sub: 'Con cuotas y cierre', icon: 'card', tone: 'out' },
];

/** Opción del menú “+”: círculo de color con ícono y nombre. `floating` = versión flotante del celular. */
function NewOption({ k, onPress, floating }: { k: (typeof KINDS)[number]; onPress: () => void; floating?: boolean }) {
  const t = useTheme(), ac = accentOf(t, k.tone);
  const dot = <View style={{ width: floating ? 48 : 36, height: floating ? 48 : 36, borderRadius: 24, backgroundColor: ac.bg, alignItems: 'center', justifyContent: 'center' }}><Icon name={k.icon} color={ac.ink} size={floating ? 24 : 20} /></View>;
  if (floating)
    return (
      <Pressable accessibilityRole="button" accessibilityLabel={k.label} onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ backgroundColor: t.card, borderRadius: radius.pill, paddingVertical: 8, paddingHorizontal: 14, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 5 }}>
          <T weight="semi" size={15}>{k.label}</T>
        </View>
        {dot}
      </Pressable>
    );
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={k.label} onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 8, borderRadius: radius.sm, backgroundColor: t.bg }}>
      {dot}
      <View style={{ flex: 1, minWidth: 0 }}><T weight="semi" size={14}>{k.label}</T><T tone="mute" size={12}>{k.sub}</T></View>
    </Pressable>
  );
}

export type EditScope = 'month' | 'following';
export interface TxEditing { t: Tx; i: number; scope?: EditScope }
interface UIApi { openTx: (editing: TxEditing) => void; openNew: (kind: TxKind) => void; openSav: (dir: SavDir, editing?: Sav | null) => void; openCardLook: (card: string) => void }
const UICtx = createContext<UIApi>({ openTx: () => {}, openNew: () => {}, openSav: () => {}, openCardLook: () => {} });
export const useUI = () => useContext(UICtx);

export function Logo({ size = 44, compact = false }: { size?: number; compact?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: compact ? 7 : 10 }}>
      <Image source={require('../../assets/icon.png')} style={{ width: size, height: size, borderRadius: size * 0.22 }} accessibilityLabel="Equa" />
      <T size={compact ? 17 : size * 0.8} weight="bold" style={{ letterSpacing: -1 }}>Equa</T>
    </View>
  );
}

/** Mes distinto al de hoy: lo publica el selector de mes para que la cinta "Volver a hoy" lo ofrezca al bajar */
interface HomeLink { label: string; go: () => void }
const HomeCtx = createContext<(h: HomeLink | null) => void>(() => {});

/** Bloque de total del encabezado (web): grande arriba de todo; al bajar se achica a una fila. */
export function Stat({ label, value, tone = 'ink', sub, c, hero, flex = 1, onPress }: { label: string; value: string; tone?: 'ink' | 'in' | 'out'; sub?: string; c: boolean; hero?: boolean; flex?: number; onPress?: () => void }) {
  const t = useTheme();
  const box = { flex, minWidth: 0, backgroundColor: t.card, borderColor: t.line, borderWidth: 1, borderRadius: c ? radius.sm : radius.md } as const;
  const inner = c ? (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingVertical: 8, paddingHorizontal: 14 }}>
      <T tone="mute" size={12} numberOfLines={1} style={{ flexShrink: 1 }}>{label}{onPress ? ' ›' : ''}</T>
      <T size={hero ? 20 : 18} weight="bold" tone={tone} numberOfLines={1}>{value}</T>
    </View>
  ) : (
    <View style={{ padding: 18 }}>
      <T tone="mute" size={13}>{label}{onPress ? ' ›' : ''}</T>
      <T size={hero ? 44 : 24} weight="bold" tone={tone} style={{ letterSpacing: hero ? -2 : -0.5, lineHeight: hero ? 50 : 30 }}>{value}</T>
      {sub ? <T tone="mute" size={12.5} style={{ marginTop: 2 }}>{sub}</T> : null}
    </View>
  );
  return onPress ? <Pressable accessibilityRole="button" onPress={onPress} style={box}>{inner}</Pressable> : <View style={box}>{inner}</View>;
}

/**
 * Contenedor de pantalla: scroll + ancho máximo centrado según el dispositivo.
 * Celular: logo compacto fijo arriba (línea y sombra suave al deslizar); si se está en otro mes y el selector ya salió
 * de la pantalla, debajo del logo aparece la cinta "Volver a hoy".
 * Web ancha (con `title`): encabezado fijo con el título, el selector de mes y los totales (`summary`), que se achican al bajar.
 */
export function Screen({ children, title, month, summary }: { children: React.ReactNode; title?: string; month?: React.ReactNode; summary?: (compact: boolean) => React.ReactNode }) {
  const L = useLayout(), t = useTheme();
  const ref = useRef<{ scrollTo: (o: { y: number; animated: boolean }) => void } | null>(null);
  const [y, setY] = useState(0), [compact, setCompact] = useState(false);
  const [home, setHome] = useState<HomeLink | null>(null);
  const head = L.wide && !!title;
  const line = y > 4, ribbon = !L.wide && !!home && y > 80, c = head && compact;
  const lift = line ? { shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 2 } : {};
  return (
    <HomeCtx.Provider value={setHome}>
      <View style={{ flex: 1 }}>
        <View style={{ width: '100%', zIndex: 5, backgroundColor: t.bg, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: line && (head || !L.wide) ? t.line : 'transparent', ...(head || !L.wide ? lift : {}) }}>
          {!L.wide ? <View style={{ height: 40, alignItems: 'center', justifyContent: 'center' }}><Logo size={22} compact /></View> : null}
          {head ? (
            <View style={{ width: '100%', maxWidth: L.content, paddingHorizontal: 16, paddingTop: c ? 14 : 24, paddingBottom: c ? 12 : 18 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: summary ? (c ? 10 : 18) : 0 }}>
                <T size={c ? 21 : 26} weight="bold" style={{ letterSpacing: -0.6 }}>{title}</T>
                {month}
              </View>
              {summary ? <View style={{ flexDirection: 'row', gap: c ? 12 : 20 }}>{summary(c)}</View> : null}
            </View>
          ) : null}
          {ribbon ? (
            <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, top: '100%', alignItems: 'center' }}>
              <Pressable accessibilityRole="button" accessibilityLabel="Volver a hoy" onPress={() => { home.go(); ref.current?.scrollTo({ y: 0, animated: false }); }}
                style={{ marginTop: 8, backgroundColor: t.card, borderWidth: 1, borderColor: t.line, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 4 }}>
                <T size={12.5} weight="bold">{`↑ Volver a hoy · ${home.label}`}</T>
              </Pressable>
            </View>
          ) : null}
        </View>
        <ScrollView ref={ref} scrollEventThrottle={32} onScroll={(e: { nativeEvent: { contentOffset: { y: number } } }) => { const yy = e.nativeEvent.contentOffset.y; setY(yy); if (head) setCompact(k => (k ? yy > 8 : yy > 40)); }} contentContainerStyle={{ alignItems: 'center', paddingBottom: L.wide ? 40 : 150 }} keyboardShouldPersistTaps="handled">
          <View style={{ width: '100%', maxWidth: L.content, paddingHorizontal: 16, paddingTop: L.wide ? (head ? 6 : 12) : 4 }}>{children}</View>
        </ScrollView>
      </View>
    </HomeCtx.Provider>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  const L = useLayout(), t = useTheme(), router = useRouter(), path = usePathname(), insets = useSafeAreaInsets();
  const { ready } = useStore();
  const [form, setForm] = useState<{ open: boolean; editing: TxEditing | null; kind: TxKind }>({ open: false, editing: null, kind: 'out' });
  const [menu, setMenu] = useState(false);   // menú de “+”: Ingreso / Gasto / Gasto con tarjeta
  const [look, setLook] = useState<string | null>(null);   // tarjeta cuyo color y estilo se está editando
  const [sf, setSf] = useState<{ open: boolean; dir: SavDir; editing: Sav | null }>({ open: false, dir: 'in', editing: null });
  const ui: UIApi = { openTx: editing => setForm({ open: true, editing, kind: 'out' }), openNew: kind => { setMenu(false); setForm({ open: true, editing: null, kind }); }, openSav: (dir, editing = null) => setSf({ open: true, dir, editing }), openCardLook: setLook };
  const active = (p: string) => (p === '/' ? path === '/' || path === '' : path.startsWith(p));
  const go = (p: string) => router.replace(p as never);

  const content = (
    <View style={{ flex: 1 }}>
      {ready ? children : <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><T tone="mute">Cargando…</T></View>}
    </View>
  );

  return (
    <UICtx.Provider value={ui}>
      <View style={{ flex: 1, backgroundColor: t.bg, paddingTop: insets.top, paddingLeft: insets.left, paddingRight: insets.right }}>
        {L.wide ? (
          <View style={{ flex: 1, flexDirection: 'row' }}>
            <View style={{ width: 248, borderRightWidth: 1, borderRightColor: t.line, backgroundColor: t.card, padding: 16, gap: 4 }}>
              <View style={{ paddingVertical: 8, paddingBottom: 20 }}><Logo size={40} /></View>
              <Pressable accessibilityRole="button" accessibilityLabel="Nuevo movimiento" accessibilityState={{ expanded: menu }} onPress={() => setMenu(m => !m)} style={{ backgroundColor: t.acc, borderRadius: radius.sm, padding: 12, alignItems: 'center', marginBottom: menu ? 6 : 12 }}>
                <T weight="semi" style={{ color: t.accInk }}>{menu ? '× Cerrar' : '＋ Nuevo movimiento'}</T>
              </Pressable>
              {menu ? <View style={{ gap: 6, marginBottom: 12 }}>{KINDS.map(k => <NewOption key={k.kind} k={k} onPress={() => ui.openNew(k.kind)} />)}</View> : null}
              {NAV.map(n => (
                <Pressable key={n.path} accessibilityRole="link" onPress={() => go(n.path)}
                  style={{ flexDirection: 'row', gap: 12, alignItems: 'center', padding: 12, borderRadius: radius.sm, backgroundColor: active(n.path) ? t.bg : 'transparent' }}>
                  <TabIcon name={n.icon} active={active(n.path)} size={22} />
                  <T tone={active(n.path) ? 'ink' : 'mute'} weight={active(n.path) ? 'semi' : 'regular'}>{n.label}</T>
                </Pressable>
              ))}
            </View>
            {content}
          </View>
        ) : (
          <>
            {content}
            {/* barra flotante: suspendida sobre el contenido, con sombra suave; el ícono activo va en un recuadro amarillo */}
            <View accessibilityRole="tablist" style={{ position: 'absolute', left: (L.width < 340 ? 6 : 10) + insets.left, right: (L.width < 340 ? 6 : 10) + insets.right, bottom: 8 + insets.bottom, flexDirection: 'row', backgroundColor: t.card, borderWidth: 1, borderColor: t.line, borderRadius: 22, paddingVertical: 6, paddingHorizontal: 2,
              shadowColor: '#12343b', shadowOpacity: 0.16, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 8 }}>
              {NAV.map(n => (
                <Pressable key={n.path} accessibilityRole="link" accessibilityLabel={n.label} accessibilityState={{ selected: active(n.path) }} onPress={() => go(n.path)}
                  style={{ flex: 1, minWidth: 0, paddingHorizontal: 1, alignItems: 'center', gap: 2 }}>
                  <TabIcon name={n.icon} active={active(n.path)} />
                  <T numberOfLines={1} tone={active(n.path) ? 'ink' : 'mute'} size={L.width < 340 ? 8 : L.width < 360 ? 9 : 10} weight={active(n.path) ? 'semi' : 'regular'}>{n.label}</T>
                </Pressable>
              ))}
            </View>
            {menu ? (
              <>
                <Pressable accessibilityLabel="Cerrar menú" onPress={() => setMenu(false)} style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: t.overlay }} />
                <View accessibilityLabel="Nuevo movimiento" style={{ position: 'absolute', right: 18 + insets.right, bottom: 82 + 56 + 14 + insets.bottom, gap: 12, alignItems: 'flex-end' }}>
                  {KINDS.map(k => <NewOption key={k.kind} k={k} floating onPress={() => ui.openNew(k.kind)} />)}
                </View>
              </>
            ) : null}
            <Pressable accessibilityRole="button" accessibilityLabel="Agregar movimiento" accessibilityState={{ expanded: menu }} onPress={() => setMenu(m => !m)}
              style={{ position: 'absolute', right: 18 + insets.right, bottom: 82 + insets.bottom, width: 56, height: 56, borderRadius: 28, backgroundColor: t.acc, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 6, transform: [{ rotate: menu ? '45deg' : '0deg' }] }}>
              <Icon name="plus" color={t.accInk} size={28} width={2.4} />
            </Pressable>
          </>
        )}
      </View>
      <CardLookSheet card={look} onClose={() => setLook(null)} />
      <SavForm visible={sf.open} dir={sf.dir} editing={sf.editing} onClose={() => setSf(f => ({ ...f, open: false }))} />
      <TxForm visible={form.open} editing={form.editing} kind={form.kind} onClose={() => setForm(f => ({ ...f, open: false }))} />
    </UICtx.Provider>
  );
}

/** Selector de mes del estado global (Resumen y Estadísticas) */
export function MonthNav({ bar }: { bar?: boolean }) {
  const { cur, setCur } = useStore();
  return <MonthNavView cur={cur} onChange={setCur} bar={bar} />;
}

/**
 * Selector de mes: mes anterior · MES ACTUAL · mes siguiente. Tocar un vecino avanza o retrocede;
 * "Volver a hoy" aparece cuando se está en otro mes. `caption` agrega una leyenda chica sobre el mes (ej. "Cierre de").
 */
export function MonthNavView({ cur, onChange, caption, bar }: { cur: number; onChange: (i: number) => void; caption?: string; bar?: boolean }) {
  const t = useTheme(), { eng } = useStore(), home = eng.now;
  const publish = useContext(HomeCtx), change = useRef(onChange);
  change.current = onChange;
  useEffect(() => {
    publish(cur !== home ? { label: monthName(home), go: () => change.current(home) } : null);
    return () => publish(null);
  }, [cur, home, publish]);
  const side = (i: number, dir: 'prev' | 'next') => {
    const yy = Math.floor(i / 12) !== Math.floor(cur / 12) ? ` ’${String(Math.floor(i / 12)).slice(2)}` : '';
    const txt = `${monthShort(i)}${yy}`;
    return (
      <Pressable accessibilityRole="button" accessibilityLabel={dir === 'prev' ? 'Mes anterior' : 'Mes siguiente'} onPress={() => onChange(i)}
        style={({ pressed }: { pressed: boolean }) => ({ ...(bar ? { minWidth: 70, paddingHorizontal: 10 } : { flex: 1, minWidth: 0 }), minHeight: bar ? 38 : 46, flexDirection: 'row', alignItems: 'center', justifyContent: dir === 'prev' ? 'flex-start' : 'flex-end', paddingHorizontal: 4, opacity: pressed ? 0.6 : 1 })}>
        <T size={15} weight="semi" tone="mute" numberOfLines={1}>{dir === 'prev' ? `‹ ${txt}` : `${txt} ›`}</T>
      </Pressable>
    );
  };
  if (bar) {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        {cur !== home ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Volver a hoy" onPress={() => onChange(home)} style={{ marginRight: 8, borderWidth: 1, borderColor: t.line, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 }}>
            <T size={12} weight="semi" tone="mute">Volver a hoy</T>
          </Pressable>
        ) : null}
        {side(cur - 1, 'prev')}
        <View accessibilityLabel="Mes elegido" style={{ backgroundColor: t.ink, borderRadius: radius.sm, paddingHorizontal: 16, paddingVertical: 8, alignItems: 'center' }}>
          <T size={14} weight="bold" style={{ color: t.card }}>{`${caption ? caption + ' ' : ''}${monthName(cur)} ${Math.floor(cur / 12)}`}</T>
        </View>
        {side(cur + 1, 'next')}
      </View>
    );
  }
  return (
    <View style={{ marginVertical: 12, width: '100%', maxWidth: 460, alignSelf: 'center' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        {side(cur - 1, 'prev')}
        <View accessibilityLabel="Mes elegido" style={{ flexShrink: 0, backgroundColor: t.ink, borderRadius: radius.md, paddingHorizontal: 16, paddingVertical: caption ? 6 : 11, alignItems: 'center' }}>
          {caption ? <T size={11} weight="semi" style={{ color: t.card, opacity: 0.7, lineHeight: 14 }}>{caption}</T> : null}
          <T size={16} weight="bold" style={{ color: t.card }}>{`${monthName(cur)} ${Math.floor(cur / 12)}`}</T>
        </View>
        {side(cur + 1, 'next')}
      </View>
      {cur !== home ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Volver a hoy" onPress={() => onChange(home)} style={{ alignSelf: 'center', marginTop: 8, borderWidth: 1, borderColor: t.line, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6 }}>
          <T size={12} weight="semi" tone="mute">Volver a hoy</T>
        </Pressable>
      ) : null}
    </View>
  );
}
