import { Link, Outlet, useLocation } from 'react-router-dom';

export default function AuthShell() {
  const isRegister = useLocation().pathname === '/daftar';

  return (
    <main className="auth">
      <section className={`auth-shell${isRegister ? ' is-register' : ''}`} aria-label="Autentikasi Arisan">
        <Outlet />
        <aside className="auth-panel">
          <div className="auth-panel-brand">
            <img src={`${import.meta.env.BASE_URL}arisanku-logo.png`} alt="ArisanKu Women’s Community" />
          </div>
          <div className="auth-panel-content">
            <p className="auth-panel-kicker">Arisan Uang &amp; Paket Lebaran</p>
            <h2>{isRegister ? 'Senang bertemu denganmu' : 'Selamat datang kembali'}</h2>
            <p>{isRegister ? 'Sudah punya akun?' : 'Belum punya akun?'}</p>
            <Link className="auth-switch" to={isRegister ? '/masuk' : '/daftar'}>
              {isRegister ? 'Masuk' : 'Daftar sekarang'}
            </Link>
          </div>
        </aside>
      </section>
    </main>
  );
}
