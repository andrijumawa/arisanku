import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { supabase, q } from '../../lib/supabase';
import { useAsync, useRealtimeRefresh } from '../../lib/hooks';
import { periodName, typeLabel } from '../../lib/format';
import { Badge, Empty, ErrorBox, Progress, Spinner } from '../../components/Ui.jsx';
import GroupInfo from '../../components/GroupInfo.jsx';
import { useToast } from '../../components/Toast.jsx';
import Icon from '../../components/Icon.jsx';

export default function AdminGroup() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const [busyId, setBusyId] = useState(null);

  const { data, loading, error, reload } = useAsync(async () => {
    const group = await q(
      supabase
        .from('groups')
        .select('id,type,name,description,nominal,durasi,max_slots,draw_mode,pay_period,package_type,package_detail,start_date,end_date,pickup_date,is_open')
        .eq('id', id)
        .single()
    );
    const members = await q(
      supabase.from('memberships').select('id,user_id,slot_count,status,profiles(full_name,phone)').eq('group_id', id).order('created_at')
    );
    const slots = await q(supabase.from('slots').select('id,membership_id,slot_no').eq('group_id', id).order('slot_no'));
    const rounds = await q(
      supabase.from('rounds').select('id,round_no,winner_user_id,pickup_date,status').eq('group_id', id).order('round_no')
    );
    const pays = await q(supabase.from('payments').select('membership_id,status').eq('group_id', id));
    return { group, members, slots, rounds, pays };
  }, [id]);
  const realtimeSubscriptions = useMemo(
    () => [
      { table: 'groups', filter: `id=eq.${id}` },
      { table: 'memberships', filter: `group_id=eq.${id}` },
      { table: 'slots', filter: `group_id=eq.${id}` },
      { table: 'rounds', filter: `group_id=eq.${id}` },
      { table: 'payments', filter: `group_id=eq.${id}` },
      ...[...new Set((data?.members || []).map((m) => m.user_id).filter(Boolean))].map((userId) => ({
        table: 'profiles',
        filter: `id=eq.${userId}`,
      })),
    ],
    [data?.members, id]
  );
  useRealtimeRefresh(reload, `admin-group-${id}`, realtimeSubscriptions);

  const nameOf = useMemo(() => {
    const map = {};
    (data?.members || []).forEach((m) => (map[m.user_id] = m.profiles?.full_name));
    return map;
  }, [data]);

  if (loading) return <Spinner />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;

  const { group: g, members, slots, rounds, pays } = data;
  const isUang = g.type === 'uang';
  const approvedOf = (mid) => pays.filter((p) => p.membership_id === mid && p.status === 'disetujui').length;
  const slotsOf = (mid) => slots.filter((s) => s.membership_id === mid).map((s) => s.slot_no);
  async function run(key, fn, okMsg) {
    setBusyId(key);
    try {
      const { error } = await fn();
      if (error) throw error;
      if (okMsg) toast(okMsg, 'success');
    } catch (x) {
      toast(x.message || 'Gagal', 'error');
    } finally {
      setBusyId(null);
    }
  }

  const approve = (m) =>
    run(m.id, () => supabase.rpc('approve_membership', { p_membership: m.id }), `${m.profiles?.full_name} diaktifkan.`);
  const setStatus = (m, status) =>
    run(m.id, () => supabase.from('memberships').update({ status }).eq('id', m.id), 'Status diperbarui.');

  const setRound = (r, patch, msg) =>
    run(r.id, () => supabase.from('rounds').update(patch).eq('id', r.id), msg);

  const toggleOpen = () =>
    run('open', () => supabase.from('groups').update({ is_open: !g.is_open }).eq('id', id), g.is_open ? 'Pendaftaran ditutup.' : 'Pendaftaran dibuka.');

  async function removeGroup() {
    if (!window.confirm(`Hapus kelompok "${g.name}" beserta semua pendaftaran & pembayarannya? Tindakan ini tidak bisa dibatalkan.`)) return;
    const { error } = await supabase.from('groups').delete().eq('id', id);
    if (error) return toast(error.message, 'error');
    toast('Kelompok dihapus.');
    nav('/admin?tab=kelompok', { replace: true });
  }

  return (
    <>
      <Link to="/admin?tab=kelompok" className="small">
        <Icon name="back" size={16} /> Semua kelompok
      </Link>

      <div className="card" style={{ marginTop: 8 }}>
        <div className="card-head">
          <div>
            <h2 style={{ marginBottom: 4 }}>{g.name}</h2>
            <span className={`badge type ${g.type}`}>{typeLabel(g)}</span>
            {!isUang && <span className="badge off" style={{ marginLeft: 6 }}>{g.pay_period}</span>}
          </div>
          <span className={`badge ${g.is_open ? 'ok' : 'off'}`}>{g.is_open ? 'Dibuka' : 'Ditutup'}</span>
        </div>
        {g.description && <p className="muted small">{g.description}</p>}
        {!isUang && g.package_detail && <p className="small item-detail"><Icon name="gift" size={16} /> {g.package_detail}</p>}
        <GroupInfo g={g} />
        <div className="actions">
          <Link to={`/admin/kelompok/${id}/ubah`} className="btn sm">
            Ubah
          </Link>
          <button className="btn sm" disabled={busyId === 'open'} onClick={toggleOpen}>
            {g.is_open ? 'Tutup pendaftaran' : 'Buka pendaftaran'}
          </button>
          <button className="btn sm danger" onClick={removeGroup}>
            Hapus
          </button>
        </div>
      </div>

      {isUang && (
        <>

          <div className="section-title">Hasil undian putaran</div>

          {rounds.length === 0 ? (
            <div className="card">
              <div className="muted small" style={{ marginBottom: 8 }}>Belum ada hasil putaran. Pemilihan pemenang dilakukan melalui menu Kocokan.</div>
              <Link to="/rolet" className="btn gold block">
                <Icon name="dice" size={18} /> Buka Kocokan
              </Link>
            </div>
          ) : (
            <div className="card">
              {rounds.map((r) => (
                <div key={r.id} className="period-row" style={{ alignItems: 'flex-start' }}>
                  <div className="period-no">{r.round_no}</div>
                  <div style={{ flex: 1 }}>
                    <b>{nameOf[r.winner_user_id] || 'Peserta'}</b>
                    <div className="row wrap" style={{ marginTop: 6 }}>
                      <input
                        type="date"
                        style={{ width: 'auto', padding: '6px 8px' }}
                        value={r.pickup_date || ''}
                        onChange={(e) => setRound(r, { pickup_date: e.target.value || null }, 'Tanggal pengambilan disimpan.')}
                      />
                      <Badge status={r.status} />
                    </div>
                  </div>
                  {r.status !== 'diserahkan' && (
                    <button className="btn sm" disabled={busyId === r.id} onClick={() => setRound(r, { status: 'diserahkan' }, 'Ditandai diserahkan.')}>
                      Diserahkan
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <div className="section-title">Peserta ({members.length})</div>
      {members.length === 0 && <Empty icon="users" title="Belum ada pendaftar" />}
      {members.map((m) => (
        <div key={m.id} className="card">
          <div className="person">
            <div className="avatar">{(m.profiles?.full_name || '?').charAt(0).toUpperCase()}</div>
            <div style={{ flex: 1 }}>
              <b>{m.profiles?.full_name}</b>
              <div className="muted small">
                {m.profiles?.phone}
                {isUang && ` · ${m.slot_count} slot${slotsOf(m.id).length ? ` (#${slotsOf(m.id).join(', #')})` : ''}`}
              </div>
            </div>
            <Badge status={m.status} />
          </div>

          {m.status !== 'menunggu' && m.status !== 'ditolak' && (
            <div style={{ marginTop: 10 }}>
              <Progress value={approvedOf(m.id)} max={g.durasi} />
              <div className="muted small" style={{ marginTop: 4 }}>
                Lunas {approvedOf(m.id)} dari {g.durasi} {periodName(g).toLowerCase()}
              </div>
            </div>
          )}

          <div className="actions">
            {(m.status === 'menunggu' || m.status === 'ditolak') && (
              <button className="btn primary sm" disabled={busyId === m.id} onClick={() => approve(m)}>
                Setujui
              </button>
            )}
            {m.status === 'menunggu' && (
              <button className="btn danger sm" disabled={busyId === m.id} onClick={() => setStatus(m, 'ditolak')}>
                Tolak
              </button>
            )}
            {m.status === 'aktif' && (
              <button className="btn sm" disabled={busyId === m.id} onClick={() => setStatus(m, 'nonaktif')}>
                Nonaktifkan
              </button>
            )}
            {m.status === 'nonaktif' && (
              <button className="btn primary sm" disabled={busyId === m.id} onClick={() => approve(m)}>
                Aktifkan
              </button>
            )}
          </div>
        </div>
      ))}

      <p className="muted small center">
        Bukti transfer yang menunggu diperiksa di tab <b>Pembayaran</b> pada Panel Admin.
      </p>
    </>
  );
}
