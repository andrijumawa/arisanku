import { Component, lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from './lib/auth.jsx';
import { finishInitialLoad, getInitialLoadPending, prefetchAsync, subscribeToInitialLoad } from './lib/hooks';
import {
  loadAdminCounts,
  loadBrowseData,
  loadChatData,
  loadHomeData,
  loadRouletteAttendance,
  loadRouletteDraws,
  loadRouletteGroups,
  loadRouletteParticipants,
  loadRoulettePeriodActivation,
  loadRouletteSession,
} from './lib/menuData';
import { configured, supabase } from './lib/supabase';
import { preloadPublicImages } from './lib/imageAssets';
import { Spinner } from './components/Ui.jsx';

const loadLayout = () => import('./components/Layout.jsx');
const loadAuthShell = () => import('./components/AuthShell.jsx');
const loadHome = () => import('./pages/Home.jsx');
const loadBrowse = () => import('./pages/Browse.jsx');
const loadGroupDetail = () => import('./pages/GroupDetail.jsx');
const loadChat = () => import('./pages/Chat.jsx');
const loadAccount = () => import('./pages/Account.jsx');
const loadMenu = () => import('./pages/Menu.jsx');
const loadRoulette = () => import('./pages/Roulette.jsx');
const loadAdminHome = () => import('./pages/admin/AdminHome.jsx');
const loadGroupForm = () => import('./pages/admin/GroupForm.jsx');
const loadAdminGroup = () => import('./pages/admin/AdminGroup.jsx');

function lazyWithRetry(loader, retries = 2) {
  return lazy(async () => {
    let lastError;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        return await loader();
      } catch (error) {
        lastError = error;
        if (attempt < retries) {
          await new Promise((resolve) => window.setTimeout(resolve, 350 * (attempt + 1)));
        }
      }
    }
    throw lastError;
  });
}

const Layout = lazyWithRetry(loadLayout);
const AuthShell = lazyWithRetry(loadAuthShell);
const Home = lazyWithRetry(loadHome);
const Browse = lazyWithRetry(loadBrowse);
const GroupDetail = lazyWithRetry(loadGroupDetail);
const Chat = lazyWithRetry(loadChat);
const Account = lazyWithRetry(loadAccount);
const Menu = lazyWithRetry(loadMenu);
const Roulette = lazyWithRetry(loadRoulette);
const AdminHome = lazyWithRetry(loadAdminHome);
const GroupForm = lazyWithRetry(loadGroupForm);
const AdminGroup = lazyWithRetry(loadAdminGroup);

function loadInitialRoute(pathname, hasSession, isAdmin) {
  if (!hasSession || pathname === '/masuk' || pathname === '/daftar') {
    return Promise.all([loadAuthShell()]);
  }
  const pageLoader = pathname === '/beranda'
    ? loadHome
    : pathname === '/arisan'
      ? loadBrowse
      : /^\/g\/[^/]+$/.test(pathname)
        ? loadGroupDetail
        : pathname === '/chat'
          ? loadChat
          : pathname === '/akun'
            ? loadAccount
            : pathname === '/rolet' || pathname === '/hasil-rolet'
              ? loadRoulette
              : pathname === '/admin'
                ? loadAdminHome
                : /^\/admin\/kelompok\/baru$/.test(pathname) || /^\/admin\/kelompok\/[^/]+\/ubah$/.test(pathname)
                  ? loadGroupForm
                  : /^\/admin\/kelompok\/[^/]+$/.test(pathname)
                    ? loadAdminGroup
                    : loadMenu;
  return Promise.all([...new Set([loadLayout, pageLoader])].map((loader) => loader()));
}

function preloadMenuData(uid, isAdmin, pathname) {
  const warm = (loader, deps, description) => prefetchAsync(loader, deps).catch((error) => {
    console.error(`Gagal menyiapkan data ${description}:`, error);
    return undefined;
  });

  if (pathname === '/beranda') return Promise.all([warm(loadHomeData, [uid], 'Beranda')]);
  if (pathname === '/arisan') return Promise.all([warm(loadBrowseData, [uid], 'Arisan')]);
  if (pathname === '/chat') return Promise.all([warm(loadChatData, [uid], 'Chat')]);
  if (pathname === '/akun') return Promise.resolve();
  if (pathname === '/admin') {
    return isAdmin
      ? Promise.all([warm(loadAdminCounts, [], 'Admin')])
      : Promise.resolve();
  }
  if (pathname === '/rolet' || pathname === '/hasil-rolet') {
    return warm(loadRouletteGroups, [isAdmin, uid], 'Kocokan').then(async (groups) => {
      const groupId = groups?.[0]?.id;
      if (!groupId) return;
      const draws = await warm(loadRouletteDraws, [groupId], 'hasil kocokan');
      if (!draws) return;
      const periodNo = draws.reduce((latest, draw) => Math.max(latest, draw.period_no), 0) + 1;
      await Promise.all([
        warm(loadRouletteAttendance, [groupId, periodNo], 'daftar hadir kocokan'),
        warm(loadRoulettePeriodActivation, [groupId, periodNo], 'status aktivasi kocokan'),
        warm(loadRouletteSession, [groupId, periodNo], 'sesi kocokan'),
        warm(loadRouletteParticipants, [groupId], 'peserta kocokan'),
      ]);
    });
  }
  return Promise.resolve();
}

