import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { supabase } from '../lib/supabase';
import { useAsync, useRealtimeRefresh } from '../lib/hooks';
import { loadHomeData } from '../lib/menuData';
import { bestPaymentByPeriod, fmtDate, paymentDueDate, periodName, periodUnit, rupiah, typeLabel, withdrawalDate } from '../lib/format';
import { Badge, Empty, ErrorBox, Progress, Spinner } from '../components/Ui.jsx';
import Icon from '../components/Icon.jsx';
import Modal from '../components/Modal.jsx';
import { useToast } from '../components/Toast.jsx';
import { useConfirm } from '../components/Confirm.jsx';

function realtimeListSubscription(table, field, values) {
  const ids = [...new Set(values.filter(Boolean))];
  if (!ids.length) return [];
  const filter = ids.length === 1
    ? `${field}=eq.${ids[0]}`
    : ids.length <= 100
      ? `${field}=in.(${ids.join(',')})`
      : null;
  return [{ table, ...(filter ? { filter } : {}) }];
}

function AvailableGroupCard({ group, membership, remainingSlots, availabilityError, onSelect }) {
  const isMoney = group.type === 'uang';
  const statusClass = membership?.status === 'menunggu'
    ? ' is-pending'
    : membership?.status === 'aktif'
      ? ' is-active'
    : membership?.status === 'ditolak'
      ? ' is-rejected'
      : membership?.status === 'nonaktif'
        ? ' is-inactive'
        : '';
  const action = membership?.status === 'menunggu'
    ? 'Menunggu persetujuan'
    : membership?.status === 'ditolak'
      ? 'Pendaftaran ditolak'
      : membership?.status === 'nonaktif'
        ? 'Keanggotaan nonaktif'
        : membership?.status === 'aktif'
          ? 'Sudah bergabung'
        : 'Lihat & daftar';

  return (
    <button
      type="button"
      className={`home-offer-card${statusClass}`}
      onClick={() => onSelect(group, membership)}
    >
      <span className={`home-offer-icon ${isMoney ? 'money' : 'package'}`}>
        <Icon name={isMoney ? 'coin' : 'gift'} size={21} />
      </span>
      <span className="home-offer-copy">
        <span className="home-offer-type">{typeLabel(group)}</span>
        <strong>{group.name}</strong>
        <span className="home-offer-summary">
          {rupiah(group.nominal)} / {periodUnit(group)} · {group.durasi} kali
          {group.type === 'uang' && group.max_slots != null
            ? ` · ${availabilityError ? 'ketersediaan slot belum dimuat' : `${remainingSlots} slot tersisa`}`
            : ''}
        </span>
      </span>
      <span className="home-offer-state">
        {membership ? <Badge status={membership.status} /> : <Icon name="arrowRight" size={18} />}
        <small className={membership?.status === 'menunggu' ? 'text-pending' : ''}>{action}</small>
      </span>
    </button>
  );
}

