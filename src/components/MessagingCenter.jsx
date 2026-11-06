import { useEffect, useMemo, useState } from 'react';
import {
  collection, doc, getDocs, limit, onSnapshot, orderBy, query, where
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { Flag, Lock, MessageCircle, Search, Send, ShieldBan, UserRound, X } from 'lucide-react';
import { db, functions } from '../firebase';

const MAX_MESSAGE_LENGTH = 500;
const dateValue = value => {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  return new Date(value).getTime() || 0;
};
const hasLink = text => /(?:https?:\/\/|www\.|mailto:|[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}|(?:^|\s)[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/\S*)?)/i.test(text);
const conversationIdFor = (first, second) => [first, second].sort().join('__');

export default function MessagingCenter({ user, initialConversationId = '' }) {
  const [conversations, setConversations] = useState([]);
  const [participantProfiles, setParticipantProfiles] = useState({});
  const [selectedConversationId, setSelectedConversationId] = useState(initialConversationId);
  const [selectedRecipient, setSelectedRecipient] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messageText, setMessageText] = useState('');
  const [searchText, setSearchText] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [blockedUsers, setBlockedUsers] = useState([]);
  const [sending, setSending] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (initialConversationId) setSelectedConversationId(initialConversationId);
  }, [initialConversationId]);

  useEffect(() => {
    if (!user?.id) return undefined;
    const conversationsQuery = query(collection(db, 'conversations'), where('participants', 'array-contains', user.id));
    return onSnapshot(conversationsQuery, snapshot => {
      const items = snapshot.docs.map(item => ({ ...item.data(), id: item.id }));
      items.sort((a, b) => dateValue(b.updatedAt) - dateValue(a.updatedAt));
      setConversations(items);
    }, error => {
      console.error('No se pudieron cargar las conversaciones:', error);
      setErrorMessage('No se pudieron cargar tus conversaciones. Comprueba los permisos de Firebase.');
    });
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return undefined;
    return onSnapshot(collection(db, 'users', user.id, 'blockedUsers'), snapshot => {
      setBlockedUsers(snapshot.docs.map(item => item.id));
    }, error => console.error('No se pudo cargar la lista de bloqueos:', error));
  }, [user?.id]);

  useEffect(() => {
    if (!selectedConversationId || !user?.id || selectedRecipient) {
      setMessages([]);
      return undefined;
    }
    setLoadingMessages(true);
    return onSnapshot(collection(db, 'conversations', selectedConversationId, 'messages'), snapshot => {
      const items = snapshot.docs.map(item => ({ ...item.data(), id: item.id }));
      items.sort((a, b) => dateValue(a.createdAt) - dateValue(b.createdAt));
      setMessages(items);
      setLoadingMessages(false);
    }, error => {
      console.error('No se pudieron cargar los mensajes:', error);
      setLoadingMessages(false);
      setErrorMessage('No se pudo abrir esta conversación. Comprueba los permisos de Firebase.');
    });
  }, [selectedConversationId, selectedRecipient, user?.id]);

  useEffect(() => {
    const term = searchText.trim().toLocaleLowerCase('es');
    if (term.length < 2 || !user?.id) {
      setSearchResults([]);
      return undefined;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const profilesQuery = query(
          collection(db, 'publicProfiles'),
          orderBy('nameLower'),
          where('nameLower', '>=', term),
          where('nameLower', '<=', `${term}\uf8ff`),
          limit(12)
        );
        const snapshot = await getDocs(profilesQuery);
        if (!cancelled) setSearchResults(snapshot.docs
          .map(item => ({ ...item.data(), id: item.id }))
          .filter(profile => profile.id !== user.id));
      } catch (error) {
        console.error('No se pudieron buscar usuarios:', error);
        if (!cancelled) setSearchResults([]);
      }
    }, 250);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [searchText, user?.id]);

  // Consulta los perfiles públicos por UID: el nombre y la foto cambian sin alterar el historial.
  const participantIds = useMemo(() => [...new Set(conversations.flatMap(item => item.participants || []).filter(id => id && id !== user?.id))].sort(), [conversations, user?.id]);
  const participantIdsKey = participantIds.join('|');
  useEffect(() => {
    const ids = participantIdsKey ? participantIdsKey.split('|') : [];
    setParticipantProfiles({});
    const unsubscribers = ids.map(uid => onSnapshot(doc(db, 'publicProfiles', uid), snapshot => {
      if (snapshot.exists()) setParticipantProfiles(current => ({ ...current, [uid]: snapshot.data() }));
    }, error => console.warn('No se pudo consultar el perfil público del participante:', uid, error)));
    return () => unsubscribers.forEach(unsubscribe => unsubscribe());
  }, [participantIdsKey]);

  const activeConversation = useMemo(() => conversations.find(item => item.id === selectedConversationId) || null, [conversations, selectedConversationId]);
  const otherUid = activeConversation?.participants?.find(uid => uid !== user?.id) || selectedRecipient?.id || '';
  const otherName = participantProfiles[otherUid]?.name
    || activeConversation?.participantNames?.[otherUid]
    || selectedRecipient?.name
    || searchResults.find(profile => profile.id === otherUid)?.name
    || 'Usuario de ToonKnight';
  const isBlocked = blockedUsers.includes(otherUid);
  const consecutiveLimitReached = activeConversation?.lastSenderId === user?.id
    && Number(activeConversation?.consecutiveCount || 0) >= 3;

  const startConversation = profile => {
    setSelectedConversationId(conversationIdFor(user.id, profile.id));
    setSelectedRecipient(profile);
    setSearchText('');
    setSearchResults([]);
    setErrorMessage('');
  };

  const sendMessage = async event => {
    event.preventDefault();
    const text = messageText.trim();
    if (!otherUid || !text || sending) return;
    if (text.length > MAX_MESSAGE_LENGTH) return;
    if (hasLink(text)) {
      setErrorMessage('No se permiten enlaces en los mensajes.');
      return;
    }
    if (isBlocked) {
      setErrorMessage('Has bloqueado a este usuario. Desbloquéalo para volver a escribirle.');
      return;
    }
    if (consecutiveLimitReached) {
      setErrorMessage('Has enviado tres mensajes seguidos. Espera a que la otra persona responda.');
      return;
    }
    setSending(true);
    setErrorMessage('');
    try {
      const send = httpsCallable(functions, 'sendDirectMessage');
      const response = await send({ recipientUid: otherUid, text });
      setSelectedConversationId(response.data.conversationId);
      setSelectedRecipient(null);
      setMessageText('');
    } catch (error) {
      console.error('No se pudo enviar el mensaje:', error);
      const code = error?.code || '';
      setErrorMessage(code.includes('failed-precondition')
        ? 'Has enviado tres mensajes seguidos. Espera a que la otra persona responda.'
        : code.includes('permission-denied')
          ? 'No se puede enviar el mensaje: existe un bloqueo entre estas cuentas.'
          : error?.message || 'No se pudo enviar el mensaje. Inténtalo de nuevo.');
    } finally {
      setSending(false);
    }
  };

  const toggleBlock = async () => {
    if (!otherUid) return;
    const shouldBlock = !isBlocked;
    if (shouldBlock && !window.confirm(`¿Quieres bloquear a ${otherName}? No podrá enviarte mensajes privados.`)) return;
    try {
      const setBlock = httpsCallable(functions, 'setUserBlock');
      await setBlock({ targetUid: otherUid, blocked: shouldBlock });
    } catch (error) {
      console.error('No se pudo actualizar el bloqueo:', error);
      setErrorMessage('No se pudo actualizar el bloqueo.');
    }
  };

  const report = async (type, extra = {}) => {
    const reason = window.prompt('Indica el motivo de la denuncia (spam, acoso, suplantación, contenido inapropiado u otro):');
    if (!reason?.trim()) return;
    const details = window.prompt('Añade detalles para ayudar al moderador a investigar (opcional):') || '';
    try {
      const reportContent = httpsCallable(functions, 'reportContent');
      await reportContent({ type, reason: reason.trim(), details, ...extra });
      window.alert('Denuncia enviada al equipo de moderación.');
    } catch (error) {
      console.error('No se pudo enviar la denuncia:', error);
      window.alert('No se pudo enviar la denuncia. Inténtalo de nuevo.');
    }
  };

  if (!user?.id) return <div className="mx-auto max-w-4xl p-8 text-center text-sm text-gray-400">Inicia sesión para utilizar los mensajes privados.</div>;

  return <section className="mx-auto max-w-7xl space-y-5 px-4 py-8 sm:px-6 lg:px-12">
    <div><span className="text-xs font-semibold uppercase tracking-wider text-red-400">COMUNIDAD TURODAJE</span><h1 className="mt-2 text-3xl font-black text-white">Mensajes privados</h1><p className="mt-2 text-sm text-gray-400">Conversaciones individuales. Solo texto, hasta 500 caracteres y sin enlaces ni archivos.</p></div>
    {errorMessage && <div role="alert" className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">{errorMessage}<button type="button" onClick={() => setErrorMessage('')} className="ml-2 underline">Cerrar</button></div>}
    <div className="grid min-h-[560px] grid-cols-1 overflow-hidden rounded-2xl border border-[#2e2e34] bg-[#17171b] md:grid-cols-[300px_minmax(0,1fr)]">
      <aside className="border-b border-[#2e2e34] md:border-b-0 md:border-r">
        <div className="border-b border-[#2e2e34] p-4"><label className="relative block"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" /><input value={searchText} onChange={event => setSearchText(event.target.value)} placeholder="Buscar usuarios..." className="w-full rounded-xl border border-[#34343b] bg-[#111113] py-2.5 pl-9 pr-3 text-sm text-white outline-none focus:border-red-500" /></label>
          {searchResults.length > 0 && <div className="mt-2 max-h-48 overflow-y-auto rounded-xl border border-[#34343b] bg-[#111113]">{searchResults.map(profile => <button key={profile.id} type="button" onClick={() => startConversation(profile)} className="flex w-full items-center gap-3 p-3 text-left hover:bg-[#24242b]"><img src={profile.photo || ''} alt="" className="h-9 w-9 rounded-full bg-[#2a2a30] object-cover" /><span className="min-w-0"><span className="block truncate text-sm font-semibold text-white">{profile.name || 'Usuario'}</span><span className="block text-[11px] text-gray-500">Iniciar conversación</span></span></button>)}</div>}
          {searchText.trim().length >= 2 && searchResults.length === 0 && <p className="mt-2 text-xs text-gray-500">No se encontraron usuarios con ese nombre.</p>}
        </div>
        <div className="max-h-[440px] overflow-y-auto p-2">
          {conversations.length === 0 ? <p className="p-4 text-sm text-gray-500">Todavía no tienes conversaciones. Busca a un usuario para escribirle.</p> : conversations.map(conversation => {
            const participant = conversation.participants?.find(uid => uid !== user.id);
            const name = participantProfiles[participant]?.name || conversation.participantNames?.[participant] || 'Usuario de ToonKnight';
            const photo = participantProfiles[participant]?.photo || conversation.participantPhotos?.[participant] || '';
            return <button key={conversation.id} type="button" onClick={() => { setSelectedConversationId(conversation.id); setSelectedRecipient(null); setErrorMessage(''); }} className={`flex w-full items-center gap-3 rounded-xl p-3 text-left transition ${selectedConversationId === conversation.id ? 'bg-red-600/15 border border-red-500/30' : 'border border-transparent hover:bg-[#222226]'}`}><img src={photo} alt="" className="h-10 w-10 rounded-full bg-[#2a2a30] object-cover" /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-white">{name}</span><span className="block truncate text-xs text-gray-500">{conversation.lastMessage || 'Abrir conversación'}</span></span><MessageCircle className="h-4 w-4 shrink-0 text-gray-500" /></button>;
          })}
        </div>
      </aside>
      <div className="flex min-h-[480px] min-w-0 flex-col">
        {!selectedConversationId ? <div className="flex flex-1 flex-col items-center justify-center p-8 text-center"><MessageCircle className="h-12 w-12 text-gray-700" /><h2 className="mt-4 text-lg font-bold text-white">Tus conversaciones</h2><p className="mt-2 max-w-sm text-sm text-gray-500">Selecciona una conversación o busca un usuario para enviarle un mensaje.</p></div> : <>
          <header className="flex items-center justify-between gap-3 border-b border-[#2e2e34] p-4"><div className="flex min-w-0 items-center gap-3"><UserRound className="h-5 w-5 shrink-0 text-red-300" /><div className="min-w-0"><h2 className="truncate text-sm font-bold text-white">{otherName}</h2><p className="text-[11px] text-gray-500">Conversación privada</p></div></div><div className="flex shrink-0 gap-2"><button type="button" onClick={() => report('user', { targetUid: otherUid })} title="Denunciar usuario" className="rounded-lg border border-[#34343b] p-2 text-gray-400 hover:text-red-300"><Flag className="h-4 w-4" /></button><button type="button" onClick={toggleBlock} title={isBlocked ? 'Desbloquear usuario' : 'Bloquear usuario'} className={`rounded-lg border p-2 ${isBlocked ? 'border-amber-500/40 text-amber-300' : 'border-[#34343b] text-gray-400 hover:text-red-300'}`}>{isBlocked ? <X className="h-4 w-4" /> : <ShieldBan className="h-4 w-4" />}</button></div></header>
          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {loadingMessages ? <p className="text-center text-xs text-gray-500">Cargando mensajes...</p> : messages.length === 0 ? <p className="py-10 text-center text-sm text-gray-500">Inicia la conversación con un mensaje.</p> : messages.map(message => <div key={message.id} className={`flex ${message.senderId === user.id ? 'justify-end' : 'justify-start'}`}><div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 ${message.senderId === user.id ? 'bg-red-600 text-white' : 'bg-[#28282f] text-gray-100'}`}><p className="whitespace-pre-wrap break-words text-sm">{message.text}</p><div className="mt-1 flex items-center justify-between gap-4"><span className="text-[10px] opacity-60">{new Date(dateValue(message.createdAt)).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}</span><button type="button" onClick={() => report('message', { conversationId: selectedConversationId, messageId: message.id })} title="Denunciar mensaje" className="opacity-60 hover:opacity-100"><Flag className="h-3 w-3" /></button></div></div></div>)}
          </div>
          <form onSubmit={sendMessage} className="space-y-2 border-t border-[#2e2e34] p-4"><textarea value={messageText} onChange={event => setMessageText(event.target.value)} maxLength={MAX_MESSAGE_LENGTH} rows={3} placeholder="Escribe un mensaje..." disabled={isBlocked || consecutiveLimitReached} className="w-full resize-y rounded-xl border border-[#34343b] bg-[#111113] p-3 text-sm text-white outline-none focus:border-red-500 disabled:opacity-50" /><div className="flex flex-wrap items-center justify-between gap-3"><span className="text-[11px] text-gray-500">{messageText.length}/{MAX_MESSAGE_LENGTH} · Sin enlaces ni archivos{consecutiveLimitReached ? ' · Esperando respuesta' : ''}</span><button type="submit" disabled={sending || !messageText.trim() || isBlocked || consecutiveLimitReached || messageText.length > MAX_MESSAGE_LENGTH} className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-40"><Send className="h-4 w-4" />{sending ? 'Enviando...' : 'Enviar'}</button></div>{isBlocked && <p className="text-xs text-amber-300"><Lock className="mr-1 inline h-3.5 w-3.5" />Has bloqueado a este usuario. Desbloquéalo para enviar mensajes.</p>}</form>
        </>}
      </div>
    </div>
    <p className="text-xs text-gray-500">Los mensajes se conservan para los participantes. Puedes denunciar mensajes o perfiles y bloquear cuentas. El límite de tres mensajes seguidos y los controles anti-spam se aplican también en el servidor.</p>
  </section>;
}