function StartupSplash({ imageUrl, error, onRetry }) {
  return (
    <div className="startup-splash" role={error ? 'alert' : 'status'} aria-live="polite">
      <img className="startup-splash-image" src={imageUrl} alt="" />
      <div className="startup-splash-shade" />
      <div className="startup-splash-content">
        <img className="startup-splash-logo" src={`${import.meta.env.BASE_URL}icons/arisanku-mark.png`} alt="" />
        <h1>ArisanKu</h1>
        {error ? (
          <>
            <p>Aplikasi belum dapat disiapkan. Periksa koneksi internet lalu coba lagi.</p>
            <button type="button" className="startup-splash-retry" onClick={onRetry}>Muat ulang aplikasi</button>
          </>
        ) : (
          <>
            <p>Menyiapkan akun dan data awal…</p>
            <span className="startup-splash-progress" aria-hidden="true"><span /></span>
          </>
        )}
      </div>
    </div>
  );
}

class GroupFormErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Group form render failed:', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="card err-box" role="alert">
        <h2>Formulir kelompok gagal dimuat</h2>
        <p>{this.state.error.message || 'Terjadi kesalahan saat membuka formulir.'}</p>
        <Link className="btn" to="/admin?tab=kelompok">Kembali ke daftar kelompok</Link>
      </div>
    );
  }
}

function Guard({ children, admin = false, verified = false, member = false }) {
  const { session, profile, ready } = useAuth();
  const [membershipChecked, setMembershipChecked] = useState(false);
  const [hasActiveMembership, setHasActiveMembership] = useState(false);

  useEffect(() => {
    if (!member || !session || profile?.role === 'admin') {
      setMembershipChecked(true);
      setHasActiveMembership(profile?.role === 'admin');
      return;
    }
    let alive = true;
    setMembershipChecked(false);
    supabase
      .from('memberships')
      .select('id')
      .eq('user_id', session.user.id)
      .eq('status', 'aktif')
      .limit(1)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!alive) return;
        setHasActiveMembership(!error && Boolean(data));
        setMembershipChecked(true);
      });
    return () => { alive = false; };
  }, [member, session, profile?.role]);
  if (!ready) return <Spinner />;
  if (!session) return <Navigate to="/masuk" replace />;
  if (verified && !profile) return <Spinner />;
  if (verified && profile.account_status !== 'disetujui' && profile.role !== 'admin') {
    return <Navigate to="/" replace />;
  }
  if (member) {
    if (!membershipChecked) return <Spinner />;
    if (!hasActiveMembership) return <Navigate to="/" replace />;
  }
  if (admin) {
    if (!profile) return <Spinner />;
    if (profile.role !== 'admin') return <Navigate to="/" replace />;
  }
  return children;
}

function SetupNotice() {
  return (
    <div className="auth">
      <div className="card" style={{ maxWidth: 440 }}>
        <h2>Konfigurasi belum lengkap</h2>
        <p className="muted">
          Buat file <code>.env</code> berisi <code>VITE_SUPABASE_URL</code> dan <code>VITE_SUPABASE_ANON_KEY</code>
          (lihat <code>.env.example</code>), lalu jalankan ulang aplikasi. Untuk deploy GitHub Pages, isi keduanya di
          GitHub → Settings → Secrets and variables → Actions.
        </p>
      </div>
    </div>
  );
}

