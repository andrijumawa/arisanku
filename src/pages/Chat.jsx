import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../lib/auth.jsx';
import { supabase } from '../lib/supabase';
import { fmtDay, fmtTime, sameDay } from '../lib/format';
import { compressImage } from '../lib/image';
import { Spinner } from '../components/Ui.jsx';
import SignedImage from '../components/SignedImage.jsx';
import { useToast } from '../components/Toast.jsx';

export default function Chat() {
  const { session, isAdmin } = useAuth();
  const uid = session.user.id;
  const toast = useToast();
  const [allowed, setAllowed] = useState(null);
  const [msgs, setMsgs] = useState([]);
  const [names, setNames] = useState({});
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const bottom = useRef(null);
  const camRef = useRef(null);
  const galRef = useRef(null);
  const namesRef = useRef({});
  namesRef.current = names;

  const ensureNames = useCallback(async (ids) => {
    const missing = [...new Set(ids)].filter((i) => i && !namesRef.current[i]);
    if (!missing.length) return;
    const { data } = await supabase.from('public_profiles').select('id,full_name').in('id', missing);
    if (data) setNames((n) => ({ ...n, ...Object.fromEntries(data.map((p) => [p.id, p.full_name])) }));
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: ok } = await supabase.rpc('can_chat');
      if (!alive) return;
      setAllowed(!!ok);
      if (!ok) return;
      const { data } = await supabase
        .from('chat_messages')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(150);
      if (!alive) return;
      const list = (data || []).reverse();
      setMsgs(list);
      ensureNames(list.map((m) => m.user_id));
    })();

    const ch = supabase
      .channel('chat-room')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, (p) => {
        setMsgs((m) => (m.some((x) => x.id === p.new.id) ? m : [...m, p.new]));
        ensureNames([p.new.user_id]);
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'chat_messages' }, (p) => {
        setMsgs((m) => m.filter((x) => x.id !== p.old.id));
      })
      .subscribe();

    return () => {
      alive = false;
      supabase.removeChannel(ch);
    };
  }, [ensureNames]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [msgs.length]);

  const append = (row) => setMsgs((m) => (m.some((x) => x.id === row.id) ? m : [...m, row]));

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
    if (!window.confirm('Hapus pesan ini untuk semua peserta?')) return;
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
          <div className="empty-ico">💬</div>
          <strong>Chat grup belum tersedia</strong>
          <p className="muted">Chat terbuka setelah pendaftaranmu di salah satu arisan disetujui admin.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="chat">
      <div className="chat-list">
        {msgs.length === 0 && <div className="center muted" style={{ marginTop: 40 }}>Belum ada pesan. Sapa peserta lain 👋</div>}
        {msgs.map((m, i) => {
          const mine = m.user_id === uid;
          const newDay = i === 0 || !sameDay(msgs[i - 1].created_at, m.created_at);
          return (
            <div key={m.id} style={{ display: 'contents' }}>
              {newDay && <div className="day-sep">{fmtDay(m.created_at)}</div>}
              <div className={`bubble ${mine ? 'me' : ''}`}>
                {!mine && <div className="who">{names[m.user_id] || '…'}</div>}
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
          📷
        </button>
        <button type="button" className="round-btn" disabled={busy} onClick={() => galRef.current?.click()} aria-label="Pilih dari galeri">
          🖼️
        </button>
        <textarea
          rows={1}
          placeholder="Tulis pesan…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKey}
        />
        <button className="round-btn send" disabled={busy || !text.trim()} aria-label="Kirim">
          ➤
        </button>
      </form>
    </div>
  );
}
