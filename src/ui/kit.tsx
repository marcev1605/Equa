import React from 'react';
import { Platform, Pressable, Text as RNText, TextInput, View, type StyleProp, type TextInputProps, type TextStyle, type ViewStyle } from 'react-native';
import { fmtMoney } from '../domain/dates';
import { font, radius, useTheme, type Accent } from './theme';
import { useReveal } from './overlay';

type Tone = 'ink' | 'mute' | 'in' | 'out';
export function T({ tone = 'ink', size = 16, weight = 'regular', style, children, ...rest }:
  { tone?: Tone; size?: number; weight?: 'regular' | 'semi' | 'bold'; style?: StyleProp<TextStyle>; children?: React.ReactNode; numberOfLines?: number; selectable?: boolean }) {
  const t = useTheme();
  const color = tone === 'ink' ? t.ink : tone === 'mute' ? t.mute : tone === 'in' ? t.inc : t.out;
  return <RNText {...rest} style={[{ color, fontSize: size, fontFamily: font[weight], lineHeight: Math.round(size * 1.3) }, style]}>{children}</RNText>;
}

export const Money = ({ v, tone, size = 16, weight = 'semi', sign, hide }: { v: number; tone?: Tone; size?: number; weight?: 'regular' | 'semi' | 'bold'; sign?: '+' | '−'; hide?: boolean }) =>
  <T tone={tone} size={size} weight={weight}>{hide ? '$ ••••••' : `${sign ?? ''}${fmtMoney(v)}`}</T>;

