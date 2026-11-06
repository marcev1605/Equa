import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { loadHide, saveHide } from '../data/privacy';

/** Modo "ocultar saldos": un solo ojito en Resumen. Mientras se lee lo guardado se muestran ocultos, así nunca se ve un saldo de más. */
interface Privacy { hide: boolean; toggle: () => void }
const Ctx = createContext<Privacy>({ hide: false, toggle: () => {} });
export const usePrivacy = () => useContext(Ctx);

export const MASK = '$ ••••••';

export function PrivacyProvider({ children }: { children: React.ReactNode }) {
  const [hide, setHide] = useState<boolean | null>(null);
  const cur = useRef<boolean | null>(null);
  const put = (v: boolean) => { cur.current = v; setHide(v); };
  useEffect(() => { let on = true; loadHide().then(v => { if (on && cur.current === null) put(v); }); return () => { on = false; }; }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  const toggle = useCallback(() => { const n = cur.current === false; put(n); saveHide(n); }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  return <Ctx.Provider value={{ hide: hide !== false, toggle }}>{children}</Ctx.Provider>;
}
