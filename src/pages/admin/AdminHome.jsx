import { useCallback, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../lib/auth.jsx';
import { supabase, q } from '../../lib/supabase';
import { useAsync, useRealtimeRefresh } from '../../lib/hooks';
import { fmtDate, rupiah, typeLabel } from '../../lib/format';
import { Badge, Empty, ErrorBox, Spinner } from '../../components/Ui.jsx';
import SignedImage from '../../components/SignedImage.jsx';
import { useToast } from '../../components/Toast.jsx';

const initial = (s) => (s || '?').trim().charAt(0).toUpperCase();

export default function AdminHome() {
  const [params, setParams] = useSearchParams();
  const [listRevisions, setListRevisions] = useState({ registrations: 0, payments: 0 });
  const tab = params.get('tab') || 'daftar';
  const { data, loading, error, reload } = useAsync(async () => {
    const [pendingMem, pendingPay] = await Promise.all([
      supabase.from('memberships').select('id', { count: 'exact', head: true }).eq('status', 'menunggu'),
      supabase.from('payments').select('id', { count: 'exact', head: true }).eq('status', 'menunggu'),
    ]);
    if (pendingMem.error) throw pendingMem.error;
    if (pendingPay.error) throw pendingPay.error;
    return { mem: pendingMem.count || 0, pay: pendingPay.count || 0 };
  }, []);
  const onRealtimeChange = useCallback((tables) => {
    setListRevisions((current) => ({
      registrations: current.registrations + Number(tables.includes('memberships')),
      payments: current.payments + Number(tables.includes('payments')),
    }));
  }, []);
  useRealtimeRefresh(reload, 'admin-counts', [{ table: 'memberships' }, { table: 'payments' }], true, onRealtimeChange);

  const tabs = [
    ['daftar', 'Pendaftaran', data?.mem],
    ['bayar', 'Pembayaran', data?.pay],
    ['kelompok', 'Kelompok'],
    ['peserta', 'Peserta'],
  ];

  return (
    <>
      <h2>Panel Admin</h2>
      <div className="tabs">
        {tabs.map(([k, label, n]) => (
          <button key={k} className={`tab ${tab === k ? 'on' : ''}`} onClick={() => setParams({ tab: k })}>
            {label}
            {n > 0 && <i>{n}</i>}
          </button>
        ))}
      </div>
      {error && <ErrorBox error={error} onRetry={reload} />}
      {loading && !data && <Spinner />}
      {tab === 'daftar' && <Registrations revision={listRevisions.registrations} />}
      {tab === 'bayar' && <Payments revision={listRevisions.payments} />}
      {tab === 'kelompok' && <Groups />}
      {tab === 'peserta' && <People />}
    </>
  );
}

/* ---------------- Pendaftaran ---------------- */
function Registrations({ revision }) {
  const toast = useToast();
  const [busyId, setBusyId] = useState(null);
  const { data, loading, error, reload } = useAsync(
    () =>
      q(
        supabase
          .from('memberships')
      .select('id,user_id,slot_count,status,created_at,profiles(full_name,phone),groups(name,type,nominal,package_type)')
          .eq('status', 'menunggu')
          .order('created_at')
      ),
    [revision]
  );
  useRealtimeRefresh(
    reload,
    'admin-registrations',
    [{ table: 'profiles' }, { table: 'groups' }]
  );

  async function approve(m) {
    setBusyId(m.id);
    const { error } = await supabase.rpc('approve_membership', { p_membership: m.id });
    setBusyId(null);
    if (error) return toast(error.message, 'error');
    toast(`${m.profiles?.full_name} disetujui.`, 'success');
  }

  async function reject(m) {
    if (!window.confirm(`Tolak pendaftaran ${m.profiles?.full_name}?`)) return;
    setBusyId(m.id);
    const { error } = await supabase.from('memberships').update({ status: 'ditolak' }).eq('id', m.id);
    setBusyId(null);
    if (error) return toast(error.message, 'error');
  }

  if (loading) return <Spinner />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!data.length) return <Empty icon="check" title="Tidak ada pendaftaran menunggu" />;

  return data.map((m) => (
    <div key={m.id} className="card">
      <div className="person">
        <div className="avatar">{initial(m.profiles?.full_name)}</div>
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
      <div className="actions">
        <button className="btn primary sm" disabled={busyId === m.id} onClick={() => approve(m)}>
          Setujui
        </button>
        <button className="btn danger sm" disabled={busyId === m.id} onClick={() => reject(m)}>
          Tolak
        </button>
      </div>
    </div>
  ));
}