export function Card({ children, style, pad = 14 }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; pad?: number }) {
  const t = useTheme();
  return <View style={[{ backgroundColor: t.card, borderColor: t.line, borderWidth: 1, borderRadius: radius.md, padding: pad, marginTop: 14 }, style]}>{children}</View>;
}
export const H2 = ({ children }: { children: React.ReactNode }) => <T tone="mute" size={15} weight="semi" style={{ marginBottom: 8 }}>{children}</T>;
export const Row = ({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) =>
  <View style={[{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, style]}>{children}</View>;

export function Button({ label, onPress, kind = 'primary', danger, style, disabled, center, accent, size }:
  { label: string; size?: number; onPress: () => void; kind?: 'primary' | 'option' | 'link'; danger?: boolean; style?: StyleProp<ViewStyle>; disabled?: boolean; center?: boolean; accent?: Accent }) {
  const t = useTheme();
  if (kind === 'link')
    return <Pressable accessibilityRole="button" onPress={onPress} style={[{ paddingVertical: 8, alignItems: 'center' }, style]}><T tone="mute" style={{ textDecorationLine: 'underline' }}>{label}</T></Pressable>;
  const primary = kind === 'primary';
  return (
    <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress}
      style={({ pressed }: { pressed: boolean }) => [{ backgroundColor: primary ? (accent?.bg ?? t.acc) : t.bg, borderColor: primary ? (accent?.bg ?? t.acc) : t.line, borderWidth: 1, borderRadius: radius.sm, paddingVertical: 13, paddingHorizontal: 14, marginTop: 8, opacity: disabled ? 0.5 : pressed ? 0.85 : 1, alignItems: primary || center ? 'center' : 'flex-start', justifyContent: 'center' }, style]}>
      <T size={size} weight={primary || center ? 'semi' : 'regular'} tone={danger ? 'out' : 'ink'} style={[primary ? { color: accent?.ink ?? t.accInk } : null, center ? { textAlign: 'center' } : null]}>{label}</T>
    </Pressable>
  );
}

export function Field(props: TextInputProps & { label?: string }) {
  const t = useTheme();
  const { label, style, ...rest } = props;
  return (
    <View style={{ marginBottom: 8, flex: 1, minWidth: 0 }}>
      {label ? <T tone="mute" size={13} style={{ marginBottom: 4 }}>{label}</T> : null}
      <TextInput placeholderTextColor={t.mute} accessibilityLabel={label} {...rest} style={[{ backgroundColor: t.bg, borderColor: t.line, borderWidth: 1, borderRadius: radius.sm, padding: 11, color: t.ink, fontSize: 16, fontFamily: font.regular }, style]} />
    </View>
  );
}

export function Seg<V extends string>({ value, options, onChange, accent }: { value: V; options: [V, string][]; onChange: (v: V) => void; accent?: Accent | ((v: V) => Accent) }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8 }}>
      {options.map(([v, label]) => {
        const a: Accent = (typeof accent === 'function' ? accent(v) : accent) ?? { bg: t.acc, ink: t.accInk };
        return (
          <Pressable key={v} accessibilityRole="button" onPress={() => onChange(v)}
            style={{ flex: 1, padding: 10, borderRadius: radius.sm, borderWidth: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: v === value ? a.bg : t.bg, borderColor: v === value ? a.bg : t.line }}>
            <T size={14} weight={v === value ? 'semi' : 'regular'} style={[v === value ? { color: a.ink } : null, { textAlign: 'center' }]}>{label}</T>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Check({ on, onPress, label, size = 26, accent }: { on: boolean; onPress?: () => void; label?: string; size?: number; accent?: Accent }) {
  const t = useTheme();
  const box = (
    <View style={{ width: size, height: size, borderRadius: size / 2, borderWidth: 2, borderColor: on ? (accent?.bg ?? t.acc) : t.line, backgroundColor: on ? (accent?.bg ?? t.acc) : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
      {on ? <T weight="bold" size={size * 0.55} style={{ color: accent?.ink ?? t.accInk, lineHeight: size * 0.7 }}>✓</T> : null}
    </View>
  );
  if (!onPress) return box;
  return <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={label} onPress={onPress} hitSlop={8}>{box}</Pressable>;
}

export const Bar = ({ pct, color }: { pct: number; color?: string }) => {
  const t = useTheme();
  return <View style={{ height: 8, backgroundColor: t.line, borderRadius: 5, overflow: 'hidden', marginVertical: 4 }}><View style={{ height: '100%', width: `${Math.max(0, Math.min(100, pct))}%`, backgroundColor: color || t.acc }} /></View>;
};

/** Enlace discreto para volver a la lista desde un detalle (sin caja ni relleno). */
export function BackLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} hitSlop={10} style={{ alignSelf: 'flex-start', paddingVertical: 6, marginBottom: 8 }}>
      <T size={13} weight="semi" tone="mute">{label}</T>
    </Pressable>
  );
}

/** Fila de lista con separador superior */
export function Item({ left, title, sub, right, done, onPress, first }:
  { left?: React.ReactNode; title: string; sub?: string; right?: React.ReactNode; done?: boolean; onPress?: () => void; first?: boolean }) {
  const t = useTheme();
  const body = (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderTopWidth: first ? 0 : 1, borderTopColor: t.line, gap: 10 }}>
      {left}
      <View style={{ flex: 1, minWidth: 0, opacity: done ? 0.5 : 1 }}>
        <T numberOfLines={2}>{title}</T>
        {sub ? <T tone="mute" size={13}>{sub}</T> : null}
      </View>
      {right}
    </View>
  );
  return onPress ? <Pressable accessibilityRole="button" onPress={onPress}>{body}</Pressable> : body;
}

/** Botón "⋯" de opciones */
export const Dots = ({ onPress, label = 'Opciones', color }: { onPress: () => void; label?: string; color?: string }) =>
  <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={8} style={{ paddingHorizontal: 8 }}><T tone="mute" size={20} style={color ? { color } : undefined}>⋯</T></Pressable>;

/** Encabezado plegable (estilo Datos / Tarjetas) */
export function Collapsible({ title, right, open, onToggle, children }: { title: string; right?: React.ReactNode; open: boolean; onToggle: () => void; children?: React.ReactNode }) {
  return (
    <View>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={onToggle}>
        <Row><T tone="mute" size={15} weight="semi">{open ? '▾' : '▸'} {title}</T>{right}</Row>
      </Pressable>
      {open ? <View style={{ marginTop: 10 }}>{children}</View> : null}
    </View>
  );
}

/** Campo de fecha YYYY-MM-DD. Web: selector nativo del navegador. iOS/Android: texto con guiones automáticos
 *  (para un calendario nativo se puede reemplazar por @react-native-community/datetimepicker). */
export function DateField({ value, onChange, label }: { value: string; onChange: (v: string) => void; label?: string }) {
  const t = useTheme();
  if (Platform.OS === 'web') {
    return (
      <View style={{ marginBottom: 8, flex: 1, minWidth: 0 }}>
        {label ? <T tone="mute" size={13} style={{ marginBottom: 4 }}>{label}</T> : null}
        {React.createElement('input', {
          type: 'date', value, 'aria-label': label || 'Fecha', onChange: (e: any) => onChange(e.target.value),
          style: { backgroundColor: t.bg, border: `1px solid ${t.line}`, borderRadius: 10, padding: 11, color: t.ink, fontSize: 16, fontFamily: font.regular, colorScheme: t.bg === '#0e2226' ? 'dark' : 'light', width: '100%', minWidth: 0, maxWidth: '100%', boxSizing: 'border-box', WebkitAppearance: 'none', appearance: 'none', height: 46 },
        })}
      </View>
    );
  }
  const fmt = (raw: string) => { const d = raw.replace(/\D/g, '').slice(0, 8); return d.length > 6 ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}` : d.length > 4 ? `${d.slice(0, 4)}-${d.slice(4)}` : d; };
  return <Field label={label} value={value} onChangeText={(x: string) => onChange(fmt(x))} placeholder="AAAA-MM-DD" keyboardType="number-pad" maxLength={10} />;
}

/** Selector por chips (categorías, tarjetas) */
export function Chips({ value, options, onChange, extra, accent, labelPrefix }: { labelPrefix?: string; value: string; options: string[]; onChange: (v: string) => void; extra?: { label: string; onPress: () => void }; accent?: Accent }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
      {options.map(o => (
        <Pressable key={o} accessibilityRole="button" accessibilityLabel={labelPrefix ? labelPrefix + o : undefined} onPress={() => onChange(o)}
          style={{ paddingVertical: 8, paddingHorizontal: 12, borderRadius: radius.pill, borderWidth: 1, backgroundColor: o === value ? (accent?.bg ?? t.acc) : t.bg, borderColor: o === value ? (accent?.bg ?? t.acc) : t.line }}>
          <T size={14} weight={o === value ? 'semi' : 'regular'} style={o === value ? { color: accent?.ink ?? t.accInk } : undefined}>{o}</T>
        </Pressable>
      ))}
      {extra ? <Pressable accessibilityRole="button" onPress={extra.onPress} style={{ paddingVertical: 8, paddingHorizontal: 12, borderRadius: radius.pill, borderWidth: 1, borderColor: t.line, borderStyle: 'dashed' }}><T size={14} tone="mute">{extra.label}</T></Pressable> : null}
    </View>
  );
}

/** Desplegable en línea: muestra la opción elegida y, al tocarla, la lista con una línea secundaria (p. ej. el saldo) bajo cada nombre. */
export interface SelectOption { value: string; label: string; sub?: string }
export function Select({ label, value, options, onChange, accent, footer }: { label: string; value: string; options: SelectOption[]; onChange: (v: string) => void; accent?: Accent; footer?: { label: string; onPress: () => void } }) {
  const t = useTheme();
  const [open, setOpen] = React.useState(false);
  const reveal = useReveal(), listRef = React.useRef(null as any);
  React.useEffect(() => { if (open && reveal) { const id = setTimeout(() => reveal(listRef.current), 150); return () => clearTimeout(id); } }, [open]);   // eslint-disable-line react-hooks/exhaustive-deps
  const cur = options.find(o => o.value === value);
  const opt = (o: SelectOption) => (
    <View style={{ flex: 1 }}>
      <T weight={o.value === value ? 'semi' : 'regular'} size={15}>{o.label}</T>
      {o.sub ? <T tone="mute" size={13}>{o.sub}</T> : null}
    </View>
  );
  return (
    <View style={{ marginBottom: 8 }}>
      <T tone="mute" size={13} style={{ marginBottom: 4 }}>{label}</T>
      <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ expanded: open }} onPress={() => setOpen(!open)}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: t.bg, borderColor: open ? (accent?.bg ?? t.acc) : t.line, borderWidth: 1, borderRadius: radius.sm, paddingVertical: 9, paddingHorizontal: 11 }}>
        {cur ? opt(cur) : <View style={{ flex: 1 }}><T tone="mute">Elegir…</T></View>}
        <T tone="mute" size={14}>{open ? '▴' : '▾'}</T>
      </Pressable>
      {open ? (
        <View ref={listRef} collapsable={false} style={{ borderColor: t.line, borderWidth: 1, borderRadius: radius.sm, marginTop: 4, backgroundColor: t.card, overflow: 'hidden' }}>
          {options.map((o, i) => (
            <Pressable key={o.value} accessibilityRole="button" accessibilityLabel={o.label} onPress={() => { onChange(o.value); setOpen(false); }}
              style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 9, paddingHorizontal: 11, borderTopWidth: i ? 1 : 0, borderTopColor: t.line, backgroundColor: o.value === value ? t.bg : 'transparent' }}>
              {opt(o)}
              {o.value === value ? <T size={14} weight="bold" style={accent ? { color: accent.bg } : undefined}>✓</T> : null}
            </Pressable>
          ))}
          {footer ? (
            <Pressable accessibilityRole="button" accessibilityLabel={footer.label} onPress={() => { setOpen(false); footer.onPress(); }}
              style={{ paddingVertical: 11, paddingHorizontal: 11, borderTopWidth: options.length ? 1 : 0, borderTopColor: t.line }}>
              <T size={15} tone="mute">{footer.label}</T>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
