import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { supabase } from '../lib/supabase';
import { useToast } from './Toast.jsx';

export default function Layout() {
  const { isAdmin, session } = useAuth();
  const toast = useToast();
  const loc = useLocation();
  const [unread, setUnread] = useState(0);
  const uid = session.user.id;
  const onChat = loc.pathname.startsWith('/chat');

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
            toast('💬 Pesan baru di grup chat');
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
    <div className="app">
      <header className="hdr">
        <img className="brand-logo" src={`${import.meta.env.BASE_URL}icons/arisanku-mark.png`} alt="ArisanKu" />
        {isAdmin && <span className="badge gold">Admin</span>}
      </header>

      <main className={onChat ? 'main-chat' : 'main'}>
        <Outlet />
      </main>

      <nav className="nav">
        <NavLink to="/" end>
          <span>🏠</span>Beranda
        </NavLink>
        <NavLink to="/arisan">
          <span>🎯</span>Arisan
        </NavLink>
        <NavLink to="/chat">
          <span className="ico-wrap">
            💬{unread > 0 && <i className="dot">{unread > 9 ? '9+' : unread}</i>}
          </span>
          Chat
        </NavLink>
        {isAdmin && (
          <NavLink to="/admin">
            <span>🛠️</span>Admin
          </NavLink>
        )}
        <NavLink to="/akun">
          <span>👤</span>Akun
        </NavLink>
      </nav>
    </div>
  );
}
