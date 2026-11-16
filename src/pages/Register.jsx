import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { isValidPhone } from '../lib/supabase';

export default function Register() {
  const { signUp, session } = useAuth();
  const nav = useNavigate();
  const [form, setForm] = useState({ fullName: '', phone: '', password: '', confirm: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  if (session) return <Navigate to="/" replace />;

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setErr('');
    if (form.fullName.trim().length < 3) return setErr('Nama lengkap minimal 3 huruf.');
    if (!isValidPhone(form.phone)) return setErr('Nomor telepon tidak valid. Contoh: 081234567890');
    if (form.password.length < 6) return setErr('Password minimal 6 karakter.');
    if (form.password !== form.confirm) return setErr('Konfirmasi password tidak sama.');
    setBusy(true);
    try {
      await signUp({ phone: form.phone, password: form.password, fullName: form.fullName });
      nav('/arisan', { replace: true });
    } catch (x) {
      setErr(x.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <div className="auth-brand">
        <div className="big">◎</div>
        <h1>Daftar Peserta</h1>
        <p>Cukup nomor telepon &amp; password</p>
      </div>
      <form className="card" onSubmit={submit}>
        {err && <div className="alert err">{err}</div>}
        <label className="field">
          <span>Nama lengkap</span>
          <input value={form.fullName} onChange={set('fullName')} autoComplete="name" required />
        </label>
        <label className="field">
          <span>Nomor telepon</span>
          <input
            type="tel"
            inputMode="tel"
            placeholder="08xxxxxxxxxx"
            value={form.phone}
            onChange={set('phone')}
            autoComplete="username"
            required
          />
          <div className="hint">Nomor ini dipakai untuk masuk. Gunakan nomor aktif (sebaiknya WhatsApp).</div>
        </label>
        <label className="field">
          <span>Password</span>
          <input type="password" value={form.password} onChange={set('password')} autoComplete="new-password" required />
        </label>
        <label className="field">
          <span>Ulangi password</span>
          <input type="password" value={form.confirm} onChange={set('confirm')} autoComplete="new-password" required />
        </label>
        <button className="btn primary block" disabled={busy}>
          {busy ? 'Memproses…' : 'Daftar'}
        </button>
        <p className="center muted" style={{ marginTop: 14 }}>
          Sudah punya akun? <Link to="/masuk">Masuk</Link>
        </p>
      </form>
    </div>
  );
}
