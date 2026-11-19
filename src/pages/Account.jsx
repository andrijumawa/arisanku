import { useEffect, useState } from 'react';
import { useAuth } from '../lib/auth.jsx';
import { phoneToEmail, supabase } from '../lib/supabase';
import { currentSubscription, disablePush, enablePush, pushSupported } from '../lib/push';
import { useToast } from '../components/Toast.jsx';

const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

export default function Account() {
  const { profile, session, signOut } = useAuth();
  const toast = useToast();
  const [name, setName] = useState(profile?.full_name || '');
  const [saving, setSaving] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [pushOn, setPushOn] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const supported = pushSupported();

  useEffect(() => {
    setName(profile?.full_name || '');
  }, [profile]);

  useEffect(() => {
    if (!supported) return;
    currentSubscription()
      .then((s) => setPushOn(!!s && Notification.permission === 'granted'))
      .catch(() => {});
  }, [supported]);

  async function saveName(e) {
    e.preventDefault();
    if (name.trim().length < 3) return toast('Nama minimal 3 huruf.', 'error');
    setSaving(true);
    const { error } = await supabase.from('profiles').update({ full_name: name.trim() }).eq('id', session.user.id);
    setSaving(false);
    if (error) return toast(error.message, 'error');
    toast('Nama diperbarui.', 'success');
  }

  async function changePassword(e) {
    e.preventDefault();
    if (newPassword.length < 6) return toast('Password baru minimal 6 karakter.', 'error');
    if (newPassword !== confirmPassword) return toast('Konfirmasi password baru tidak cocok.', 'error');

    setPasswordBusy(true);
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: phoneToEmail(profile?.phone),
        password: currentPassword,
      });
      if (signInError) {
        if (/invalid login credentials/i.test(signInError.message)) {
          throw new Error('Password saat ini salah.');
        }
        throw signInError;
      }

      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
      if (updateError) throw updateError;

      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      toast('Password berhasil diperbarui.', 'success');
    } catch (error) {
      toast(error.message || 'Password gagal diperbarui.', 'error');
    } finally {
      setPasswordBusy(false);
    }
  }

  async function togglePush() {
    setPushBusy(true);
    try {
      if (pushOn) {
        await disablePush();
        setPushOn(false);
        toast('Notifikasi dimatikan di perangkat ini.');
      } else {
        await enablePush(session.user.id);
        setPushOn(true);
        toast('Notifikasi aktif.', 'success');
      }
    } catch (x) {
      toast(x.message || 'Gagal mengatur notifikasi', 'error');
    } finally {
      setPushBusy(false);
    }
  }

  return (
    <>
      <h2>Akun</h2>

      <form className="card" onSubmit={saveName}>
        <label className="field">
          <span>Nomor telepon</span>
          <input value={profile?.phone || ''} disabled />
        </label>
        <label className="field">
          <span>Nama lengkap</span>
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <button className="btn primary" disabled={saving}>
          {saving ? 'Menyimpan…' : 'Simpan nama'}
        </button>
      </form>

      <form className="card" onSubmit={changePassword}>
        <h3>Ganti password</h3>
        <label className="field">
          <span>Password saat ini</span>
          <input
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            required
          />
        </label>
        <label className="field">
          <span>Password baru</span>
          <input
            type="password"
            autoComplete="new-password"
            minLength={6}
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            required
          />
        </label>
        <label className="field">
          <span>Konfirmasi password baru</span>
          <input
            type="password"
            autoComplete="new-password"
            minLength={6}
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            required
          />
        </label>
        <button className="btn primary" disabled={passwordBusy}>
          {passwordBusy ? 'Memperbarui…' : 'Simpan password baru'}
        </button>
      </form>

      <div className="card">
        <div className="row between">
          <div>
            <h3 style={{ marginBottom: 2 }}>Notifikasi</h3>
            <div className="muted small">Pesan chat baru, persetujuan pendaftaran &amp; pembayaran.</div>
          </div>
          {supported && (
            <button className={`btn sm ${pushOn ? '' : 'primary'}`} disabled={pushBusy} onClick={togglePush}>
              {pushOn ? 'Matikan' : 'Aktifkan'}
            </button>
          )}
        </div>
        {!supported && (
          <div className="alert warn" style={{ marginTop: 10, marginBottom: 0 }}>
            Browser ini belum mendukung notifikasi.
            {isIOS() && ' Di iPhone, pasang aplikasi ke Layar Utama dulu (Bagikan → Tambah ke Layar Utama).'}
          </div>
        )}
        {supported && isIOS() && !isStandalone() && (
          <div className="alert warn" style={{ marginTop: 10, marginBottom: 0 }}>
            Di iPhone notifikasi hanya jalan jika aplikasi dipasang ke Layar Utama (Bagikan → Tambah ke Layar Utama).
          </div>
        )}
      </div>

      <button className="btn danger block" onClick={signOut}>
        Keluar
      </button>
    </>
  );
}
