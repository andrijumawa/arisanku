// Edge Function: kirim Web Push. Dipanggil oleh Database Webhook (lihat supabase/webhooks.sql).
// Secrets yang dibutuhkan: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT, WEBHOOK_SECRET
import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

webpush.setVapidDetails(
  Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@example.com',
  Deno.env.get('VAPID_PUBLIC_KEY')!,
  Deno.env.get('VAPID_PRIVATE_KEY')!
);

type Payload = { title: string; body: string; url?: string; tag?: string };

async function send(userIds: string[], payload: Payload) {
  if (!userIds.length) return;
  const { data: subs } = await db.from('push_subscriptions').select('*').in('user_id', userIds);
  await Promise.all(
    (subs ?? []).map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(payload)
        );
      } catch (e) {
        // langganan kedaluwarsa -> hapus
        if (e.statusCode === 404 || e.statusCode === 410) {
          await db.from('push_subscriptions').delete().eq('id', s.id);
        } else {
          console.error('push gagal', e.statusCode, e.body);
        }
      }
    })
  );
}

async function adminIds(): Promise<string[]> {
  const { data } = await db.from('profiles').select('id').eq('role', 'admin');
  return (data ?? []).map((a) => a.id);
}

Deno.serve(async (req) => {
  if (req.headers.get('x-webhook-secret') !== Deno.env.get('WEBHOOK_SECRET')) {
    return new Response('unauthorized', { status: 401 });
  }

  const { type, table, record, old_record } = await req.json();

  try {
    // 1) Pesan chat baru -> semua peserta aktif + admin (kecuali pengirim)
    if (table === 'chat_messages' && type === 'INSERT') {
      const { data: sender } = await db.from('profiles').select('full_name').eq('id', record.user_id).single();
      const { data: active } = await db.from('memberships').select('user_id').eq('status', 'aktif');
      const ids = [...new Set([...(await adminIds()), ...(active ?? []).map((a) => a.user_id)])].filter(
        (id) => id !== record.user_id
      );
      await send(ids, {
        title: `💬 ${sender?.full_name ?? 'Peserta'}`,
        body: record.body ?? '📷 Mengirim foto',
        url: '#/chat',
        tag: 'chat',
      });
    }

    // 2) Pendaftaran baru -> admin
    if (table === 'memberships' && type === 'INSERT') {
      const [{ data: u }, { data: g }] = await Promise.all([
        db.from('profiles').select('full_name').eq('id', record.user_id).single(),
        db.from('groups').select('name').eq('id', record.group_id).single(),
      ]);
      await send(await adminIds(), {
        title: 'Pendaftaran baru',
        body: `${u?.full_name ?? 'Peserta'} mendaftar ke ${g?.name ?? 'sebuah kelompok'}`,
        url: '#/admin?tab=daftar',
      });
    }

    // 3) Pendaftaran disetujui / ditolak -> peserta
    if (table === 'memberships' && type === 'UPDATE' && old_record?.status !== record.status) {
      if (['aktif', 'ditolak'].includes(record.status)) {
        const { data: g } = await db.from('groups').select('name').eq('id', record.group_id).single();
        await send([record.user_id], {
          title: record.status === 'aktif' ? 'Pendaftaran disetujui ✅' : 'Pendaftaran ditolak',
          body: g?.name ?? 'Kelompok arisan',
          url: `#/g/${record.group_id}`,
        });
      }
    }

    // 4) Bukti pembayaran baru -> admin
    if (table === 'payments' && type === 'INSERT') {
      const { data: m } = await db.from('memberships').select('user_id').eq('id', record.membership_id).single();
      const { data: u } = await db.from('profiles').select('full_name').eq('id', m?.user_id).single();
      await send(await adminIds(), {
        title: 'Bukti pembayaran baru',
        body: `${u?.full_name ?? 'Peserta'} mengirim bukti transfer`,
        url: '#/admin?tab=bayar',
      });
    }

    // 5) Pembayaran disetujui / ditolak -> peserta
    if (table === 'payments' && type === 'UPDATE' && old_record?.status !== record.status) {
      if (['disetujui', 'ditolak'].includes(record.status)) {
        const { data: m } = await db.from('memberships').select('user_id').eq('id', record.membership_id).single();
        if (m) {
          await send([m.user_id], {
            title: record.status === 'disetujui' ? 'Pembayaran disetujui ✅' : 'Pembayaran ditolak',
            body:
              record.status === 'ditolak' && record.note
                ? `Periode ke-${record.period_no}: ${record.note}`
                : `Periode ke-${record.period_no}`,
            url: `#/g/${record.group_id}`,
          });
        }
      }
    }
  } catch (e) {
    console.error(e);
    return new Response('error', { status: 500 });
  }

  return new Response('ok');
});
