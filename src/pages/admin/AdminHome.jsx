import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useNavigationType, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../lib/auth.jsx';
import { supabase, q } from '../../lib/supabase';
import { useAsync, useRealtimeRefresh } from '../../lib/hooks';
import { loadAdminCounts } from '../../lib/menuData';
import { fmtDate, rupiah, typeLabel } from '../../lib/format';
import { Empty, ErrorBox, Spinner } from '../../components/Ui.jsx';
import SignedImage, { signedUrls } from '../../components/SignedImage.jsx';
import { useToast } from '../../components/Toast.jsx';
import Icon from '../../components/Icon.jsx';
import Modal from '../../components/Modal.jsx';
import { useConfirm } from '../../components/Confirm.jsx';
import AdminPagination from '../../components/admin/AdminPagination.jsx';

const initial = (s) => (s || '?').trim().charAt(0).toUpperCase();
const ADMIN_PAGE_SIZE = 25;
const sections = [
  ['daftar', 'Pendaftaran', 'Tinjau permintaan bergabung', 'inbox', 'admin-registration.webp'],
  ['bayar', 'Pembayaran', 'Periksa bukti transfer', 'coin', 'admin-payment.webp'],
  ['kelompok', 'Kelompok', 'Atur kelompok arisan', 'folder', 'admin-group.webp'],
  ['peserta', 'Peserta', 'Kelola akun dan verifikasi', 'users', 'admin-people.webp'],
];

export default function AdminHome() {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const navigationType = useNavigationType();
  const [listRevisions, setListRevisions] = useState({ registrations: 0, payments: 0, accounts: 0 });
  const requestedTab = params.get('tab');
  const activeSection = sections.find(([key]) => key === requestedTab);
  const restoreGroupSection = requestedTab === 'kelompok'
    && (navigationType === 'POP' || location.state?.restoreAdminGroupModal === true);
  const { data, error, reload } = useAsync(loadAdminCounts, []);
  const onRealtimeChange = useCallback((tables) => {
    setListRevisions((current) => ({
      registrations: current.registrations + Number(tables.includes('memberships')),
      payments: current.payments + Number(tables.includes('payments')),
      accounts: current.accounts + Number(tables.includes('profiles')),
    }));
  }, []);
  useRealtimeRefresh(
    reload,
    'admin-counts',
    [{ table: 'memberships' }, { table: 'payments' }, { table: 'profiles' }],
    true,
    onRealtimeChange
  );

  const openSection = (nextTab) => {
    setParams((current) => {
      const next = new URLSearchParams(current);
      next.set('tab', nextTab);
      return next;
    });
  };
  const closeSection = () => {
    setParams((current) => {
      const next = new URLSearchParams(current);
      next.delete('tab');
      return next;
    });
  };

  return (
    <section className="admin-panel">
      <header className="admin-heading">
        <span className="admin-heading-icon" aria-hidden="true"><Icon name="tools" size={22} /></span>
        <h2>Panel Admin</h2>
      </header>
      {error && <ErrorBox error={error} onRetry={reload} />}
      <nav className="admin-cards" aria-label="Kategori admin">
        {sections.map(([key, label, description, icon, image]) => {
          const count = key === 'daftar' ? data?.mem : key === 'bayar' ? data?.pay : key === 'peserta' ? data?.accounts : null;
          const isNew = ['daftar', 'bayar', 'peserta'].includes(key) && count > 0;
          return (
            <button
              key={key}
              className={`admin-card${key === 'daftar' ? ' admin-card-registration' : ''}${isNew ? ' admin-card-new' : ''}`}
              type="button"
              onClick={() => openSection(key)}
              aria-haspopup="dialog"
              aria-label={count > 0 ? `${label}, ${count} menunggu. ${description}` : `${label}. ${description}`}
            >
              <img
                className="admin-card-art"
                src={`${import.meta.env.BASE_URL}images/${image}`}
                alt=""
                aria-hidden="true"
                loading="lazy"
                decoding="async"
              />
              <span className="admin-card-top">
                <span className="admin-card-icon"><Icon name={icon} size={21} /></span>
                <span className="admin-card-trailing">
                  {count > 0 && <i className="admin-card-count">{count}</i>}
                  {isNew && <b className="admin-card-new-label">Baru</b>}
                </span>
              </span>
              <span className="admin-card-copy">
                <strong>{label}</strong>
                <span>{description}</span>
              </span>
            </button>
          );
        })}
      </nav>
      {activeSection && (
        <Modal
          title={activeSection[1]}
          onClose={closeSection}
          tall
          animate={!restoreGroupSection}
        >
          <div className="admin-content">
            {activeSection[0] === 'daftar' && <Registrations revision={listRevisions.registrations} />}
            {activeSection[0] === 'bayar' && <Payments revision={listRevisions.payments} />}
            {activeSection[0] === 'kelompok' && <Groups />}
            {activeSection[0] === 'peserta' && <People revision={listRevisions.accounts} />}
          </div>
        </Modal>
      )}
    </section>
  );
}

