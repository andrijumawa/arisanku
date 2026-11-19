import { useEffect, useRef, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { supabase } from '../lib/supabase';
import { useToast } from './Toast.jsx';
import Icon from './Icon.jsx';

export default function Layout() {
  const { isAdmin, profile, session } = useAuth();
  const toast = useToast();
  const loc = useLocation();
  const isGroupDetail = /^\/g\/[^/]+$/.test(loc.pathname);
  const backTarget = isGroupDetail && ['/beranda', '/arisan'].includes(loc.state?.from)
    ? loc.state.from
    : isGroupDetail
      ? '/beranda'
      : '/';
  const backLabel = backTarget === '/beranda' ? 'Kembali ke Beranda' : 'Kembali ke Menu';
  const [unread, setUnread] = useState(0);
  const [pullDistance, setPullDistance] = useState(0);
  const [pullState, setPullState] = useState('idle');
  const pullStartRef = useRef(null);
  const pullDistanceRef = useRef(0);
  const uid = session.user.id;
  const onChat = loc.pathname.startsWith('/chat');

  useEffect(() => {
    const viewport = window.visualViewport;

    const syncVisibleViewport = () => {
      if (!viewport) return;
      document.documentElement.style.setProperty('--visible-viewport-height', `${viewport.height}px`);
      document.documentElement.style.setProperty('--visible-viewport-offset-top', `${viewport.offsetTop}px`);
      document.body.classList.toggle('keyboard-open', viewport.height < window.innerHeight - 120);
    };

    syncVisibleViewport();
    viewport?.addEventListener('resize', syncVisibleViewport);
    viewport?.addEventListener('scroll', syncVisibleViewport);
    window.addEventListener('resize', syncVisibleViewport);

    return () => {
      viewport?.removeEventListener('resize', syncVisibleViewport);
      viewport?.removeEventListener('scroll', syncVisibleViewport);
      window.removeEventListener('resize', syncVisibleViewport);
      document.documentElement.style.removeProperty('--visible-viewport-height');
      document.documentElement.style.removeProperty('--visible-viewport-offset-top');
      document.body.classList.remove('keyboard-open');
    };
  }, []);

  useEffect(() => {
    let startY = null;
    let scrollTarget = null;

    const findScrollTarget = (target) => {
      let element = target instanceof Element ? target : null;
      while (element && element !== document.body) {
        const overflowY = getComputedStyle(element).overflowY;
        if (
          (overflowY === 'auto' || overflowY === 'scroll') &&
          element.scrollHeight > element.clientHeight + 1
        ) {
          return element;
        }
        element = element.parentElement;
      }
      return document.scrollingElement;
    };

    const onTouchStart = (event) => {
      if (event.touches.length !== 1 || pullStartRef.current) return;
      if (event.target.closest?.('input, textarea, select, button, a')) return;
      const target = findScrollTarget(event.target);
      if (target && target.scrollTop > 0) return;
      startY = event.touches[0].clientY;
      scrollTarget = target;
      pullStartRef.current = true;
    };

    const onTouchMove = (event) => {
      if (!pullStartRef.current || event.touches.length !== 1) return;
      const distance = event.touches[0].clientY - startY;
      if (distance <= 0) {
        pullDistanceRef.current = 0;
        setPullDistance(0);
        setPullState('idle');
        return;
      }
      if (scrollTarget && scrollTarget.scrollTop > 0) {
        pullStartRef.current = false;
        pullDistanceRef.current = 0;
        setPullDistance(0);
        setPullState('idle');
        return;
      }
      event.preventDefault();
      const nextDistance = Math.min(distance, 96);
      pullDistanceRef.current = nextDistance;
      setPullDistance(nextDistance);
      setPullState(distance >= 76 ? 'ready' : 'pulling');
    };

    const resetPull = () => {
      pullStartRef.current = false;
      startY = null;
      scrollTarget = null;
      pullDistanceRef.current = 0;
      setPullDistance(0);
      setPullState('idle');
    };

    const onTouchEnd = async () => {
      if (!pullStartRef.current) return;
      const shouldRefresh = pullDistanceRef.current >= 76;
      pullStartRef.current = false;
      startY = null;
      scrollTarget = null;
      if (!shouldRefresh) {
        pullDistanceRef.current = 0;
        setPullDistance(0);
        setPullState('idle');
        return;
      }

      setPullDistance(76);
      setPullState('refreshing');
      try {
        const registration = await navigator.serviceWorker?.getRegistration();
        if (registration) await registration.update();
        window.location.reload();
      } catch (error) {
        console.error('Pull-to-refresh update check failed:', error);
        toast('Pembaruan gagal diperiksa. Coba tarik lagi.', 'error');
        pullDistanceRef.current = 0;
        setPullDistance(0);
        setPullState('idle');
      }
    };

    document.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('touchend', onTouchEnd, { passive: true });
    document.addEventListener('touchcancel', resetPull, { passive: true });
    return () => {
      document.removeEventListener('touchstart', onTouchStart);
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', onTouchEnd);
      document.removeEventListener('touchcancel', resetPull);
    };
  }, [toast]);

  useEffect(() => {
    const keepFocusedFieldVisible = (event) => {
      const field = event.target;
      if (!(field instanceof HTMLElement)) return;
      if (!field.matches('input, textarea, select')) return;

      window.setTimeout(() => {
        const rect = field.getBoundingRect?.() || field.getBoundingClientRect();
        const viewportHeight = window.visualViewport?.height || window.innerHeight;
        if (rect.bottom > viewportHeight - 24) {
          field.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }
      }, 180);
    };

    document.addEventListener('focusin', keepFocusedFieldVisible);
    return () => document.removeEventListener('focusin', keepFocusedFieldVisible);
  }, []);

  useEffect(() => {
    if (loc.pathname.startsWith('/chat')) setUnread(0);
  }, [loc.pathname]);

  // Pesan baru saat aplikasi terbuka (RLS memastikan hanya anggota chat yang menerima)
  useEffect(() => {
    if (onChat) return undefined;
    let ch = null;
    const connect = () => {
      if (ch || document.visibilityState === 'hidden') return;
      ch = supabase
        .channel('layout-chat')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `user_id=neq.${uid}` },
          (p) => {
            if (p.new.user_id === uid) return;
            setUnread((n) => n + 1);
            toast('Pesan baru di grup chat');
          }
        )
        .subscribe((status) => {
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            console.error(`Realtime channel "layout-chat" failed: ${status}`);
          }
        });
    };
    const disconnect = () => {
      if (!ch) return;
      const current = ch;
      ch = null;
      void supabase.removeChannel(current);
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') disconnect();
      else connect();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    connect();
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      disconnect();
    };
  }, [onChat, uid, toast]);

  return (
    <div className={`app${loc.pathname === '/' ? ' is-menu' : ''}`}>
      <div
        className="app-watermark"
        aria-hidden="true"
        style={{ '--app-watermark-image': `url("${import.meta.env.BASE_URL}icons/arisanku-mark.png")` }}
      />
      <header className="hdr">
        <img className="brand-logo" src={`${import.meta.env.BASE_URL}icons/arisanku-mark.png`} alt="ArisanKu" />
        <div className="header-account">
          {isAdmin && <span className="badge gold">Admin</span>}
          <span className="header-account-name">{profile?.full_name || 'Peserta'}</span>
          <span className="header-avatar" aria-hidden="true">
            <Icon name="user" size={19} />
          </span>
        </div>
      </header>

      {pullState !== 'idle' && (
        <div
          className={`pull-refresh-indicator is-${pullState}`}
          style={{ '--pull-distance': `${pullDistance}px` }}
          role="status"
          aria-live="polite"
        >
          <span className="pull-refresh-icon" aria-hidden="true" />
          {pullState === 'refreshing'
            ? 'Memeriksa pembaruan…'
            : pullState === 'ready'
              ? 'Lepaskan untuk memperbarui'
              : 'Tarik untuk memperbarui'}
        </div>
      )}

      <main
        className={
          onChat
            ? 'main-chat'
            : loc.pathname === '/'
              ? 'main main-menu'
              : `main${loc.pathname === '/admin' ? ' main-admin' : ''}`
        }
      >
        <Outlet context={{ unread }} />
      </main>

      {loc.pathname !== '/' && (
        <footer className="app-back">
          <Link to={backTarget} className="app-back-button">
            <Icon name="back" size={19} /> {backLabel}
          </Link>
        </footer>
      )}
    </div>
  );
}
