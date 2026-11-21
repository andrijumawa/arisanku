import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { supabase, q } from '../../lib/supabase';
import { useAsync, useRealtimeRefresh } from '../../lib/hooks';
import { bestPaymentByPeriod, fmtDate, paymentDueDate, periodName, typeLabel, withdrawalDate } from '../../lib/format';
import { Badge, Empty, ErrorBox, Progress, Spinner } from '../../components/Ui.jsx';
import GroupInfo from '../../components/GroupInfo.jsx';
import { useToast } from '../../components/Toast.jsx';
import Icon from '../../components/Icon.jsx';
import { useConfirm } from '../../components/Confirm.jsx';

export default function AdminGroup() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
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
    const rounds = await q(
      supabase.from('rounds').select('id,round_no,winner_user_id,pickup_date,status').eq('group_id', id).order('round_no')
    );
    const rouletteDraws = await q(
      supabase.from('roulette_draws').select('id,period_no,participants').eq('group_id', id).order('period_no')
    );
    const pays = await q(supabase.from('payments').select('membership_id,period_no,status').eq('group_id', id));
    return { group, members, rounds, rouletteDraws, pays };
  }, [id]);
  const realtimeSubscriptions = useMemo(
    () => [
      { table: 'groups', filter: `id=eq.${id}` },
      { table: 'memberships', filter: `group_id=eq.${id}` },
      { table: 'rounds', filter: `group_id=eq.${id}` },
      { table: 'roulette_draws', filter: `group_id=eq.${id}` },
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

  const { group: g, members, rounds, rouletteDraws, pays } = data;
  const isUang = g.type === 'uang';
  const rouletteRounds = rouletteDraws.flatMap((draw) => {
    const participants = draw.participants || [];
    return participants
      .slice(0, participants.length === 2 ? 2 : 1)
      .map((participant, index) => {
        const roundNo = draw.period_no + index;
        const existingRound = rounds.find(
          (round) => round.round_no === roundNo && round.winner_user_id === participant.user_id
        );
        return existingRound || {
          id: null,
          round_no: roundNo,
          winner_user_id: participant.user_id,
          pickup_date: withdrawalDate(g.start_date, g.pay_period, roundNo),
          status: 'dijadwalkan',
        };
      });
  });
  const displayedRounds = [
    ...rouletteRounds,
    ...rounds.filter((round) => !rouletteRounds.some((rouletteRound) => rouletteRound.round_no === round.round_no)),
  ].sort((a, b) => a.round_no - b.round_no);
  const approvedOf = (mid) => pays.filter((p) => p.membership_id === mid && p.status === 'disetujui').length;
  const today = new Date();
  const todayString = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const paymentsByMember = new Map();
  pays.forEach((payment) => {
    const memberPayments = paymentsByMember.get(payment.membership_id) || [];
    memberPayments.push(payment);
    paymentsByMember.set(payment.membership_id, memberPayments);
  });
  const overduePeriodsOf = (member) => {
    if (member.status !== 'aktif') return [];
    const memberPayments = bestPaymentByPeriod(paymentsByMember.get(member.id));
    return Array.from({ length: g.durasi }, (_, index) => index + 1).flatMap((periodNo) => {
      const payment = memberPayments[periodNo];
      if (payment?.status === 'disetujui' || payment?.status === 'menunggu') return [];
      const dueDate = paymentDueDate(g.start_date, g.pay_period, periodNo);
      return dueDate && dueDate < todayString ? [{ periodNo, dueDate }] : [];
    });
  };
  const nextPaymentScheduleOf = (member) => {
    if (member.status !== 'aktif') return null;
    const memberPayments = bestPaymentByPeriod(paymentsByMember.get(member.id));
    const periodNo = Array.from({ length: g.durasi }, (_, index) => index + 1)
      .find((period) => memberPayments[period]?.status !== 'disetujui');
    const winningRounds = isUang
      ? displayedRounds.filter((round) => round.winner_user_id === member.user_id).sort((a, b) => a.round_no - b.round_no)
      : [];
    return {
      periodNo,
      payment: periodNo ? memberPayments[periodNo] : null,
      dueDate: periodNo ? paymentDueDate(g.start_date, g.pay_period, periodNo) : null,
      winningRounds,
    };
  };
  const overdueByMember = new Map(members.map((member) => [member.id, overduePeriodsOf(member)]));
  const paymentScheduleByMember = new Map(members.map((member) => [member.id, nextPaymentScheduleOf(member)]));
  const overdueMemberCount = [...overdueByMember.values()].filter((periods) => periods.length > 0).length;
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
    run(r.id || `round-${r.round_no}`, () => (
      r.id
        ? supabase.from('rounds').update(patch).eq('id', r.id)
        : supabase.from('rounds').insert({
            group_id: id,
            round_no: r.round_no,
            winner_user_id: r.winner_user_id,
            pickup_date: withdrawalDate(g.start_date, g.pay_period, r.round_no) || r.pickup_date,
            status: r.status,
            ...patch,
          })
    ), msg);

  const toggleOpen = () =>
    run('open', () => supabase.from('groups').update({ is_open: !g.is_open }).eq('id', id), g.is_open ? 'Pendaftaran ditutup.' : 'Pendaftaran dibuka.');

  async function removeGroup() {
    const accepted = await confirm({
      title: 'Hapus kelompok?',
      message: `Kelompok "${g.name}" beserta semua pendaftaran dan pembayarannya akan dihapus permanen.`,
      confirmLabel: 'Hapus kelompok',
    });
    if (!accepted) return;
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

          {displayedRounds.length === 0 ? (
            <div className="card">
              <div className="muted small" style={{ marginBottom: 8 }}>Belum ada hasil putaran. Pemilihan pemenang dilakukan melalui menu Kocokan.</div>
              <Link to="/rolet" className="btn gold block">
                <Icon name="dice" size={18} /> Buka Kocokan
              </Link>
            </div>
          ) : (
            <div className="card">
              {displayedRounds.map((r) => (
                <div key={r.id || `round-${r.round_no}`} className="period-row" style={{ alignItems: 'flex-start' }}>
                  <div className="period-no">{r.round_no}</div>
                  <div style={{ flex: 1 }}>
                    <b>{nameOf[r.winner_user_id] || 'Peserta'}</b>
                    <div className="row wrap" style={{ marginTop: 6 }}>
                      <label className="muted small">
                        Tanggal pencairan
                        <input
                          type="date"
                          style={{ width: 'auto', padding: '6px 8px', marginLeft: 8 }}
                          value={r.pickup_date || withdrawalDate(g.start_date, g.pay_period, r.round_no) || ''}
                          onChange={(e) => setRound(r, { pickup_date: e.target.value || null }, 'Tanggal pencairan disimpan.')}
                          aria-label={`Tanggal pencairan putaran ke-${r.round_no}`}
                        />
                      </label>
                      <Badge status={r.status} />
                    </div>
                  </div>
                  {r.status !== 'diserahkan' && (
                    <button className="btn sm" disabled={busyId === (r.id || `round-${r.round_no}`)} onClick={() => setRound(r, { status: 'diserahkan' }, 'Ditandai diserahkan.')}>
                      Diserahkan
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <div className="row between section-title">
        <span>Peserta ({members.length})</span>
        {overdueMemberCount > 0 && (
          <span className="badge bad">{overdueMemberCount} menunggak</span>
        )}
      </div>
      {members.length === 0 && <Empty icon="users" title="Belum ada pendaftar" />}
      {members.map((m) => (
        <div key={m.id} className="card">
          <div className="person">
            <div className="avatar">{(m.profiles?.full_name || '?').charAt(0).toUpperCase()}</div>
            <div style={{ flex: 1 }}>
              <b>{m.profiles?.full_name}</b>
              <div className="muted small">
                {m.profiles?.phone}
                {isUang && ` · ${m.slot_count} slot`}
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

          {paymentScheduleByMember.get(m.id) && (
            <details className="admin-payment-schedule">
              <summary>Jadwal pembayaran &amp; penarikan</summary>
              <table>
                <tbody>
                  {paymentScheduleByMember.get(m.id).periodNo && (
                    <>
                      <tr>
                        <th scope="row">{periodName(g)}</th>
                        <td>Ke-{paymentScheduleByMember.get(m.id).periodNo}</td>
                      </tr>
                      <tr>
                        <th scope="row">Jatuh tempo</th>
                        <td>{fmtDate(paymentScheduleByMember.get(m.id).dueDate)}</td>
                      </tr>
                    </>
                  )}
                  {paymentScheduleByMember.get(m.id).payment && (
                    <tr>
                      <th scope="row">Status</th>
                      <td>
                        {paymentScheduleByMember.get(m.id).payment.status === 'menunggu'
                          ? 'Bukti menunggu verifikasi'
                          : 'Bukti ditolak'}
                      </td>
                    </tr>
                  )}
                  {paymentScheduleByMember.get(m.id).winningRounds.map((round) => (
                    <tr key={round.id} className={round.status === 'diserahkan' ? 'withdrawal-inactive' : ''}>
                      <th scope="row">Penarikan putaran ke-{round.round_no}</th>
                      <td>
                        {fmtDate(round.pickup_date || withdrawalDate(g.start_date, g.pay_period, round.round_no))}
                        {round.status === 'diserahkan' && <span className="withdrawal-state">Sudah diterima</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!paymentScheduleByMember.get(m.id).periodNo && paymentScheduleByMember.get(m.id).winningRounds.length === 0 && (
                <p className="muted small">Belum ada jadwal pembayaran atau hasil rolet.</p>
              )}
            </details>
          )}

          {(overdueByMember.get(m.id) || []).length > 0 && (
            <div className="admin-payment-overdue" role="status">
              <Icon name="clock" size={16} aria-hidden="true" />
              <span>
                <b>Belum bayar:</b>{' '}
                {overdueByMember.get(m.id).map(({ periodNo, dueDate }, index) => (
                  <span key={periodNo}>
                    {index > 0 && ', '}
                    {periodName(g).toLowerCase()} ke-{periodNo} (jatuh tempo {fmtDate(dueDate)})
                  </span>
                ))}
              </span>
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
