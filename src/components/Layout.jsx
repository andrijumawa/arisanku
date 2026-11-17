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

  useEffect(() => {
    if (loc.pathname.startsWith('/chat')) setUnread(0);
  }, [loc.pathname]);

  // Pesan baru saat aplikasi terbuka (RLS memastikan hanya anggota chat yang menerima)
  useEffect(() => {
    const ch = supabase
      .channel('layout-chat')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, (p) => {
        if (p.new.user_id === uid) return;
        if (window.location.hash.startsWith('#/chat')) return;
        setUnread((n) => n + 1);
        toast('💬 Pesan baru di grup chat');
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [uid, toast]);

  const onChat = loc.pathname.startsWith('/chat');

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
