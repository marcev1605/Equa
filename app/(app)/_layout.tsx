import React, { useMemo } from 'react';
import { Slot, Redirect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LocalRepository } from '../../src/data/localRepository';
import { SupabaseRepository } from '../../src/data/supabaseRepository';
import type { Repository } from '../../src/data/repository';
import { supabase } from '../../src/lib/supabase';
import { useAuth } from '../../src/state/auth';
import { StoreProvider } from '../../src/state/store';
import { Shell } from '../../src/ui/Shell';

/** Zona autenticada. Con Supabase configurado exige sesión; sin él corre en modo demo (datos locales). */
export default function AppLayout() {
  const auth = useAuth();
  const uid = auth.session?.user.id;
  const repo = useMemo<Repository | null>(() => {
    if (supabase) return uid ? new SupabaseRepository(supabase, uid) : null;
    return new LocalRepository(AsyncStorage);
  }, [uid]);

  if (!auth.ready) return null;
  if (auth.mode === 'cloud' && !auth.session) return <Redirect href="/login" />;
  if (!repo) return null;
  return (
    <StoreProvider key={uid || 'demo'} repo={repo}>
      <Shell><Slot /></Shell>
    </StoreProvider>
  );
}
