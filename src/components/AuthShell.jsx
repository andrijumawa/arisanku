import { Link, Outlet, useLocation } from 'react-router-dom';

export default function AuthShell() {
  const isLogin = useLocation().pathname === '/masuk';

  return (
    <main className="auth">
      <section className={`auth-shell${isLogin ? ' is-login' : ''}`} aria-label="Autentikasi Arisan">
        <Outlet />
        <aside className="auth-panels" aria-label="Pilihan akun">
          <section className="auth-panel-content auth-panel-content--register">
            <img src={`${import.meta.env.BASE_URL}arisanku-logo.png`} alt="ArisanKu Women’s Community" />
            <div>
              <p className="auth-panel-kicker">Arisan Uang &amp; Paket Lebaran</p>
              <h2>Senang bertemu denganmu</h2>
              <p>Belum punya akun?</p>
              <Link className="auth-switch" to="/daftar">Daftar sekarang</Link>
            </div>
          </section>
          <section className="auth-panel-content auth-panel-content--login">
            <img src={`${import.meta.env.BASE_URL}arisanku-logo.png`} alt="ArisanKu Women’s Community" />
            <div>
              <p className="auth-panel-kicker">Arisan Uang &amp; Paket Lebaran</p>
              <h2>Selamat datang kembali</h2>
              <p>Sudah punya akun?</p>
              <Link className="auth-switch" to="/masuk">Masuk</Link>
            </div>
          </section>
        </aside>
      </section>
    </main>
  );
}
