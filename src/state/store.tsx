import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { emptySnapshot, type Snapshot } from '../domain/types';
import { createEngine, type Engine } from '../domain/engine';
import { createActions, type Actions, type Result } from '../services/actions';
import type { Repository } from '../data/repository';
import { todayYmd } from '../domain/dates';
import { useDialogs } from '../ui/dialogs';

export interface Store {
  repo: Repository;
  snap: Snapshot;
  eng: Engine;
  A: Actions;
  ready: boolean;
  /** mes que se está mirando (índice año*12+mes) */
  cur: number;
  setCur: (n: number | ((p: number) => number)) => void;
  reload: () => Promise<void>;
  /** Ejecuta una operación: muestra el error si falla y recarga los datos si sale bien. */
  run: (fn: () => Promise<Result | void>, okMsg?: string) => Promise<boolean>;
}
const Ctx = createContext<Store | null>(null);
export const useStore = () => useContext(Ctx)!;

export function StoreProvider({ repo, children }: { repo: Repository; children: React.ReactNode }) {
  const dlg = useDialogs();
  const [snap, setSnap] = useState<Snapshot>(emptySnapshot);
  const [ready, setReady] = useState(false);
  const [day, setDay] = useState(() => todayYmd());
  const [cur, setCur] = useState(() => day.y * 12 + day.m);
  const A = useMemo(() => createActions(repo), [repo]);
  const eng = useMemo(() => createEngine(snap, day), [snap, day]);

  const reload = useCallback(async () => {
    setSnap(await repo.load());
    const t = todayYmd();
    setDay(d => (d.y === t.y && d.m === t.m && d.d === t.d ? d : t));
  }, [repo]);

  useEffect(() => {
    (async () => {
      let S = await repo.load();
      // Reparación de datos viejos (solo recarga si realmente corrigió algo)
      try { if ((await A.relinkOverrides(S)) > 0) S = await repo.load(); } catch { /* opcional: si falla, la app sigue igual */ }
      setSnap(S);
      setReady(true);
    })().catch(e => dlg.toast(String(e?.message || e)));
  }, [A, repo]);

  const run = useCallback(async (fn: () => Promise<Result | void>, okMsg?: string) => {
    try {
      const r = await fn();
      if (r && !r.ok) { dlg.toast(r.error); return false; }
      await reload();
      if (okMsg) dlg.toast(okMsg);
      return true;
    } catch (e: any) { dlg.toast(String(e?.message || e)); return false; }
  }, [reload, dlg]);

  const value = useMemo<Store>(() => ({ repo, snap, eng, A, ready, cur, setCur, reload, run }), [repo, snap, eng, A, ready, cur, reload, run]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
