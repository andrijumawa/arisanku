import { useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './lib/auth.jsx';
import { configured, supabase } from './lib/supabase';
import Layout from './components/Layout.jsx';
import { Spinner } from './components/Ui.jsx';
import AuthShell from './components/AuthShell.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import Home from './pages/Home.jsx';
import Browse from './pages/Browse.jsx';
import GroupDetail from './pages/GroupDetail.jsx';
import Chat from './pages/Chat.jsx';
import Account from './pages/Account.jsx';
import Menu from './pages/Menu.jsx';
import Roulette from './pages/Roulette.jsx';
import RouletteResults from './pages/RouletteResults.jsx';
import AdminHome from './pages/admin/AdminHome.jsx';
import GroupForm from './pages/admin/GroupForm.jsx';
import AdminGroup from './pages/admin/AdminGroup.jsx';

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
  );
}
