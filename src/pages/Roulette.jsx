import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../lib/auth.jsx';
import { q, supabase } from '../lib/supabase';
import { useAsync, useRealtimeRefresh } from '../lib/hooks';
import { Empty, ErrorBox, Spinner } from '../components/Ui.jsx';
import Icon from '../components/Icon.jsx';
import { useToast } from '../components/Toast.jsx';
import { CustomSelect } from '../components/CustomSelect.jsx';

const SPIN_MS = 5500;

export default function Roulette() {
  const { isAdmin } = useAuth();
  const toast = useToast();
  const [groupId, setGroupId] = useState('');
  const [periodNo, setPeriodNo] = useState(1);
  const [busy, setBusy] = useState(false);
  const [spinIndex, setSpinIndex] = useState(0);

  const groupsState = useAsync(
    () => q(
      supabase
        .from('groups')
        .select('id,name,durasi,type,draw_mode')
        .eq('type', 'uang')
        .eq('draw_mode', 'acak')
        .order('name')
    ),
    []
  );
  const groups = groupsState.data || [];
  const selectedGroup = groups.find((group) => group.id === groupId) || null;

  useEffect(() => {
    if (groups.length && !groups.some((group) => group.id === groupId)) {
      setGroupId(groups[0].id);
      setPeriodNo(1);
    }
  }, [groupId, groups]);

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

  const participantNames = useMemo(
    () => (session?.draft_order || []).map((participant) => participant.full_name),
    [session?.draft_order]
  );

  useEffect(() => {
    if (session?.status !== 'spinning' || !participantNames.length) return undefined;
    const timer = setInterval(() => setSpinIndex((index) => (index + 1) % participantNames.length), 110);
    return () => clearInterval(timer);
  }, [participantNames.length, session?.status, session?.id, session?.attempt_count]);

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
    }, Math.max(0, SPIN_MS - elapsed + 250));
    return () => clearTimeout(timeout);
  }, [isAdmin, liveState.reload, session?.id, session?.spin_started_at, session?.status, toast]);

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

  async function rerunRoulette() {
    if (!session?.id) return;
    setBusy(true);
    try {
      await q(supabase.rpc('run_roulette_attempt', { p_session: session.id }));
      await liveState.reload();
    } catch (error) {
      toast(error.message || 'Gagal mengulang Rolet.', 'error');
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
      toast('Hasil tersimpan di menu Hasil Rolet.', 'success');
    } catch (error) {
      toast(error.message || 'Gagal menyimpan hasil Rolet.', 'error');
    } finally {
      setBusy(false);
    }
  }

  const spinning = session?.status === 'spinning';
  const saved = session?.status === 'saved';
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
          <p className="muted">Pilih kelompok dan periode untuk memantau pengacakan bersama.</p>
        </div>
      </header>

      <section className="card roulette-live">
        <div className="roulette-selectors">
          <label className="field">
            <span>Kelompok</span>
            <CustomSelect
              value={groupId}
              onValueChange={(value) => {
                setGroupId(value);
                setPeriodNo(1);
              }}
              disabled={groupsState.loading || !groups.length || spinning || busy}
              ariaLabel="Kelompok"
              options={groups.map((group) => ({ value: group.id, label: group.name }))}
            />
          </label>
          <label className="field">
            <span>Periode</span>
            <CustomSelect
              value={periodNo}
              onValueChange={(value) => setPeriodNo(Number(value))}
              disabled={!selectedGroup || spinning || busy}
              ariaLabel="Periode"
              options={Array.from({ length: selectedGroup?.durasi || 0 }, (_, index) => index + 1)
                .map((period) => ({ value: period, label: `Periode ${period}` }))}
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
            <div className={`roulette-machine${spinning ? ' is-spinning' : ''}`} aria-live="polite">
              <span className="roulette-machine-icon"><Icon name="dice" size={48} /></span>
              <strong className="roulette-machine-name">
                {spinning ? displayedName : session?.draft_order?.[0]?.full_name || 'Rolet siap'}
              </strong>
              <span className="roulette-machine-status">
                {spinning
                  ? 'Sedang mengacak peserta…'
                  : saved
                    ? 'Hasil sudah disimpan'
                    : session?.status === 'active'
                      ? `Hasil sementara · percobaan ${session.attempt_count} dari 3`
                      : 'Menunggu admin memulai Rolet'}
              </span>
            </div>

            <div className="roulette-live-meta">
              <span>{selectedGroup?.name} · Periode {periodNo}</span>
              {session && <span>Percobaan {session.attempt_count} dari 3</span>}
            </div>

            {isAdmin && (
              <div className="roulette-admin-controls">
                {!session || saved ? (
                  <button className="btn primary" onClick={startRoulette} disabled={busy || spinning}>
                    <Icon name="shuffle" size={18} /> {busy ? 'Memulai…' : saved ? 'Mulai Rolet baru' : 'Mulai Rolet'}
                  </button>
                ) : spinning ? (
                  <p className="muted small">Rolet sedang berputar. Peserta lain melihat animasi ini secara realtime.</p>
                ) : (
                  <div className="row wrap">
                    {session.attempt_count < 3 && (
                      <button className="btn primary" onClick={rerunRoulette} disabled={busy}>
                        <Icon name="shuffle" size={18} /> {busy ? 'Memulai…' : 'Acak ulang'}
                      </button>
                    )}
                    <button className="btn" onClick={saveResult} disabled={busy}>
                      Simpan hasil
                    </button>
                  </div>
                )}
                {!saved && session?.attempt_count < 3 && (
                  <p className="muted small">Admin dapat mengulang maksimal tiga kali. Hasil percobaan ketiga tersimpan otomatis.</p>
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
