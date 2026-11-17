import { useEffect, useState } from 'react';
import { useAuth } from '../lib/auth.jsx';
import { supabase } from '../lib/supabase';
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

      <div className="card">
        <h3>Pasang aplikasi</h3>
        <p className="muted small" style={{ marginBottom: 0 }}>
          Android (Chrome): menu ⋮ → <b>Instal aplikasi</b>. iPhone (Safari): tombol Bagikan → <b>Tambah ke Layar Utama</b>.
        </p>
      </div>

      <button className="btn danger block" onClick={signOut}>
        Keluar
      </button>
    </>
  );
}