/* ---------------- Pendaftaran ---------------- */
function Registrations({ revision }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [busyId, setBusyId] = useState(null);
  const [page, setPage] = useState(0);
  const { data: result, loading, error, reload } = useAsync(async () => {
    const { data, error: queryError, count } = await supabase
      .from('memberships')
      .select('id,user_id,slot_count,status,created_at,profiles(full_name,phone,avatar_path),groups(name,type,nominal,package_type)', { count: 'exact' })
      .eq('status', 'menunggu')
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(page * ADMIN_PAGE_SIZE, (page + 1) * ADMIN_PAGE_SIZE - 1);
    if (queryError) throw queryError;
    return { items: data || [], total: count || 0 };
  }, [revision, page]);
  useRealtimeRefresh(
    reload,
    'admin-registrations',
    [{ table: 'groups' }]
  );

  async function approve(m) {
    setBusyId(m.id);
    const { error } = await supabase.rpc('approve_membership', { p_membership: m.id });
    setBusyId(null);
    if (error) return toast(error.message, 'error');
    toast(`${m.profiles?.full_name} disetujui.`, 'success');
  }

  async function reject(m) {
    const accepted = await confirm({
      title: 'Tolak pendaftaran?',
      message: `Pendaftaran ${m.profiles?.full_name || 'peserta ini'} akan ditolak.`,
      confirmLabel: 'Tolak',
    });
    if (!accepted) return;
    setBusyId(m.id);
    const { error } = await supabase.from('memberships').update({ status: 'ditolak' }).eq('id', m.id);
    setBusyId(null);
    if (error) return toast(error.message, 'error');
  }

  if (loading) return <Spinner />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!result.total) return <Empty icon="check" title="Tidak ada pendaftaran menunggu" />;

  return (
    <>
      {result.items.map((m) => (
        <div key={m.id} className="card">
          <div className="person">
            {m.profiles?.avatar_path
              ? <SignedImage bucket="profile-avatars" path={m.profiles.avatar_path} alt={`Foto ${m.profiles.full_name}`} className="avatar admin-person-photo" />
              : <div className="avatar">{initial(m.profiles?.full_name)}</div>}
            <div style={{ flex: 1 }}>
              <b>{m.profiles?.full_name}</b>
              <div className="muted small">{m.profiles?.phone}</div>
            </div>
            <span className="muted small">{fmtDate(m.created_at)}</span>
          </div>
          <hr className="divider" />
          <div className="small">
            <b>{m.groups?.name}</b> · {typeLabel(m.groups || {})} · {rupiah(m.groups?.nominal)}
            {m.groups?.type === 'uang' && <> · {m.slot_count} slot</>}
          </div>
          <div className="actions admin-review-actions">
            <button type="button" className="btn primary sm" disabled={busyId === m.id} onClick={() => approve(m)}>
              Setujui
            </button>
            <button type="button" className="btn danger sm" disabled={busyId === m.id} onClick={() => reject(m)}>
              Tolak
            </button>
          </div>
        </div>
      ))}
      <AdminPagination page={page} pageSize={ADMIN_PAGE_SIZE} total={result.total} onPageChange={setPage} />
    </>
  );
}

