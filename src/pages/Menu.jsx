import { useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import Icon from '../components/Icon.jsx';
import { useToast } from '../components/Toast.jsx';

export default function Menu() {
  const { profile, isAdmin, signOut } = useAuth();
  const { unread = 0 } = useOutletContext() || {};
  const toast = useToast();
  const [signingOut, setSigningOut] = useState(false);
  const accountPending = !isAdmin
    && profile?.account_status !== 'disetujui'
    && profile?.account_status !== 'ditolak';
  const accountRejected = !isAdmin && profile?.account_status === 'ditolak';
  const items = [
    { to: '/beranda', icon: 'home', label: 'Beranda', disabled: accountPending || accountRejected },
    { to: '/arisan', icon: 'target', label: 'Arisan', disabled: accountPending || accountRejected },
    { to: '/rolet', icon: 'dice', label: 'Rolet', disabled: accountPending || accountRejected },
    { to: '/hasil-rolet', icon: 'check', label: 'Hasil Rolet', disabled: accountPending || accountRejected },
    { to: '/chat', icon: 'message', label: 'Chat', count: unread, disabled: accountPending || accountRejected },
    ...(isAdmin ? [{ to: '/admin', icon: 'tools', label: 'Admin' }] : []),
    { to: '/akun', icon: 'user', label: 'Akun', disabled: accountPending || accountRejected },
    { action: 'logout', icon: 'logout', label: signingOut ? 'Keluar…' : 'Keluar' },
  ];

  async function handleSignOut() {
    setSigningOut(true);
    try {
      const { error } = await signOut();
      if (error) throw error;
    } catch (error) {
      toast(error.message || 'Gagal keluar dari akun.', 'error');
      setSigningOut(false);
    }
  }

  return (
    <section className="menu-page">
      <div className="menu-heading">
        <p className="muted small">ArisanKu</p>
        <h1>Menu</h1>
        <p className="muted">Halo, {profile?.full_name?.split(' ')[0] || 'Peserta'}. Mau membuka apa?</p>
      </div>
      {accountPending && (
        <div className="account-verification-notice" role="status">
          <strong>Akun menunggu verifikasi admin</strong>
          <span>Menu lainnya akan aktif setelah admin menyetujui akun kamu.</span>
        </div>
      )}
      {accountRejected && (
        <div className="account-verification-notice is-rejected" role="status">
          <strong>Akun belum disetujui</strong>
          <span>Silakan hubungi admin untuk mendapatkan bantuan.</span>
        </div>
      )}
      <nav className="menu-grid" aria-label="Menu utama">
        {items.map((item) => (
          item.action === 'logout' ? (
            <button
              key={item.action}
              type="button"
              className="menu-tile menu-tile-logout"
              onClick={handleSignOut}
              disabled={signingOut}
            >
              <Icon name={item.icon} size={38} className="menu-tile-icon" />
              <span>{item.label}</span>
            </button>
          ) : (
            item.disabled ? (
              <button key={item.to} type="button" className="menu-tile is-disabled" disabled>
                <Icon name={item.icon} size={38} className="menu-tile-icon" />
                <span>{item.label}</span>
                <span className="menu-tile-locked">
                  {accountRejected ? 'Belum disetujui' : 'Menunggu verifikasi'}
                </span>
              </button>
            ) : (
              <Link key={item.to} to={item.to} className="menu-tile">
                <Icon name={item.icon} size={38} className="menu-tile-icon" />
                <span>{item.label}</span>
                {item.count > 0 && <span className="menu-tile-count">{item.count > 9 ? '9+' : item.count}</span>}
              </Link>
            )
          )
        ))}
      </nav>
    </section>
  );
}
