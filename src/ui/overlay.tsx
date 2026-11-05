import React, { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { findNodeHandle, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { radius, useLayout, useTheme } from './theme';

/**
 * Capa de superposiciones propia (en vez de <Modal> nativo): permite apilar
 * hojas y diálogos de forma idéntica en iOS, Android y web.
 */
interface Entry { id: string; node: React.ReactNode }
interface Ctx { set(id: string, node: React.ReactNode): void; remove(id: string): void }
const OverlayCtx = createContext<Ctx | null>(null);

export function OverlayProvider({ children }: { children: React.ReactNode }) {
  const [list, setList] = useState<Entry[]>([]);
  const api = useMemo<Ctx>(() => ({
    set: (id, node) => setList(l => (l.some(e => e.id === id) ? l.map(e => (e.id === id ? { id, node } : e)) : [...l, { id, node }])),
    remove: id => setList(l => l.filter(e => e.id !== id)),
  }), []);
  return (
    <OverlayCtx.Provider value={api}>
      {children}
      {list.map(e => <View key={e.id} style={[StyleSheet.absoluteFill, { zIndex: 100 }]} pointerEvents="box-none">{e.node}</View>)}
    </OverlayCtx.Provider>
  );
}

/** Las hojas con scroll ofrecen `reveal(nodo)`: desplaza el formulario para que lo recién desplegado (una lista de opciones) quede a la vista. */
const RevealCtx = createContext<((node: any) => void) | null>(null);
export const useReveal = () => useContext(RevealCtx);

let seq = 0;
/** Registra `node` en la capa mientras `visible` sea true. */
export function useOverlay(visible: boolean, node: React.ReactNode) {
  const ctx = useContext(OverlayCtx)!;
  const id = useRef('ov' + ++seq).current;
  // useLayoutEffect: la hoja se actualiza antes de que el teclado dispare el siguiente carácter (con useEffect se perdían dígitos al escribir rápido).
  useLayoutEffect(() => { if (visible) ctx.set(id, node); else ctx.remove(id); });
  useEffect(() => () => ctx.remove(id), [ctx, id]);
}

/**
 * Solo web: en el celular el teclado no achica la página, solo la "ventana visible" (visualViewport).
 * Medimos esa ventana para que la hoja quede siempre dentro de lo que se ve y el campo enfocado no se tape.
 */
function useVisibleBox(active: boolean): { top: number; height: number } | null {
  const [box, setBox] = useState<{ top: number; height: number } | null>(null);
  useEffect(() => {
    const w: any = typeof window !== 'undefined' ? window : null;
    const vv = Platform.OS === 'web' && active && w ? w.visualViewport : null;
    if (!vv) { setBox(null); return; }
    const upd = () => setBox({ top: vv.offsetTop, height: vv.height });
    upd();
    vv.addEventListener('resize', upd); vv.addEventListener('scroll', upd);
    const onFocus = (e: any) => {
      const el = e.target;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') && el.scrollIntoView) setTimeout(() => el.scrollIntoView({ block: 'center', behavior: 'smooth' }), 320);
    };
    w.document.addEventListener('focusin', onFocus);
    return () => { vv.removeEventListener('resize', upd); vv.removeEventListener('scroll', upd); w.document.removeEventListener('focusin', onFocus); };
  }, [active]);
  return box;
}

/**
 * Hoja inferior en móvil / diálogo centrado en pantallas anchas.
 * El contenido se desplaza, pero `footer` (los botones Guardar / Cancelar) queda SIEMPRE visible abajo, sin importar cuánto crezca el formulario.
 */
export function Sheet({ visible, onClose, children, footer }: { visible: boolean; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode }) {
  const t = useTheme(), L = useLayout();
  const centered = !L.mobile;
  const vb = useVisibleBox(visible);
  const scrollRef = useRef<any>(null), contentRef = useRef<any>(null), viewH = useRef(0);
  const reveal = useMemo(() => (node: any) => {
    if (!node) return;
    if (Platform.OS === 'web') {   // web: busca el contenedor con scroll más cercano y lo mueve lo justo para que `node` entre completo
      let sc: any = node.parentElement;
      while (sc && !(/(auto|scroll)/.test(getComputedStyle(sc).overflowY) && sc.scrollHeight > sc.clientHeight + 2)) sc = sc.parentElement;
      if (!sc) return;
      const a = node.getBoundingClientRect(), b = sc.getBoundingClientRect();
      if (a.bottom > b.bottom - 8) sc.scrollTop += Math.min(a.bottom - b.bottom + 12, Math.max(0, a.top - b.top - 8));
      else if (a.top < b.top) sc.scrollTop -= b.top - a.top + 8;
      return;
    }
    const root = findNodeHandle(contentRef.current);
    if (root && node.measureLayout) node.measureLayout(root, (_x: number, y: number, _w: number, h: number) => scrollRef.current?.scrollTo({ y: Math.max(0, y + h - viewH.current + 12), animated: true }), () => {});
  }, []);
  useOverlay(visible, (
    <View style={[StyleSheet.absoluteFill, vb ? { top: vb.top, bottom: undefined, height: vb.height } : null, { backgroundColor: t.overlay, justifyContent: centered ? 'center' : 'flex-end', alignItems: 'center' }]}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Cerrar" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ width: '100%', maxWidth: 520, maxHeight: '88%', zIndex: 1 }}>
        <View style={{ backgroundColor: t.card, borderRadius: radius.lg, borderBottomLeftRadius: centered ? radius.lg : 0, borderBottomRightRadius: centered ? radius.lg : 0, paddingTop: 16, paddingHorizontal: 16, paddingBottom: centered ? 16 : 24, flexShrink: 1, minHeight: 0 }}>
          <ScrollView ref={scrollRef} onLayout={(e: any) => { viewH.current = e.nativeEvent.layout.height; }} style={{ flexGrow: 0, flexShrink: 1 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <RevealCtx.Provider value={reveal}><View ref={contentRef} collapsable={false}>{children}</View></RevealCtx.Provider>
          </ScrollView>
          {footer ? <View accessibilityLabel="Botones de la hoja" style={{ paddingTop: 10, marginTop: 6, borderTopWidth: 1, borderTopColor: t.line }}>{footer}</View> : null}
        </View>
      </KeyboardAvoidingView>
    </View>
  ));
  return null;
}
