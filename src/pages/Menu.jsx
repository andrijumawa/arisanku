import { useEffect, useRef, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { supabase } from '../lib/supabase';
import Icon from '../components/Icon.jsx';
import { signedUrl } from '../components/SignedImage.jsx';
import { useToast } from '../components/Toast.jsx';
import { useAsync, useRealtimeRefresh } from '../lib/hooks';

const menuImageUrl = (image) => `${import.meta.env.BASE_URL}images/${image}`;

export default function Menu() {
  const { profile, session, isAdmin, signOut, refreshProfile } = useAuth();
  const { unread = 0 } = useOutletContext() || {};
  const toast = useToast();
  const [signingOut, setSigningOut] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState('');
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const photoInput = useRef(null);
  const selfieInput = useRef(null);
  const accountPending = !isAdmin
    && profile?.account_status !== 'disetujui'
    && profile?.account_status !== 'ditolak';
  const accountRejected = !isAdmin && profile?.account_status === 'ditolak';
  const rouletteAccessState = useAsync(async () => {
    if (isAdmin) return { hasAccess: true, activeGroupIds: [] };
    const { data, error } = await supabase
      .from('memberships')
      .select('group_id')
      .eq('user_id', session.user.id)
      .eq('status', 'aktif');
    if (error) throw error;
    const activeGroupIds = (data || []).map((item) => item.group_id);
    return { hasAccess: activeGroupIds.length > 0, activeGroupIds };
  }, [isAdmin, session.user.id]);
  useRealtimeRefresh(
    rouletteAccessState.reload,
    'menu-roulette-access',
    [{ table: 'memberships', filter: `user_id=eq.${session.user.id}` }],
    !isAdmin
  );
  const rouletteAccess = rouletteAccessState.data?.hasAccess;
  const adminCountsState = useAsync(async () => {
    if (!isAdmin) return { registrations: 0, payments: 0, participants: 0 };
    const [registrations, payments, participants] = await Promise.all([
      supabase.from('memberships').select('id', { count: 'exact', head: true }).eq('status', 'menunggu'),
      supabase.from('payments').select('id', { count: 'exact', head: true }).eq('status', 'menunggu'),
      supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('account_status', 'menunggu'),
    ]);
    if (registrations.error) throw registrations.error;
    if (payments.error) throw payments.error;
    if (participants.error) throw participants.error;
    return {
      registrations: registrations.count || 0,
      payments: payments.count || 0,
      participants: participants.count || 0,
    };
  }, [isAdmin]);
  useRealtimeRefresh(
    adminCountsState.reload,
    'menu-admin-counts',
    [{ table: 'memberships' }, { table: 'payments' }, { table: 'profiles' }],
    isAdmin
  );
  const adminNotifications = {
    registrations: adminCountsState.data?.registrations || 0,
    payments: adminCountsState.data?.payments || 0,
    participants: adminCountsState.data?.participants || 0,
  };
  const adminPendingCount = adminNotifications.registrations + adminNotifications.payments + adminNotifications.participants;
  const adminDescription = adminPendingCount > 0
    ? `${adminNotifications.registrations} pendaftaran · ${adminNotifications.payments} pembayaran · ${adminNotifications.participants} peserta menunggu`
    : 'Kelola akun dan kelompok';
  const items = [
    { to: '/beranda', icon: 'home', image: 'menu-home.png', label: 'Beranda', description: 'Ringkasan aktivitas arisan', disabled: accountPending || accountRejected },
    { to: '/arisan', icon: 'target', image: 'menu-arisan.png', label: 'Arisan', description: 'Cari kelompok & daftar', disabled: accountPending || accountRejected },
    {
      to: '/rolet',
      icon: 'dice',
      image: 'menu-kocokan.png',
      label: 'Kocokan',
      description: 'Pantau pengacakan peserta',
      loading: !isAdmin && rouletteAccessState.loading && !accountPending && !accountRejected,
      disabled: accountPending || accountRejected || (!isAdmin && (!rouletteAccess || rouletteAccessState.loading)),
    },
    { to: '/chat', icon: 'message', image: 'menu-chat.png', label: 'Chat', description: 'Obrolan bersama peserta', count: unread, disabled: accountPending || accountRejected },
    ...(isAdmin ? [{
      to: '/admin',
      icon: 'tools',
      image: 'menu-admin.png',
      label: 'Admin',
      description: adminDescription,
      count: adminPendingCount,
      adminNotifications,
    }] : []),
    { to: '/akun', icon: 'user', image: 'menu-akun.png', label: 'Akun', description: 'Atur informasi profil', disabled: accountPending || accountRejected },
    { action: 'logout', icon: 'logout', label: signingOut ? 'Keluar…' : 'Keluar', description: 'Akhiri sesi akun' },
  ];

  useEffect(() => {
    let active = true;
    if (!profile?.avatar_path) {
      setAvatarUrl('');
      return () => { active = false; };
    }
    signedUrl('profile-avatars', profile.avatar_path)
      .then((url) => {
        if (active) setAvatarUrl(url);
      })
      .catch((error) => {
        console.error('Gagal memuat foto profil:', error);
        if (active) {
          setAvatarUrl('');
          toast('Foto profil tidak dapat dimuat.', 'error');
        }
      });
    return () => { active = false; };
  }, [profile?.avatar_path, toast]);

  async function handleAvatarChange(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const extensions = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
    const extension = extensions[file.type];
    if (!extension) return toast('Gunakan foto JPG, PNG, atau WebP.', 'error');
    if (file.size > 5 * 1024 * 1024) return toast('Ukuran foto maksimal 5 MB.', 'error');

    setUploadingAvatar(true);
    const path = `${session.user.id}/${Date.now()}.${extension}`;
    let uploaded = false;
    try {
      const storage = supabase.storage.from('profile-avatars');
      const { error: uploadError } = await storage.upload(path, file, {
        cacheControl: '3600',
        contentType: file.type,
        upsert: false,
      });
      if (uploadError) throw uploadError;
      uploaded = true;

      const { data: signedData, error: signedError } = await storage.createSignedUrl(path, 3600);
      if (signedError) throw signedError;
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ avatar_path: path })
        .eq('id', session.user.id);
      if (profileError) throw profileError;

      setAvatarUrl(signedData.signedUrl);
      await refreshProfile();
      if (profile?.avatar_path) {
        const { error: removeError } = await storage.remove([profile.avatar_path]);
        if (removeError) console.error('Gagal menghapus foto profil lama:', removeError);
      }
      toast('Foto profil diperbarui.', 'success');
    } catch (error) {
      if (uploaded) {
        const { error: removeError } = await supabase.storage.from('profile-avatars').remove([path]);
        if (removeError) console.error('Gagal membersihkan foto profil yang tidak tersimpan:', removeError);
      }
      console.error('Gagal memperbarui foto profil:', error);
      toast(error.message || 'Foto profil gagal diperbarui.', 'error');
    } finally {
      setUploadingAvatar(false);
    }
  }

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
      <div className="menu-avatar-wrap">
        <button
          type="button"
          className="menu-avatar"
          aria-label="Pilih foto profil dari galeri"
          onClick={() => photoInput.current?.click()}
          disabled={uploadingAvatar}
        >
          {avatarUrl
            ? <img className="menu-avatar-image" src={avatarUrl} alt="" />
            : <Icon name="user" size={112} />}
          {uploadingAvatar && <span className="menu-avatar-loading">Menyimpan…</span>}
        </button>
        <button
          type="button"
          className="menu-avatar-camera"
          aria-label="Ambil selfie untuk foto profil"
          title="Ambil selfie"
          onClick={() => selfieInput.current?.click()}
          disabled={uploadingAvatar}
        >
          <Icon name="camera" size={21} />
        </button>
        <input
          ref={photoInput}
          className="visually-hidden"
          type="file"
          accept="image/*"
          onChange={handleAvatarChange}
          tabIndex={-1}
        />
        <input
          ref={selfieInput}
          className="visually-hidden"
          type="file"
          accept="image/*"
          capture="user"
          onChange={handleAvatarChange}
          tabIndex={-1}
        />
      </div>
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
            item.disabled && item.to !== '/rolet' ? (
              <button
                key={item.to}
                type="button"
                className="menu-tile is-disabled"
                disabled
              >
                <img className="menu-tile-character" src={menuImageUrl(item.image)} alt="" aria-hidden="true" loading="lazy" decoding="async" />
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
                className={`menu-tile${item.to === '/admin' ? ' menu-tile-admin' : ''}${item.to === '/rolet' ? ` menu-tile-kocok${item.loading ? ' is-loading' : item.disabled ? ' is-disabled' : ''}` : ''}`}
                aria-disabled={item.to === '/rolet' && item.disabled ? true : undefined}
                aria-busy={item.to === '/rolet' && item.loading ? true : undefined}
                tabIndex={item.to === '/rolet' && item.disabled ? -1 : undefined}
                onClick={item.to === '/rolet' && item.disabled ? (event) => event.preventDefault() : undefined}
              >
                <img className="menu-tile-character" src={menuImageUrl(item.image)} alt="" aria-hidden="true" loading="lazy" decoding="async" />
                <span className="menu-tile-top">
                  <span className="menu-tile-icon-wrap"><Icon name={item.icon} className="menu-tile-icon" /></span>
                  {item.to === '/rolet' && item.disabled && !item.loading
                    ? <span className="menu-tile-state-icon"><Icon name="clock" size={15} /></span>
                    : <span className="menu-tile-arrow"><Icon name="arrowRight" size={17} /></span>}
                  {item.adminNotifications ? (
                    <span className="menu-admin-notifications" aria-label={`${item.adminNotifications.registrations} pendaftaran, ${item.adminNotifications.payments} pembayaran, ${item.adminNotifications.participants} peserta menunggu`}>
                      {item.adminNotifications.registrations > 0 && <span className="menu-admin-notice"><b>Pendaftaran</b>{item.adminNotifications.registrations > 9 ? '9+' : item.adminNotifications.registrations}</span>}
                      {item.adminNotifications.payments > 0 && <span className="menu-admin-notice"><b>Pembayaran</b>{item.adminNotifications.payments > 9 ? '9+' : item.adminNotifications.payments}</span>}
                      {item.adminNotifications.participants > 0 && <span className="menu-admin-notice"><b>Peserta</b>{item.adminNotifications.participants > 9 ? '9+' : item.adminNotifications.participants}</span>}
                    </span>
                  ) : item.count > 0 ? (
                    <span className="menu-tile-count">{item.count > 9 ? '9+' : item.count}</span>
                  ) : null}
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
