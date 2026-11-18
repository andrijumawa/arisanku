import { lazy, Suspense, useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './lib/auth.jsx';
import { configured, supabase } from './lib/supabase';
import { Spinner } from './components/Ui.jsx';

const Layout = lazy(() => import('./components/Layout.jsx'));
const AuthShell = lazy(() => import('./components/AuthShell.jsx'));
const Home = lazy(() => import('./pages/Home.jsx'));
const Browse = lazy(() => import('./pages/Browse.jsx'));
const GroupDetail = lazy(() => import('./pages/GroupDetail.jsx'));
const Chat = lazy(() => import('./pages/Chat.jsx'));
const Account = lazy(() => import('./pages/Account.jsx'));
const Menu = lazy(() => import('./pages/Menu.jsx'));
const Roulette = lazy(() => import('./pages/Roulette.jsx'));
const RouletteResults = lazy(() => import('./pages/RouletteResults.jsx'));
const AdminHome = lazy(() => import('./pages/admin/AdminHome.jsx'));
const GroupForm = lazy(() => import('./pages/admin/GroupForm.jsx'));
const AdminGroup = lazy(() => import('./pages/admin/AdminGroup.jsx'));

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
  if (!configured) return <SetupNotice />;
  return (
    <Suspense fallback={<Spinner text="Memuat halaman…" />}>
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
          <Route path="hasil-rolet" element={<Guard verified member><RouletteResults /></Guard>} />
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
                <GroupForm />
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
  );
}
