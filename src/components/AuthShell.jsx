import { Link, Outlet, useLocation } from 'react-router-dom';

export default function AuthShell() {
  const isLogin = useLocation().pathname === '/masuk';

  return (
    <main className="auth">
      <section className={`auth-shell${isLogin ? ' is-login' : ''}`} aria-label="Autentikasi Arisan">
        <Outlet />
        <aside className="auth-panels" aria-label="Pilihan akun">
          <section className="auth-panel-content auth-panel-content--register">
            <div>
              <p className="auth-panel-kicker">ARISANKU</p>
              <h2>
                <span className="auth-copy-desktop">Senang bertemu denganmu</span>
                <span className="auth-copy-mobile">Hello, Welcome!</span>
              </h2>
              <p>
                <span className="auth-copy-desktop">Belum punya akun?</span>
                <span className="auth-copy-mobile">Don't have an account?</span>
              </p>
              <Link className="auth-switch" to="/daftar">
                <span className="auth-copy-desktop">Daftar sekarang</span>
                <span className="auth-copy-mobile">Register</span>
              </Link>
            </div>
          </section>
          <section className="auth-panel-content auth-panel-content--login">
            <div>
              <p className="auth-panel-kicker">ARISANKU</p>
              <h2>
                <span className="auth-copy-desktop">Selamat datang kembali</span>
                <span className="auth-copy-mobile">Welcome Back!</span>
              </h2>
              <p>
                <span className="auth-copy-desktop">Sudah punya akun?</span>
                <span className="auth-copy-mobile">Already have an account?</span>
              </p>
              <Link className="auth-switch" to="/masuk">
                <span className="auth-copy-desktop">Masuk</span>
                <span className="auth-copy-mobile">Login</span>
              </Link>
            </div>
          </section>
        </aside>
      </section>
    </main>
  );
}