/* ---------------- Pembayaran ---------------- */
function Payments({ revision }) {
  const { session } = useAuth();
  const toast = useToast();
  const [busyId, setBusyId] = useState(null);
  const [page, setPage] = useState(0);
  const [paymentView, setPaymentView] = useState('menunggu');
  const { data: result, loading, error, reload } = useAsync(async () => {
    const { data, error: queryError, count } = await supabase
      .from('payments')
      .select('id,amount,period_no,created_at,reviewed_at,proof_path,group_id,membership_id,status,groups(name,type,pay_period),memberships(slot_count,profiles(full_name,phone))', { count: 'exact' })
      .eq('status', paymentView === 'menunggu' ? 'menunggu' : 'disetujui')
      .order(paymentView === 'menunggu' ? 'created_at' : 'reviewed_at', { ascending: paymentView === 'menunggu', nullsFirst: false })
      .order('id', { ascending: true })
      .range(page * ADMIN_PAGE_SIZE, (page + 1) * ADMIN_PAGE_SIZE - 1);
    if (queryError) throw queryError;
    return { items: data || [], total: count || 0 };
  }, [revision, page, paymentView]);
  useRealtimeRefresh(
    reload,
    'admin-payments',
    [{ table: 'groups' }]
  );

  async function review(p, status) {
    let note = null;
    if (status === 'ditolak') {
      note = window.prompt('Alasan penolakan (opsional):', 'Bukti tidak jelas / nominal tidak sesuai');
      if (note === null) return;
    }
    setBusyId(p.id);
    const { error } = await supabase
      .from('payments')
      .update({ status, note: note || null, reviewed_by: session.user.id, reviewed_at: new Date().toISOString() })
      .eq('id', p.id);
    setBusyId(null);
    if (error) return toast(error.message, 'error');
    toast(status === 'disetujui' ? 'Pembayaran disetujui.' : 'Pembayaran ditolak.', 'success');
  }

  if (loading) return <Spinner />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;

  return (
    <>
      <nav className="admin-payment-tabs" aria-label="Daftar pembayaran">
        <button
          type="button"
          className={`btn sm${paymentView === 'menunggu' ? ' primary' : ''}`}
          aria-pressed={paymentView === 'menunggu'}
          onClick={() => {
            setPage(0);
            setPaymentView('menunggu');
          }}
        >
          Menunggu
        </button>
        <button
          type="button"
          className={`btn sm${paymentView === 'riwayat' ? ' primary' : ''}`}
          aria-pressed={paymentView === 'riwayat'}
          onClick={() => {
            setPage(0);
            setPaymentView('riwayat');
          }}
        >
          Riwayat pembayaran
        </button>
      </nav>
      {!result.total && (
        <Empty
          icon="check"
          title={paymentView === 'menunggu' ? 'Tidak ada pembayaran menunggu' : 'Belum ada pembayaran disetujui'}
        />
      )}
      {result.items.map((p) => {
        const who = p.memberships?.profiles;
        return (
          <div key={p.id} className="card">
            <div className="person">
              <div className="avatar">{initial(who?.full_name)}</div>
              <div style={{ flex: 1 }}>
                <b>{who?.full_name}</b>
                <div className="muted small">{who?.phone}</div>
              </div>
              <b>{rupiah(p.amount)}</b>
            </div>
            <div className="admin-payment-summary">
              <div className="small">
                {p.groups?.name} · periode ke-{p.period_no} · {fmtDate(p.created_at)}
              </div>
              {paymentView === 'menunggu'
                ? <SignedImage bucket="bukti-transfer" path={p.proof_path} alt="Bukti transfer" className="thumb sm admin-payment-proof" />
                : <span className="badge ok">Disetujui {fmtDate(p.reviewed_at)}</span>}
            </div>
            {paymentView === 'menunggu' && (
              <div className="actions admin-review-actions">
                <button type="button" className="btn primary sm" disabled={busyId === p.id} onClick={() => review(p, 'disetujui')}>
                  Setujui
                </button>
                <button type="button" className="btn danger sm" disabled={busyId === p.id} onClick={() => review(p, 'ditolak')}>
                  Tolak
                </button>
              </div>
            )}
          </div>
        );
      })}
      <AdminPagination page={page} pageSize={ADMIN_PAGE_SIZE} total={result.total} onPageChange={setPage} />
    </>
  );
}

