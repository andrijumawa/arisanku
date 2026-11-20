import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import Login from '../pages/Login.jsx';
import Register from '../pages/Register.jsx';

export default function AuthShell() {
  const { pathname } = useLocation();
  const isLogin = pathname === '/masuk';
  const previousPath = useRef(pathname);
  const keyboardWasOpen = useRef(false);
  const keyboardCloseTimer = useRef(null);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [visibleViewport, setVisibleViewport] = useState(null);
  const [keyboardClosing, setKeyboardClosing] = useState(false);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return undefined;

    const syncKeyboardState = () => {
      const keyboardOpen = viewport.height < window.innerHeight - 120;
      if (keyboardCloseTimer.current !== null) {
        window.clearTimeout(keyboardCloseTimer.current);
        keyboardCloseTimer.current = null;
      }

      if (keyboardOpen) {
        keyboardWasOpen.current = true;
        setKeyboardClosing(false);
      } else if (keyboardWasOpen.current) {
        keyboardWasOpen.current = false;
        setKeyboardClosing(true);
        keyboardCloseTimer.current = window.setTimeout(() => {
          setKeyboardClosing(false);
          keyboardCloseTimer.current = null;
        }, 400);
      }

      setVisibleViewport({
        height: viewport.height,
        offsetTop: viewport.offsetTop,
        keyboardOpen,
      });
    };

    syncKeyboardState();
    viewport.addEventListener('resize', syncKeyboardState);
    viewport.addEventListener('scroll', syncKeyboardState);
    window.addEventListener('resize', syncKeyboardState);

    return () => {
      viewport.removeEventListener('resize', syncKeyboardState);
      viewport.removeEventListener('scroll', syncKeyboardState);
      window.removeEventListener('resize', syncKeyboardState);
      if (keyboardCloseTimer.current !== null) {
        window.clearTimeout(keyboardCloseTimer.current);
      }
    };
  }, []);

  useLayoutEffect(() => {
    if (previousPath.current === pathname) return undefined;
    previousPath.current = pathname;
    setIsTransitioning(true);
    const timeout = window.setTimeout(() => setIsTransitioning(false), 1800);
    return () => window.clearTimeout(timeout);
  }, [pathname]);

  return (
    <main
      className={`auth${visibleViewport?.keyboardOpen ? ' keyboard-open' : ''}${keyboardClosing ? ' keyboard-closing' : ''}`}
      style={visibleViewport?.keyboardOpen ? {
        '--auth-visible-height': `${visibleViewport.height}px`,
        '--auth-viewport-top': `${visibleViewport.offsetTop}px`,
      } : undefined}
    >
      <img className="auth-background-image" src={`${import.meta.env.BASE_URL}images/initial-loading.jpeg`} alt="" aria-hidden="true" />
      <section className={`auth-shell${isLogin ? ' is-login' : ''}${isTransitioning ? ' is-transitioning' : ''}`} aria-label="Autentikasi Arisan">
        <Login />
        <Register />
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