/* ---------------- Pembayaran ---------------- */
function Payments({ revision }) {
  const { session } = useAuth();
  const toast = useToast();
  const [busyId, setBusyId] = useState(null);
  const { data, loading, error, reload } = useAsync(
    () =>
      q(
        supabase
          .from('payments')
          .select('id,amount,period_no,created_at,proof_path,group_id,membership_id,status,groups(name,type,pay_period),memberships(slot_count,profiles(full_name,phone))')
          .eq('status', 'menunggu')
          .order('created_at')
      ),
    [revision]
  );
  useRealtimeRefresh(
    reload,
    'admin-payments',
    [{ table: 'groups' }, { table: 'profiles' }]
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
  if (!data.length) return <Empty icon="check" title="Tidak ada pembayaran menunggu" />;

  return data.map((p) => {
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
        <div className="small" style={{ margin: '10px 0' }}>
          {p.groups?.name} · periode ke-{p.period_no} · {fmtDate(p.created_at)}
        </div>
        <SignedImage bucket="bukti-transfer" path={p.proof_path} alt="Bukti transfer" className="thumb" />
        <div className="actions">
          <button className="btn primary sm" disabled={busyId === p.id} onClick={() => review(p, 'disetujui')}>
            Setujui
          </button>
          <button className="btn danger sm" disabled={busyId === p.id} onClick={() => review(p, 'ditolak')}>
            Tolak
          </button>
        </div>
      </div>
    );
  });
}

/* ---------------- Kelompok ---------------- */
function Groups() {
  const { data, loading, error, reload } = useAsync(
    () => q(supabase.from('groups').select('id,type,name,nominal,durasi,pay_period,package_type,is_open,created_at,memberships(count)').order('created_at', { ascending: false })),
    []
  );
  useRealtimeRefresh(reload, 'admin-groups', [{ table: 'groups' }, { table: 'memberships' }]);

  if (loading) return <Spinner />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;

  return (
    <>
      <Link to="/admin/kelompok/baru" className="btn primary block" style={{ marginBottom: 12 }}>
        + Kelompok baru
      </Link>
      {data.length === 0 && <Empty icon="folder" title="Belum ada kelompok">Buat kelompok arisan uang atau paket lebaran.</Empty>}
      {data.map((g) => (
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
function People() {
  const { session } = useAuth();
  const toast = useToast();
  const [search, setSearch] = useState('');
  const { data, loading, error, reload } = useAsync(
    () => q(supabase.from('profiles').select('id,full_name,phone,role,created_at').order('created_at', { ascending: false })),
    []
  );
  useRealtimeRefresh(reload, 'admin-people', [{ table: 'profiles' }]);

  const list = useMemo(() => {
    const s = search.trim().toLowerCase();
    return (data || []).filter((p) => !s || p.full_name.toLowerCase().includes(s) || p.phone.includes(s));
  }, [data, search]);

  async function toggleRole(p) {
    const next = p.role === 'admin' ? 'peserta' : 'admin';
    if (!window.confirm(`${next === 'admin' ? 'Jadikan' : 'Cabut hak admin'} ${p.full_name}?`)) return;
    const { error } = await supabase.from('profiles').update({ role: next }).eq('id', p.id);
    if (error) return toast(error.message, 'error');
  }

  if (loading) return <Spinner />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;

  return (
    <>
      <input placeholder="Cari nama / nomor telepon…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ marginBottom: 12 }} />
      <div className="muted small" style={{ margin: '0 2px 8px' }}>
        {list.length} peserta
      </div>
      {list.map((p) => (
        <div key={p.id} className="card">
          <div className="person">
            <div className="avatar">{initial(p.full_name)}</div>
            <div style={{ flex: 1 }}>
              <b>{p.full_name}</b>
              <div className="muted small">{p.phone}</div>
            </div>
            {p.role === 'admin' && <span className="badge gold">Admin</span>}
            {p.id !== session.user.id && (
              <button className="btn sm" onClick={() => toggleRole(p)}>
                {p.role === 'admin' ? 'Cabut admin' : 'Jadikan admin'}
              </button>
            )}
          </div>
        </div>
      ))}
    </>
  );
}
