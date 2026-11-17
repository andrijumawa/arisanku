import { Link, useOutletContext } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';

export default function Menu() {
  const { profile, isAdmin } = useAuth();
  const { unread = 0 } = useOutletContext() || {};
  const items = [
    { to: '/beranda', icon: '🏠', label: 'Beranda' },
    { to: '/arisan', icon: '🎯', label: 'Arisan' },
    { to: '/chat', icon: '💬', label: 'Chat', count: unread },
    ...(isAdmin ? [{ to: '/admin', icon: '🛠️', label: 'Admin' }] : []),
    { to: '/akun', icon: '👤', label: 'Akun' },
  ];

  return (
    <section className="menu-page">
      <div className="menu-heading">
        <p className="muted small">ArisanKu</p>
        <h1>Menu</h1>
        <p className="muted">Halo, {profile?.full_name?.split(' ')[0] || 'Peserta'}. Mau membuka apa?</p>
      </div>
      <nav className="menu-grid" aria-label="Menu utama">
        {items.map((item) => (
          <Link key={item.to} to={item.to} className="menu-tile">
            <span className="menu-tile-icon" aria-hidden="true">{item.icon}</span>
            <span>{item.label}</span>
            {item.count > 0 && <span className="menu-tile-count">{item.count > 9 ? '9+' : item.count}</span>}
          </Link>
        ))}
      </nav>
    </section>
  );
}
