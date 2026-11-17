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
    { to: '/beranda', icon: 'home', label: 'Beranda', description: 'Ringkasan aktivitas arisan', disabled: accountPending || accountRejected },
    { to: '/arisan', icon: 'target', label: 'Arisan', description: 'Cari kelompok dan daftar', disabled: accountPending || accountRejected },
    { to: '/rolet', icon: 'dice', label: 'Rolet', description: 'Pantau pengacakan peserta', disabled: accountPending || accountRejected },
    { to: '/hasil-rolet', icon: 'check', label: 'Hasil Rolet', description: 'Lihat hasil yang tersimpan', disabled: accountPending || accountRejected },
    { to: '/chat', icon: 'message', label: 'Chat', description: 'Obrolan bersama peserta', count: unread, disabled: accountPending || accountRejected },
    ...(isAdmin ? [{ to: '/admin', icon: 'tools', label: 'Admin', description: 'Kelola akun dan kelompok' }] : []),
    { to: '/akun', icon: 'user', label: 'Akun', description: 'Atur informasi profil', disabled: accountPending || accountRejected },
    { action: 'logout', icon: 'logout', label: signingOut ? 'Keluar…' : 'Keluar', description: 'Akhiri sesi akun' },
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
        <span className="menu-heading-kicker">AKSES CEPAT</span>
        <h1>Menu</h1>
        <span className="menu-heading-mark" aria-hidden="true"><Icon name="grid" size={27} /></span>
      </div>
      {accountPending && (
        <div className="account-verification-notice" role="status">
          <span className="verification-icon"><Icon name="clock" size={21} /></span>
          <span className="verification-copy">
            <strong>Akun menunggu verifikasi admin</strong>
            <span>Untuk mempercepat verifikasi, bisa hubungi admin.</span>
          </span>
          <span className="verification-pulse" aria-hidden="true" />
        </div>
      )}
      {accountRejected && (
        <div className="account-verification-notice is-rejected" role="status">
          <span className="verification-icon"><Icon name="close" size={21} /></span>
          <span className="verification-copy">
            <strong>Akun belum disetujui</strong>
            <span>Silakan hubungi admin untuk mendapatkan bantuan.</span>
          </span>
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
              <span className="menu-tile-top">
                <span className="menu-tile-icon-wrap"><Icon name={item.icon} className="menu-tile-icon" /></span>
                <span className="menu-tile-arrow"><Icon name="arrowRight" size={17} /></span>
              </span>
              <span className="menu-tile-copy">
                <strong>{item.label}</strong>
                <span>{item.description}</span>
              </span>
            </button>
          ) : (
            item.disabled ? (
              <button
                key={item.to}
                type="button"
                className={`menu-tile is-disabled${item.to === '/hasil-rolet' ? ' menu-tile-results' : ''}`}
                disabled
              >
                {item.to === '/hasil-rolet' && (
                  <img
                    className="menu-tile-watermark"
                    src={`${import.meta.env.BASE_URL}icons/arisanku-mark.png`}
                    alt=""
                    aria-hidden="true"
                  />
                )}
                <span className="menu-tile-top">
                  <span className="menu-tile-icon-wrap"><Icon name={item.icon} className="menu-tile-icon" /></span>
                  <span className="menu-tile-state-icon"><Icon name="clock" size={15} /></span>
                </span>
                <span className="menu-tile-copy">
                  <strong>{item.label}</strong>
                  <span>{item.description}</span>
                </span>
                <span className="menu-tile-locked">
                  {accountRejected ? 'Belum disetujui' : 'Menunggu verifikasi'}
                </span>
              </button>
            ) : (
              <Link
                key={item.to}
                to={item.to}
                className={`menu-tile${item.to === '/hasil-rolet' ? ' menu-tile-results' : ''}`}
              >
                {item.to === '/hasil-rolet' && (
                  <img
                    className="menu-tile-watermark"
                    src={`${import.meta.env.BASE_URL}icons/arisanku-mark.png`}
                    alt=""
                    aria-hidden="true"
                  />
                )}
                <span className="menu-tile-top">
                  <span className="menu-tile-icon-wrap"><Icon name={item.icon} className="menu-tile-icon" /></span>
                  <span className="menu-tile-arrow"><Icon name="arrowRight" size={17} /></span>
                  {item.count > 0 && <span className="menu-tile-count">{item.count > 9 ? '9+' : item.count}</span>}
                </span>
                <span className="menu-tile-copy">
                  <strong>{item.label}</strong>
                  <span>{item.description}</span>
                </span>
              </Link>
            )
          )
        ))}
      </nav>
    </section>
  );
}
