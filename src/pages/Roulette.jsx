import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../lib/auth.jsx';
import { q, supabase } from '../lib/supabase';
import { useAsync, useRealtimeRefresh } from '../lib/hooks';
import { Empty, ErrorBox, Spinner } from '../components/Ui.jsx';
import Icon from '../components/Icon.jsx';
import { useToast } from '../components/Toast.jsx';
import { CustomSelect } from '../components/CustomSelect.jsx';

function getSpinDuration(roundNo, totalRounds) {
  if (roundNo <= 3) return 7000;
  if (!(totalRounds > 3)) return 3000;
  const remainingRatio = Math.max(0, (totalRounds - roundNo) / (totalRounds - 3));
  return Math.max(3000, Math.round(3000 + 4000 * remainingRatio));
}

export default function Roulette() {
  const { isAdmin, session: authSession } = useAuth();
  const toast = useToast();
  const [groupId, setGroupId] = useState('');
  const [periodNo, setPeriodNo] = useState(1);
  const [busy, setBusy] = useState(false);
  const [spinIndex, setSpinIndex] = useState(0);
  const [wheelAngle, setWheelAngle] = useState(0);

  const groupsState = useAsync(async () => {
    if (isAdmin) {
      return q(
        supabase
          .from('groups')
          .select('id,name,durasi,type,draw_mode,pay_period')
          .eq('type', 'uang')
          .eq('draw_mode', 'acak')
          .order('name')
      );
    }

    const memberships = await q(
      supabase
        .from('memberships')
        .select('group_id,groups(id,name,durasi,type,draw_mode,pay_period)')
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

  useEffect(() => {
    if (!groupId) return;
    let alive = true;
    supabase
      .from('roulette_draws')
      .select('period_no')
      .eq('group_id', groupId)
      .order('period_no', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (alive) setPeriodNo(data?.period_no ? data.period_no + 1 : 1);
      });
    return () => { alive = false; };
  }, [groupId]);

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
        .select('profiles(full_name)')
        .eq('group_id', groupId)
        .eq('status', 'aktif')
    );
    return memberships
      .map((membership) => membership.profiles?.full_name)
      .filter(Boolean);
  }, [groupId]);
  useRealtimeRefresh(
    participantsState.reload,
    `roulette-participants-${groupId || 'none'}`,
    groupId ? [{ table: 'memberships', filter: `group_id=eq.${groupId}` }, { table: 'profiles' }] : []
  );

  const participantNames = useMemo(
    () => (session?.draft_order?.length
      ? session.draft_order.map((participant) => participant.full_name)
      : participantsState.data || []),
    [session?.draft_order, participantsState.data]
  );

  useEffect(() => {
    if (!participantNames.length) return;
    if (session?.status === 'active' || session?.status === 'saved') {
      setWheelAngle(0);
      setSpinIndex(0);
    }
  }, [session?.status, session?.id, participantNames.length]);

  const spinDuration = getSpinDuration(periodNo, selectedGroup?.durasi || periodNo);
  const spinIntervalMs = Math.max(65, Math.round(110 * (spinDuration / 7000)));

  useEffect(() => {
    if (session?.status !== 'spinning' || !participantNames.length) return undefined;
    const timer = setInterval(() => {
      setSpinIndex((index) => (index + 1) % participantNames.length);
      setWheelAngle((angle) => angle + 18);
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
        toast(error.message || 'Gagal menyelesaikan putaran Rolet.', 'error');
      }
    }, Math.max(0, spinDuration - elapsed + 250));
    return () => clearTimeout(timeout);
  }, [isAdmin, liveState.reload, session?.id, session?.spin_started_at, session?.status, spinDuration, toast]);

  async function startRoulette() {
    if (!groupId) return;
    setBusy(true);
    try {
      await q(supabase.rpc('start_roulette_session', { p_group: groupId, p_period: periodNo }));
      await liveState.reload();
      toast('Rolet mulai berputar. Semua peserta dapat memantau hasilnya.', 'success');
    } catch (error) {
      toast(error.message || 'Gagal memulai Rolet.', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function saveResult() {
    if (!session?.id) return;
    setBusy(true);
    try {
      await q(supabase.rpc('save_roulette_attempt', { p_session: session.id }));
      await liveState.reload();
      setPeriodNo((current) => current + 1);
      toast('Pemenang tersimpan. Putaran berikutnya siap.', 'success');
    } catch (error) {
      toast(error.message || 'Gagal menyimpan hasil Rolet.', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function cancelResult() {
    if (!session?.id) return;
    if (!window.confirm('Batalkan hasil Rolet ini? Hasil belum disimpan, jadi putaran ini bisa dimulai ulang.')) return;
    setBusy(true);
    try {
      await q(supabase.rpc('cancel_roulette_session', { p_session: session.id }));
      await liveState.reload();
      toast('Hasil Rolet dibatalkan. Putaran ini bisa dimulai ulang.', 'success');
    } catch (error) {
      toast(error.message || 'Gagal membatalkan hasil Rolet.', 'error');
    } finally {
      setBusy(false);
    }
  }

  const spinning = session?.status === 'spinning';
  const saved = session?.status === 'saved';
  const cancelled = session?.status === 'cancelled';
  const displayedName = participantNames.length
    ? participantNames[spinIndex % participantNames.length]
    : 'Menunggu peserta';

  return (
    <section className="roulette-page">
      <header className="roulette-heading">
        <span className="roulette-heading-icon"><Icon name="shuffle" size={25} /></span>
        <div>
          <p className="muted small">ArisanKu</p>
          <h1>Rolet peserta</h1>
          <p className="muted">Pilih kelompok untuk memantau pengacakan bersama.</p>
        </div>
      </header>

      <section className="card roulette-live">
        <div className="roulette-selectors">
          <label className="field">
            <span>Kelompok</span>
            <CustomSelect
              value={groupId}
              onValueChange={(value) => setGroupId(value)}
              disabled={groupsState.loading || !groups.length || spinning || busy}
              ariaLabel="Kelompok"
              options={groups.map((group) => ({ value: group.id, label: group.name }))}
            />
          </label>
        </div>

        {groupsState.loading ? <Spinner text="Memuat kelompok…" /> : groupsState.error ? (
          <ErrorBox error={groupsState.error} onRetry={groupsState.reload} />
        ) : !groups.length ? (
          <Empty icon="users" title="Belum ada kelompok untuk Rolet">
            Rolet tersedia pada kelompok arisan uang dengan metode acak.
          </Empty>
        ) : liveState.loading ? <Spinner text="Menyambungkan ke Rolet…" /> : liveState.error ? (
          <ErrorBox error={liveState.error} onRetry={liveState.reload} />
        ) : (
          <>
            <div className={`roulette-machine roulette-wheel-machine${spinning ? ' is-spinning' : ''}`} aria-live="polite">
              <div className="roulette-wheel-wrap">
                <div className="roulette-pointer" aria-hidden="true"><span /></div>
                <div
                  className={`roulette-wheel${participantNames.length > 12 ? ' roulette-wheel--dense' : ''}`}
                  style={{ '--wheel-angle': `${spinning ? wheelAngle : 0}deg` }}
                  aria-label="Mesin Rolet peserta"
                >
                  <div className="roulette-wheel-rim">
                    {participantNames.map((name, index) => {
                      const angle = participantNames.length ? -90 + (360 / participantNames.length) * index : -90;
                      const radians = (angle * Math.PI) / 180;
                      const radius = 35;
                      const left = 50 + radius * Math.cos(radians);
                      const top = 50 + radius * Math.sin(radians);
                      return (
                        <span
                          key={`${name}-${index}`}
                          className="roulette-wheel-name"
                          style={{ left: `${left}%`, top: `${top}%` }}
                        >
                          <span title={name}>{participantNames.length > 16
                            ? name.trim().split(/\s+/)[0].slice(0, 6)
                            : name}</span>
                        </span>
                      );
                    })}
                  </div>
                  <div className="roulette-wheel-hub">
                    <Icon name="dice" size={30} />
                    <strong>{spinning ? displayedName : participantNames[0] || 'Siap'}</strong>
                  </div>
                </div>
              </div>
              <span className="roulette-machine-status">
                {spinning
                  ? 'Sedang mengacak peserta…'
                  : saved
                    ? 'Hasil sudah disimpan'
                    : session?.status === 'active'
                      ? 'Hasil sementara · siap disimpan'
                      : 'Menunggu admin memulai Rolet'}
              </span>
            </div>

            <div className="roulette-live-meta">
              <span>{selectedGroup?.name}</span>
              <span>Putaran {periodNo} · {(spinDuration / 1000).toFixed(spinDuration % 1000 ? 1 : 0)} detik</span>
            </div>

            {isAdmin && (
              <div className="roulette-admin-controls">
                {!session || saved || cancelled ? (
                  <button className="btn primary" onClick={startRoulette} disabled={busy || spinning}>
                    <Icon name="shuffle" size={18} /> {busy ? 'Memulai…' : `Mulai putaran ${periodNo}`}
                  </button>
                ) : spinning ? (
                  <p className="muted small">Rolet sedang berputar. Peserta lain melihat animasi ini secara realtime.</p>
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

            {!spinning && session?.draft_order?.length > 0 && (
              <ol className="roulette-final-order" aria-label="Urutan peserta Rolet">
                {session.draft_order.map((participant, index) => (
                  <li key={`${participant.user_id}-${index}`}>
                    <span className="roulette-rank">{index + 1}</span>
                    <span>{participant.full_name}</span>
                  </li>
                ))}
              </ol>
            )}
          </>
        )}
      </section>
    </section>
  );
}
