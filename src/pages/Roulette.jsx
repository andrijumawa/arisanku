import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../lib/auth.jsx';
import { q, supabase } from '../lib/supabase';
import { useAsync, useRealtimeRefresh } from '../lib/hooks';
import {
  loadRouletteAttendance,
  loadRouletteDraws,
  loadRouletteGroups,
  loadRouletteParticipants,
  loadRoulettePeriodActivation,
  loadRouletteSession,
} from '../lib/menuData';
import { Empty, ErrorBox, Spinner } from '../components/Ui.jsx';
import Icon from '../components/Icon.jsx';
import RouletteChat from '../components/RouletteChat.jsx';
import { useToast } from '../components/Toast.jsx';
import { CustomSelect } from '../components/CustomSelect.jsx';
import { useConfirm } from '../components/Confirm.jsx';

function getSpinDuration(roundNo, totalRounds) {
  if (roundNo <= 3) return 7000;
  if (!(totalRounds > 3)) return 3000;
  const remainingRatio = Math.max(0, (totalRounds - roundNo) / (totalRounds - 3));
  return Math.max(3000, Math.round(3000 + 4000 * remainingRatio));
}

const WHEEL_COLORS = ['#ee746e', '#e7b955', '#4fba9a', '#9b78d8', '#d96388', '#7566e8', '#5598d4', '#e58b61'];
const REALTIME_PROFILE_FILTER_SIZE = 100;

function wheelSectorPath(index, count) {
  const slice = 360 / count;
  const startAngle = -90 + index * slice;
  const endAngle = startAngle + slice;
  const pointAt = (angle) => {
    const radians = (angle * Math.PI) / 180;
    return {
      x: 50 + 50 * Math.cos(radians),
      y: 50 + 50 * Math.sin(radians),
    };
  };
  const start = pointAt(startAngle);
  const end = pointAt(endAngle);
  const largeArc = slice > 180 ? 1 : 0;
  return `M 50 50 L ${start.x} ${start.y} A 50 50 0 ${largeArc} 1 ${end.x} ${end.y} Z`;
}

