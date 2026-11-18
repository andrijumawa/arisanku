import { useMemo, useState } from 'react';
import { q, supabase } from '../lib/supabase';
import { useAsync, useRealtimeRefresh } from '../lib/hooks';
import { fmtDate } from '../lib/format';
import { Empty, ErrorBox, Spinner } from '../components/Ui.jsx';
import Icon from '../components/Icon.jsx';
import { CustomSelect } from '../components/CustomSelect.jsx';
import { useAuth } from '../lib/auth.jsx';

const PAGE_SIZE = 30;

export default function RouletteResults() {
  const { isAdmin, session: authSession } = useAuth();
  const [groupFilter, setGroupFilter] = useState('');
  const [page, setPage] = useState(0);
  const groupsState = useAsync(async () => {
    if (isAdmin) {
      return q(supabase.from('groups').select('id,name,durasi').eq('type', 'uang').eq('draw_mode', 'acak').order('name'));
    }
    const memberships = await q(
      supabase
        .from('memberships')
        .select('group_id,groups(id,name,durasi,type,draw_mode)')
        .eq('user_id', authSession.user.id)
        .eq('status', 'aktif')
    );
    return memberships
      .map((membership) => membership.groups)
      .filter((group) => group?.type === 'uang' && group?.draw_mode === 'acak');
  }, [isAdmin, authSession.user.id]);
  useRealtimeRefresh(
    groupsState.reload,
    `roulette-results-access-${authSession.user.id}-${isAdmin ? 'admin' : 'member'}`,
    isAdmin
      ? [{ table: 'groups' }]
      : [{ table: 'memberships', filter: `user_id=eq.${authSession.user.id}` }]
  );
  const groups = groupsState.data || [];
  const groupMap = useMemo(() => new Map(groups.map((group) => [group.id, group])), [groups]);
  const groupIds = groups.filter((group) => !groupFilter || group.id === groupFilter).map((group) => group.id);
  const groupKey = groupIds.join(',');

  const historyState = useAsync(async () => {
    if (!groupIds.length) return { draws: [], count: 0 };
    let query = supabase
      .from('roulette_draws')
      .select('id,group_id,period_no,attempt_no,participants,created_at', { count: 'exact' })
      .in('group_id', groupIds)
      .order('created_at', { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
    const { data, error, count } = await query;
    if (error) throw error;
    return { draws: data || [], count: count || 0 };
  }, [groupKey, page]);

  useRealtimeRefresh(historyState.reload, 'roulette-saved-results', [{ table: 'roulette_draws' }]);

  function changeFilter(change) {
    setPage(0);
    change();
  }

  const draws = historyState.data?.draws || [];
  const count = historyState.data?.count || 0;
  const maxPage = Math.max(0, Math.ceil(count / PAGE_SIZE) - 1);
  return (
    <section className="roulette-page">
      <header className="roulette-heading">
        <span className="roulette-heading-icon"><Icon name="dice" size={25} /></span>
        <div>
          <p className="muted small">ArisanKu</p>
          <h1>Hasil Rolet</h1>
          <p className="muted">Riwayat urutan peserta yang sudah disimpan admin.</p>
        </div>
      </header>

      <section className="roulette-history">
        <div className="roulette-filters">
          <label className="field">
            <span>Kelompok</span>
            <CustomSelect value={groupFilter} onValueChange={(value) => changeFilter(() => {
              setGroupFilter(value);
            })}
              ariaLabel="Filter kelompok"
              options={[
                { value: '', label: 'Semua kelompok' },
                ...groups.map((group) => ({ value: group.id, label: group.name })),
              ]}
            />
          </label>
        </div>

        {groupsState.loading || historyState.loading ? <Spinner text="Memuat hasil Rolet…" /> : groupsState.error ? (
          <ErrorBox error={groupsState.error} onRetry={groupsState.reload} />
        ) : historyState.error ? (
          <ErrorBox error={historyState.error} onRetry={historyState.reload} />
        ) : draws.length ? (
          <>
            <div className="roulette-results">
              {draws.map((draw) => (
                <article className="card roulette-result" key={draw.id}>
                  <div className="roulette-result-head">
                    <div>
                      <h2>{groupMap.get(draw.group_id)?.name || 'Kelompok arisan'}</h2>
                      <p className="muted small">Putaran {draw.period_no} · Disimpan {fmtDate(draw.created_at)}</p>
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
            <div className="roulette-pagination">
              <button className="btn sm" onClick={() => setPage((current) => Math.max(0, current - 1))} disabled={page === 0 || historyState.loading}>
                Hasil lebih baru
              </button>
              <span className="muted small">{count} hasil · Halaman {page + 1} dari {maxPage + 1}</span>
              <button className="btn sm" onClick={() => setPage((current) => Math.min(maxPage, current + 1))} disabled={page >= maxPage || historyState.loading}>
                Hasil sebelumnya
              </button>
            </div>
          </>
        ) : (
          <Empty icon="dice" title="Belum ada hasil tersimpan">
            Hasil yang disimpan admin akan tampil di sini.
          </Empty>
        )}
      </section>
    </section>
  );
}
