import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../lib/auth.jsx';
import { q, supabase } from '../lib/supabase';
import { useAsync, useRealtimeRefresh } from '../lib/hooks';
import { Empty, ErrorBox, Spinner } from '../components/Ui.jsx';
import Icon from '../components/Icon.jsx';
import RouletteChat from '../components/RouletteChat.jsx';
import { useToast } from '../components/Toast.jsx';
import { CustomSelect } from '../components/CustomSelect.jsx';

function getSpinDuration(roundNo, totalRounds) {
  if (roundNo <= 3) return 7000;
  if (!(totalRounds > 3)) return 3000;
  const remainingRatio = Math.max(0, (totalRounds - roundNo) / (totalRounds - 3));
  return Math.max(3000, Math.round(3000 + 4000 * remainingRatio));
}

function payoutDate(group, periodNo) {
  if (!group?.start_date || !Number.isInteger(periodNo) || periodNo < 1) return null;
  const date = new Date(`${group.start_date}T12:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  const offset = periodNo - 1;

  if (group.pay_period === 'harian') date.setDate(date.getDate() + offset);
  else if (group.pay_period === 'mingguan') date.setDate(date.getDate() + offset * 7);
  else if (group.pay_period === 'bulanan') {
    const day = date.getDate();
    date.setDate(1);
    date.setMonth(date.getMonth() + offset);
    const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    date.setDate(Math.min(day, lastDay));
  } else return null;

  return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
}

const WHEEL_COLORS = ['#ee746e', '#e7b955', '#4fba9a', '#9b78d8', '#d96388', '#7566e8', '#5598d4', '#e58b61'];

export default function Roulette() {
  const { isAdmin, session: authSession } = useAuth();
  const toast = useToast();
  const [groupId, setGroupId] = useState('');
  const [busy, setBusy] = useState(false);
  const [spinIndex, setSpinIndex] = useState(0);
  const [wheelAngle, setWheelAngle] = useState(0);
  const [wheelTransitionDuration, setWheelTransitionDuration] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [fallbackFullscreen, setFallbackFullscreen] = useState(false);
  const [countdownEndsAt, setCountdownEndsAt] = useState(null);
  const [countdownNow, setCountdownNow] = useState(Date.now());
  const wheelMachineRef = useRef(null);
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
    const timer = window.setInterval(() => setCountdownNow(Date.now()), 100);
    return () => window.clearInterval(timer);
  }, [countdownEndsAt]);

  useEffect(() => {
    const syncFullscreen = () => {
      setFullscreen(document.fullscreenElement === wheelMachineRef.current || fallbackFullscreen);
    };
    const exitFallbackOnEscape = (event) => {
      if (event.key === 'Escape' && fallbackFullscreen) setFallbackFullscreen(false);
    };

    document.addEventListener('fullscreenchange', syncFullscreen);
    document.addEventListener('keydown', exitFallbackOnEscape);
    syncFullscreen();
    return () => {
      document.removeEventListener('fullscreenchange', syncFullscreen);
      document.removeEventListener('keydown', exitFallbackOnEscape);
    };
  }, [fallbackFullscreen]);

  const groupsState = useAsync(async () => {
    if (isAdmin) {
      return q(
        supabase
          .from('groups')
          .select('id,name,durasi,type,draw_mode,pay_period,start_date')
          .eq('type', 'uang')
          .eq('draw_mode', 'acak')
          .order('name')
      );
    }

    const memberships = await q(
      supabase
        .from('memberships')
        .select('group_id,groups(id,name,durasi,type,draw_mode,pay_period,start_date)')
        .eq('user_id', authSession.user.id)
        .eq('status', 'aktif')
    );
    return memberships
      .map((membership) => membership.groups)
      .filter((group) => group?.type === 'uang' && group?.draw_mode === 'acak');
  }, [isAdmin, authSession.user.id]);
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

  const drawsState = useAsync(async () => {
    if (!groupId) return [];
    return q(
      supabase
        .from('roulette_draws')
        .select('period_no,participants')
        .eq('group_id', groupId)
        .order('period_no')
    );
  }, [groupId]);
  useRealtimeRefresh(
    drawsState.reload,
    `roulette-draws-${groupId || 'none'}`,
    groupId ? [{ table: 'roulette_draws', filter: `group_id=eq.${groupId}` }] : [],
    Boolean(groupId)
  );
  const savedDraws = drawsState.loading ? [] : drawsState.data || [];
  const periodNo = savedDraws.reduce((latest, draw) => Math.max(latest, draw.period_no), 0) + 1;
  const previousWinnerIds = useMemo(
    () => new Set(savedDraws.map((draw) => draw.participants?.[0]?.user_id).filter(Boolean)),
    [savedDraws]
  );
  const liveState = useAsync(async () => {
    if (!groupId || !periodNo) return null;
    const { data, error } = await supabase
      .from('roulette_sessions')
      .select('id,group_id,period_no,attempt_count,selected_user_ids,draft_order,status,spin_started_at,created_at')
      .eq('group_id', groupId)
      .eq('period_no', periodNo)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data;
  }, [groupId, periodNo]);
  const session = liveState.data;
  useRealtimeRefresh(
    liveState.reload,
    `roulette-live-${groupId || 'none'}-${periodNo}`,
    groupId ? [{ table: 'roulette_sessions', filter: `group_id=eq.${groupId}` }] : [],
    Boolean(groupId)
  );

  const participantsState = useAsync(async () => {
    if (!groupId) return [];
    const memberships = await q(
      supabase
        .from('memberships')
        .select('user_id,profiles(full_name)')
        .eq('group_id', groupId)
        .eq('status', 'aktif')
    );
    return memberships
      .filter((membership) => membership.profiles?.full_name)
      .map((membership) => ({ user_id: membership.user_id, full_name: membership.profiles.full_name }));
  }, [groupId]);
  useRealtimeRefresh(
    participantsState.reload,
    `roulette-participants-${groupId || 'none'}`,
    groupId ? [{ table: 'memberships', filter: `group_id=eq.${groupId}` }, { table: 'profiles' }] : []
  );

  const activeParticipants = participantsState.loading ? [] : participantsState.data || [];
  const remainingParticipants = activeParticipants.filter((participant) => !previousWinnerIds.has(participant.user_id));
  const participantNames = useMemo(
    () => (session?.draft_order?.length
      ? session.draft_order.map((participant) => participant.full_name)
      : remainingParticipants.map((participant) => participant.full_name)),
    [session?.draft_order, remainingParticipants]
  );
  const rouletteComplete = !drawsState.loading
    && !participantsState.loading
    && savedDraws.length > 0
    && remainingParticipants.length === 1;

  const wheelBackground = useMemo(() => {
    if (!participantNames.length) return '#fff';
    const slice = 360 / participantNames.length;
    const sectors = participantNames.map((_, index) => {
      const start = index * slice;
      const end = (index + 1) * slice;
      const color = WHEEL_COLORS[index % WHEEL_COLORS.length];
      return `${color} ${start}deg ${end}deg`;
    });
    return `conic-gradient(from ${-90 - slice / 2}deg, ${sectors.join(', ')})`;
  }, [participantNames]);

  const spinDuration = getSpinDuration(periodNo, activeParticipants.length || periodNo);
  const spinIntervalMs = Math.max(65, Math.round(110 * (spinDuration / 7000)));

  useEffect(() => {
    if (session?.status !== 'spinning' || !participantNames.length) return undefined;
    const elapsed = session.spin_started_at
      ? Math.max(0, Date.now() - new Date(session.spin_started_at).getTime())
      : 0;
    const remaining = Math.max(0, spinDuration - elapsed);
    const selectedAngle = 0;
    const targetAngle = 360 * 6 + selectedAngle;
    setWheelAngle(0);
    setWheelTransitionDuration(remaining);
    if (remaining === 0) {
      setWheelAngle(targetAngle);
    } else {
      const frame = requestAnimationFrame(() => setWheelAngle(targetAngle));
      return () => cancelAnimationFrame(frame);
    }
    return undefined;
  }, [
    participantNames.length,
    session?.attempt_count,
    session?.id,
    session?.spin_started_at,
    session?.status,
    spinDuration
  ]);

  useEffect(() => {
    if (session?.status !== 'spinning' || !participantNames.length) return undefined;
    setSpinIndex(0);
    const timer = setInterval(() => {
      setSpinIndex((index) => (index + 1) % participantNames.length);
    }, spinIntervalMs);
    return () => clearInterval(timer);
  }, [participantNames.length, session?.status, session?.id, session?.attempt_count, spinIntervalMs]);

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

  async function cancelResult() {
    if (!session?.id) return;
    if (!window.confirm('Batalkan hasil kocokan ini? Hasil belum disimpan, jadi putaran ini bisa dimulai ulang.')) return;
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

  async function toggleFullscreen() {
    const machine = wheelMachineRef.current;
    if (!machine) return;

    try {
      if (fullscreen) {
        if (document.fullscreenElement) {
          await document.exitFullscreen();
        } else {
          setFallbackFullscreen(false);
          setFullscreen(false);
        }
        return;
      }

      if (machine.requestFullscreen) {
        try {
          await machine.requestFullscreen();
          return;
        } catch {
          setFallbackFullscreen(true);
          setFullscreen(true);
          return;
        }
      }

      setFallbackFullscreen(true);
      setFullscreen(true);
    } catch (error) {
      toast(error.message || 'Tidak dapat mengubah tampilan layar penuh.', 'error');
    }
  }

  const spinning = session?.status === 'spinning';
  const saved = session?.status === 'saved';
  const cancelled = session?.status === 'cancelled';
  const displayedName = participantNames.length ? participantNames[spinIndex % participantNames.length] : 'Menunggu peserta';
  const countdown = countdownEndsAt ? Math.max(0, Math.ceil((countdownEndsAt - countdownNow) / 1000)) : null;
  const canStart = isAdmin && !rouletteComplete && !spinning
    && (!session || saved || cancelled)
    && !busy;

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
        ) : participantsState.error ? (
          <ErrorBox error={participantsState.error} onRetry={participantsState.reload} />
        ) : liveState.loading ? <Spinner text="Menyambungkan ke kocokan…" /> : liveState.error ? (
          <ErrorBox error={liveState.error} onRetry={liveState.reload} />
        ) : (
          <>
            <div
              ref={wheelMachineRef}
              className={`roulette-machine roulette-wheel-machine${spinning ? ' is-spinning' : ''}${fullscreen && fallbackFullscreen ? ' is-fullscreen' : ''}`}
              aria-live="polite"
            >
              {countdown !== null && (
                <span className="roulette-countdown" role="timer" aria-label={`Mulai dalam ${countdown} detik`}>
                  <strong>{countdown}</strong>
                  <span>Mulai dalam</span>
                </span>
              )}
              <button
                type="button"
                className="roulette-fullscreen-toggle"
                onClick={toggleFullscreen}
                aria-label={fullscreen ? 'Keluar dari layar penuh' : 'Tampilkan kocokan layar penuh'}
                title={fullscreen ? 'Keluar dari layar penuh' : 'Layar penuh'}
              >
                <Icon name={fullscreen ? 'fullscreenExit' : 'fullscreen'} size={19} />
              </button>
              <div className="roulette-wheel-wrap">
                <div className="roulette-pointer" aria-hidden="true"><span /></div>
                <div
                  className="roulette-wheel"
                  role="img"
                  style={{
                    '--wheel-angle': `${wheelAngle}deg`,
                    '--wheel-transition': spinning && wheelAngle > 0 && wheelTransitionDuration > 0
                      ? `transform ${wheelTransitionDuration}ms cubic-bezier(0.12, 0.78, 0.12, 1)`
                      : 'none',
                    background: wheelBackground
                  }}
                  aria-label="Mesin kocokan peserta"
                >
                  <div className="roulette-wheel-labels">
                    {participantNames.map((name, index) => {
                      const angle = participantNames.length ? -90 + (360 / participantNames.length) * index : -90;
                      const radians = (angle * Math.PI) / 180;
                      const radius = 59;
                      const left = 50 + radius * Math.cos(radians);
                      const top = 50 + radius * Math.sin(radians);
                      const maxLength = participantNames.length >= 18 ? 7 : participantNames.length >= 13 ? 10 : 20;
                      const label = name.length > maxLength ? `${name.slice(0, maxLength - 1)}…` : name;
                      const normalizedAngle = (angle + 360) % 360;
                      const labelAngle = normalizedAngle >= 90 && normalizedAngle < 270
                        ? angle - 90
                        : angle + 90;
                      return (
                        <span
                          key={`${name}-${index}`}
                          className="roulette-wheel-name"
                          style={{
                            left: `${left}%`,
                            top: `${top}%`,
                            '--label-angle': `${labelAngle}deg`
                          }}
                          title={name}
                        >
                          {label}
                        </span>
                      );
                    })}
                  </div>
                  <div className="roulette-wheel-center" aria-hidden="true">
                    <strong>KOCOK</strong>
                    <span>ARISAN</span>
                  </div>
                </div>
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
              {fullscreen && <RouletteChat />}
            </div>

            <div className="roulette-live-meta">
              <span>{selectedGroup?.name}</span>
              <span>{rouletteComplete ? 'Selesai' : `Putaran ${periodNo} · ${(spinDuration / 1000).toFixed(spinDuration % 1000 ? 1 : 0)} detik`}</span>
            </div>

            {rouletteComplete && (
              <p className="muted small">
                Urutan kocokan selesai. {remainingParticipants[0]?.full_name || 'Peserta terakhir'} otomatis mendapat nomor terakhir
                {' '}({activeParticipants.length}).
              </p>
            )}

            {isAdmin && !rouletteComplete && session && !saved && !cancelled && (
              <div className="roulette-admin-controls">
                {spinning ? (
                  <p className="muted small">Kocokan sedang berputar. Peserta lain melihat animasi ini secara realtime.</p>
                ) : (
                  <div className="row wrap">
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
                Pemenang putaran {periodNo}: <strong>{session.draft_order[0].full_name}</strong>
                {session.draft_order.length === 2 && (
                  <> · Peserta terakhir: <strong>{session.draft_order[1].full_name}</strong></>
                )}
              </p>
            )}

            <section className="roulette-history" aria-label="Hasil kocokan tersimpan">
              <h2 className="section-title">Hasil kocokan</h2>
              {drawsState.loading ? <Spinner text="Memuat hasil kocokan…" /> : savedDraws.length ? (
                <div className="roulette-results">
                  {[...savedDraws]
                    .sort((a, b) => a.period_no - b.period_no)
                    .map((draw) => (
                      <article className="card roulette-result" key={`${draw.period_no}-${draw.participants?.[0]?.user_id}`}>
                        <div className="roulette-result-head">
                          <div>
                            <h2>{selectedGroup?.name || 'Kelompok arisan'}</h2>
                            <p className="muted small">
                              Putaran {draw.period_no} · Tanggal pencairan:{' '}
                              <strong>{payoutDate(selectedGroup, draw.period_no) || 'belum ditentukan'}</strong>
                            </p>
                          </div>
                          <Icon name="dice" size={23} className="roulette-result-icon" />
                        </div>
                        <ol>
                          {(draw.participants || [])
                            .slice(0, draw.participants?.length === 2 ? 2 : 1)
                            .map((participant, index) => (
                              <li key={`${participant.user_id}-${index}`}>
                                <span className="roulette-rank">{draw.period_no + index}</span>
                                <span>{participant.full_name}</span>
                              </li>
                            ))}
                        </ol>
                      </article>
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
