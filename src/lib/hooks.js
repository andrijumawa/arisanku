import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from './supabase';

// Muat data async + reload manual. fn dipanggil ulang saat deps berubah.
// Reload ulang (reload() / kembali dari background) tidak menampilkan spinner dan
// tidak menghapus data yang sudah tampil; layar hanya diperbarui jika datanya berubah.
const sameData = (a, b) => {
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
};

export function useAsync(fn, deps = []) {
  const [state, setState] = useState({ loading: true, data: null, error: null });
  const [tick, setTick] = useState(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const lastDeps = useRef(null);
  const hasData = useRef(false);

  useEffect(() => {
    let alive = true;
    const prev = lastDeps.current;
    const depsChanged = !prev || prev.length !== deps.length || deps.some((d, i) => !Object.is(d, prev[i]));
    lastDeps.current = deps;
    if (depsChanged) hasData.current = false;
    const silent = !depsChanged && hasData.current;

    if (!silent) setState((s) => ({ ...s, loading: true, error: null }));
    fnRef
      .current()
      .then((data) => {
        if (!alive) return;
        hasData.current = true;
        setState((s) => (silent && sameData(s.data, data) ? s : { loading: false, data, error: null }));
      })
      .catch((error) => {
        if (!alive) return;
        if (silent) {
          console.error('Gagal memperbarui data:', error);
          return;
        }
        hasData.current = false;
        setState({ loading: false, data: null, error });
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { ...state, reload };
}

export function useRealtimeRefresh(reload, channelName, subscriptions, enabled = true, onChange) {
  const reloadRef = useRef(reload);
  const onChangeRef = useRef(onChange);
  reloadRef.current = reload;
  onChangeRef.current = onChange;
  const signature = JSON.stringify(subscriptions);

  useEffect(() => {
    if (!enabled) return undefined;

    let channel = null;
    let timer = null;
    let disposed = false;
    const changedTables = new Set();

    const stop = () => {
      if (timer) clearTimeout(timer);
      timer = null;
      changedTables.clear();
      if (!channel) return;
      const current = channel;
      channel = null;
      void supabase.removeChannel(current);
    };

    const start = () => {
      if (channel || disposed || document.visibilityState === 'hidden') return;
      let next = supabase.channel(channelName);
      for (const { table, event = '*', filter } of JSON.parse(signature)) {
        next = next.on(
          'postgres_changes',
          { event, schema: 'public', table, ...(filter ? { filter } : {}) },
          () => {
            changedTables.add(table);
            if (timer) clearTimeout(timer);
            timer = setTimeout(() => {
              timer = null;
              if (disposed || document.visibilityState === 'hidden') return;
              const tables = [...changedTables];
              changedTables.clear();
              reloadRef.current();
              onChangeRef.current?.(tables);
            }, 350);
          }
        );
      }
      channel = next.subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error(`Realtime channel "${channelName}" failed: ${status}`);
        }
      });
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        stop();
      } else {
        reloadRef.current();
        start();
      }
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    start();
    return () => {
      disposed = true;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      stop();
    };
  }, [channelName, enabled, signature]);
}