/* ---------------- Kelompok ---------------- */
function Groups() {
  const { data, loading, error, reload } = useAsync(
    () => q(supabase.from('groups').select('id,type,name,nominal,durasi,pay_period,package_type,is_open,created_at,memberships(count)').order('created_at', { ascending: false })),
    []
  );
  useRealtimeRefresh(reload, 'admin-groups', [{ table: 'groups' }, { table: 'memberships' }]);

  return (
    <>
      <Link to="/admin/kelompok/baru" className="btn primary block admin-group-create">
        + Kelompok baru
      </Link>
      {loading && <Spinner text="Memuat kelompok…" />}
      {error && <ErrorBox error={error} onRetry={reload} />}
      {!loading && !error && data.length === 0 && <Empty icon="folder" title="Belum ada kelompok">Buat kelompok arisan uang atau paket lebaran.</Empty>}
      {!loading && !error && data.map((g) => (
        <Link key={g.id} to={`/admin/kelompok/${g.id}`} className="card link">
          <div className="card-head">
            <div>
              <h3>{g.name}</h3>
              <span className={`badge type ${g.type}`}>{typeLabel(g)}</span>
              {g.type === 'paket' && <span className="badge off" style={{ marginLeft: 6 }}>{g.pay_period}</span>}
            </div>
            <span className={`badge ${g.is_open ? 'ok' : 'off'}`}>{g.is_open ? 'Dibuka' : 'Ditutup'}</span>
          </div>
          <div className="muted small">
            {rupiah(g.nominal)} · {g.durasi}× · {g.memberships?.[0]?.count ?? 0} pendaftar
          </div>
        </Link>
      ))}
    </>
  );
}

