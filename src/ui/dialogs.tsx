import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Button, DateField, Field, T } from './kit';
import { radius, useTheme } from './theme';
import { Sheet, useOverlay } from './overlay';

export interface ActionOption { label: string; destructive?: boolean; onPress: () => void }
/** Aviso de "se guardó": qué se guardó (título, importe y detalle) y qué pasó con tus saldos. */
export interface SavedInfo { title: string; amount?: string; tone?: 'in' | 'out' | 'sav'; lines?: string[]; effect?: string }
export interface DialogApi {
  confirm(o: { message: string; okLabel: string; destructive?: boolean }): Promise<boolean>;
  ask(o: { title: string; initial?: string | number | null; type?: 'text' | 'number' | 'date'; placeholder?: string; okLabel?: string }): Promise<string | null>;
  actions(o: { title?: string; options: ActionOption[] }): void;
  toast(msg: string): void;
  /** Ventana al centro con el detalle de lo que se guardó y un botón OK. */
  saved(info: SavedInfo): void;
}
const Ctx = createContext<DialogApi | null>(null);
export const useDialogs = () => useContext(Ctx)!;

type Cur =
  | { kind: 'confirm'; message: string; okLabel: string; destructive?: boolean; done: (v: boolean) => void }
  | { kind: 'ask'; title: string; initial: string; type: 'text' | 'number' | 'date'; placeholder?: string; okLabel: string; done: (v: string | null) => void }
  | { kind: 'actions'; title?: string; options: ActionOption[] };

export function DialogProvider({ children }: { children: React.ReactNode }) {
  const [cur, setCur] = useState<Cur | null>(null);
  const [toastMsg, setToast] = useState<string | null>(null);
  const [savedInfo, setSaved] = useState<SavedInfo | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const api = useMemo<DialogApi>(() => ({
    confirm: o => new Promise(res => setCur({ kind: 'confirm', ...o, done: res })),
    ask: o => new Promise(res => setCur({ kind: 'ask', title: o.title, initial: o.initial == null ? '' : String(o.initial), type: o.type || 'text', placeholder: o.placeholder, okLabel: o.okLabel || 'Guardar', done: res })),
    actions: o => setCur({ kind: 'actions', ...o }),
    saved: info => setSaved(info),
    toast: msg => { setToast(msg); if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(() => setToast(null), 2600); },
  }), []);

  return (
    <Ctx.Provider value={api}>
      {children}
      <DialogView cur={cur} close={() => setCur(null)} />
      <Toast msg={toastMsg} />
      <SavedView info={savedInfo} close={() => setSaved(null)} />
    </Ctx.Provider>
  );
}

function SavedView({ info, close }: { info: SavedInfo | null; close: () => void }) {
  const t = useTheme(), color = info?.tone === 'in' ? t.inc : info?.tone === 'out' ? t.out : t.sav;
  // web: Enter y Escape cierran el aviso (el botón OK recibe el foco al abrirse)
  useEffect(() => {
    if (!info || Platform.OS !== 'web' || typeof document === 'undefined') return;
    const on = (e: any) => { if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); close(); } };
    document.addEventListener('keydown', on);
    return () => document.removeEventListener('keydown', on);
  }, [info, close]);
  useOverlay(!!info, info ? (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: t.overlay, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20 }]}>
      <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="Cerrar aviso" />
      <View accessibilityLabel="Movimiento guardado" accessibilityViewIsModal style={{ width: '100%', maxWidth: 360, maxHeight: '90%', backgroundColor: t.card, borderRadius: radius.lg, borderColor: t.line, borderWidth: 1, paddingTop: 22, paddingHorizontal: 18, paddingBottom: 16, alignItems: 'center', zIndex: 1 }}>
        <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: t.inc + '2b', alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
          <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={t.inc} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round"><Path d="M5 12.5l4.5 4.5L19 7.5" /></Svg>
        </View>
        <T weight="bold" size={19} style={{ textAlign: 'center' }}>{info.title}</T>
        {info.amount ? <T weight="bold" size={30} style={{ color, letterSpacing: -1, marginTop: 2, textAlign: 'center' }}>{info.amount}</T> : null}
        {(info.lines ?? []).map((l, k) => <T key={k} tone="mute" size={14} style={{ textAlign: 'center', marginTop: k === 0 ? 2 : 0 }}>{l}</T>)}
        {info.effect ? <View accessibilityLabel="Efecto en tus saldos" style={{ alignSelf: 'stretch', backgroundColor: t.bg, borderRadius: radius.sm, paddingVertical: 9, paddingHorizontal: 12, marginTop: 12 }}><T size={13} tone="mute" style={{ textAlign: 'center' }}>{info.effect}</T></View> : null}
        <View style={{ alignSelf: 'stretch', marginTop: 14 }}><Button label="OK" onPress={close} center /></View>
      </View>
    </View>
  ) : null);
  return null;
}

