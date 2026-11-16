import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { isValidPhone } from '../lib/supabase';

export default function Login() {
  const { signIn, session } = useAuth();
  const nav = useNavigate();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  if (session) return <Navigate to="/" replace />;

  async function submit(e) {
    e.preventDefault();
    setErr('');
    if (!isValidPhone(phone)) return setErr('Nomor telepon tidak valid. Contoh: 081234567890');
    setBusy(true);
    try {
      await signIn(phone, password);
      nav('/', { replace: true });
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
        <h1>Arisan</h1>
        <p>Arisan Uang &amp; Paket Lebaran</p>
      </div>
      <form className="card" onSubmit={submit}>
        <h2>Masuk</h2>
        {err && <div className="alert err">{err}</div>}
        <label className="field">
          <span>Nomor telepon</span>
          <input
            type="tel"
            inputMode="tel"
            autoComplete="username"
            placeholder="08xxxxxxxxxx"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
          />
        </label>
        <label className="field">
          <span>Password</span>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        <button className="btn primary block" disabled={busy}>
          {busy ? 'Memproses…' : 'Masuk'}
        </button>
        <p className="center muted" style={{ marginTop: 14 }}>
          Belum punya akun? <Link to="/daftar">Daftar</Link>
        </p>
      </form>
    </div>
  );
}
