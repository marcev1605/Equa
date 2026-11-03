/* Arnés de prueba: implementa en DOM el subconjunto de react-native que usa Equa (NO es parte de la app). */
import React, { useEffect, useImperativeHandle, useRef, useState } from 'react';

const UNITLESS = new Set(['flex', 'flexGrow', 'flexShrink', 'opacity', 'zIndex', 'fontWeight', 'aspectRatio']);
export function css(style: any): React.CSSProperties {
  const flat: any = Array.isArray(style) ? Object.assign({}, ...style.flat(9).filter(Boolean).map((s: any) => (Array.isArray(s) ? Object.assign({}, ...s) : s))) : { ...(style || {}) };
  const o: any = {};
  for (const [k, v0] of Object.entries(flat)) {
    let v: any = v0;
    if (v === undefined || v === null) continue;
    if (k === 'paddingHorizontal') { o.paddingLeft = o.paddingRight = px(v); continue; }
    if (k === 'paddingVertical') { o.paddingTop = o.paddingBottom = px(v); continue; }
    if (k === 'marginHorizontal') { o.marginLeft = o.marginRight = px(v); continue; }
    if (k === 'marginVertical') { o.marginTop = o.marginBottom = px(v); continue; }
    if (k === 'shadowColor' || k === 'shadowOpacity' || k === 'shadowRadius' || k === 'shadowOffset' || k === 'elevation' || k === 'textAlignVertical' || k === 'tintColor') continue;
    if (k === 'flex' && typeof v === 'number') { o.flex = `${v} ${v} 0%`; continue; }
    if (k === 'fontFamily') { o.fontFamily = `'Bricolage Grotesque', system-ui, sans-serif`; continue; }
    if (k === 'fontFamilyWeight') continue;
    o[k] = typeof v === 'number' && !UNITLESS.has(k) ? v + 'px' : v;
  }
  return o;
}
const px = (v: any) => (typeof v === 'number' ? v + 'px' : v);
const base: React.CSSProperties = { display: 'flex', flexDirection: 'column', alignItems: 'stretch', position: 'relative', boxSizing: 'border-box', minHeight: 0, minWidth: 0, flexShrink: 0, border: '0 solid black', marginTop: 0, marginRight: 0, marginBottom: 0, marginLeft: 0, paddingTop: 0, paddingRight: 0, paddingBottom: 0, paddingLeft: 0 };
const FONT_WEIGHT: Record<string, number> = { BricolageGrotesque_400Regular: 400, BricolageGrotesque_600SemiBold: 600, BricolageGrotesque_800ExtraBold: 800 };

export const StyleSheet = { create: <T,>(s: T) => s, flatten: (s: any) => (Array.isArray(s) ? Object.assign({}, ...s.flat(9).filter(Boolean)) : s), absoluteFill: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 } as any };
export const Platform = { OS: 'web' as const, select: (o: any) => o.web ?? o.default };
export const findNodeHandle = (x: any) => x ?? null;
export const Share = { share: async (_: any) => ({}) };

function aria(p: any): any {
  const a: any = {};
  if (p.accessibilityLabel) a['aria-label'] = p.accessibilityLabel;
  if (p.accessibilityRole) a.role = p.accessibilityRole === 'link' ? 'link' : p.accessibilityRole;
  if (p.accessibilityState?.expanded !== undefined) a['aria-expanded'] = p.accessibilityState.expanded;
  if (p.accessibilityState?.selected !== undefined) a['aria-selected'] = p.accessibilityState.selected;
  if (p.accessibilityState?.checked !== undefined) a['aria-checked'] = p.accessibilityState.checked;
  return a;
}

export const View = React.forwardRef<HTMLDivElement, any>(({ style, children, pointerEvents, __pe, collapsable, ...p }, ref) => {
  const s = css(style);
  if (__pe) (s as any).pointerEvents = 'auto';
  if (pointerEvents) (s as any).pointerEvents = pointerEvents === 'box-none' ? 'none' : pointerEvents;
  return <div ref={ref} {...aria(p)} style={{ ...base, ...s }}>{pointerEvents === 'box-none' ? <PassThrough>{children}</PassThrough> : children}</div>;
});
// hijos de un contenedor box-none sí reciben eventos
const PassThrough = ({ children }: any) => <>{React.Children.map(children, (c: any) => (React.isValidElement(c) ? React.cloneElement(c as any, { __pe: true }) : c))}</>;

export function Text({ style, children, numberOfLines, selectable, ...p }: any) {
  const s: any = css(style);
  if (s.fontFamily) { const fam = (Array.isArray(style) ? style.flat(9) : [style]).filter(Boolean).map((x: any) => x.fontFamily).filter(Boolean).pop(); s.fontWeight = FONT_WEIGHT[fam] || 400; }
  const clamp = numberOfLines ? { display: '-webkit-box', WebkitLineClamp: numberOfLines, WebkitBoxOrient: 'vertical', overflow: 'hidden' } : {};
  return <span {...aria(p)} style={{ ...base, display: 'inline', flexShrink: 1, whiteSpace: 'pre-wrap', wordBreak: 'break-word', font: 'inherit', ...s, ...clamp } as any}>{children}</span>;
}

