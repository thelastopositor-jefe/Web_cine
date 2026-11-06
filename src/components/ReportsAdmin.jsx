import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { CheckCircle2, Clock3, Flag, Search, ShieldAlert } from 'lucide-react';
import { db, functions } from '../firebase';

const dateValue = value => {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  return new Date(value).getTime() || 0;
};
const statusLabel = status => status === 'resolved' ? 'Resuelta' : status === 'reviewing' ? 'En revisión' : 'Pendiente';
const typeLabel = report => report.type === 'message' ? 'Mensaje' : report.type === 'user' ? 'Usuario' : report.type === 'project' || report.projectId ? 'Proyecto' : 'Empleo / otro';

export default function ReportsAdmin() {
  const [reports, setReports] = useState([]);
  const [jobReports, setJobReports] = useState([]);
  const [selected, setSelected] = useState(null);
  const [search, setSearch] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    const unsubscribeReports = onSnapshot(collection(db, 'reports'), snapshot => {
      setReports(snapshot.docs.map(item => ({ ...item.data(), id: item.id, collectionName: 'reports' })));
      setLoadError('');
    }, error => { console.error(error); setLoadError('No se pudieron cargar las denuncias. Comprueba las reglas de moderación.'); });
    const unsubscribeJobs = onSnapshot(collection(db, 'jobReports'), snapshot => {
      setJobReports(snapshot.docs.map(item => ({ ...item.data(), id: item.id, collectionName: 'jobReports' })));
    }, error => console.error('No se pudieron cargar las denuncias de empleo:', error));
    return () => { unsubscribeReports(); unsubscribeJobs(); };
  }, []);

  const allReports = useMemo(() => [...reports, ...jobReports].sort((a, b) => dateValue(b.createdAt) - dateValue(a.createdAt)), [reports, jobReports]);
  // La bandeja principal solo muestra denuncias pendientes o en revisión.
  // Las resueltas permanecen guardadas en Firestore y en el registro de moderación.
  const filteredReports = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('es');
    return allReports.filter(report => report.status !== 'resolved' && (!term || [report.reason, report.details, report.projectTitle, report.targetName, report.jobTitle, report.reporterEmail, report.reporterUid].filter(Boolean).join(' ').toLocaleLowerCase('es').includes(term)));
  }, [allReports, search]);

  const updateStatus = async status => {
    if (!selected || saving) return;
    setSaving(true);
    try {
      const review = httpsCallable(functions, 'reviewReport');
      await review({ reportId: selected.id, collectionName: selected.collectionName, status, note });
      setSelected(current => current ? { ...current, status, moderatorNote: note } : current);
      setNote('');
    } catch (error) {
      console.error('No se pudo actualizar la denuncia:', error);
      window.alert('No se pudo actualizar la denuncia. Comprueba que las funciones de Firebase estén desplegadas.');
    } finally { setSaving(false); }
  };

  return <section className="space-y-4">
    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><h3 className="text-xl font-bold text-white">Denuncias recibidas</h3><p className="mt-1 text-xs text-gray-400">Revisa mensajes, perfiles, proyectos y anuncios reportados.</p></div><span className="text-xs text-amber-300">{allReports.filter(item => item.status !== 'resolved').length} pendientes o en revisión</span></div>
    <label className="relative block"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar denuncias..." className="w-full rounded-xl border border-[#34343b] bg-[#111113] py-2.5 pl-9 pr-3 text-sm text-white outline-none focus:border-red-500" /></label>
    {loadError && <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{loadError}</p>}
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <div className="max-h-[560px] space-y-2 overflow-y-auto pr-1">{filteredReports.length === 0 ? <p className="rounded-xl border border-dashed border-[#34343b] p-6 text-center text-sm text-gray-500">No hay denuncias que mostrar.</p> : filteredReports.map(report => <button key={`${report.collectionName}-${report.id}`} type="button" onClick={() => { setSelected(report); setNote(report.moderatorNote || ''); }} className={`w-full rounded-xl border p-3 text-left ${selected?.id === report.id && selected?.collectionName === report.collectionName ? 'border-red-500/50 bg-red-500/10' : 'border-[#2e2e34] bg-[#1a1a1e] hover:bg-[#222226]'}`}><div className="flex items-center justify-between gap-2"><span className="text-[10px] font-bold uppercase tracking-wider text-amber-300">{typeLabel(report)}</span><span className="text-[10px] text-gray-500">{statusLabel(report.status)}</span></div><p className="mt-1 text-sm font-semibold text-white">{report.reason || 'Sin motivo indicado'}</p><p className="mt-1 line-clamp-2 text-xs text-gray-400">{report.details || report.projectTitle || report.jobTitle || report.targetName || 'Sin detalles adicionales'}</p><p className="mt-2 text-[10px] text-gray-600">{dateValue(report.createdAt) ? new Date(dateValue(report.createdAt)).toLocaleString('es-ES') : 'Fecha no disponible'}</p></button>)}</div>
      <div className="min-h-[300px] rounded-xl border border-[#2e2e34] bg-[#1a1a1e] p-4">
        {!selected ? <div className="flex h-full flex-col items-center justify-center text-center"><ShieldAlert className="h-10 w-10 text-gray-700" /><p className="mt-3 text-sm text-gray-500">Selecciona una denuncia para investigar.</p></div> : <div className="space-y-4">
          <div className="flex items-center justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-wider text-amber-300">{typeLabel(selected)}</p><h4 className="mt-1 text-lg font-bold text-white">{selected.reason || 'Denuncia'}</h4></div><Flag className="h-5 w-5 text-red-300" /></div>
          <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2"><p className="text-gray-400">Denunciante: <span className="text-gray-200">{selected.reporterName || selected.reporterEmail || selected.reporterUid || 'No disponible'}</span></p><p className="text-gray-400">Denunciado: <span className="text-gray-200">{selected.targetName || selected.targetUid || selected.projectTitle || selected.jobTitle || 'No especificado'}</span></p><p className="text-gray-400">Estado: <span className="text-gray-200">{statusLabel(selected.status)}</span></p><p className="text-gray-400">ID: <span className="break-all text-gray-500">{selected.id}</span></p></div>
          {selected.details && <div><p className="mb-1 text-xs font-bold text-gray-300">Detalles aportados</p><p className="whitespace-pre-wrap rounded-lg bg-[#111113] p-3 text-sm text-gray-300">{selected.details}</p></div>}
          {selected.contextMessages?.length > 0 && <div><p className="mb-2 text-xs font-bold text-gray-300">Contexto de la conversación</p><div className="max-h-64 space-y-2 overflow-y-auto rounded-lg bg-[#111113] p-3">{selected.contextMessages.map(message => <div key={message.id} className="rounded-lg border border-[#292930] p-2"><p className="mb-1 text-[10px] text-gray-500">{message.senderId === selected.targetUid ? 'Usuario denunciado' : message.senderId === selected.reporterUid ? 'Denunciante' : 'Participante'}</p><p className="whitespace-pre-wrap break-words text-xs text-gray-200">{message.text}</p></div>)}</div></div>}
          {selected.projectTitle && <p className="text-xs text-gray-400">Proyecto: <span className="text-gray-200">{selected.projectTitle}</span></p>}
          <label className="block text-xs font-bold text-gray-300">Nota interna del moderador<textarea value={note} onChange={event => setNote(event.target.value)} maxLength={1000} rows={3} placeholder="Anota lo que has comprobado o la medida tomada..." className="mt-1 w-full rounded-xl border border-[#34343b] bg-[#111113] p-3 text-sm text-white" /></label>
          <div className="flex flex-wrap gap-2"><button type="button" disabled={saving} onClick={() => updateStatus('reviewing')} className="inline-flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-bold text-amber-200 disabled:opacity-50"><Clock3 className="h-4 w-4" />En revisión</button><button type="button" disabled={saving} onClick={() => updateStatus('resolved')} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"><CheckCircle2 className="h-4 w-4" />Resolver denuncia</button></div>
          {selected.moderatorNote && <p className="text-xs text-gray-500">Nota guardada: {selected.moderatorNote}</p>}
        </div>}
      </div>
    </div>
  </section>;
}
