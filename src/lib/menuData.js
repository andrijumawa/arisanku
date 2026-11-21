import { q, supabase } from './supabase';

const prefetchedChatData = new Map();

export async function loadHomeData(uid) {
  const [ms, [groups, groupsError], [availability, availabilityError]] = await Promise.all([
    q(
      supabase
        .from('memberships')
        .select('id,status,slot_count,group_id,groups(id,name,type,nominal,durasi,max_slots,pay_period,package_type,start_date)')
        .eq('user_id', uid)
        .order('created_at', { ascending: false })
    ),
    q(
      supabase
        .from('groups')
        .select('id,type,name,description,nominal,durasi,max_slots,draw_mode,pay_period,package_type,package_detail,start_date,end_date,pickup_date,is_open')
        .order('created_at', { ascending: false })
    ).then((value) => [value, null]).catch((error) => {
      console.error('Gagal memuat kelompok tersedia di Beranda:', error);
      return [[], error];
    }),
    q(supabase.rpc('group_availability'))
      .then((value) => [value || [], null]).catch((error) => {
        console.error('Gagal memuat ketersediaan slot kelompok:', error);
        return [[], error];
      }),
  ]);
  const ids = ms.map((membership) => membership.id);
  const groupIds = [...new Set(ms.map((membership) => membership.group_id).filter(Boolean))];
  const [pays, rounds, rouletteDraws] = await Promise.all([
    ids.length
      ? q(supabase.from('payments').select('membership_id,period_no,status').in('membership_id', ids))
      : [],
    groupIds.length
      ? q(supabase.from('rounds').select('id,group_id,round_no,winner_user_id,pickup_date,status').in('group_id', groupIds).order('round_no'))
      : [],
    groupIds.length
      ? q(
        supabase
          .from('roulette_draws')
          .select('id,group_id,period_no,participants')
          .in('group_id', groupIds)
          .order('period_no')
      )
      : [],
  ]);
  return { ms, groups, groupsError, availability, availabilityError, pays, rounds, rouletteDraws };
}

export async function loadBrowseData(uid) {
  const [groups, mine] = await Promise.all([
    q(
      supabase
        .from('groups')
        .select('id,type,name,description,nominal,durasi,max_slots,draw_mode,pay_period,package_type,package_detail,start_date,end_date,pickup_date,is_open')
        .order('created_at', { ascending: false })
    ),
    q(supabase.from('memberships').select('id,group_id,status').eq('user_id', uid)),
  ]);
  return { groups, mine: Object.fromEntries(mine.map((membership) => [membership.group_id, membership])) };
}

export async function loadRouletteGroups(isAdmin, uid) {
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
      .eq('user_id', uid)
      .eq('status', 'aktif')
  );
  return memberships
    .map((membership) => membership.groups)
    .filter((group) => group?.type === 'uang' && group?.draw_mode === 'acak');
}

export async function loadRouletteDraws(groupId) {
  if (!groupId) return [];
  return q(
    supabase
      .from('roulette_draws')
      .select('period_no,participants')
      .eq('group_id', groupId)
      .order('period_no')
  );
}

export async function loadRouletteAttendance(groupId, periodNo) {
  if (!groupId || !periodNo) return [];
  return q(
    supabase
      .from('roulette_attendance')
      .select('user_id')
      .eq('group_id', groupId)
      .eq('period_no', periodNo)
  );
}

export async function loadRoulettePeriodActivation(groupId, periodNo) {
  if (!groupId || !periodNo) return false;
  return q(supabase.rpc('roulette_period_is_activated', {
    p_group: groupId,
    p_period: periodNo,
  }));
}

export async function loadRouletteSession(groupId, periodNo) {
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
}

export async function loadRouletteParticipants(groupId) {
  if (!groupId) return [];
  return q(supabase.rpc('get_roulette_participants', { p_group: groupId }));
}

export async function loadChatData(uid) {
  const { data: allowed, error: accessError } = await supabase.rpc('can_chat');
  if (accessError) throw accessError;
  if (!allowed) {
    const result = { allowed: false, adminIds: [], messages: [], names: {} };
    prefetchedChatData.set(uid, result);
    return result;
  }

  const [admins, messages] = await Promise.all([
    supabase.rpc('chat_admin_ids'),
    supabase
      .from('chat_messages')
      .select('id,user_id,body,image_path,created_at')
      .order('created_at', { ascending: false })
      .limit(150),
  ]);
  if (admins.error) throw admins.error;
  if (messages.error) throw messages.error;
  const messageList = (messages.data || []).reverse();
  const userIds = [...new Set(messageList.map((message) => message.user_id).filter(Boolean))];
  const profiles = userIds.length
    ? await supabase.from('public_profiles').select('id,full_name').in('id', userIds)
    : { data: [], error: null };
  if (profiles.error) throw profiles.error;
  const result = {
    allowed: true,
    adminIds: admins.data || [],
    messages: messageList,
    names: Object.fromEntries((profiles.data || []).map((profile) => [profile.id, profile.full_name])),
  };
  prefetchedChatData.set(uid, result);
  return result;
}

export function takePrefetchedChatData(uid) {
  if (!prefetchedChatData.has(uid)) return undefined;
  const data = prefetchedChatData.get(uid);
  prefetchedChatData.delete(uid);
  return data;
}

export async function loadAdminCounts() {
  const [pendingMem, pendingPay, pendingAccounts] = await Promise.all([
    supabase.from('memberships').select('id', { count: 'exact', head: true }).eq('status', 'menunggu'),
    supabase.from('payments').select('id', { count: 'exact', head: true }).eq('status', 'menunggu'),
    supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('account_status', 'menunggu'),
  ]);
  if (pendingMem.error) throw pendingMem.error;
  if (pendingPay.error) throw pendingPay.error;
  if (pendingAccounts.error) throw pendingAccounts.error;
  return { mem: pendingMem.count || 0, pay: pendingPay.count || 0, accounts: pendingAccounts.count || 0 };
}