export function Pressable({ style, children, onPress, disabled, accessibilityRole, hitSlop, ...p }: any) {
  const [pressed, setPressed] = useState(false);
  const st = typeof style === 'function' ? style({ pressed }) : style;
  const { __pe, ...rest } = p;
  return (
    <div {...aria({ accessibilityRole, ...rest })} role={accessibilityRole === 'link' ? 'link' : accessibilityRole === 'checkbox' ? 'checkbox' : 'button'} tabIndex={disabled ? -1 : 0}
      onMouseDown={() => setPressed(true)} onMouseUp={() => setPressed(false)} onMouseLeave={() => setPressed(false)}
      onClick={e => { if (disabled) return; e.stopPropagation(); onPress?.(e); }}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPress?.(e); } }}
      style={{ ...base, cursor: disabled ? 'default' : 'pointer', pointerEvents: 'auto', ...css(st) }}>
      {typeof children === 'function' ? children({ pressed }) : children}
    </div>
  );
}

export function TextInput({ style, value, onChangeText, onSubmitEditing, placeholder, placeholderTextColor, keyboardType, secureTextEntry, multiline, numberOfLines, autoFocus, maxLength, autoCapitalize, autoComplete, editable = true, ...p }: any) {
  const inputMode = keyboardType === 'decimal-pad' ? 'decimal' : keyboardType === 'number-pad' ? 'numeric' : keyboardType === 'email-address' ? 'email' : undefined;
  const common: any = { value: value ?? '', placeholder, autoFocus, maxLength, disabled: !editable, inputMode, 'aria-label': p.accessibilityLabel || placeholder,
    onChange: (e: any) => onChangeText?.(e.target.value), onKeyDown: (e: any) => { if (e.key === 'Enter' && !multiline) onSubmitEditing?.(); },
    style: { ...base, display: 'block', width: '100%', font: 'inherit', outline: 'none', pointerEvents: 'auto', ...css(style), ['--ph' as any]: placeholderTextColor } };
  return multiline ? <textarea rows={numberOfLines} {...common} /> : <input type={secureTextEntry ? 'password' : 'text'} {...common} />;
}

export function ScrollView({ style, contentContainerStyle, children, horizontal, onScroll, ref, ...p }: any) {
  const el = useRef<HTMLDivElement>(null);
  useImperativeHandle(ref, () => ({ scrollTo: ({ x = 0, y = 0, animated }: any) => el.current?.scrollTo({ left: x, top: y, behavior: animated ? 'smooth' : 'auto' }) }) as any, []);
  return (
    <div ref={el} {...aria(p)} onScroll={onScroll ? (e => onScroll({ nativeEvent: { contentOffset: { x: e.currentTarget.scrollLeft, y: e.currentTarget.scrollTop } } })) : undefined}
      style={{ ...base, flexGrow: 1, flexShrink: 1, ...(horizontal ? { overflowX: 'auto', overflowY: 'hidden', scrollbarWidth: 'none' } : { overflowY: 'auto', overflowX: 'hidden' }), pointerEvents: 'auto', ...css(style) }}>
      <div style={{ ...base, flexGrow: 1, ...(horizontal ? { flexDirection: 'row', flexShrink: 0 } : {}), ...css(contentContainerStyle) }}>{children}</div>
    </div>
  );
}
export const KeyboardAvoidingView = View;
export function Image({ source, style, accessibilityLabel }: any) {
  const src = typeof source === 'string' ? source : source?.uri || source?.default;
  return <img src={src} alt={accessibilityLabel || ''} style={{ ...base, display: 'block', ...css(style) }} />;
}
export const ActivityIndicator = () => <div style={{ ...base, width: 20, height: 20 }}>…</div>;

export function useWindowDimensions() {
  const get = () => ({ width: window.innerWidth, height: window.innerHeight, scale: 1, fontScale: 1 });
  const [d, setD] = useState(get);
  useEffect(() => { const f = () => setD(get()); window.addEventListener('resize', f); return () => window.removeEventListener('resize', f); }, []);
  return d;
}
export function useColorScheme(): 'light' | 'dark' {
  const mq = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  const [m, setM] = useState(!!mq?.matches);
  useEffect(() => { if (!mq) return; const f = () => setM(mq.matches); mq.addEventListener('change', f); return () => mq.removeEventListener('change', f); }, []);
  return m ? 'dark' : 'light';
}
export type StyleProp<T> = T | T[] | null | undefined | false;
export type ViewStyle = any; export type TextStyle = any; export type TextInputProps = any;