export default function Home() {
  const { profile, session } = useAuth();
  const uid = session.user.id;
  const toast = useToast();
  const confirm = useConfirm();
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [slots, setSlots] = useState(1);
  const [busy, setBusy] = useState(false);

  const { data, loading, error, reload } = useAsync(loadHomeData, [uid]);
  const displayedData = data;
  const homeData = useMemo(() => {
    if (!displayedData) return null;
    const {
      ms = [],
      groups = [],
      availability = [],
      pays = [],
      rounds = [],
      rouletteDraws = [],
    } = displayedData;
    const membershipByGroup = Object.fromEntries(ms.map((membership) => [membership.group_id, membership]));
    const reservedSlotsByGroup = Object.fromEntries(
      availability.map((item) => [item.group_id, Number(item.reserved_slots) || 0])
    );
    const paymentsByMembership = new Map();
    pays.forEach((payment) => {
      const membershipPayments = paymentsByMembership.get(payment.membership_id) || [];
      membershipPayments.push(payment);
      paymentsByMembership.set(payment.membership_id, membershipPayments);
    });
    const roundsByGroup = new Map();
    rounds.forEach((round) => {
      const groupRounds = roundsByGroup.get(round.group_id) || [];
      groupRounds.push(round);
      roundsByGroup.set(round.group_id, groupRounds);
    });
    const rouletteDrawsByGroup = new Map();
    rouletteDraws.forEach((draw) => {
      const groupDraws = rouletteDrawsByGroup.get(draw.group_id) || [];
      groupDraws.push(draw);
      rouletteDrawsByGroup.set(draw.group_id, groupDraws);
    });
    const activeMemberships = ms.filter((membership) => membership.status === 'aktif');
    const offerGroups = groups.filter((group) => (
      (group.is_open
        && (group.type !== 'uang' || group.max_slots == null
          || displayedData.availabilityError
          || Number(group.max_slots) - (reservedSlotsByGroup[group.id] || 0) > 0))
      || (membershipByGroup[group.id] && membershipByGroup[group.id].status !== 'aktif')
    ));
    return {
      ms,
      availabilityError: displayedData.availabilityError,
      groupsError: displayedData.groupsError,
      rounds,
      membershipByGroup,
      reservedSlotsByGroup,
      paymentsByMembership,
      roundsByGroup,
      rouletteDrawsByGroup,
      activeMemberships,
      offerGroups,
      aktif: activeMemberships.length,
      menungguDaftar: ms.filter((membership) => membership.status === 'menunggu').length,
      menungguBayar: pays.filter((payment) => payment.status === 'menunggu').length,
    };
  }, [displayedData]);
  const availabilityGroupIds = useMemo(() => [...new Set([
    ...(displayedData?.groups || []).filter((group) => group.is_open).map((group) => group.id),
    ...(displayedData?.ms || [])
      .filter((membership) => membership.status !== 'aktif')
      .map((membership) => membership.group_id),
  ].filter(Boolean))], [displayedData]);
  const hasScopedAvailabilityFilter = availabilityGroupIds.length > 0 && availabilityGroupIds.length <= 100;
  const availabilityFilter = hasScopedAvailabilityFilter
    ? availabilityGroupIds.length === 1
      ? `group_id=eq.${availabilityGroupIds[0]}`
      : `group_id=in.(${availabilityGroupIds.join(',')})`
    : null;
  const memberGroupIds = useMemo(
    () => [...new Set((displayedData?.ms || []).map((membership) => membership.group_id).filter(Boolean))],
    [displayedData]
  );
  const realtimeSubscriptions = useMemo(() => [
    { table: 'memberships', filter: `user_id=eq.${uid}` },
    ...(availabilityFilter
      ? [{ table: 'memberships', filter: availabilityFilter }]
      : availabilityGroupIds.length > 100 ? [{ table: 'memberships' }] : []),
    { table: 'groups' },
    ...(availabilityFilter
      ? [{ table: 'slots', filter: availabilityFilter }]
      : availabilityGroupIds.length > 100 ? [{ table: 'slots' }] : []),
    ...realtimeListSubscription('payments', 'membership_id', (displayedData?.ms || []).map((membership) => membership.id)),
    ...realtimeListSubscription('rounds', 'group_id', memberGroupIds),
    ...realtimeListSubscription('roulette_draws', 'group_id', memberGroupIds),
  ], [availabilityFilter, availabilityGroupIds.length, displayedData, memberGroupIds, uid]);
  useRealtimeRefresh(reload, `home-${uid}`, realtimeSubscriptions);

  if (loading && !displayedData) return <Spinner />;
  if (error && !displayedData) return <ErrorBox error={error} onRetry={reload} />;
  if (!homeData) return <Spinner />;

  const {
    ms,
    groupsError,
    availabilityError,
    rounds,
    membershipByGroup,
    reservedSlotsByGroup,
    paymentsByMembership,
    roundsByGroup,
    rouletteDrawsByGroup,
    activeMemberships,
    offerGroups,
    aktif,
    menungguDaftar,
    menungguBayar,
  } = homeData;

  async function submitRegistration() {
    if (!selectedGroup) return;
    setBusy(true);
    try {
      const { error: joinError } = await supabase.from('memberships').insert({
        group_id: selectedGroup.group.id,
        user_id: uid,
        slot_count: selectedGroup.group.type === 'uang' ? Math.max(1, Number(slots) || 1) : 1,
      });
      if (joinError) throw joinError;
      toast('Pendaftaran terkirim untuk diperiksa admin.', 'success');
      setSelectedGroup(null);
      setSlots(1);
      reload();
    } catch (joinError) {
      toast(joinError.message || 'Pendaftaran gagal dikirim.', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function cancelRegistration() {
    const membership = selectedGroup?.membership;
    if (!membership) return;
    const accepted = await confirm({
      title: 'Batalkan pendaftaran?',
      message: 'Pendaftaran Anda akan dibatalkan dan dapat diajukan kembali.',
      confirmLabel: 'Batalkan',
    });
    if (!accepted) return;
    setBusy(true);
    try {
      const { error: cancelError } = await supabase
        .from('memberships')
        .delete()
        .eq('id', membership.id)
        .eq('user_id', uid);
      if (cancelError) throw cancelError;
      toast('Pendaftaran dibatalkan.');
      setSelectedGroup(null);
      reload();
    } catch (cancelError) {
      toast(cancelError.message || 'Pendaftaran gagal dibatalkan.', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {error && <ErrorBox error={error} onRetry={reload} />}
      {(groupsError || availabilityError) && <ErrorBox error={groupsError || availabilityError} onRetry={reload} />}
      <h2>Halo, {profile?.full_name?.split(' ')[0] || 'Peserta'}</h2>

      <div className="stats">
        <div className="stat">
          <b>{aktif}</b>
          <span>Arisan aktif</span>
        </div>
        <div className="stat is-pending">
          <b>{menungguDaftar}</b>
          <span>Menunggu persetujuan</span>
        </div>
        <div className="stat is-pending">
          <b>{menungguBayar}</b>
          <span>Menunggu verifikasi</span>
        </div>
      </div>

      <section className="home-offers" aria-labelledby="home-offers-title">
        <div className="row between">
          <div className="section-title" id="home-offers-title" style={{ margin: '4px 2px 8px' }}>
            Kelompok tersedia
          </div>
          <Link to="/arisan" className="small">Lihat semua</Link>
        </div>
        {offerGroups.length > 0 ? (
          <div className="home-offer-list">
            {offerGroups.map((group) => (
              <AvailableGroupCard
                key={group.id}
                group={group}
                membership={membershipByGroup[group.id]}
                availabilityError={availabilityError}
                remainingSlots={availabilityError || group.max_slots == null
                  ? null
                  : Math.max(0, Number(group.max_slots) - (reservedSlotsByGroup[group.id] || 0))}
                onSelect={(selected, membership) => {
                  const remaining = availabilityError || selected.max_slots == null
                    ? null
                    : Math.max(0, Number(selected.max_slots) - (reservedSlotsByGroup[selected.id] || 0));
                  setSlots(1);
                  setSelectedGroup({
                    group: selected,
                    membership,
                    remainingSlots: remaining,
                    availabilityError,
                  });
                }}
              />
            ))}
          </div>
        ) : (
          <div className="home-offer-empty">Belum ada kelompok yang dibuka admin.</div>
        )}
      </section>

      <div className="row between">
        <div className="section-title" style={{ margin: '4px 2px 8px' }}>
          Arisan saya
        </div>
        <Link to="/arisan" className="small">
          + Ikut arisan
        </Link>
      </div>

      {activeMemberships.length === 0 ? (
        <Empty icon="target" title="Belum ada arisan aktif">
          Arisan yang sudah disetujui admin akan muncul di sini.
        </Empty>
      ) : (
        activeMemberships.map((m) => {
          const g = m.groups;
            const membershipPayments = paymentsByMembership.get(m.id) || [];
          const paymentsByPeriod = bestPaymentByPeriod(membershipPayments);
          const done = Object.values(paymentsByPeriod).filter((payment) => payment.status === 'disetujui').length;
          const nextPeriod = Array.from({ length: g.durasi }, (_, index) => index + 1)
            .find((period) => paymentsByPeriod[period]?.status !== 'disetujui');
          const dueDate = nextPeriod ? paymentDueDate(g.start_date, g.pay_period, nextPeriod) : null;
          const groupRounds = (roundsByGroup.get(g.id) || [])
            .filter((round) => round.winner_user_id === uid)
            .sort((a, b) => a.round_no - b.round_no);
          const rouletteRounds = (rouletteDrawsByGroup.get(g.id) || [])
            .flatMap((draw) => {
              const participants = draw.participants || [];
              return participants
                .slice(0, participants.length === 2 ? 2 : 1)
                .map((participant, index) => {
                  const roundNo = draw.period_no + index;
                  const existingRound = rounds.find(
                    (round) => round.group_id === g.id && round.round_no === roundNo
                      && round.winner_user_id === participant.user_id
                  );
                  return existingRound || {
                    id: `roulette-${draw.id}-${participant.user_id}`,
                    round_no: roundNo,
                    winner_user_id: participant.user_id,
                    pickup_date: null,
                    status: 'dijadwalkan',
                  };
                })
                .filter((round) => round.winner_user_id === uid);
            });
          const winningRounds = [
            ...rouletteRounds,
            ...groupRounds.filter((round) => !rouletteRounds.some((rouletteRound) => rouletteRound.round_no === round.round_no)),
          ].sort((a, b) => a.round_no - b.round_no);
          const nextPayment = paymentsByPeriod[nextPeriod];
          return (
            <article key={m.id} className="card home-membership-card">
              <div className="home-membership-content">
                <div className="card-head">
                  <div>
                    <h3>{g.name}</h3>
                    <div className="muted small">
                      {typeLabel(g)} · {rupiah(g.nominal)}/{periodUnit(g)}
                      {m.slot_count > 1 ? ` · ${m.slot_count} slot` : ''}
                    </div>
                  </div>
                  <Link to={`/g/${g.id}`} state={{ from: '/beranda' }} className="home-membership-link">
                    Pembayaran
                    <Icon name="arrowRight" size={16} />
                  </Link>
                </div>
                <Progress value={done} max={g.durasi} />
                <div className="row between small muted home-payment-progress">
                  <span>
                    Lunas {done} dari {g.durasi} {periodName(g).toLowerCase()}
                  </span>
                  {membershipPayments.filter((payment) => payment.status === 'menunggu').length > 0 && (
                    <span className="text-pending">{membershipPayments.filter((payment) => payment.status === 'menunggu').length} menunggu verifikasi</span>
                  )}
                </div>
              </div>
              {(nextPeriod || winningRounds.length > 0) && (
                <details className="home-payment-details">
                  <summary>Jadwal pembayaran &amp; penarikan</summary>
                  {nextPeriod && dueDate ? (
                    <table>
                      <tbody>
                        <tr>
                          <th scope="row">{periodName(g)}</th>
                          <td>Ke-{nextPeriod}</td>
                        </tr>
                        <tr>
                          <th scope="row">Jatuh tempo</th>
                          <td>{fmtDate(dueDate)}</td>
                        </tr>
                        {nextPayment && (
                          <tr>
                            <th scope="row">Status</th>
                            <td>
                              {nextPayment.status === 'menunggu'
                                ? <span className="text-pending">Bukti menunggu verifikasi</span>
                                : nextPayment.status === 'ditolak'
                                  ? 'Bukti ditolak'
                                  : 'Belum dibayar'}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  ) : nextPeriod ? (
                    <p className="muted small">Tanggal jatuh tempo belum ditentukan.</p>
                  ) : null}
                  {winningRounds.length > 0 ? (
                    <table>
                      <tbody>
                        {winningRounds.map((round) => (
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
                  ) : (
                    <p className="muted small">Belum ada hasil rolet untuk penarikan.</p>
                  )}
                </details>
              )}
            </article>
          );
        })
      )}

      {selectedGroup && (
        <Modal title={selectedGroup.group.name} onClose={() => !busy && setSelectedGroup(null)}>
          <div className="stack">
            <div className="home-offer-modal-summary">
              <span className={`home-offer-icon ${selectedGroup.group.type === 'uang' ? 'money' : 'package'}`}>
                <Icon name={selectedGroup.group.type === 'uang' ? 'coin' : 'gift'} size={22} />
              </span>
              <div>
                <b>{typeLabel(selectedGroup.group)}</b>
                <div className="muted small">
                  {rupiah(selectedGroup.group.nominal)} / {periodUnit(selectedGroup.group)} · {selectedGroup.group.durasi} kali
                </div>
              </div>
            </div>
            {selectedGroup.group.description && <p className="muted small">{selectedGroup.group.description}</p>}
            {selectedGroup.group.type === 'paket' && selectedGroup.group.package_detail && (
              <p className="small"><Icon name="gift" size={16} /> {selectedGroup.group.package_detail}</p>
            )}
            {selectedGroup.membership?.status === 'menunggu' ? (
              <div className="home-offer-status is-pending">
                Pendaftaran sedang menunggu persetujuan admin. Kamu bisa membayar setelah disetujui.
                <button type="button" className="btn sm danger" disabled={busy} onClick={cancelRegistration}>
                  Batalkan pendaftaran
                </button>
              </div>
            ) : selectedGroup.membership ? (
              <div className={`home-offer-status is-${selectedGroup.membership.status}`}>
                Status keanggotaan: <b>{selectedGroup.membership.status}</b>.
                <Link
                  className="btn block"
                  to={`/g/${selectedGroup.group.id}`}
                  state={{ from: '/beranda' }}
                  onClick={() => setSelectedGroup(null)}
                >
                  Lihat status
                </Link>
              </div>
            ) : (
              <>
                {selectedGroup.group.type === 'uang' && (
                  <label className="field">
                    <span>Jumlah slot yang ingin diikuti</span>
                    <input
                      type="number"
                      min="1"
                      max={selectedGroup.remainingSlots ?? undefined}
                      value={slots}
                      onChange={(event) => setSlots(event.target.value)}
                    />
                    <div className="hint">
                      {selectedGroup.availabilityError
                        ? 'Ketersediaan slot belum dapat diperiksa. Coba lagi setelah halaman dimuat ulang.'
                        : selectedGroup.remainingSlots == null
                        ? 'Slot kelompok ini tidak dibatasi.'
                        : `Tersisa ${selectedGroup.remainingSlots} slot. Iuran dikalikan dengan jumlah slot yang dipilih.`}
                    </div>
                  </label>
                )}
                <p className="muted small">Pendaftaran diperiksa admin sebelum kamu bisa mulai membayar.</p>
                <button
                  type="button"
                  className="btn primary block"
                  disabled={busy || (selectedGroup.remainingSlots != null
                    && (selectedGroup.remainingSlots < 1 || Number(slots) > selectedGroup.remainingSlots))
                    || (selectedGroup.availabilityError && selectedGroup.group.type === 'uang'
                      && selectedGroup.group.max_slots != null)}
                  onClick={submitRegistration}
                >
                  {busy ? 'Mengirim…' : 'Daftar kelompok'}
                </button>
              </>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
