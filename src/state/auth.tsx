import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

interface AuthApi {
  mode: 'demo' | 'cloud';
  ready: boolean;
  session: Session | null;
  signIn(email: string, password: string): Promise<string | null>;
  signUp(email: string, password: string, name?: string): Promise<string | null>;   // devuelve mensaje de error o null
  resetPassword(email: string): Promise<string | null>;
  signOut(): Promise<void>;
}
const Ctx = createContext<AuthApi | null>(null);
export const useAuth = () => useContext(Ctx)!;

const msg = (e: { message: string } | null) => (e ? traducir(e.message) : null);
function traducir(m: string) {
  if (/invalid login/i.test(m)) return 'Email o contraseña incorrectos';
  if (/already registered|already been registered/i.test(m)) return 'Ese email ya tiene una cuenta';
  if (/password should be at least/i.test(m)) return 'La contraseña debe tener al menos 6 caracteres';
  if (/email not confirmed/i.test(m)) return 'Confirmá tu email desde el mensaje que te enviamos';
  return m;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(!supabase);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }: any) => { setSession(data.session); setReady(true); });
    const { data } = supabase.auth.onAuthStateChange((_e: unknown, s: Session | null) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  const api = useMemo<AuthApi>(() => ({
    mode: supabase ? 'cloud' : 'demo', ready, session,
    signIn: async (email, password) => msg((await supabase!.auth.signInWithPassword({ email: email.trim(), password })).error),
    signUp: async (email, password, name) => msg((await supabase!.auth.signUp({ email: email.trim(), password, options: { data: { display_name: name?.trim() || undefined } } })).error),
    resetPassword: async email => msg((await supabase!.auth.resetPasswordForEmail(email.trim())).error),
    signOut: async () => { await supabase?.auth.signOut(); },
  }), [ready, session]);

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}
