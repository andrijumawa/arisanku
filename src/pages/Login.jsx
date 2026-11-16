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
    <form className="auth-form auth-form--login" onSubmit={submit}>
      <div className="auth-form-heading">
        <h1>Masuk</h1>
      </div>
      {err && <div className="alert err">{err}</div>}
      <label className="field auth-field">
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
        <svg className="auth-field-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 3.8 8.2 3a1.5 1.5 0 0 1 1.7.8l1.5 3a1.5 1.5 0 0 1-.3 1.8l-1.6 1.4a14.6 14.6 0 0 0 4.5 4.5l1.4-1.6a1.5 1.5 0 0 1 1.8-.3l3 1.5a1.5 1.5 0 0 1 .8 1.7l-.8 3.2a1.5 1.5 0 0 1-1.5 1.1A16.9 16.9 0 0 1 3.9 5.3 1.5 1.5 0 0 1 5 3.8Z" />
        </svg>
      </label>
      <label className="field auth-field">
        <span>Password</span>
        <input
          type="password"
          autoComplete="current-password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <svg className="auth-field-icon" viewBox="0 0 24 24" aria-hidden="true">
          <rect x="4.5" y="10" width="15" height="11" rx="2" />
          <path d="M8 10V7a4 4 0 1 1 8 0v3" />
        </svg>
      </label>
      <button className="btn primary block auth-submit" disabled={busy}>
        {busy ? 'Memproses…' : 'Masuk'}
      </button>
      <p className="auth-form-footer">
        Belum punya akun? <Link to="/daftar">Daftar</Link>
      </p>
    </form>
  );
}
