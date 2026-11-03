import React, { createContext, useContext, useEffect, useState } from 'react';

type Comp = React.ComponentType<any>;
export const registry: { login?: Comp; appLayout?: Comp; screens: Record<string, Comp> } = { screens: {} };
const DepthCtx = createContext(0);

let current = (() => { try { return window.location.hash.slice(1) || '/'; } catch { return '/'; } })();
const subs = new Set<() => void>();
const go = (p: string) => { current = p; subs.forEach(f => f()); };
try { window.addEventListener('hashchange', () => go(window.location.hash.slice(1) || '/')); } catch { /* sin window.location */ }
function useHash() {
  const [p, setP] = useState(current);
  useEffect(() => { const f = () => setP(current); subs.add(f); return () => { subs.delete(f); }; }, []);
  return p;
}
export const usePathname = () => useHash();
export const useRouter = () => ({ replace: go, push: go });
export function Redirect({ href }: { href: string }) { useEffect(() => { go(href); }, [href]); return null; }
export function Slot() {
  const depth = useContext(DepthCtx), path = useHash();
  let C: Comp | undefined;
  if (depth === 0) C = path === '/login' ? registry.login : registry.appLayout;
  else C = registry.screens[path] || registry.screens['/'];
  return <DepthCtx.Provider value={depth + 1}>{C ? <C /> : null}</DepthCtx.Provider>;
}
export const Stack = () => <Slot />;
