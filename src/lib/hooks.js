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

let initialLoadPending = 0;
let initialLoadFinished = false;
const initialLoadListeners = new Set();

export function getInitialLoadPending() {
  return initialLoadPending;
}

export function subscribeToInitialLoad(listener) {
  initialLoadListeners.add(listener);
  return () => initialLoadListeners.delete(listener);
}

export function finishInitialLoad() {
  initialLoadFinished = true;
}

export function prefetchAsync(fn, deps = []) {
  const key = getAsyncCacheKey(fn, deps);
  const cachedData = getCachedData(key);
  if (cachedData !== undefined) return Promise.resolve(cachedData);
  const finishTrackedLoad = trackInitialLoad();
  return loadAsyncData(key, () => fn(...deps)).finally(finishTrackedLoad);
}

function trackInitialLoad() {
  if (initialLoadFinished) return () => {};
  initialLoadPending += 1;
  initialLoadListeners.forEach((listener) => listener(initialLoadPending));
  let active = true;
  return () => {
    if (!active) return;
    active = false;
    initialLoadPending = Math.max(0, initialLoadPending - 1);
    initialLoadListeners.forEach((listener) => listener(initialLoadPending));
  };
}

const asyncDataCache = new Map();
const inFlightAsyncData = new Map();
const ASYNC_CACHE_LIMIT = 100;
let cachedUserId = null;

supabase.auth.onAuthStateChange((_event, session) => {
  const nextUserId = session?.user?.id || null;
  if (cachedUserId !== nextUserId) asyncDataCache.clear();
  cachedUserId = nextUserId;
});

function getAsyncCacheKey(fn, deps) {
  let serializedDeps;
  try {
    serializedDeps = JSON.stringify(deps);
  } catch {
    serializedDeps = deps.map((dep) => String(dep)).join('|');
  }
  return `${fn.toString()}::${serializedDeps}`;
}

function getCachedData(key) {
  if (!asyncDataCache.has(key)) return undefined;
  const cached = asyncDataCache.get(key);
  asyncDataCache.delete(key);
  asyncDataCache.set(key, cached);
  return cached;
}

function setCachedData(key, data) {
  asyncDataCache.delete(key);
  asyncDataCache.set(key, data);
  if (asyncDataCache.size > ASYNC_CACHE_LIMIT) {
    asyncDataCache.delete(asyncDataCache.keys().next().value);
  }
}

function loadAsyncData(key, loader) {
  const existing = inFlightAsyncData.get(key);
  if (existing) return existing;
  const request = Promise.resolve()
    .then(loader)
    .then((data) => {
      setCachedData(key, data);
      return data;
    })
    .finally(() => {
      if (inFlightAsyncData.get(key) === request) inFlightAsyncData.delete(key);
    });
  inFlightAsyncData.set(key, request);
  return request;
}

export function useAsync(fn, deps = []) {
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const cacheKey = getAsyncCacheKey(fn, deps);
  const [state, setState] = useState(() => {
    const data = getCachedData(cacheKey);
    return { key: cacheKey, loading: data === undefined, hasData: data !== undefined, data, error: null };
  });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    const finishTrackedLoad = trackInitialLoad();
    const cachedData = getCachedData(cacheKey);
    setState((current) => current.key === cacheKey
      ? {
        ...current,
        loading: cachedData === undefined ? !current.hasData : false,
        error: null,
        ...(cachedData === undefined ? {} : { hasData: true, data: cachedData }),
      }
      : {
        key: cacheKey,
        loading: cachedData === undefined,
        hasData: cachedData !== undefined,
        data: cachedData,
        error: null,
      });

    loadAsyncData(cacheKey, () => fnRef.current())
      .then((data) => {
        if (!alive) return;
        setState((current) => {
          if (current.key !== cacheKey) return { key: cacheKey, loading: false, hasData: true, data, error: null };
          if (current.hasData && sameData(current.data, data)) return { ...current, loading: false, error: null };
          return { key: cacheKey, loading: false, hasData: true, data, error: null };
        });
      })
      .catch((error) => {
        if (!alive) return;
        setState((current) => current.key === cacheKey && current.hasData
          ? { ...current, loading: false, error }
          : { key: cacheKey, loading: false, hasData: false, data: null, error });
      })
      .finally(finishTrackedLoad);
    return () => {
      alive = false;
    };
  }, [cacheKey, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  const currentState = state.key === cacheKey
    ? state
    : (() => {
      const data = getCachedData(cacheKey);
      return { key: cacheKey, loading: data === undefined, hasData: data !== undefined, data, error: null };
    })();
  return { loading: currentState.loading, data: currentState.data, error: currentState.error, reload };
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