function getWheelTargetAngle(participants, winner, attemptCount, spinKey) {
  const count = participants.length;
  if (!count) return 0;

  const winnerIndex = participants.findIndex((participant) => (
    participant.user_id === winner?.user_id
    && (winner?.slot_no == null || Number(participant.slot_no) === Number(winner.slot_no))
  ));
  const sliceAngle = 360 / count;
  const spinSeed = `${spinKey || ''}:${winner?.user_id || ''}:${winner?.slot_no || ''}:${attemptCount}`;
  let hash = 2166136261;
  for (let index = 0; index < spinSeed.length; index += 1) {
    hash ^= spinSeed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  const randomPosition = 0.18 + ((hash >>> 0) / 0xffffffff) * 0.64;
  const stopPosition = (winnerIndex < 0 ? 0 : winnerIndex) + randomPosition;
  const stopOffset = (360 - ((stopPosition * sliceAngle) % 360)) % 360;
  const rotations = 5 + ((Math.max(1, attemptCount) - 1) % 4);
  return rotations * 360 + stopOffset;
}

function participantSlotLabel(participant) {
  const name = participant?.full_name || 'Peserta';
  return Number(participant?.slot_count) > 1
    ? `${name} ${participant.slot_no}`
    : name;
}

const RouletteWheelGraphic = memo(function RouletteWheelGraphic({
  participantNames,
  wheelAngle,
  wheelTargetAngle,
  spinning,
  wheelTransitionDuration,
}) {
  return (
    <div
      className={`roulette-wheel${spinning ? ' is-spinning' : ''}`}
      role="img"
      style={{
        '--wheel-angle': `${wheelAngle}deg`,
        '--wheel-target-angle': `${wheelTargetAngle}deg`,
        '--wheel-duration': `${wheelTransitionDuration}ms`
      }}
      aria-label="Mesin kocokan peserta"
    >
      <svg className="roulette-wheel-sectors" viewBox="0 0 100 100" aria-hidden="true">
        {participantNames.map((name, index) => (
          <path
            key={`${name}-${index}`}
            d={wheelSectorPath(index, participantNames.length)}
            fill={WHEEL_COLORS[index % WHEEL_COLORS.length]}
          />
        ))}
      </svg>
      <div className="roulette-wheel-labels">
        {participantNames.map((name, index) => {
          const angle = participantNames.length
            ? -90 + (360 / participantNames.length) * (index + 0.5)
            : -90;
          const radians = (angle * Math.PI) / 180;
          const onLeftSide = Math.cos(radians) < 0;
          const radius = onLeftSide ? 46 : 10;
          const left = 50 + radius * Math.cos(radians);
          const top = 50 + radius * Math.sin(radians);
          const labelAngle = angle + (onLeftSide ? 180 : 0);
          return (
            <span
              key={`${name}-${index}`}
              className="roulette-wheel-name"
              style={{
                left: `${left}%`,
                top: `${top}%`,
                '--label-angle': `${labelAngle}deg`,
                '--label-width': participantNames.length >= 10 ? '36%' : '46%',
                '--label-font-size': participantNames.length >= 16
                  ? 'clamp(5px, 1.65vw, 8px)'
                  : participantNames.length >= 10
                    ? 'clamp(6px, 1.9vw, 9px)'
                    : 'clamp(7px, 2.4vw, 11px)'
              }}
              title={name}
            >
              {name}
            </span>
          );
        })}
      </div>
      <div className="roulette-wheel-center" aria-hidden="true">
        <img src={`${import.meta.env.BASE_URL}icons/arisanku-mark.png`} alt="" />
      </div>
    </div>
  );
});

export default function Roulette() {
  const { isAdmin, session: authSession } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const [groupId, setGroupId] = useState('');
  const [busy, setBusy] = useState(false);
  const [adminAttendanceBusyUser, setAdminAttendanceBusyUser] = useState('');
  const [fallbackFullscreen, setFallbackFullscreen] = useState(false);
  const [countdownEndsAt, setCountdownEndsAt] = useState(null);
  const [countdownNow, setCountdownNow] = useState(Date.now());
  const countdownChannelRef = useRef(null);
  const countdownEndsAtRef = useRef(null);

  useEffect(() => {
    if (!groupId) return undefined;
    const channel = supabase.channel(`roulette-countdown-${groupId}`);
    countdownChannelRef.current = channel;
    channel
      .on('broadcast', { event: 'countdown' }, ({ payload }) => {
        if (payload?.endsAt) {
          countdownEndsAtRef.current = payload.endsAt;
          setCountdownEndsAt(payload.endsAt);
        }
      })
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error(`Realtime channel "roulette-countdown-${groupId}" failed: ${status}`);
        }
      });

    return () => {
      countdownChannelRef.current = null;
      countdownEndsAtRef.current = null;
      setCountdownEndsAt(null);
      void supabase.removeChannel(channel);
    };
  }, [groupId]);

  useEffect(() => {
    if (!countdownEndsAt) return undefined;
    const timer = window.setTimeout(() => {
      if (countdownEndsAtRef.current === countdownEndsAt) {
        countdownEndsAtRef.current = null;
        setCountdownEndsAt(null);
      }
    }, Math.max(0, countdownEndsAt - Date.now()));
    return () => window.clearTimeout(timer);
  }, [countdownEndsAt]);

  useEffect(() => {
    if (!countdownEndsAt) return undefined;
    const timer = window.setInterval(() => setCountdownNow(Date.now()), 100);
    return () => window.clearInterval(timer);
  }, [countdownEndsAt]);

  useEffect(() => {
    document.body.classList.toggle('roulette-fullscreen-open', fallbackFullscreen);
    return () => document.body.classList.remove('roulette-fullscreen-open');
  }, [fallbackFullscreen]);

  const groupsState = useAsync(loadRouletteGroups, [isAdmin, authSession.user.id]);
  useRealtimeRefresh(
    groupsState.reload,
    `roulette-access-groups-${authSession.user.id}-${isAdmin ? 'admin' : 'member'}`,
    isAdmin
      ? [{ table: 'groups' }]
      : [{ table: 'memberships', filter: `user_id=eq.${authSession.user.id}` }]
  );
  const groups = groupsState.data || [];
  const selectedGroup = groups.find((group) => group.id === groupId) || null;
  useEffect(() => {
    if (groups.length && !groups.some((group) => group.id === groupId)) {
      setGroupId(groups[0].id);
    }
  }, [groupId, groups]);

  const drawsState = useAsync(loadRouletteDraws, [groupId]);
  useRealtimeRefresh(
    drawsState.reload,
    `roulette-draws-${groupId || 'none'}`,
    groupId ? [{ table: 'roulette_draws', filter: `group_id=eq.${groupId}` }] : [],
    Boolean(groupId)
  );
  const savedDraws = drawsState.loading ? [] : drawsState.data || [];
  const periodNo = savedDraws.reduce((latest, draw) => Math.max(latest, draw.period_no), 0) + 1;
  const attendanceState = useAsync(loadRouletteAttendance, [groupId, periodNo]);
  useRealtimeRefresh(
    attendanceState.reload,
    `roulette-attendance-${groupId || 'none'}-${periodNo}`,
    groupId ? [{ table: 'roulette_attendance', filter: `group_id=eq.${groupId}` }] : [],
    Boolean(groupId)
  );
  const activationState = useAsync(loadRoulettePeriodActivation, [groupId, periodNo]);
  useRealtimeRefresh(
    activationState.reload,
    `roulette-period-activation-${groupId || 'none'}-${periodNo}`,
    groupId ? [{ table: 'roulette_period_controls', filter: `group_id=eq.${groupId}` }] : [],
    Boolean(groupId)
  );
  const periodActivated = activationState.data === true;
  const attendanceUserIds = useMemo(
    () => new Set(periodActivated
      ? (attendanceState.data || []).map((attendance) => attendance.user_id)
      : []),
    [attendanceState.data, periodActivated]
  );
  const previousWinners = useMemo(
    () => savedDraws.map((draw) => draw.participants?.[0]).filter((participant) => participant?.user_id),
    [savedDraws]
  );
  const previousWinnerIds = useMemo(
    () => new Set(previousWinners.filter((winner) => winner.slot_no == null).map((winner) => winner.user_id)),
    [previousWinners]
  );
  const previousWinnerSlots = useMemo(
    () => new Set(previousWinners
      .filter((winner) => winner.slot_no != null)
      .map((winner) => `${winner.user_id}:${Number(winner.slot_no)}`)),
    [previousWinners]
  );
  const liveState = useAsync(loadRouletteSession, [groupId, periodNo]);
  const session = liveState.data;
  useRealtimeRefresh(
    liveState.reload,
    `roulette-live-${groupId || 'none'}-${periodNo}`,
    groupId ? [{ table: 'roulette_sessions', filter: `group_id=eq.${groupId}` }] : [],
    Boolean(groupId)
  );

  const participantsState = useAsync(loadRouletteParticipants, [groupId, periodNo]);
  const participantRealtimeSubscriptions = useMemo(() => {
    const userIds = [...new Set((participantsState.data || []).map((participant) => participant.user_id).filter(Boolean))];
    return [
      { table: 'memberships', filter: `group_id=eq.${groupId}` },
      { table: 'payments', filter: `group_id=eq.${groupId}` },
      ...Array.from({ length: Math.ceil(userIds.length / REALTIME_PROFILE_FILTER_SIZE) }, (_, index) => {
        const batch = userIds.slice(
          index * REALTIME_PROFILE_FILTER_SIZE,
          (index + 1) * REALTIME_PROFILE_FILTER_SIZE
        );
        return { table: 'profiles', filter: `id=in.(${batch.join(',')})` };
      }),
    ];
  }, [groupId, participantsState.data, periodNo]);
  useRealtimeRefresh(
    participantsState.reload,
    `roulette-participants-${groupId || 'none'}-${periodNo}`,
    groupId ? participantRealtimeSubscriptions : []
  );

  const activeParticipants = participantsState.loading ? [] : participantsState.data || [];
  const eligibleUserIds = useMemo(
    () => new Set(activeParticipants.map((participant) => participant.user_id)),
    [activeParticipants]
  );
  const registeredUserIds = useMemo(
    () => new Set([...attendanceUserIds].filter((userId) => eligibleUserIds.has(userId))),
    [attendanceUserIds, eligibleUserIds]
  );
  const adminRoster = useMemo(() => {
    const participantsByUser = new Map();
    activeParticipants.forEach((participant) => {
      const entry = participantsByUser.get(participant.user_id) || {
        user_id: participant.user_id,
        full_name: participant.full_name,
        slots: [],
      };
      entry.slots.push(participant);
      participantsByUser.set(participant.user_id, entry);
    });
    const rosterOrder = new Map([...participantsByUser.keys()].map((userId, index) => [userId, index]));
    const attendanceTimes = new Map(
      (attendanceState.data || []).map((attendance) => [
        attendance.user_id,
        new Date(attendance.created_at).getTime(),
      ])
    );
    return [...participantsByUser.values()].sort((a, b) => {
      const aRegisteredAt = attendanceTimes.get(a.user_id);
      const bRegisteredAt = attendanceTimes.get(b.user_id);
      if (aRegisteredAt !== undefined && bRegisteredAt !== undefined) return aRegisteredAt - bRegisteredAt;
      if (aRegisteredAt !== undefined) return -1;
      if (bRegisteredAt !== undefined) return 1;
      return rosterOrder.get(a.user_id) - rosterOrder.get(b.user_id);
    });
  }, [activeParticipants, attendanceState.data]);
  const selectedWinnerUserId = session?.status === 'active'
    ? session.draft_order?.[0]?.user_id
    : null;
  const displayedAdminRoster = useMemo(() => {
    if (!selectedWinnerUserId) return adminRoster;
    return [...adminRoster].sort((a, b) => (
      Number(b.user_id === selectedWinnerUserId) - Number(a.user_id === selectedWinnerUserId)
    ));
  }, [adminRoster, selectedWinnerUserId]);
  const remainingParticipants = activeParticipants.filter((participant) => (
    !previousWinnerIds.has(participant.user_id)
    && !previousWinnerSlots.has(`${participant.user_id}:${participant.slot_no}`)
  ));
  const orderedParticipants = useMemo(
    () => periodActivated
      ? remainingParticipants.filter((participant) => registeredUserIds.has(participant.user_id))
      : [],
    [periodActivated, remainingParticipants, registeredUserIds]
  );
  const wheelParticipants = useMemo(() => {
    const draftOrder = session?.draft_order;
    if (!Array.isArray(draftOrder) || !draftOrder.length) {
      return orderedParticipants;
    }

    const activeSlots = new Map(orderedParticipants.map((participant) => [
      `${participant.user_id}:${Number(participant.slot_no)}`,
      participant,
    ]));
    const includedSlots = new Set();
    const wheelOrder = [];
    draftOrder.forEach((participant) => {
      if (participant.slot_no == null) {
        orderedParticipants
          .filter((slot) => slot.user_id === participant.user_id)
          .forEach((slot) => {
            const key = `${slot.user_id}:${Number(slot.slot_no)}`;
            if (!includedSlots.has(key)) {
              includedSlots.add(key);
              wheelOrder.push(slot);
            }
          });
        return;
      }

      const key = `${participant.user_id}:${Number(participant.slot_no)}`;
      const activeSlot = activeSlots.get(key);
      if (activeSlot && !includedSlots.has(key)) {
        includedSlots.add(key);
        wheelOrder.push(participant);
      }
    });
    orderedParticipants.forEach((participant) => {
      const key = `${participant.user_id}:${Number(participant.slot_no)}`;
      if (!includedSlots.has(key)) wheelOrder.push(participant);
    });
    return wheelOrder;
  }, [orderedParticipants, session?.draft_order]);
  const participantNames = useMemo(
    () => wheelParticipants.map(participantSlotLabel),
    [wheelParticipants]
  );
  const rouletteComplete = !drawsState.loading
    && !participantsState.loading
    && savedDraws.length > 0
    && remainingParticipants.length === 1;

  const spinDuration = getSpinDuration(periodNo, activeParticipants.length || periodNo);
  const wheelTargetAngle = session?.draft_order?.[0]
    ? getWheelTargetAngle(
      wheelParticipants,
      session.draft_order[0],
      session.attempt_count,
      session.id
    )
    : 0;
  const wheelTransitionDuration = useMemo(() => {
    if (session?.status !== 'spinning') return 0;
    const elapsed = session.spin_started_at
      ? Math.max(0, Date.now() - new Date(session.spin_started_at).getTime())
      : 0;
    return Math.max(0, spinDuration - elapsed);
  }, [session?.spin_started_at, session?.status, spinDuration]);

  useEffect(() => {
    if (!isAdmin || session?.status !== 'spinning') return undefined;
    const elapsed = Date.now() - new Date(session.spin_started_at).getTime();
    const timeout = setTimeout(async () => {
      try {
        await q(supabase.rpc('finish_roulette_attempt', { p_session: session.id }));
        liveState.reload();
      } catch (error) {
        toast(error.message || 'Gagal menyelesaikan putaran kocokan.', 'error');
      }
    }, Math.max(0, spinDuration - elapsed + 250));
    return () => clearTimeout(timeout);
  }, [isAdmin, liveState.reload, session?.id, session?.spin_started_at, session?.status, spinDuration, toast]);

  async function startRoulette() {
    if (!groupId || busy || countdownEndsAtRef.current) return;
    const endsAt = Date.now() + 5000;
    countdownEndsAtRef.current = endsAt;
    setCountdownEndsAt(endsAt);

    try {
      const channel = countdownChannelRef.current;
      if (channel?.state === 'joined') {
        const { error } = await channel.send({
          type: 'broadcast',
          event: 'countdown',
          payload: { endsAt },
        });
        if (error) console.error('Gagal mengirim hitung mundur kocokan:', error);
      }

      window.setTimeout(async () => {
        countdownEndsAtRef.current = null;
        setCountdownEndsAt(null);
        setBusy(true);
        try {
          await q(supabase.rpc('start_roulette_session', { p_group: groupId, p_period: periodNo }));
          await liveState.reload();
          toast('Kocokan mulai berputar.', 'success');
        } catch (error) {
          toast(error.message || 'Gagal memulai kocokan.', 'error');
        } finally {
          setBusy(false);
        }
      }, Math.max(0, endsAt - Date.now()));
    } catch (error) {
      countdownEndsAtRef.current = null;
      setCountdownEndsAt(null);
      toast(error.message || 'Hitung mundur kocokan gagal dimulai.', 'error');
    }
  }

  async function registerAttendance() {
    if (!groupId || !periodActivated || busy || hasRegistered) return;
    setBusy(true);
    try {
      const registered = await q(supabase.rpc('register_roulette_attendance', {
        p_group: groupId,
        p_period: periodNo,
      }));
      await attendanceState.reload();
      toast(
        registered ? `Kehadiran Anda tercatat untuk ${selectedGroup?.name || 'kelompok ini'}.` : 'Anda sudah terdaftar hadir.',
        registered ? 'success' : 'info'
      );
    } catch (error) {
      toast(error.message || 'Gagal mendaftarkan kehadiran.', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function registerParticipantAttendance(userId) {
    if (!isAdmin || !periodActivated || !groupId || !userId || adminAttendanceBusyUser) return;
    setAdminAttendanceBusyUser(userId);
    try {
      const registered = await q(supabase.rpc('admin_register_roulette_attendance', {
        p_group: groupId,
        p_period: periodNo,
        p_user: userId,
      }));
      await Promise.all([attendanceState.reload(), participantsState.reload()]);
      toast(
        registered ? 'Peserta ditambahkan ke daftar hadir kocokan.' : 'Peserta sudah terdaftar hadir.',
        registered ? 'success' : 'info'
      );
    } catch (error) {
      toast(error.message || 'Gagal menambahkan peserta ke daftar hadir.', 'error');
    } finally {
      setAdminAttendanceBusyUser('');
    }
  }

  async function togglePeriodActivation() {
    if (!isAdmin || !groupId || busy) return;
    setBusy(true);
    try {
      const rpcName = periodActivated
        ? 'deactivate_roulette_period'
        : 'activate_roulette_period';
      await q(supabase.rpc(rpcName, {
        p_group: groupId,
        p_period: periodNo,
      }));
      await Promise.all([
        activationState.reload(),
        ...(periodActivated ? [attendanceState.reload()] : []),
      ]);
      toast(
        periodActivated
          ? `Pendaftaran hadir putaran ${periodNo} ditutup.`
          : `Pendaftaran hadir putaran ${periodNo} dibuka.`,
        'success'
      );
    } catch (error) {
      toast(error.message || 'Gagal mengubah status periode kocokan.', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function saveResult() {
    if (!session?.id) return;
    setBusy(true);
    try {
      await q(supabase.rpc('save_roulette_attempt', { p_session: session.id }));
      await Promise.all([liveState.reload(), drawsState.reload()]);
      toast(
        session.draft_order.length === 2
          ? 'Pemenang tersimpan. Peserta yang tersisa mendapat nomor terakhir.'
          : 'Pemenang tersimpan. Putaran berikutnya siap.',
        'success'
      );
    } catch (error) {
      toast(error.message || 'Gagal menyimpan hasil kocokan.', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function rerunRoulette() {
    if (!session?.id || !isAdmin || busy) return;
    setBusy(true);
    try {
      await q(supabase.rpc('run_roulette_attempt', { p_session: session.id }));
      await liveState.reload();
      toast('Kocokan diulang.', 'success');
    } catch (error) {
      toast(error.message || 'Gagal mengulang kocokan.', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function cancelResult() {
    if (!session?.id) return;
    const accepted = await confirm({
      title: 'Batalkan hasil kocokan?',
      message: 'Hasil belum disimpan, jadi putaran ini dapat dimulai ulang.',
      confirmLabel: 'Batalkan hasil',
    });
    if (!accepted) return;
    setBusy(true);
    try {
      await q(supabase.rpc('cancel_roulette_session', { p_session: session.id }));
      await liveState.reload();
      toast('Hasil kocokan dibatalkan. Putaran ini bisa dimulai ulang.', 'success');
    } catch (error) {
      toast(error.message || 'Gagal membatalkan hasil kocokan.', 'error');
    } finally {
      setBusy(false);
    }
  }

  function toggleFullscreen() {
    if (!periodActivated) return;
    setFallbackFullscreen((current) => !current);
  }

  useEffect(() => {
    if (!periodActivated) setFallbackFullscreen(false);
  }, [periodActivated]);

  const spinning = session?.status === 'spinning';
  const saved = session?.status === 'saved';
  const cancelled = session?.status === 'cancelled';
  const countdown = countdownEndsAt && countdownEndsAt > countdownNow
    ? Math.ceil((countdownEndsAt - countdownNow) / 1000)
    : null;
  const canStart = isAdmin && !rouletteComplete && !spinning
    && periodActivated
    && (!session || saved || cancelled)
    && !busy;
  const hasRegistered = registeredUserIds.has(authSession.user.id);
  const isEligibleForPeriod = eligibleUserIds.has(authSession.user.id);

  return (
    <section className="roulette-page">
      <header className="roulette-heading">
        <span className="roulette-heading-icon"><Icon name="shuffle" size={25} /></span>
        <div>
          <h1>Kocokan peserta</h1>
        </div>
      </header>

      <section className="card roulette-live">
        <div className="roulette-selectors">
          <label className="field">
            <span>Kelompok</span>
            <CustomSelect
              value={groupId}
              onValueChange={(value) => setGroupId(value)}
              disabled={groupsState.loading || !groups.length || spinning || busy || countdown !== null}
              ariaLabel="Kelompok"
              options={groups.map((group) => ({ value: group.id, label: group.name }))}
            />
          </label>
        </div>

        {groupsState.loading ? <Spinner text="Memuat kelompok…" /> : groupsState.error ? (
          <ErrorBox error={groupsState.error} onRetry={groupsState.reload} />
        ) : !groups.length ? (
          <Empty icon="users" title="Belum ada kelompok untuk kocokan">
            Kocokan tersedia pada kelompok arisan uang dengan metode acak.
          </Empty>
        ) : drawsState.error ? (
          <ErrorBox error={drawsState.error} onRetry={drawsState.reload} />
        ) : attendanceState.error ? (
          <ErrorBox error={attendanceState.error} onRetry={attendanceState.reload} />
        ) : activationState.error ? (
          <ErrorBox error={activationState.error} onRetry={activationState.reload} />
        ) : participantsState.error ? (
          <ErrorBox error={participantsState.error} onRetry={participantsState.reload} />
        ) : liveState.loading ? <Spinner text="Menyambungkan ke kocokan…" /> : liveState.error ? (
          <ErrorBox error={liveState.error} onRetry={liveState.reload} />
        ) : (
          <>
            <div
              className={`roulette-machine roulette-wheel-machine${spinning ? ' is-spinning' : ''}${fallbackFullscreen ? ' is-fullscreen' : ''}${periodActivated ? '' : ' is-inactive'}`}
              aria-live="polite"
            >
              {countdown !== null && (
                <span className="roulette-countdown" role="timer" aria-label={`Mulai dalam ${countdown} detik`}>
                  <strong>{countdown}</strong>
                  <span>Mulai dalam</span>
                </span>
              )}
              {!periodActivated && (
                <span className="roulette-machine-status is-pending" role="status">
                  Menunggu admin mengaktifkan daftar hadir
                </span>
              )}
              {groupId && ((isAdmin && !fallbackFullscreen) || (!isAdmin && fallbackFullscreen)) && (
                <div className="roulette-attendance-controls">
                  {isAdmin && !fallbackFullscreen ? (
                    <button
                      type="button"
                      className={`roulette-attendance-toggle roulette-activation-toggle${periodActivated ? ' is-registered' : ''}`}
                      onClick={togglePeriodActivation}
                      disabled={busy || activationState.loading || spinning || session?.status === 'active' || saved || rouletteComplete}
                      aria-label={periodActivated ? `Nonaktifkan pendaftaran putaran ${periodNo}` : `Aktifkan pendaftaran putaran ${periodNo}`}
                    >
                      <span>{periodActivated ? 'Nonaktifkan' : 'Aktifkan'}</span>
                      <span className="roulette-attendance-count">{periodNo}</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      className={`roulette-attendance-toggle${hasRegistered ? ' is-registered' : ''}`}
                      onClick={registerAttendance}
                      disabled={
                        !periodActivated
                        || busy
                        || attendanceState.loading
                        || participantsState.loading
                        || !isEligibleForPeriod
                        || hasRegistered
                        || countdown !== null
                        || spinning
                        || saved
                        || rouletteComplete
                      }
                      aria-label={
                        hasRegistered
                          ? 'Kehadiran sudah terdaftar'
                          : isEligibleForPeriod
                            ? 'Daftar hadir untuk kocokan'
                            : `Tidak aktif: pembayaran periode ${periodNo} harus disetujui untuk ikut kocokan`
                      }
                    >
                      <span>{hasRegistered ? 'Terdaftar' : isEligibleForPeriod ? 'Daftar hadir' : 'Tidak aktif'}</span>
                      <span className="roulette-attendance-count">{registeredUserIds.size}</span>
                    </button>
                  )}
                </div>
              )}
              <div className="roulette-machine-controls">
                <button
                  type="button"
                  className="roulette-fullscreen-toggle"
                  onClick={toggleFullscreen}
                  disabled={!periodActivated}
                  aria-label={!periodActivated ? 'Perbesar rolet belum tersedia sampai periode diaktifkan' : fallbackFullscreen ? 'Kecilkan tampilan kocokan' : 'Tampilkan kocokan layar penuh'}
                  title={!periodActivated ? 'Aktifkan periode untuk memperbesar rolet' : fallbackFullscreen ? 'Kecilkan rolet' : 'Layar penuh'}
                >
                  <Icon name={fallbackFullscreen ? 'fullscreenExit' : 'fullscreen'} size={19} />
                </button>
              </div>
              <div className="roulette-wheel-wrap">
                <div className="roulette-pointer" aria-hidden="true"><span /></div>
                <RouletteWheelGraphic
                  participantNames={participantNames}
                  wheelAngle={wheelTargetAngle}
                  wheelTargetAngle={wheelTargetAngle}
                  spinning={spinning}
                  wheelTransitionDuration={wheelTransitionDuration}
                />
                {canStart && (
                  <button
                    type="button"
                    className="roulette-center-start"
                    onClick={startRoulette}
                    disabled={countdown !== null}
                    aria-label={`Mulai kocokan putaran ${periodNo}`}
                  >
                    <Icon name="shuffle" size={20} />
                    <span>Mulai</span>
                  </button>
                )}
              </div>
              {(spinning || rouletteComplete || saved || session?.status === 'active') && (
                <span className="roulette-machine-status">
                  {spinning
                    ? 'Sedang mengacak peserta…'
                    : rouletteComplete
                      ? 'Urutan peserta selesai'
                      : saved
                        ? 'Hasil sudah disimpan'
                        : 'Hasil sementara · siap disimpan'}
                </span>
              )}
              {fallbackFullscreen && (
                <div className="roulette-fullscreen-panels">
                  <RouletteChat groupId={groupId} />
                  <section className="roulette-participant-roster" aria-label="Daftar peserta rolet">
                    <div className="roulette-participant-roster-heading">
                      <strong>Peserta</strong>
                      <span>{registeredUserIds.size} hadir dari {activeParticipants.length} slot</span>
                    </div>
                    <div className="roulette-participant-roster-list">
                      {displayedAdminRoster.length ? displayedAdminRoster.map((participant, index) => {
                        const isRegistered = registeredUserIds.has(participant.user_id);
                        const isSelectedWinner = participant.user_id === selectedWinnerUserId;
                        const isBusy = adminAttendanceBusyUser === participant.user_id;
                        return (
                          <div
                            className={`roulette-roster-person${isRegistered ? ' is-present' : ''}${isSelectedWinner ? ' is-selected' : ''}`}
                            key={participant.user_id}
                            aria-current={isSelectedWinner ? 'true' : undefined}
                          >
                            <span className="roulette-roster-number" aria-hidden="true">{index + 1}</span>
                            <span className="roulette-roster-person-copy">
                              <strong>{participant.full_name}</strong>
                              {participant.slots.length > 1 && (
                                <small>{participant.slots.length} slot</small>
                              )}
                            </span>
                            {isSelectedWinner ? (
                              <span className="roulette-roster-status is-selected">Terpilih</span>
                            ) : isRegistered ? (
                              <span className="roulette-roster-status">Hadir</span>
                            ) : isAdmin ? (
                              <button
                                type="button"
                                className="roulette-roster-add"
                                onClick={() => registerParticipantAttendance(participant.user_id)}
                                disabled={
                                  Boolean(adminAttendanceBusyUser)
                                  || !periodActivated
                                  || countdown !== null
                                  || spinning
                                  || saved
                                  || rouletteComplete
                                  || session?.status === 'active'
                                }
                              >
                                {isBusy ? '...' : 'Tambah'}
                              </button>
                            ) : (
                              <span className="roulette-roster-status is-pending">Belum hadir</span>
                            )}
                          </div>
                        );
                      }) : (
                        <p className="roulette-participant-roster-empty">Belum ada peserta yang dapat ikut kocokan.</p>
                      )}
                    </div>
                  </section>
                </div>
              )}
            </div>

            {!participantNames.length && !rouletteComplete && periodActivated && (
              <p className="roulette-attendance-empty" role="status">
                Hanya peserta dengan pembayaran periode {periodNo} yang sudah disetujui yang dapat ikut. Peserta yang sudah daftar hadir akan muncul di roda rolet.
              </p>
            )}

            <div className="roulette-live-meta">
              <span>{selectedGroup?.name}</span>
              <span>{rouletteComplete ? 'Selesai' : `Putaran ${periodNo} · ${(spinDuration / 1000).toFixed(spinDuration % 1000 ? 1 : 0)} detik`}</span>
            </div>

            {rouletteComplete && (
              <p className="muted small">
                Urutan kocokan selesai. {participantSlotLabel(remainingParticipants[0])} otomatis mendapat nomor terakhir
                {' '}({activeParticipants.length}).
              </p>
            )}

            {isAdmin && !rouletteComplete && session && !saved && !cancelled && (
              <div className="roulette-admin-controls">
                {spinning ? (
                  <p className="muted small">Kocokan sedang berputar. Peserta lain melihat animasi ini secara realtime.</p>
                ) : (
                  <div className="row wrap">
                    {session?.status === 'active' && (
                      <button className="btn primary" onClick={rerunRoulette} disabled={busy}>
                        Putar ulang
                      </button>
                    )}
                    <button className="btn primary" onClick={saveResult} disabled={busy}>
                      Simpan pemenang putaran {periodNo}
                    </button>
                    <button className="btn danger" onClick={cancelResult} disabled={busy}>
                      Batalkan hasil
                    </button>
                  </div>
                )}
              </div>
            )}

            {!spinning && session?.status === 'active' && session.draft_order?.[0] && (
              <p className="roulette-round-winner">
                Pemenang putaran {periodNo}: <strong>{participantSlotLabel(session.draft_order[0])}</strong>
                {session.draft_order.length === 2 && (
                  <> · Peserta terakhir: <strong>{participantSlotLabel(session.draft_order[1])}</strong></>
                )}
              </p>
            )}

            <section className="roulette-history" aria-label="Hasil kocokan tersimpan">
              <h2 className="section-title">Hasil kocokan</h2>
              {drawsState.loading ? <Spinner text="Memuat hasil kocokan…" /> : savedDraws.length ? (
                <div className="roulette-results">
                  {[...savedDraws]
                    .sort((a, b) => a.period_no - b.period_no)
                    .flatMap((draw) => (
                      (draw.participants || [])
                        .slice(0, draw.participants?.length === 2 ? 2 : 1)
                        .map((participant, index) => (
                          <article className="card roulette-result" key={`${draw.period_no}-${participant.user_id}-${index}`}>
                            <ol>
                              <li key={`${participant.user_id}-${index}`}>
                                <span className="roulette-rank">{draw.period_no + index}</span>
                                <span>{participantSlotLabel(participant)}</span>
                              </li>
                            </ol>
                          </article>
                        ))
                    ))}
                </div>
              ) : (
                <Empty icon="dice" title="Belum ada hasil tersimpan">
                  Hasil yang disimpan admin akan tampil di sini.
                </Empty>
              )}
            </section>
          </>
        )}
      </section>
    </section>
  );
}
