import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { Redirect } from 'expo-router';
import { useAuth } from '../src/state/auth';
import { Button, Card, Field, Seg, T } from '../src/ui/kit';
import { Logo } from '../src/ui/Shell';
import { useTheme } from '../src/ui/theme';

export default function Login() {
  const auth = useAuth(), t = useTheme();
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState(''), [password, setPassword] = useState(''), [name, setName] = useState('');
  const [busy, setBusy] = useState(false), [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  if (auth.mode === 'demo' || auth.session) return <Redirect href="/" />;

  async function submit() {
    if (!email.includes('@') || password.length < 6) { setMsg({ ok: false, text: 'Ingresá un email válido y una contraseña de 6+ caracteres' }); return; }
    setBusy(true); setMsg(null);
    const err = mode === 'in' ? await auth.signIn(email, password) : await auth.signUp(email, password, name);
    setBusy(false);
    if (err) setMsg({ ok: false, text: err });
    else if (mode === 'up') setMsg({ ok: true, text: 'Cuenta creada. Si pedimos confirmación, revisá tu email y después iniciá sesión.' });
  }
  async function reset() {
    if (!email.includes('@')) { setMsg({ ok: false, text: 'Escribí tu email arriba' }); return; }
    const err = await auth.resetPassword(email);
    setMsg(err ? { ok: false, text: err } : { ok: true, text: 'Te enviamos un email para restablecer la contraseña.' });
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: t.bg }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 20 }} keyboardShouldPersistTaps="handled">
        <View style={{ width: '100%', maxWidth: 420 }}>
          <View style={{ alignItems: 'center', marginBottom: 12 }}><Logo size={56} /></View>
          <T tone="mute" style={{ textAlign: 'center' }}>Tus finanzas, claras y en todos tus dispositivos</T>
          <Card pad={18} style={{ marginTop: 22 }}>
            <Seg value={mode} onChange={setMode} options={[['in', 'Ingresar'], ['up', 'Crear cuenta']]} />
            {mode === 'up' && <Field label="Nombre (opcional)" value={name} onChangeText={setName} autoCapitalize="words" />}
            <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" />
            <Field label="Contraseña" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoComplete={mode === 'in' ? 'current-password' : 'new-password'} onSubmitEditing={submit} />
            {msg ? <T tone={msg.ok ? 'in' : 'out'} size={14} style={{ marginBottom: 6 }}>{msg.text}</T> : null}
            <Button label={busy ? 'Un momento…' : mode === 'in' ? 'Ingresar' : 'Crear cuenta'} onPress={submit} disabled={busy} />
            {mode === 'in' && <Button kind="link" label="Olvidé mi contraseña" onPress={reset} />}
          </Card>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
