import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../lib/auth.jsx';
import { supabase } from '../lib/supabase';
import { fmtTime } from '../lib/format';
import { useToast } from './Toast.jsx';
import Icon from './Icon.jsx';

export default function RouletteChat({ groupId }) {
  const { session } = useAuth();
  const toast = useToast();
  const [allowed, setAllowed] = useState(null);
  const [messages, setMessages] = useState([]);
  const [names, setNames] = useState({});
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const listRef = useRef(null);
  const uid = session.user.id;

  useEffect(() => {
    if (!groupId) {
      setAllowed(false);
      setMessages([]);
      setNames({});
      return undefined;
    }

    let active = true;
    const channel = supabase
      .channel(`roulette-chat-${groupId}-${uid}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'roulette_chat_messages',
          filter: `group_id=eq.${groupId}`,
        },
        async ({ new: message }) => {
          if (!active || message.group_id !== groupId || !message.body) return;
          setMessages((current) => current.some((item) => item.id === message.id)
            ? current
            : [...current, message].slice(-50));
          const { data: profile, error } = await supabase
            .from('public_profiles')
            .select('id,full_name')
            .eq('id', message.user_id)
            .maybeSingle();
          if (!active) return;
          if (error) {
            console.error('Gagal memuat nama peserta chat:', error);
            return;
          }
          if (profile) setNames((current) => ({ ...current, [profile.id]: profile.full_name }));
        }
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error(`Realtime channel "roulette-chat-${groupId}" failed: ${status}`);
        }
      });

    async function load() {
      setAllowed(null);
      setMessages([]);
      setNames({});
      const { data: canChat, error: accessError } = await supabase.rpc('can_access_roulette_chat', {
        p_group: groupId,
      });
      if (!active) return;
      if (accessError) {
        setAllowed(false);
        toast(accessError.message, 'error');
        return;
      }
      setAllowed(Boolean(canChat));
      if (!canChat) return;

      const { data, error } = await supabase
        .from('roulette_chat_messages')
        .select('id,group_id,user_id,body,created_at')
        .eq('group_id', groupId)
        .order('created_at', { ascending: false })
        .limit(50);
      if (!active) return;
      if (error) {
        toast(error.message, 'error');
        return;
      }

      const latestMessages = (data || []).reverse();
      setMessages((current) => {
        const ids = new Set(current.map((message) => message.id));
        return [...latestMessages, ...current.filter((message) => !ids.has(message.id))].slice(-50);
      });

      const userIds = [...new Set(latestMessages.map((message) => message.user_id))];
      if (userIds.length) {
        const { data: profiles, error: profilesError } = await supabase
          .from('public_profiles')
          .select('id,full_name')
          .in('id', userIds);
        if (!active) return;
        if (profilesError) {
          toast(profilesError.message, 'error');
          return;
        }
        setNames(Object.fromEntries((profiles || []).map((profile) => [profile.id, profile.full_name])));
      }
    }

    void load();
    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [groupId, toast, uid]);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages.length]);

  async function sendMessage(event) {
    event.preventDefault();
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true);
    const { data, error } = await supabase
      .from('roulette_chat_messages')
      .insert({ group_id: groupId, user_id: uid, body })
      .select('id,group_id,user_id,body,created_at')
      .single();
    setBusy(false);
    if (error) {
      toast(error.message, 'error');
      return;
    }
    setMessages((current) => current.some((message) => message.id === data.id)
      ? current
      : [...current, data].slice(-50));
    setNames((current) => ({ ...current, [uid]: current[uid] || 'Saya' }));
    setText('');
  }

  return (
    <section className="roulette-fullscreen-chat" aria-label="Chat peserta">
      <div className="roulette-fullscreen-chat-heading">
        <Icon name="message" size={17} />
        <strong>Chat peserta</strong>
        <span>Kelompok ini</span>
      </div>
      {allowed === false ? (
        <p className="roulette-fullscreen-chat-empty">Chat ini hanya untuk peserta aktif kelompok.</p>
      ) : (
        <>
          <div className="roulette-fullscreen-chat-messages" ref={listRef} aria-live="polite">
            {allowed === null ? (
              <p className="roulette-fullscreen-chat-empty">Menghubungkan chat…</p>
            ) : messages.length ? (
              messages.map((message) => (
                <article
                  className={`roulette-chat-message${message.user_id === uid ? ' is-mine' : ''}`}
                  key={message.id}
                >
                  <strong>{message.user_id === uid ? (names[uid] || 'Saya') : (names[message.user_id] || 'Peserta')}</strong>
                  <p>{message.body}</p>
                  <time>{fmtTime(message.created_at)}</time>
                </article>
              ))
            ) : (
              <p className="roulette-fullscreen-chat-empty">Belum ada pesan. Sapa peserta lain.</p>
            )}
          </div>
          <form className="roulette-fullscreen-chat-composer" onSubmit={sendMessage}>
            <input
              aria-label="Tulis pesan chat"
              placeholder="Sapa peserta lain…"
              value={text}
              onChange={(event) => setText(event.target.value)}
              maxLength={1000}
              disabled={allowed !== true || busy}
            />
            <button type="submit" aria-label="Kirim pesan" disabled={allowed !== true || busy || !text.trim()}>
              <Icon name="send" size={18} />
            </button>
          </form>
        </>
      )}
    </section>
  );
}
