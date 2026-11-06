import { useEffect, useMemo, useState } from 'react';
import { addDoc, collection, deleteDoc, doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { BriefcaseBusiness, Search, Plus, X, MapPin, Monitor, Mail, Phone, Pencil, Trash2, Flag, CheckCircle2, Clock3, UserRound, Filter } from 'lucide-react';
import { db } from '../firebase';

const TYPES = [
  { value: 'empleo', label: 'Empleo' },
  { value: 'colaboracion', label: 'Colaboración' },
  { value: 'servicio', label: 'Servicio' },
];
const CATEGORIES = ['Dirección','Producción','Guion','Interpretación / actores','Casting','Dirección de fotografía','Operador de cámara','Iluminación / eléctricos','Sonido directo','Diseño sonoro','Montaje y edición','Colorización','Dirección de arte','Vestuario y maquillaje','Localizaciones','VFX y animación','Música original','Distribución y festivales','Alquiler de equipos','Servicios audiovisuales','Otro'];
const MODALITIES = [{ value: 'remoto', label: 'Remoto' }, { value: 'presencial', label: 'Presencial' }, { value: 'hibrido', label: 'Híbrido' }];
const COMPENSATIONS = [{ value: 'remunerado', label: 'Remunerado' }, { value: 'no-remunerado', label: 'No remunerado' }, { value: 'negociable', label: 'Negociable' }, { value: 'no-especificado', label: 'No especificado' }];
const COUNTRIES = ['Argentina', 'Bolivia', 'Chile', 'Colombia', 'Costa Rica', 'Ecuador', 'España', 'Estados Unidos', 'México', 'Perú', 'Uruguay', 'Venezuela', 'Otro', 'Remoto / internacional'];
const EMPTY_FORM = { title: '', description: '', type: 'colaboracion', category: 'Dirección', country: '', modality: 'remoto', compensation: 'negociable', contactEmail: '', contactPhone: '', portfolioUrl: '' };
const inputClass = 'w-full rounded-xl border border-[#34343b] bg-[#111113] px-3 py-2.5 text-sm text-gray-100 placeholder:text-gray-500 focus:border-red-500 focus:outline-none';
const labelClass = 'mb-1.5 block text-xs font-medium text-gray-400';
const optionLabel = (options, value) => options.find(option => option.value === value)?.label || value || 'No especificado';
const formatDate = value => { const date = new Date(value || 0); return Number.isNaN(date.getTime()) || !value ? 'Fecha no disponible' : new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short', year: 'numeric' }).format(date); };

export default function JobsSection({ user, isAdmin, onLogin }) {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [queryText, setQueryText] = useState('');
  const [typeFilter, setTypeFilter] = useState('todos');
  const [categoryFilter, setCategoryFilter] = useState('todas');
  const [countryFilter, setCountryFilter] = useState('todos');
  const [modalityFilter, setModalityFilter] = useState('todas');
  const [statusFilter, setStatusFilter] = useState('activos');
  const [showForm, setShowForm] = useState(false);
  const [editingJob, setEditingJob] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [reportingId, setReportingId] = useState('');
  const [expandedJobs, setExpandedJobs] = useState(() => new Set());

  const toggleJobDetails = jobId => setExpandedJobs(previous => {
    const next = new Set(previous);
    if (next.has(jobId)) next.delete(jobId); else next.add(jobId);
    return next;
  });

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'jobListings'), snapshot => {
      const items = snapshot.docs.map(item => ({ ...item.data(), id: item.id }));
      items.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
      setJobs(items); setLoading(false); setLoadError('');
    }, error => {
      console.error('Error al cargar anuncios:', error);
      setLoadError('No se pudieron cargar los anuncios. Comprueba las reglas de Firestore.');
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const visibleJobs = useMemo(() => {
    const query = queryText.trim().toLocaleLowerCase('es');
    return jobs.filter(job => {
      if (statusFilter === 'activos' && job.status !== 'active') return false;
      if (statusFilter === 'cerrados' && job.status !== 'closed') return false;
      if (typeFilter !== 'todos' && job.type !== typeFilter) return false;
      if (categoryFilter !== 'todas' && job.category !== categoryFilter) return false;
      if (countryFilter !== 'todos' && job.country !== countryFilter) return false;
      if (modalityFilter !== 'todas' && job.modality !== modalityFilter) return false;
      if (query && ![job.title, job.description, job.category, job.country, job.authorName].filter(Boolean).join(' ').toLocaleLowerCase('es').includes(query)) return false;
      return true;
    });
  }, [jobs, queryText, typeFilter, categoryFilter, countryFilter, modalityFilter, statusFilter]);

  const openNewForm = () => {
    if (!user) { onLogin?.(); return; }
    setEditingJob(null); setForm({ ...EMPTY_FORM, contactEmail: user.contactEmail || user.email || '' }); setShowForm(true);
  };
  const openEditForm = job => {
    setEditingJob(job);
    setForm({ ...EMPTY_FORM, title: job.title || '', description: job.description || '', type: job.type || 'colaboracion', category: job.category || 'Dirección', country: job.country || '', modality: job.modality || 'remoto', compensation: job.compensation || 'negociable', contactEmail: job.contactEmail || '', contactPhone: job.contactPhone || '', portfolioUrl: job.portfolioUrl || '' });
    setShowForm(true);
  };
  const canManage = job => Boolean(user && (isAdmin || job.authorId === user.id || job.authorEmail === user.email));

  const handleSubmit = async event => {
    event.preventDefault();
    if (!user?.id) { onLogin?.(); return; }
    const title = form.title.trim(), description = form.description.trim();
    if (!title || !description || !form.country) { alert('Completa el título, la descripción y el país.'); return; }
    if (!form.contactEmail.trim() && !form.contactPhone.trim() && !window.confirm('No has añadido correo ni teléfono. ¿Quieres publicar el anuncio sin datos de contacto?')) return;
    if (form.portfolioUrl.trim()) {
      try { const parsed = new URL(form.portfolioUrl.trim()); if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error(); }
      catch { alert('El enlace del portafolio debe ser una URL válida que empiece por https:// o http://.'); return; }
    }
    setSaving(true);
    const now = new Date().toISOString();
    const payload = {
      title, description, type: form.type, category: form.category, country: form.country,
      modality: form.modality, compensation: form.compensation,
      contactEmail: form.contactEmail.trim(), contactPhone: form.contactPhone.trim(), portfolioUrl: form.portfolioUrl.trim(),
      authorId: editingJob?.authorId || user.id, authorEmail: editingJob?.authorEmail || user.email || '',
      authorName: editingJob?.authorName || user.name || user.email || 'Usuario', status: editingJob?.status || 'active', updatedAt: now,
      ...(editingJob ? {} : { createdAt: now }),
    };
    try {
      if (editingJob) {
        if (!canManage(editingJob)) throw new Error('No tienes permiso para editar este anuncio.');
        await updateDoc(doc(db, 'jobListings', editingJob.id), payload);
      } else await addDoc(collection(db, 'jobListings'), payload);
      setShowForm(false); setEditingJob(null); setForm(EMPTY_FORM);
    } catch (error) {
      console.error('No se pudo guardar el anuncio:', error);
      alert(error?.message?.includes('permiso') ? error.message : 'No se pudo guardar el anuncio. Comprueba las reglas de Firestore e inténtalo de nuevo.');
    } finally { setSaving(false); }
  };

  const handleToggleStatus = async job => {
    if (!canManage(job)) return;
    const status = job.status === 'closed' ? 'active' : 'closed';
    if (!window.confirm(status === 'closed' ? '¿Quieres cerrar este anuncio?' : '¿Quieres volver a activar este anuncio?')) return;
    try { await updateDoc(doc(db, 'jobListings', job.id), { status, updatedAt: new Date().toISOString() }); }
    catch (error) { console.error(error); alert('No se pudo cambiar el estado del anuncio. Comprueba las reglas de Firestore.'); }
  };
  const handleDelete = async job => {
    if (!canManage(job) || !window.confirm(`¿Eliminar definitivamente «${job.title}»?`)) return;
    try { await deleteDoc(doc(db, 'jobListings', job.id)); }
    catch (error) { console.error(error); alert('No se pudo eliminar el anuncio. Comprueba las reglas de Firestore.'); }
  };
  const handleReport = async job => {
    if (!user?.id) { onLogin?.(); return; }
    if (job.authorId === user.id || isAdmin) return;
    const reason = window.prompt('Indica brevemente el motivo de la denuncia (spam, fraude, contenido inapropiado, etc.):');
    if (!reason?.trim()) return;
    setReportingId(job.id);
    try {
      await addDoc(collection(db, 'jobReports'), { jobId: job.id, jobTitle: job.title, reason: reason.trim().slice(0, 1000), reporterId: user.id, reporterEmail: user.email || '', createdAt: new Date().toISOString(), status: 'pending' });
      alert('Denuncia enviada al equipo de moderación.');
    } catch (error) { console.error(error); alert('No se pudo enviar la denuncia. Comprueba las reglas de Firestore.'); }
    finally { setReportingId(''); }
  };

  return <div className="mx-auto max-w-7xl space-y-7 px-4 py-8 sm:px-6 lg:px-12">
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div><span className="text-xs font-semibold uppercase tracking-wider text-red-400">OPORTUNIDADES PARA CREADORES</span><h1 className="mt-2 flex items-center gap-3 text-3xl font-black tracking-tight text-white sm:text-4xl"><BriefcaseBusiness className="h-8 w-8 text-red-400" />Empleo, colaboraciones y servicios</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-gray-400">Encuentra trabajo, forma un equipo o anuncia los servicios que ofreces en el cine y la producción audiovisual.</p></div>
      <button onClick={openNewForm} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-red-500"><Plus className="h-4 w-4" />Publicar anuncio</button>
    </div>
    <div className="space-y-4 rounded-2xl border border-[#2e2e34] bg-[#1a1a1e] p-4 sm:p-5">
      <div className="relative"><Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" /><input value={queryText} onChange={e => setQueryText(e.target.value)} placeholder="Buscar por título, especialidad, descripción o usuario..." className={`${inputClass} pl-10 pr-4`} aria-label="Buscar anuncios" /></div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className={labelClass}>Tipo de anuncio<select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className={inputClass}><option value="todos">Todos los tipos</option>{TYPES.map(type => <option key={type.value} value={type.value}>{type.label}</option>)}</select></label>
        <label className={labelClass}>Especialidad<select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} className={inputClass}><option value="todas">Todas las especialidades</option>{CATEGORIES.map(category => <option key={category}>{category}</option>)}</select></label>
        <label className={labelClass}>País<select value={countryFilter} onChange={e => setCountryFilter(e.target.value)} className={inputClass}><option value="todos">Todos los países</option>{COUNTRIES.map(country => <option key={country}>{country}</option>)}</select></label>
        <label className={labelClass}>Modalidad<select value={modalityFilter} onChange={e => setModalityFilter(e.target.value)} className={inputClass}><option value="todas">Todas las modalidades</option>{MODALITIES.map(modality => <option key={modality.value} value={modality.value}>{modality.label}</option>)}</select></label>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#2e2e34] pt-3"><div className="flex flex-wrap gap-2">{[['activos', 'Anuncios activos'], ['todos', 'Todos'], ['cerrados', 'Cerrados']].map(([value, label]) => <button key={value} onClick={() => setStatusFilter(value)} className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${statusFilter === value ? 'border-red-500 bg-red-500/15 text-red-300' : 'border-[#34343b] text-gray-400 hover:text-white'}`}>{label}</button>)}</div><span className="text-xs text-gray-500"><Filter className="mr-1 inline h-3.5 w-3.5" />{visibleJobs.length} anuncio(s)</span></div>
    </div>
    {loadError && <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">{loadError}</div>}
    {loading ? <div className="rounded-2xl border border-[#2e2e34] p-10 text-center text-sm text-gray-400">Cargando anuncios…</div> : visibleJobs.length === 0 ? <div className="rounded-2xl border border-dashed border-[#34343b] p-10 text-center"><BriefcaseBusiness className="mx-auto h-10 w-10 text-gray-600" /><h2 className="mt-3 text-lg font-bold text-white">No hay anuncios que coincidan</h2><p className="mt-1 text-sm text-gray-500">Prueba otros filtros o publica la primera oportunidad.</p><button onClick={openNewForm} className="mt-4 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-red-500">Publicar anuncio</button></div> : <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">{visibleJobs.map(job => {
      const canEdit = canManage(job);
      const isExpanded = expandedJobs.has(job.id);
      return <article key={job.id} className={`flex flex-col rounded-xl border bg-[#1a1a1e] p-4 transition ${job.status === 'closed' ? 'border-[#34343b] opacity-75' : 'border-[#2e2e34] hover:border-red-500/40'}`}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex flex-wrap gap-1.5">
            <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${job.type === 'empleo' ? 'bg-emerald-500/10 text-emerald-300' : job.type === 'servicio' ? 'bg-violet-500/10 text-violet-300' : 'bg-red-500/10 text-red-300'}`}>{optionLabel(TYPES, job.type)}</span>
            {job.status === 'closed' && <span className="rounded-full bg-gray-500/15 px-2 py-1 text-[10px] text-gray-400">Cerrado</span>}
            <span className="rounded-full bg-[#292930] px-2 py-1 text-[10px] text-gray-300">{job.category}</span>
          </div>
          <span className="text-[11px] text-gray-500">{formatDate(job.createdAt)}</span>
        </div>
        <h2 className="mt-2.5 text-base font-bold leading-snug text-white">{job.title}</h2>
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1.5 text-[11px] text-gray-400">
          <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{job.country || 'País no especificado'}</span>
          <span className="inline-flex items-center gap-1"><Monitor className="h-3 w-3" />{optionLabel(MODALITIES, job.modality)}</span>
          <span className="inline-flex items-center gap-1"><CheckCircle2 className="h-3 w-3" />{optionLabel(COMPENSATIONS, job.compensation)}</span>
        </div>
        {isExpanded && <>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-5 text-gray-300">{job.description}</p>
          <div className="mt-3 flex items-center gap-2 border-t border-[#2e2e34] pt-3 text-xs text-gray-500"><UserRound className="h-3.5 w-3.5" /><span>{job.authorName || 'Usuario de TuRodaje'}</span></div>
          {(job.contactEmail || job.contactPhone || job.portfolioUrl) && <div className="mt-3 flex flex-wrap gap-2">
            {job.contactEmail && <a href={`mailto:${job.contactEmail}`} className="inline-flex items-center gap-1.5 rounded-lg border border-[#34343b] px-2.5 py-1.5 text-xs text-red-300 hover:bg-red-500/10"><Mail className="h-3.5 w-3.5" />Contactar por correo</a>}
            {job.contactPhone && <a href={`tel:${job.contactPhone.replace(/[^\d+]/g, '')}`} className="inline-flex items-center gap-1.5 rounded-lg border border-[#34343b] px-2.5 py-1.5 text-xs text-red-300 hover:bg-red-500/10"><Phone className="h-3.5 w-3.5" />{job.contactPhone}</a>}
            {job.portfolioUrl && <a href={job.portfolioUrl} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1.5 rounded-lg border border-[#34343b] px-2.5 py-1.5 text-xs text-red-300 hover:bg-red-500/10">Ver portafolio ↗</a>}
          </div>}
        </>}
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[#2e2e34] pt-3">
          <button onClick={() => toggleJobDetails(job.id)} aria-expanded={isExpanded} className="inline-flex items-center gap-1 rounded-lg bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-300 hover:bg-red-500/20">{isExpanded ? 'Ocultar detalles' : 'Ver detalles'}</button>
          {canEdit && <><button onClick={() => openEditForm(job)} className="inline-flex items-center gap-1.5 rounded-lg border border-[#34343b] px-2.5 py-1.5 text-xs text-gray-300 hover:bg-[#292930]"><Pencil className="h-3.5 w-3.5" />Editar</button><button onClick={() => handleToggleStatus(job)} className="inline-flex items-center gap-1.5 rounded-lg border border-[#34343b] px-2.5 py-1.5 text-xs text-gray-300 hover:bg-[#292930]"><Clock3 className="h-3.5 w-3.5" />{job.status === 'closed' ? 'Reabrir' : 'Cerrar'}</button><button onClick={() => handleDelete(job)} className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/20 px-2.5 py-1.5 text-xs text-red-300 hover:bg-red-500/10"><Trash2 className="h-3.5 w-3.5" />Eliminar</button></>}
          {user && !canEdit && <button disabled={reportingId === job.id} onClick={() => handleReport(job)} className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/20 px-2.5 py-1.5 text-xs text-amber-300 hover:bg-amber-500/10 disabled:opacity-50"><Flag className="h-3.5 w-3.5" />{reportingId === job.id ? 'Enviando…' : 'Denunciar'}</button>}
        </div>
      </article>;
    })}</div>}
    {showForm && <div className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto bg-black/80 p-4 backdrop-blur-sm" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setShowForm(false); }}><div role="dialog" aria-modal="true" aria-labelledby="job-form-title" className="my-8 w-full max-w-3xl rounded-3xl border border-[#34343b] bg-[#171719] p-5 shadow-2xl sm:p-7"><div className="mb-5 flex items-center justify-between gap-3"><div><h2 id="job-form-title" className="text-xl font-bold text-white">{editingJob ? 'Editar anuncio' : 'Publicar anuncio'}</h2><p className="mt-1 text-xs text-gray-500">Los datos de contacto son opcionales y solo se publican si los completas.</p></div><button onClick={() => setShowForm(false)} className="rounded-lg p-2 text-gray-400 hover:bg-[#292930] hover:text-white" aria-label="Cerrar formulario"><X className="h-5 w-5" /></button></div>
      <form onSubmit={handleSubmit} className="space-y-4"><div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="sm:col-span-2"><span className={labelClass}>Título *</span><input required maxLength={120} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} className={inputClass} placeholder="Ej. Buscamos operador de cámara para un cortometraje" /></label>
        <label><span className={labelClass}>Tipo de anuncio *</span><select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} className={inputClass}>{TYPES.map(type => <option key={type.value} value={type.value}>{type.label}</option>)}</select></label>
        <label><span className={labelClass}>Especialidad *</span><select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} className={inputClass}>{CATEGORIES.map(category => <option key={category}>{category}</option>)}</select></label>
        <label><span className={labelClass}>País *</span><select required value={form.country} onChange={e => setForm({ ...form, country: e.target.value })} className={inputClass}><option value="">Selecciona un país</option>{COUNTRIES.map(country => <option key={country}>{country}</option>)}</select></label>
        <label><span className={labelClass}>Modalidad *</span><select value={form.modality} onChange={e => setForm({ ...form, modality: e.target.value })} className={inputClass}>{MODALITIES.map(modality => <option key={modality.value} value={modality.value}>{modality.label}</option>)}</select></label>
        <label><span className={labelClass}>Remuneración</span><select value={form.compensation} onChange={e => setForm({ ...form, compensation: e.target.value })} className={inputClass}>{COMPENSATIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
        <label><span className={labelClass}>Correo de contacto (opcional)</span><input type="email" maxLength={254} value={form.contactEmail} onChange={e => setForm({ ...form, contactEmail: e.target.value })} className={inputClass} placeholder="contacto@ejemplo.com" /></label>
        <label><span className={labelClass}>Teléfono (opcional)</span><input type="tel" maxLength={40} value={form.contactPhone} onChange={e => setForm({ ...form, contactPhone: e.target.value })} className={inputClass} placeholder="+34 600 000 000" /></label>
        <label className="sm:col-span-2"><span className={labelClass}>Portafolio o web (opcional)</span><input type="url" maxLength={500} value={form.portfolioUrl} onChange={e => setForm({ ...form, portfolioUrl: e.target.value })} className={inputClass} placeholder="https://..." /></label>
        <label className="sm:col-span-2"><span className={labelClass}>Descripción *</span><textarea required minLength={10} maxLength={5000} rows={6} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className={inputClass} placeholder="Explica el proyecto, las tareas, requisitos, condiciones y cómo contactar contigo." /></label>
      </div><div className="flex flex-col-reverse gap-2 border-t border-[#2e2e34] pt-4 sm:flex-row sm:justify-end"><button type="button" onClick={() => setShowForm(false)} className="rounded-xl border border-[#34343b] px-4 py-2.5 text-sm font-semibold text-gray-300 hover:bg-[#292930]">Cancelar</button><button type="submit" disabled={saving} className="rounded-xl bg-red-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-red-500 disabled:cursor-wait disabled:opacity-60">{saving ? 'Guardando…' : editingJob ? 'Guardar cambios' : 'Publicar anuncio'}</button></div></form>
    </div></div>}
    <p className="text-center text-xs leading-5 text-gray-600">Publica con responsabilidad. TuRodaje facilita el contacto entre usuarios, pero no verifica automáticamente la legitimidad de cada oferta.</p>
  </div>;
}
