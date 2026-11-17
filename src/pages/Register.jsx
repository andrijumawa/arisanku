import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { isValidPhone } from '../lib/supabase';
import AuthSocialIcons from '../components/AuthSocialIcons.jsx';

export default function Register() {
  const { signUp, session } = useAuth();
  const nav = useNavigate();
  const [form, setForm] = useState({ fullName: '', phone: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [isMobile, setIsMobile] = useState(() => window.matchMedia('(max-width: 650px)').matches);

  useEffect(() => {
    const query = window.matchMedia('(max-width: 650px)');
    const update = () => setIsMobile(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  if (session) return <Navigate to="/" replace />;

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setErr('');
    if (form.fullName.trim().length < 3) return setErr('Nama lengkap minimal 3 huruf.');
    if (!isValidPhone(form.phone)) return setErr('Nomor telepon tidak valid. Contoh: 081234567890');
    if (form.password.length < 6) return setErr('Password minimal 6 karakter.');
    setBusy(true);
    try {
      await signUp({ phone: form.phone, password: form.password, fullName: form.fullName });
      nav('/', { replace: true });
    } catch (x) {
      setErr(x.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="auth-form auth-form--register" onSubmit={submit}>
      <div className="auth-form-heading">
        <h1><span className="auth-copy-desktop">Daftar peserta</span><span className="auth-copy-mobile">Registration</span></h1>
      </div>
      {err && <div className="alert err">{err}</div>}
      <label className="field auth-field">
        <span><span className="auth-copy-desktop">Nama lengkap</span><span className="auth-copy-mobile">Username</span></span>
        <input placeholder={isMobile ? 'Username' : 'Nama lengkap'} value={form.fullName} onChange={set('fullName')} autoComplete="name" required />
        <svg className="auth-field-icon" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="8" r="3.5" />
          <path d="M5 20a7 7 0 0 1 14 0" />
        </svg>
      </label>
      <label className="field auth-field">
        <span><span className="auth-copy-desktop">Nomor telepon</span><span className="auth-copy-mobile">Phone number</span></span>
        <input
          type="tel"
          inputMode="tel"
          placeholder={isMobile ? 'Phone number' : 'Nomor telepon'}
          value={form.phone}
          onChange={set('phone')}
          autoComplete="username"
          required
        />
        <svg className="auth-field-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 3.8 8.2 3a1.5 1.5 0 0 1 1.7.8l1.5 3a1.5 1.5 0 0 1-.3 1.8l-1.6 1.4a14.6 14.6 0 0 0 4.5 4.5l1.4-1.6a1.5 1.5 0 0 1 1.8-.3l3 1.5a1.5 1.5 0 0 1 .8 1.7l-.8 3.2a1.5 1.5 0 0 1-1.5 1.1A16.9 16.9 0 0 1 3.9 5.3 1.5 1.5 0 0 1 5 3.8Z" />
        </svg>
      </label>
      <label className="field auth-field">
        <span>Password</span>
        <input type="password" placeholder="Password" value={form.password} onChange={set('password')} autoComplete="new-password" required />
        <svg className="auth-field-icon" viewBox="0 0 24 24" aria-hidden="true">
          <rect x="4.5" y="10" width="15" height="11" rx="2" />
          <path d="M8 10V7a4 4 0 1 1 8 0v3" />
        </svg>
      </label>
      <button className="btn primary block auth-submit" disabled={busy}>
        <span className="auth-copy-desktop">{busy ? 'Memproses…' : 'Daftar'}</span>
        <span className="auth-copy-mobile">{busy ? 'Processing...' : 'Register'}</span>
      </button>
      <p className="auth-form-footer">
        Sudah punya akun? <Link to="/masuk">Masuk</Link>
      </p>
      <img className="auth-form-brand" src={`${import.meta.env.BASE_URL}arisanku-logo.png`} alt="ArisanKu" />
      <AuthSocialIcons mode="register" />
    </form>
  );
}
