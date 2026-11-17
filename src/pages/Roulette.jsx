import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../lib/auth.jsx';
import { q, supabase } from '../lib/supabase';
import { useAsync, useRealtimeRefresh } from '../lib/hooks';
import { fmtDate } from '../lib/format';
import { Empty, ErrorBox, Spinner } from '../components/Ui.jsx';
import Icon from '../components/Icon.jsx';
import { useToast } from '../components/Toast.jsx';

const PAGE_SIZE = 30;

function monthBounds(month) {
  const [year, monthNumber] = month.split('-').map(Number);
  return {
    start: new Date(Date.UTC(year, monthNumber - 1, 1)).toISOString(),
    end: new Date(Date.UTC(year, monthNumber, 1)).toISOString(),
  };
}

export default function Roulette() {
  const { isAdmin } = useAuth();
  const toast = useToast();
  const [groupFilter, setGroupFilter] = useState('');
  const [monthFilter, setMonthFilter] = useState('');
  const [page, setPage] = useState(0);
  const [manageGroup, setManageGroup] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);
  const [sessionId, setSessionId] = useState(null);
  const [attemptCount, setAttemptCount] = useState(0);
  const [sessionStatus, setSessionStatus] = useState(null);
  const [order, setOrder] = useState([]);
  const [busy, setBusy] = useState(false);
  const [adminData, setAdminData] = useState({ loading: false, error: null, members: [] });

  const groupsState = useAsync(
    () => q(supabase.from('groups').select('id,name,type,draw_mode,pay_period').eq('type', 'uang').eq('draw_mode', 'acak').order('name')),
    []
  );
  const groups = groupsState.data || [];
  const groupMap = useMemo(() => new Map(groups.map((group) => [group.id, group])), [groups]);
  const eligibleGroupIds = useMemo(
    () => (groupFilter ? groups.filter((group) => group.id === groupFilter).map((group) => group.id) : groups.map((group) => group.id)),
    [groupFilter, groups]
  );
  const matchingIdsKey = eligibleGroupIds.join(',');

  const historyState = useAsync(async () => {
    if (!eligibleGroupIds.length) return { draws: [], count: 0 };
    let query = supabase
      .from('roulette_draws')
      .select('id,group_id,attempt_no,participants,created_at', { count: 'exact' })
      .in('group_id', eligibleGroupIds)
      .order('created_at', { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
    if (monthFilter) {
      const { start, end } = monthBounds(monthFilter);
      query = query.gte('created_at', start).lt('created_at', end);
    }
    const { data, error, count } = await query;
    if (error) throw error;
    return { draws: data || [], count: count || 0 };
  }, [matchingIdsKey, monthFilter, page]);

  useRealtimeRefresh(historyState.reload, 'roulette-history', [{ table: 'roulette_draws' }]);

  const loadAdminData = useCallback(async () => {
    if (!isAdmin || !manageGroup) return;
    setAdminData((current) => ({ ...current, loading: true, error: null }));
    try {
      const [members, activeSession] = await Promise.all([
        q(
          supabase
            .from('memberships')
            .select('user_id,profiles(full_name)')
            .eq('group_id', manageGroup)
            .eq('status', 'aktif')
            .order('created_at')
        ),
        q(
          supabase
            .from('roulette_sessions')
            .select('id,attempt_count,selected_user_ids,draft_order,status')
            .eq('group_id', manageGroup)
            .eq('status', 'active')
            .maybeSingle()
        ),
      ]);
      setAdminData({ loading: false, error: null, members: members || [] });
      const activeUserIds = new Set((members || []).map((member) => member.user_id));
      setSessionId(activeSession?.id || null);
      setAttemptCount(activeSession?.attempt_count || 0);
      setSessionStatus(activeSession?.status || null);
      setSelectedIds((activeSession?.selected_user_ids || []).filter((id) => activeUserIds.has(id)));
      setOrder(activeSession?.draft_order || []);
    } catch (error) {
      setAdminData((current) => ({ ...current, loading: false, error }));
    }
  }, [isAdmin, manageGroup]);

  useEffect(() => {
    if (groups.length && !manageGroup) setManageGroup(groups[0].id);
  }, [groups, manageGroup]);

  useEffect(() => {
    if (!isAdmin || !manageGroup) return;
    setSelectedIds([]);
    setSessionId(null);
    setAttemptCount(0);
    setSessionStatus(null);
    setOrder([]);
    loadAdminData();
  }, [isAdmin, loadAdminData, manageGroup]);

  function changeFilter(change) {
    setPage(0);
    change();
  }

  async function startSession() {
    setBusy(true);
    try {
      const id = await q(supabase.rpc('start_roulette_session', { p_group: manageGroup }));
      setSessionId(id);
      setAttemptCount(0);
      setSessionStatus('active');
      setSelectedIds([]);
      setOrder([]);
      toast('Sesi Rolet dimulai.', 'success');
    } catch (error) {
      toast(error.message || 'Gagal memulai sesi Rolet.', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function runAttempt() {
    if (!sessionId) return;
    setBusy(true);
    try {
      const result = await q(
        supabase.rpc('run_roulette_attempt', { p_session: sessionId, p_user_ids: selectedIds })
      );
      setAttemptCount(result.attempt_no);
      setOrder(result.participants || []);
      setSessionStatus(result.saved_draw_id ? 'saved' : 'active');
      if (result.saved_draw_id) {
        toast('Percobaan ketiga tersimpan otomatis.', 'success');
        historyState.reload();
      }
    } catch (error) {
      toast(error.message || 'Gagal mengacak peserta.', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function saveAttempt() {
    if (!sessionId) return;
    setBusy(true);
    try {
      await q(supabase.rpc('save_roulette_attempt', { p_session: sessionId }));
      setSessionStatus('saved');
      toast('Hasil Rolet tersimpan dan dapat dilihat peserta.', 'success');
      historyState.reload();
    } catch (error) {
      toast(error.message || 'Gagal menyimpan hasil Rolet.', 'error');
    } finally {
      setBusy(false);
    }
  }

  const history = historyState.data?.draws || [];
  const resultCount = historyState.data?.count || 0;
  const maxPage = Math.max(0, Math.ceil(resultCount / PAGE_SIZE) - 1);

  return (
    <main className="roulette-page">
      <header className="roulette-heading">
        <span className="roulette-heading-icon"><Icon name="shuffle" size={25} /></span>
        <div>
          <p className="muted small">ArisanKu</p>
          <h1>Rolet peserta</h1>
          <p className="muted">Susun urutan peserta secara acak. Hasil Rolet tidak mengubah undian resmi.</p>
        </div>
      </header>

      {isAdmin && (
        <section className="card roulette-admin" aria-labelledby="roulette-admin-title">
          <div className="card-head">
            <div>
              <h2 id="roulette-admin-title">Pengaturan admin</h2>
              <p className="muted small">Pilih kelompok dan peserta aktif yang akan diacak.</p>
            </div>
            <span className="badge">Admin</span>
          </div>

          {groupsState.loading ? <Spinner text="Memuat kelompok…" /> : groupsState.error ? (
            <ErrorBox error={groupsState.error} onRetry={groupsState.reload} />
          ) : !groups.length ? (
            <Empty icon="users" title="Belum ada kelompok acak">
              Rolet tersedia untuk kelompok arisan uang dengan metode acak.
            </Empty>
          ) : (
            <>
              <label className="field">
                <span>Kelompok arisan</span>
                <select
                  value={manageGroup}
                  onChange={(event) => {
                    setManageGroup(event.target.value);
                    setAdminData({ loading: false, error: null, members: [] });
                  }}
                  disabled={busy}
                >
                  {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
                </select>
              </label>

              {adminData.error && <ErrorBox error={adminData.error} onRetry={loadAdminData} />}
              {adminData.loading ? <Spinner text="Memuat peserta…" /> : (
                <>
                  <div className="roulette-roster-head">
                    <strong>Peserta aktif</strong>
                    <span className="muted small">{selectedIds.length} dipilih dari {adminData.members.length}</span>
                  </div>
                  {adminData.members.length ? (
                    <fieldset className="roulette-roster" disabled={busy || sessionStatus === 'saved'}>
                      <legend className="sr-only">Pilih peserta Rolet</legend>
                      {adminData.members.map((member) => (
                        <label className="roulette-member" key={member.user_id}>
                          <input
                            type="checkbox"
                            checked={selectedIds.includes(member.user_id)}
                            onChange={(event) => setSelectedIds((current) => event.target.checked
                              ? [...current, member.user_id]
                              : current.filter((id) => id !== member.user_id))}
                          />
                          <span>{member.profiles?.full_name || 'Peserta'}</span>
                        </label>
                      ))}
                    </fieldset>
                  ) : <p className="muted">Belum ada peserta aktif di kelompok ini.</p>}

                  {sessionId && sessionStatus === 'active' ? (
                    <div className="roulette-session">
                      <div className="roulette-session-meta">
                        <strong>Percobaan {attemptCount} dari 3</strong>
                        <span className="muted small">{3 - attemptCount} kesempatan tersisa</span>
                      </div>
                      <div className="row wrap">
                        <button className="btn primary" onClick={runAttempt} disabled={busy || adminData.loading || Boolean(adminData.error) || selectedIds.length < 2}>
                          <Icon name="shuffle" size={18} /> {busy ? 'Mengacak…' : 'Acak urutan'}
                        </button>
                        {attemptCount > 0 && attemptCount < 3 && (
                          <button className="btn" onClick={saveAttempt} disabled={busy}>
                            Simpan hasil ini
                          </button>
                        )}
                        <button className="btn ghost sm" onClick={loadAdminData} disabled={busy}>
                          Muat ulang peserta
                        </button>
                      </div>
                      {selectedIds.length < 2 && <p className="muted small">Pilih minimal dua peserta untuk melanjutkan.</p>}
                    </div>
                  ) : sessionStatus === 'saved' ? (
                    <div className="roulette-session">
                      <p className="roulette-saved-note">Sesi selesai. Hasil ini tersimpan untuk dilihat peserta.</p>
                      <button className="btn primary" onClick={startSession} disabled={busy || adminData.loading || Boolean(adminData.error)}>
                        Mulai sesi baru
                      </button>
                    </div>
                  ) : (
                    <div className="roulette-session">
                      <button className="btn primary" onClick={startSession} disabled={busy || adminData.loading || Boolean(adminData.error)}>
                        Mulai sesi Rolet
                      </button>
                      <p className="muted small">Hasil pertama atau kedua dapat disimpan lebih awal. Percobaan ketiga tersimpan otomatis.</p>
                    </div>
                  )}
                  {order.length > 0 && (
                    <section className="roulette-order" aria-label="Urutan hasil Rolet">
                      <div className="roulette-roster-head">
                        <strong>{sessionStatus === 'saved' ? 'Hasil tersimpan' : 'Urutan sementara'}</strong>
                        <span className="muted small">Percobaan {attemptCount}</span>
                      </div>
                      <ol>{order.map((participant, index) => (
                        <li key={`${participant.user_id}-${index}`}>
                          <span className="roulette-rank">{index + 1}</span>
                          <span>{participant.full_name}</span>
                        </li>
                      ))}</ol>
                    </section>
                  )}
                </>
              )}
            </>
          )}
        </section>
      )}

      <section className="roulette-history" aria-labelledby="roulette-history-title">
        <div className="roulette-history-heading">
          <div>
            <p className="muted small">Riwayat tersimpan</p>
            <h2 id="roulette-history-title">Hasil Rolet</h2>
          </div>
          {resultCount > 0 && <span className="badge">{resultCount} hasil</span>}
        </div>
        <div className="roulette-filters">
          <label className="field">
            <span>Kelompok</span>
            <select value={groupFilter} onChange={(event) => changeFilter(() => setGroupFilter(event.target.value))}>
              <option value="">Semua kelompok</option>
              {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Bulan hasil</span>
            <input type="month" value={monthFilter} onChange={(event) => changeFilter(() => setMonthFilter(event.target.value))} />
          </label>
        </div>

        {groupsState.loading || historyState.loading ? <Spinner text="Memuat riwayat…" /> : groupsState.error ? (
          <ErrorBox error={groupsState.error} onRetry={groupsState.reload} />
        ) : historyState.error ? (
          <ErrorBox error={historyState.error} onRetry={historyState.reload} />
        ) : history.length ? (
          <>
            <div className="roulette-results">
              {history.map((draw) => (
                <article className="card roulette-result" key={draw.id}>
                  <div className="roulette-result-head">
                    <div>
                      <h3>{groupMap.get(draw.group_id)?.name || 'Kelompok arisan'}</h3>
                      <p className="muted small">{fmtDate(draw.created_at)} · Percobaan {draw.attempt_no}</p>
                    </div>
                    <Icon name="dice" size={23} className="roulette-result-icon" />
                  </div>
                  <ol>{(draw.participants || []).map((participant, index) => (
                    <li key={`${participant.user_id}-${index}`}>
                      <span className="roulette-rank">{index + 1}</span>
                      <span>{participant.full_name}</span>
                    </li>
                  ))}</ol>
                </article>
              ))}
            </div>
            <div className="roulette-pagination">
              <button className="btn sm" onClick={() => setPage((current) => Math.max(0, current - 1))} disabled={page === 0 || historyState.loading}>
                Hasil lebih baru
              </button>
              <span className="muted small">Halaman {page + 1} dari {maxPage + 1}</span>
              <button className="btn sm" onClick={() => setPage((current) => Math.min(maxPage, current + 1))} disabled={page >= maxPage || historyState.loading}>
                Hasil sebelumnya
              </button>
            </div>
          </>
        ) : (
          <Empty icon="dice" title="Belum ada hasil tersimpan">
            Hasil Rolet yang disimpan admin akan tampil di sini.
          </Empty>
        )}
      </section>
    </main>
  );
}
