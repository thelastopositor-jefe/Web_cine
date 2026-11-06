import { useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { BellRing, Send } from 'lucide-react';
import { functions } from '../firebase';

export default function BroadcastManager({ isAdmin }) {
  const [form, setForm] = useState({ title: '', body: '', type: 'general', targetType: 'none', targetId: '' });
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState('');

  const submit = async event => {
    event.preventDefault();
    if (!isAdmin || sending) return;
    if (!window.confirm('Este aviso se enviará a todos los usuarios registrados, incluidos los que no estén activos. ¿Continuar?')) return;
    setSending(true);
    setMessage('');
    try {
      const send = httpsCallable(functions, 'sendBroadcast');
      const target = form.targetType === 'none' || !form.targetId.trim()
        ? null
        : { [form.targetType === 'news' ? 'newsId' : 'projectId']: form.targetId.trim() };
      const response = await send({ title: form.title.trim(), body: form.body.trim(), type: form.type, target });
      setMessage(`Aviso creado. Se está distribuyendo a todos los usuarios (ID: ${response.data.broadcastId}).`);
      setForm({ title: '', body: '', type: 'general', targetType: 'none', targetId: '' });
    } catch (error) {
      console.error('No se pudo enviar el aviso general:', error);
      setMessage('No se pudo crear el aviso. Comprueba que Cloud Functions esté desplegado.');
    } finally { setSending(false); }
  };

  if (!isAdmin) return null;
  return <section className="space-y-4 rounded-2xl border border-[#2e2e34] bg-[#1a1a1e] p-4 sm:p-5">
    <div className="flex items-center gap-3"><BellRing className="h-5 w-5 text-amber-300" /><div><h3 className="text-lg font-bold text-white">Avisos generales</h3><p className="text-xs text-gray-400">Se acumulan en la campana de todos los usuarios, incluso si están inactivos.</p></div></div>
    <form onSubmit={submit} className="space-y-3">
      <label className="block text-xs text-gray-400">Título<input required maxLength={120} value={form.title} onChange={event => setForm(current => ({ ...current, title: event.target.value }))} className="mt-1 w-full rounded-xl border border-[#34343b] bg-[#111113] p-3 text-sm text-white" /></label>
      <label className="block text-xs text-gray-400">Mensaje<textarea required rows={4} maxLength={2000} value={form.body} onChange={event => setForm(current => ({ ...current, body: event.target.value }))} className="mt-1 w-full rounded-xl border border-[#34343b] bg-[#111113] p-3 text-sm text-white" /></label>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><label className="block text-xs text-gray-400">Tipo<select value={form.type} onChange={event => setForm(current => ({ ...current, type: event.target.value }))} className="mt-1 w-full rounded-xl border border-[#34343b] bg-[#111113] p-3 text-sm text-white"><option value="general">General</option><option value="news">Noticias</option><option value="event">Evento</option><option value="update">Actualización</option><option value="contest">Concurso</option></select></label><label className="block text-xs text-gray-400">Enlace interno (opcional)<select value={form.targetType} onChange={event => setForm(current => ({ ...current, targetType: event.target.value, targetId: '' }))} className="mt-1 w-full rounded-xl border border-[#34343b] bg-[#111113] p-3 text-sm text-white"><option value="none">Sin destino</option><option value="news">ID de noticia</option><option value="project">ID de proyecto</option></select></label></div>
      {form.targetType !== 'none' && <label className="block text-xs text-gray-400">ID del destino<input value={form.targetId} onChange={event => setForm(current => ({ ...current, targetId: event.target.value }))} className="mt-1 w-full rounded-xl border border-[#34343b] bg-[#111113] p-3 text-sm text-white" /></label>}
      <div className="flex flex-wrap items-center justify-between gap-3"><span className="text-[11px] text-gray-500">Se enviará a todos los usuarios registrados.</span><button type="submit" disabled={sending || !form.title.trim() || !form.body.trim()} className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2.5 text-xs font-bold text-black hover:bg-amber-400 disabled:opacity-50"><Send className="h-4 w-4" />{sending ? 'Enviando...' : 'Enviar aviso general'}</button></div>
    </form>
    {message && <p role="status" className="rounded-lg border border-[#34343b] bg-[#111113] p-3 text-xs text-gray-300">{message}</p>}
  </section>;
}
