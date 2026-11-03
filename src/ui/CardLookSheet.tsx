import React, { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { monthLabel } from '../domain/dates';
import { lookOf, type CardColor, type CardStyle } from '../domain/cardLook';
import { useStore } from '../state/store';
import { CardHero, Grad } from './CardHero';
import { COLOR_DEFS, STYLE_DEFS } from './cardLook';
import { Button, Chips, Field, T } from './kit';
import { Sheet } from './overlay';
import { useTheme } from './theme';

/** Hoja "Color y estilo" de una tarjeta: vista previa en vivo, ocho colores, cinco estilos y (para la tarjeta física) los últimos 4 números. */
export function CardLookSheet({ card, onClose }: { card: string | null; onClose: () => void }) {
  const { eng, snap, A, run } = useStore(), t = useTheme();
  const names = eng.cardNames();
  const [color, setColor] = useState<CardColor>('teal'), [style, setStyle] = useState<CardStyle>('liso'), [last4, setLast4] = useState('');
  useEffect(() => {
    if (!card) return;
    const l = lookOf(snap.cardInfo, names, card);
    setColor(l.color); setStyle(l.style); setLast4(l.last4);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card]);
  const q = card ? eng.stmtD(card, eng.now + 1) : null;
  const def = STYLE_DEFS.find(s => s.id === style) ?? STYLE_DEFS[0];

  async function save() {
    if (!card) return;
    if (await run(() => A.setCardLook(card, { color, style, last4: style === 'fisica' ? last4 : undefined }), 'Aspecto de la tarjeta actualizado')) onClose();
  }

  return (
    <Sheet visible={!!card} onClose={onClose} footer={
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1 }}><Button kind="option" center label="Cancelar" onPress={onClose} style={{ marginTop: 0, paddingHorizontal: 6 }} /></View>
        <View style={{ flex: 1.6 }}><Button label="Guardar" onPress={save} style={{ marginTop: 0 }} /></View>
      </View>
    }>
      {card && q ? (
        <>
          <T weight="bold" size={18} style={{ marginBottom: 10 }}>Color y estilo</T>
          <View accessibilityLabel="Vista previa de la tarjeta">
            <CardHero name={card} due={q.due} paid={q.paid} rem={q.rem} sub={`Se paga en ${monthLabel(eng.now + 1, false)}`} look={{ color, style, last4 }} />
          </View>
          <T tone="mute" size={13} style={{ marginTop: 14, marginBottom: 6 }}>Color</T>
          <View accessibilityLabel="Colores" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {COLOR_DEFS.map(c => {
              const on = c.id === color;
              return (
                <Pressable key={c.id} accessibilityRole="button" accessibilityLabel={'Color ' + c.name} accessibilityState={{ selected: on }} onPress={() => setColor(c.id)}
                  style={{ width: 40, height: 40, borderRadius: 20, borderWidth: 3, borderColor: on ? t.ink : t.card, overflow: 'hidden', backgroundColor: c.b }}>
                  <Grad from={c.b} to={c.b2} id={'sw' + c.id} />
                </Pressable>
              );
            })}
          </View>
          <T tone="mute" size={13} style={{ marginTop: 14, marginBottom: 6 }}>Estilo</T>
          <Chips value={def.name} options={STYLE_DEFS.map(s => s.name)} labelPrefix="Estilo: " onChange={v => setStyle(STYLE_DEFS.find(s => s.name === v)?.id ?? 'liso')} />
          <T tone="mute" size={12}>{def.desc}</T>
          {style === 'fisica' ? (
            <View style={{ marginTop: 12 }}>
              <Field label="Últimos 4 números (opcional)" value={last4} onChangeText={(v: string) => setLast4(v.replace(/[^0-9]/g, '').slice(0, 4))} keyboardType="number-pad" maxLength={4} placeholder="Por ejemplo 4521" />
            </View>
          ) : null}
        </>
      ) : null}
    </Sheet>
  );
}
