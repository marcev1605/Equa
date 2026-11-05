import React from 'react';
export const StatusBar = () => null;
export const SafeAreaProvider = ({ children }: any) => <>{children}</>;
export const useSafeAreaInsets = () => (globalThis as any).__insets ?? { top: 0, bottom: 0, left: 0, right: 0 };
export const useFonts = () => [true];
export const BricolageGrotesque_400Regular = 'BricolageGrotesque_400Regular', BricolageGrotesque_600SemiBold = 'BricolageGrotesque_600SemiBold', BricolageGrotesque_800ExtraBold = 'BricolageGrotesque_800ExtraBold';
declare const __SEED__: string | undefined;
const mem: Record<string, string> = {};
const safe = <T,>(f: () => T, d: T): T => { try { return f(); } catch { return d; } };
const AsyncStorage = {
  getItem: async (k: string) => safe(() => localStorage.getItem(k), null) ?? mem[k] ?? (typeof __SEED__ !== 'undefined' && k === 'equa-local-v1' ? __SEED__ : null),
  setItem: async (k: string, v: string) => { mem[k] = v; safe(() => localStorage.setItem(k, v), undefined); },
  removeItem: async (k: string) => { delete mem[k]; safe(() => localStorage.removeItem(k), undefined); },
};
export default AsyncStorage;
export const createClient = () => { throw new Error('Supabase no disponible en el arnés'); };
