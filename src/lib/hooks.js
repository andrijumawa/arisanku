import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from './supabase';

// Muat data async + reload manual. fn dipanggil ulang saat deps berubah.
export function useAsync(fn, deps = []) {
  const [state, setState] = useState({ loading: true, data: null, error: null });
  const [tick, setTick] = useState(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    fnRef
      .current()
      .then((data) => alive && setState({ loading: false, data, error: null }))
      .catch((error) => alive && setState({ loading: false, data: null, error }));
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
