import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../lib/auth.jsx';
import { supabase } from '../lib/supabase';
import { fmtDay, fmtTime, sameDay } from '../lib/format';
import { compressImage } from '../lib/image';
import { Spinner } from '../components/Ui.jsx';
import { takePrefetchedChatData } from '../lib/menuData';
import SignedImage from '../components/SignedImage.jsx';
import { useToast } from '../components/Toast.jsx';
import Icon from '../components/Icon.jsx';
import { useConfirm } from '../components/Confirm.jsx';

export default function Chat() {
  const { session, isAdmin } = useAuth();
  const uid = session.user.id;
  const [initialData] = useState(() => takePrefetchedChatData(uid));
  const initialDataRef = useRef(initialData);
  const toast = useToast();
  const confirm = useConfirm();
  const [allowed, setAllowed] = useState(initialData?.allowed ?? null);
  const [msgs, setMsgs] = useState(initialData?.messages || []);
  const [names, setNames] = useState(initialData?.names || {});
  const [adminIds, setAdminIds] = useState(initialData?.adminIds || []);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const bottom = useRef(null);
  const camRef = useRef(null);
  const galRef = useRef(null);
  const namesRef = useRef({});
  const msgsRef = useRef(msgs);
  const historyLoaded = useRef(false);
  const allowedRef = useRef(null);
  const syncingHistory = useRef(false);
  namesRef.current = names;
  msgsRef.current = msgs;

  const ensureNames = useCallback(async (ids) => {
    const missing = [...new Set(ids)].filter((i) => i && !namesRef.current[i]);
    if (!missing.length) return;
    const { data } = await supabase.from('public_profiles').select('id,full_name').in('id', missing);
    if (data) setNames((n) => ({ ...n, ...Object.fromEntries(data.map((p) => [p.id, p.full_name])) }));
  }, []);

  useEffect(() => {
    let alive = true;
    let ch = null;
    const loadMessages = async () => {
      if (syncingHistory.current) return;
      syncingHistory.current = true;
      try {
        if (historyLoaded.current) {
          const current = msgsRef.current;
          if (current.length) {
            const { data: existing, error } = await supabase
              .from('chat_messages')
              .select('id')
              .in('id', current.map((m) => m.id));
            if (!alive) return;
            if (error) {
              toast(error.message, 'error');
              return;
            }
            const existingIds = new Set((existing || []).map((m) => m.id));
            const currentIds = new Set(current.map((m) => m.id));
            setMsgs((messages) => messages.filter((m) => !currentIds.has(m.id) || existingIds.has(m.id)));
          }

          const lastId = current.reduce((latest, message) => Math.max(latest, Number(message.id)), 0);
          const { data, error } = await supabase
            .from('chat_messages')
            .select('id,user_id,body,image_path,created_at')
            .gt('id', lastId)
            .order('id')
            .limit(150);
          if (!alive) return;
          if (error) {
            toast(error.message, 'error');
            return;
          }
          const newMessages = data || [];
          setMsgs((messages) => {
            const ids = new Set(messages.map((message) => message.id));
            return [...messages, ...newMessages.filter((message) => !ids.has(message.id))].slice(-150);
          });
          ensureNames(newMessages.map((message) => message.user_id));
          return;
        }

        const { data, error } = await supabase
          .from('chat_messages')
          .select('id,user_id,body,image_path,created_at')
          .order('created_at', { ascending: false })
          .limit(150);
        if (!alive) return;
        if (error) {
          toast(error.message, 'error');
          return;
        }
        const list = (data || []).reverse();
        historyLoaded.current = true;
        setMsgs((messages) => {
          const ids = new Set(list.map((message) => message.id));
          return [...list, ...messages.filter((message) => !ids.has(message.id))];
        });
        ensureNames(list.map((m) => m.user_id));
      } finally {
        syncingHistory.current = false;
      }
    };
    const checkAccess = async () => {
      if (initialDataRef.current) {
        const bootstrap = initialDataRef.current;
        initialDataRef.current = undefined;
        allowedRef.current = bootstrap.allowed;
        setAllowed(bootstrap.allowed);
        if (bootstrap.allowed) {
          historyLoaded.current = true;
        } else {
          historyLoaded.current = false;
          setMsgs([]);
          setAdminIds([]);
        }
        return;
      }
      const { data: ok, error } = await supabase.rpc('can_chat');
      if (!alive) return;
      if (error) {
        allowedRef.current = false;
        setAllowed(false);
        toast(error.message, 'error');
        return;
      }
      allowedRef.current = !!ok;
      setAllowed(!!ok);
      if (ok) {
        const { data: ids, error: adminsError } = await supabase.rpc('chat_admin_ids');
        if (!alive) return;
        if (adminsError) {
          setAdminIds([]);
          toast(adminsError.message, 'error');
        } else {
          setAdminIds(ids || []);
        }
        void loadMessages();
      }
      else {
        historyLoaded.current = false;
        setMsgs([]);
        setAdminIds([]);
      }
    };
    const connect = () => {
      if (ch || document.visibilityState === 'hidden') return;
      ch = supabase
        .channel('chat-room')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'chat_messages' },
          (p) => {
            if (!allowedRef.current) return;
            setMsgs((m) => (m.some((x) => x.id === p.new.id) ? m : [...m, p.new].slice(-150)));
            ensureNames([p.new.user_id]);
          }
        )
        .on(
          'postgres_changes',
          { event: 'DELETE', schema: 'public', table: 'chat_messages' },
          (p) => setMsgs((m) => m.filter((x) => x.id !== p.old.id))
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'memberships', filter: `user_id=eq.${uid}` },
          () => void checkAccess()
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED' && allowedRef.current) void loadMessages();
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            console.error(`Realtime channel "chat-room" failed: ${status}`);
          }
        });
    };
    const disconnect = () => {
      if (!ch) return;
      const current = ch;
      ch = null;
      void supabase.removeChannel(current);
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') disconnect();
      else {
        connect();
        void checkAccess();
      }
    };
    connect();
    void checkAccess();
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      alive = false;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      disconnect();
    };
  }, [ensureNames, toast]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [msgs.length]);

  const append = (row) => setMsgs((m) => (m.some((x) => x.id === row.id) ? m : [...m, row].slice(-150)));

  async function sendText(e) {
    e?.preventDefault();
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true);
    const { data, error } = await supabase.from('chat_messages').insert({ user_id: uid, body }).select().single();
    setBusy(false);
    if (error) return toast(error.message, 'error');
    setText('');
    append(data);
  }

  async function sendImage(file) {
    if (!file) return;
    setBusy(true);
    try {
      const blob = await compressImage(file);
      const path = `${uid}/${Date.now()}.jpg`;
      const up = await supabase.storage.from('chat-images').upload(path, blob, { contentType: blob.type || 'image/jpeg' });
      if (up.error) throw up.error;
      const { data, error } = await supabase
        .from('chat_messages')
        .insert({ user_id: uid, image_path: path, body: text.trim() || null })
        .select()
        .single();
      if (error) throw error;
      setText('');
      append(data);
    } catch (x) {
      toast(x.message || 'Gagal mengirim foto', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function remove(m) {
    const accepted = await confirm({
      title: 'Hapus pesan?',
      message: 'Pesan ini akan dihapus untuk semua peserta.',
      confirmLabel: 'Hapus',
    });
    if (!accepted) return;
    const { error } = await supabase.from('chat_messages').delete().eq('id', m.id);
    if (error) return toast(error.message, 'error');
    setMsgs((l) => l.filter((x) => x.id !== m.id));
  }

  const onKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) sendText(e);
  };

  if (allowed === null) return <Spinner />;
  if (!allowed) {
    return (
      <div className="main" style={{ paddingTop: 40 }}>
        <div className="empty">
          <Icon name="message" size={40} className="empty-ico" />
          <strong>Chat grup belum tersedia</strong>
          <p className="muted">Chat terbuka setelah pendaftaranmu di salah satu arisan disetujui admin.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="chat">
      <div className="chat-list">
        {msgs.length === 0 && (
          <div className="chat-empty center muted">
            <Icon name="message" size={32} />
            <span>Belum ada pesan. Sapa peserta lain.</span>
          </div>
        )}
        {msgs.map((m, i) => {
          const mine = m.user_id === uid;
          const adminMessage = isAdmin || adminIds.includes(m.user_id);
          const newDay = i === 0 || !sameDay(msgs[i - 1].created_at, m.created_at);
          return (
            <div key={m.id} style={{ display: 'contents' }}>
              {newDay && <div className="day-sep">{fmtDay(m.created_at)}</div>}
              <div className={`bubble ${mine ? 'me' : ''}${adminMessage ? ' admin' : ''}`}>
                {(!mine || adminMessage) && (
                  <div className="who">
                    {mine ? (names[uid] || 'Saya') : (names[m.user_id] || '…')}
                    {adminMessage && <span className="chat-admin-badge">Admin</span>}
                  </div>
                )}
                {m.image_path && <SignedImage bucket="chat-images" path={m.image_path} alt="Foto" />}
                {m.body && <div className="txt">{m.body}</div>}
                <div className="meta">
                  {fmtTime(m.created_at)}
                  {isAdmin && (
                    <button className="del" onClick={() => remove(m)} aria-label="Hapus pesan">
                      Hapus
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottom} />
      </div>

      <form className="composer" onSubmit={sendText}>
        {/* capture="environment" membuka kamera langsung di HP */}
        <input
          ref={camRef}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={(e) => {
            sendImage(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
        <input
          ref={galRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            sendImage(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
        <button type="button" className="round-btn" disabled={busy} onClick={() => camRef.current?.click()} aria-label="Ambil foto">
          <Icon name="camera" size={20} />
        </button>
        <button type="button" className="round-btn" disabled={busy} onClick={() => galRef.current?.click()} aria-label="Pilih dari galeri">
          <Icon name="image" size={20} />
        </button>
        <textarea
          rows={1}
          placeholder="Tulis pesan…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKey}
        />
        <button className="round-btn send" disabled={busy || !text.trim()} aria-label="Kirim">
          <Icon name="send" size={19} />
        </button>
      </form>
    </div>
  );
}