/* ---------------- Peserta ---------------- */
function People({ revision }) {
  const { session } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(0);
  const [busyId, setBusyId] = useState(null);
  const [avatarBatch, setAvatarBatch] = useState({ urls: new Map(), failed: false });
  const { data: result, loading, error, reload } = useAsync(async () => {
    const rows = await q(supabase.rpc('admin_people_page', {
      p_search: debouncedSearch,
      p_offset: page * ADMIN_PAGE_SIZE,
      p_limit: ADMIN_PAGE_SIZE,
    }));
    return {
      items: rows.map(({ total_count: _totalCount, ...person }) => person),
      total: Number(rows[0]?.total_count) || 0,
    };
  }, [revision, debouncedSearch, page]);

  useEffect(() => {
    let active = true;
    const paths = [...new Set((result?.items || []).map((person) => person.avatar_path).filter(Boolean))];
    setAvatarBatch({ urls: new Map(), failed: false });
    if (!paths.length) return () => { active = false; };

    signedUrls('profile-avatars', paths)
      .then(({ urls, errors }) => {
        if (!active) return;
        if (errors.length) {
          errors.forEach(({ path, message }) => {
            console.error(`Gagal membuat URL foto profil (${path}): ${message}`);
          });
        }
        setAvatarBatch({ urls, failed: false });
      })
      .catch((avatarError) => {
        if (!active) return;
        console.error('Gagal memuat URL foto profil peserta admin:', avatarError);
        setAvatarBatch({ urls: new Map(), failed: true });
      });

    return () => { active = false; };
  }, [result?.items]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setPage(0);
      setDebouncedSearch(search.trim());
    }, 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  async function toggleRole(p) {
    const next = p.role === 'admin' ? 'peserta' : 'admin';
    const accepted = await confirm({
      title: next === 'admin' ? 'Jadikan admin?' : 'Cabut hak admin?',
      message: `${next === 'admin' ? 'Jadikan' : 'Cabut hak admin untuk'} ${p.full_name || 'peserta ini'}?`,
      confirmLabel: next === 'admin' ? 'Jadikan admin' : 'Cabut hak',
    });
    if (!accepted) return;
    setBusyId(p.id);
    try {
      const { error } = await supabase.from('profiles').update({ role: next }).eq('id', p.id);
      if (error) toast(error.message, 'error');
    } finally {
      setBusyId(null);
    }
  }

  async function reviewAccount(p, accountStatus) {
    if (accountStatus === 'ditolak') {
      const accepted = await confirm({
        title: 'Tolak verifikasi akun?',
        message: `Verifikasi akun ${p.full_name || 'peserta ini'} akan ditolak.`,
        confirmLabel: 'Tolak',
      });
      if (!accepted) return;
    }
    setBusyId(p.id);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ account_status: accountStatus })
        .eq('id', p.id);
      if (error) return toast(error.message, 'error');
      toast(accountStatus === 'disetujui' ? 'Akun peserta disetujui.' : 'Verifikasi akun ditolak.', 'success');
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <Spinner />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;

  return (
    <>
      <input
        type="search"
        aria-label="Cari nama atau nomor telepon peserta"
        placeholder="Cari nama / nomor telepon…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      {result.total === 0 && (
        <Empty
          icon="search"
          title={search.trim() ? 'Tidak ada peserta yang cocok' : 'Belum ada peserta'}
        >
          {search.trim()
            ? 'Periksa nama atau nomor telepon, atau ubah pencarian.'
            : 'Belum ada akun peserta untuk ditampilkan.'}
        </Empty>
      )}
      {result.items.map((p) => (
        <div key={p.id} className="card admin-person-card">
          <div className="admin-person-row">
            {p.avatar_path
              ? avatarBatch.urls.has(p.avatar_path)
                ? <SignedImage bucket="profile-avatars" path={p.avatar_path} alt={`Foto ${p.full_name}`} className="avatar admin-person-photo" signedUrlOverride={avatarBatch.urls.get(p.avatar_path)} />
                : avatarBatch.failed
                  ? <SignedImage bucket="profile-avatars" path={p.avatar_path} alt={`Foto ${p.full_name}`} className="avatar admin-person-photo" />
                  : <div className="avatar">{initial(p.full_name)}</div>
              : <div className="avatar">{initial(p.full_name)}</div>}
            <div className="admin-person-info">
              <div className="admin-person-name-line">
                <span className="admin-person-identity">
                  <b>{p.full_name}</b>
                  {p.role === 'admin' && <span className="badge gold">Admin</span>}
                </span>
                <span className={`badge ${p.account_status === 'disetujui' ? 'ok' : p.account_status === 'ditolak' ? 'bad' : 'wait'}`}>
                  {p.account_status === 'disetujui' ? 'Terverifikasi' : p.account_status === 'ditolak' ? 'Ditolak' : 'Menunggu verifikasi'}
                </span>
              </div>
              <div className="muted small">{p.phone}</div>
            </div>
            {p.id !== session.user.id && (
              <button
                className="admin-role-button"
                type="button"
                disabled={busyId === p.id}
                onClick={() => toggleRole(p)}
                aria-label={p.role === 'admin' ? `Cabut hak admin ${p.full_name}` : `Jadikan ${p.full_name} admin`}
                title={p.role === 'admin' ? 'Cabut hak admin' : 'Jadikan admin'}
              >
                <Icon name={busyId === p.id ? 'clock' : p.role === 'admin' ? 'userMinus' : 'userPlus'} size={18} />
              </button>
            )}
          </div>
          {p.account_status !== 'disetujui' && (
            <div className="actions admin-person-actions">
              <button type="button" className="btn primary sm" disabled={busyId === p.id} onClick={() => reviewAccount(p, 'disetujui')}>
                {busyId === p.id ? 'Memproses…' : 'Terima peserta'}
              </button>
              {p.account_status !== 'ditolak' && (
                <button type="button" className="btn danger sm" disabled={busyId === p.id} onClick={() => reviewAccount(p, 'ditolak')}>
                  Tolak
                </button>
              )}
            </div>
          )}
        </div>
      ))}
      <AdminPagination page={page} pageSize={ADMIN_PAGE_SIZE} total={result.total} onPageChange={setPage} />
    </>
  );
}