function Toast({ msg }: { msg: string | null }) {
  const t = useTheme();
  useOverlay(!!msg, (
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: 96, alignItems: 'center' }}>
      <View style={{ backgroundColor: t.ink, borderRadius: 20, paddingVertical: 10, paddingHorizontal: 16, maxWidth: '90%' }}>
        <T size={14} style={{ color: t.bg }}>{msg}</T>
      </View>
    </View>
  ));
  return null;
}

function DialogView({ cur, close }: { cur: Cur | null; close: () => void }) {
  const [text, setText] = useState('');
  useEffect(() => { if (cur?.kind === 'ask') setText(cur.initial); }, [cur]);
  const dismiss = () => { if (cur?.kind === 'confirm') cur.done(false); else if (cur?.kind === 'ask') cur.done(null); close(); };
  const submitAsk = () => { if (cur?.kind !== 'ask') return; const d = cur.done, v = text.trim(); close(); d(v === '' ? null : v); };
  // los botones van en el pie fijo de la hoja: nunca quedan fuera de pantalla aunque el mensaje o la lista sean largos
  const two = (cancel: () => void, ok: { label: string; onPress: () => void; danger?: boolean; primary?: boolean }) => (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      <View style={{ flex: 1 }}><Button kind="option" center label="Cancelar" onPress={cancel} style={{ marginTop: 0, paddingHorizontal: 6 }} /></View>
      <View style={{ flex: 1.4 }}><Button kind={ok.primary ? 'primary' : 'option'} center danger={ok.danger} label={ok.label} onPress={ok.onPress} style={{ marginTop: 0 }} /></View>
    </View>
  );
  const footer = cur?.kind === 'confirm' ? two(dismiss, { label: cur.okLabel, danger: cur.destructive, onPress: () => { const d = cur.done; close(); d(true); } })
    : cur?.kind === 'ask' ? two(dismiss, { label: cur.okLabel, primary: true, onPress: submitAsk })
    : cur?.kind === 'actions' ? <Button kind="option" center label="Cancelar" onPress={close} style={{ marginTop: 0 }} /> : undefined;
  return (
    <Sheet visible={!!cur} onClose={dismiss} footer={footer}>
      {cur?.kind === 'confirm' && <T style={{ marginBottom: 6 }}>{cur.message}</T>}
      {cur?.kind === 'ask' && (
        <View>
          <T tone="mute" style={{ marginBottom: 8 }}>{cur.title}</T>
          {cur.type === 'date'
            ? <DateField value={text} onChange={setText} />
            : <Field autoFocus value={text} onChangeText={setText} placeholder={cur.placeholder} keyboardType={cur.type === 'number' ? 'decimal-pad' : 'default'} onSubmitEditing={submitAsk} />}
        </View>
      )}
      {cur?.kind === 'actions' && (
        <View>
          {cur.title ? <T tone="mute" style={{ marginBottom: 8 }}>{cur.title}</T> : null}
          {cur.options.map(o => <Button key={o.label} kind="option" danger={o.destructive} label={o.label} onPress={() => { close(); o.onPress(); }} />)}
        </View>
      )}
    </Sheet>
  );
}