export default function App() {
  const { ready, session, isAdmin } = useAuth();
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  const lastAppRouteRef = useRef(`${pathname}${search}`);
  const [routeModulesReady, setRouteModulesReady] = useState(false);
  const [initialPending, setInitialPending] = useState(getInitialLoadPending());
  const [imageReady, setImageReady] = useState(false);
  const [showSplash, setShowSplash] = useState(true);
  const [splashExiting, setSplashExiting] = useState(false);
  const [startupError, setStartupError] = useState(null);
  const startedAt = useRef(Date.now());
  const exitTimerRef = useRef(null);
  const imageUrl = `${import.meta.env.BASE_URL}images/initial-loading.webp`;

  useEffect(() => subscribeToInitialLoad(setInitialPending), []);

  useEffect(() => {
    lastAppRouteRef.current = `${pathname}${search}`;
  }, [pathname, search]);

  useEffect(() => {
    if (!window.history.state?.arisankuBackGuard) {
      window.history.replaceState(
        { ...window.history.state, arisankuBackGuard: true },
        '',
        window.location.href
      );
    }
    window.history.pushState(
      { arisankuBackGuard: true },
      '',
      window.location.href
    );

    const onPopState = () => {
      window.history.pushState(
        { arisankuBackGuard: true },
        '',
        window.location.href
      );
      navigate(lastAppRouteRef.current, { replace: true });
    };

    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [navigate]);

  useEffect(() => {
    let active = true;
    preloadPublicImages().then(() => {
      if (active) setImageReady(true);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!configured || !ready || !showSplash) return undefined;
    let active = true;
    setRouteModulesReady(false);
    setStartupError(null);
    loadInitialRoute(pathname, Boolean(session), isAdmin)
      .then(() => {
        if (active) setRouteModulesReady(true);
      })
      .catch((error) => {
        console.error('Gagal menyiapkan modul halaman awal:', error);
        if (active) setStartupError(error);
      });
    return () => {
      active = false;
    };
  }, [isAdmin, pathname, ready, session, showSplash]);

  useEffect(() => {
    if (!configured || !ready || !session || !showSplash) return undefined;
    void preloadMenuData(session.user.id, isAdmin, pathname);
    return undefined;
  }, [isAdmin, pathname, ready, session, showSplash]);

  useEffect(() => {
    if (!configured || !routeModulesReady || !ready) return undefined;
    const loaders = [
      loadMenu,
      loadHome,
      loadBrowse,
      loadChat,
      loadAccount,
      loadRoulette,
      ...(isAdmin ? [loadAdminHome] : []),
    ];
    const prefetch = () => {
      void Promise.all([...new Set(loaders)].map((loader) => loader().catch((error) => {
        console.error('Gagal memuat modul kartu menu:', error);
      })));
    };
    const idleId = typeof window.requestIdleCallback === 'function'
      ? window.requestIdleCallback(prefetch, { timeout: 1500 })
      : window.setTimeout(prefetch, 500);
    return () => {
      if (typeof window.cancelIdleCallback === 'function' && typeof idleId === 'number') {
        window.cancelIdleCallback(idleId);
      } else {
        window.clearTimeout(idleId);
      }
    };
  }, [isAdmin, ready, routeModulesReady]);

  useEffect(() => {
    if (!configured || !showSplash) return undefined;
    const timer = window.setTimeout(() => {
      setStartupError((current) => current || new Error('Persiapan awal terlalu lama.'));
    }, 20000);
    return () => window.clearTimeout(timer);
  }, [showSplash]);

  useEffect(() => {
    if (
      !configured
      || !showSplash
      || startupError
      || !ready
      || !routeModulesReady
      || !imageReady
      || initialPending > 0
    ) return undefined;

    const minimumVisibleTime = 1800;
    const exitDuration = 320;
    const delay = Math.max(0, minimumVisibleTime - (Date.now() - startedAt.current));
    const prepareExit = window.setTimeout(() => {
      setSplashExiting(true);
      const finishExit = window.setTimeout(() => {
        finishInitialLoad();
        setShowSplash(false);
      }, exitDuration);
      exitTimerRef.current = finishExit;
    }, delay);
    return () => {
      window.clearTimeout(prepareExit);
      if (exitTimerRef.current) {
        window.clearTimeout(exitTimerRef.current);
        exitTimerRef.current = null;
      }
      setSplashExiting(false);
    };
  }, [imageReady, initialPending, ready, routeModulesReady, showSplash, startupError]);

  if (!configured) return <SetupNotice />;
  return (
    <>
      <div className={`startup-app${showSplash ? ' is-preparing' : ''}`}>
        {routeModulesReady && !startupError && (
          <Suspense fallback={showSplash ? null : <Spinner text="Memuat halaman…" />}>
            <Routes>
              <Route element={<AuthShell />}>
                <Route path="/masuk" element={null} />
                <Route path="/daftar" element={null} />
              </Route>
              <Route
                element={
                  <Guard>
                    <Layout />
                  </Guard>
                }
              >
                <Route index element={<Menu />} />
                <Route path="beranda" element={<Guard verified><Home /></Guard>} />
                <Route path="arisan" element={<Guard verified><Browse /></Guard>} />
                <Route path="g/:id" element={<Guard verified><GroupDetail /></Guard>} />
                <Route path="chat" element={<Guard verified><Chat /></Guard>} />
                <Route path="akun" element={<Guard verified><Account /></Guard>} />
                <Route path="rolet" element={<Guard verified member><Roulette /></Guard>} />
                <Route path="hasil-rolet" element={<Navigate to="/rolet" replace />} />
                <Route
                  path="admin"
                  element={
                    <Guard admin>
                      <AdminHome />
                    </Guard>
                  }
                />
                <Route
                  path="admin/kelompok/baru"
                  element={
                    <Guard admin>
                      <GroupFormErrorBoundary>
                        <GroupForm />
                      </GroupFormErrorBoundary>
                    </Guard>
                  }
                />
                <Route
                  path="admin/kelompok/:id"
                  element={
                    <Guard admin>
                      <AdminGroup />
                    </Guard>
                  }
                />
                <Route
                  path="admin/kelompok/:id/ubah"
                  element={
                    <Guard admin>
                      <GroupForm />
                    </Guard>
                  }
                />
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        )}
      </div>
      {showSplash && (
        <div className={`startup-splash-layer${splashExiting ? ' is-exiting' : ''}`}>
          <StartupSplash
            imageUrl={imageUrl}
            error={startupError}
            onRetry={() => window.location.reload()}
          />
        </div>
      )}
    </>
  );
}
