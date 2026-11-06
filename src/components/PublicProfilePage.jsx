import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { ArrowLeft, ExternalLink, Flag, ShieldAlert, ShieldBan, Trash2, UserRound } from 'lucide-react';
import { auth, db, functions } from '../firebase';

const safeHttpLink = value => {
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) ? url.href : ''; }
  catch { return ''; }
};

export default function PublicProfilePage({ profileId, user, isAdmin, onClose, onEdit, onOpenProject, onDeleted, availableProjects = [] }) {
  const [profile, setProfile] = useState(null);
  const [projects, setProjects] = useState([]);
  const [ownedProjectCount, setOwnedProjectCount] = useState(0);
  const [ownedContentCounts, setOwnedContentCounts] = useState({ jobs: 0, discussions: 0, comments: 0 });
  const [loading, setLoading] = useState(true);
  const [projectsError, setProjectsError] = useState('');
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);
  const isOwner = Boolean(profileId && (user?.id === profileId || auth.currentUser?.uid === profileId));
  // El catálogo público ya está sincronizado por App; evita depender de una Cloud Function
  // que podría no estar desplegada y mantiene el portafolio actualizado en tiempo real.
  const publicProjects = availableProjects.filter(project => project.creatorId === profileId && project.status === 'approved');
  const visibleProjects = [...new Map([...publicProjects, ...projects].map(project => [project.id, project])).values()];

  useEffect(() => {
    if (!profileId) return undefined;
    const unsubscribe = onSnapshot(doc(db, 'publicProfiles', profileId), snapshot => {
      setProfile(snapshot.exists() ? { ...snapshot.data(), id: snapshot.id } : null);
      setLoading(false);
    }, error => { console.error('No se pudo cargar el perfil público:', error); setLoading(false); });
    return unsubscribe;
  }, [profileId]);

  useEffect(() => {
    if (!user?.id || user.id === profileId) { setIsBlocked(false); return undefined; }
    return onSnapshot(doc(db, 'users', user.id, 'blockedUsers', profileId), snapshot => setIsBlocked(snapshot.exists()), error => console.error('No se pudo consultar el bloqueo:', error));
  }, [user?.id, profileId]);

  useEffect(() => {
    if (!profileId) return undefined;
    let cancelled = false;
    setProjects([]);
    setProjectsError('');
    setProjectsLoading(true);
    const loadProjects = async () => {
      try {
        const getProjects = httpsCallable(functions, 'getCreatorProjects');
        const response = await getProjects({ targetUid: profileId });
        if (cancelled) return;
        setProjectsError('');
        setOwnedProjectCount(Number(response.data?.totalOwnedCount || 0));
        setOwnedContentCounts({ jobs: Number(response.data?.jobsCount || 0), discussions: Number(response.data?.discussionsCount || 0), comments: Number(response.data?.commentsCount || 0) });
        setProjects(Array.isArray(response.data?.projects) ? response.data.projects : []);
      } catch (error) {
        if (!cancelled) setProjectsError('No se pudo consultar el portafolio completo. Se muestran los proyectos disponibles en el catálogo.');
        console.error('No se pudieron cargar los proyectos del creador:', error);
      } finally {
        if (!cancelled) setProjectsLoading(false);
      }
    };
    loadProjects();
    return () => { cancelled = true; };
  }, [profileId]);

  const deleteAccount = async () => {
    if ((!isOwner && !isAdmin) || deleting) return;
    const confirmation = window.prompt(`Esta acción eliminará la cuenta y sus proyectos publicados. Escribe ELIMINAR para confirmar.`);
    if (confirmation !== 'ELIMINAR') return;
    let reason = 'Eliminación solicitada por el titular.';
    if (!isOwner && isAdmin) {
      reason = window.prompt('Indica el motivo de moderación (obligatorio):')?.trim() || '';
      if (reason.length < 10) { window.alert('El motivo debe tener al menos 10 caracteres.'); return; }
    }
    if (!window.confirm(`Se eliminarán la cuenta, ${ownedProjectCount} proyectos, ${ownedContentCounts.jobs} anuncios de empleo, ${ownedContentCounts.discussions} temas y ${ownedContentCounts.comments} comentarios asociados. Esta acción no se puede deshacer. ¿Continuar?`)) return;
    setDeleting(true);
    try {
      const removeAccount = httpsCallable(functions, 'deleteUserAccount');
      await removeAccount({ targetUid: profileId, reason });
      window.alert('La cuenta y sus proyectos han sido eliminados.');
      onDeleted?.(profileId);
    } catch (error) {
      console.error('No se pudo eliminar la cuenta:', error);
      window.alert(error?.message || 'No se pudo eliminar la cuenta. Comprueba que Cloud Functions esté desplegado.');
    } finally { setDeleting(false); }
  };

  const reportProfile = async () => {
    if (!user?.id || isOwner) return;
    const reason = window.prompt('Indica el motivo de la denuncia (spam, acoso, suplantación, contenido inapropiado u otro):');
    if (!reason?.trim()) return;
    const details = window.prompt('Añade detalles para ayudar al moderador a investigar (opcional):') || '';
    try {
      const report = httpsCallable(functions, 'reportContent');
      await report({ type: 'user', targetUid: profileId, reason: reason.trim(), details });
      window.alert('Denuncia enviada al equipo de moderación.');
    } catch (error) {
      console.error('No se pudo denunciar el perfil:', error);
      window.alert('No se pudo enviar la denuncia. Comprueba que Cloud Functions esté desplegado.');
    }
  };

  const toggleBlock = async () => {
    if (!user?.id || isOwner) return;
    if (!window.confirm(isBlocked ? `¿Desbloquear a ${profile?.name || 'este usuario'}?` : `¿Bloquear a ${profile?.name || 'este usuario'}? No podrá enviarte mensajes.`)) return;
    try {
      const block = httpsCallable(functions, 'setUserBlock');
      await block({ targetUid: profileId, blocked: !isBlocked });
    } catch (error) {
      console.error('No se pudo actualizar el bloqueo:', error);
      window.alert('No se pudo actualizar el bloqueo.');
    }
  };

  if (loading) return <div className="mx-auto max-w-6xl p-10 text-center text-sm text-gray-400">Cargando perfil...</div>;
  if (!profile) return <div className="mx-auto max-w-6xl space-y-4 p-10 text-center"><p className="text-sm text-gray-400">Este perfil público no está disponible.</p><button type="button" onClick={onClose} className="rounded-xl bg-[#292930] px-4 py-2 text-sm text-white">Volver</button></div>;

  return <main className="mx-auto max-w-6xl space-y-7 px-4 py-8 sm:px-6 lg:px-12">
    <div className="flex flex-wrap items-center justify-between gap-3"><button type="button" onClick={onClose} className="inline-flex items-center gap-2 rounded-lg border border-[#34343b] px-3 py-2 text-xs font-semibold text-gray-300 hover:bg-[#222226]"><ArrowLeft className="h-4 w-4" />Volver</button><div className="flex flex-wrap gap-2">{user && !isOwner && <><button type="button" onClick={reportProfile} className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/30 px-3 py-2 text-xs text-red-300"><Flag className="h-3.5 w-3.5" />Denunciar</button><button type="button" onClick={toggleBlock} className="inline-flex items-center gap-1.5 rounded-lg border border-[#34343b] px-3 py-2 text-xs text-gray-300"><ShieldBan className="h-3.5 w-3.5" />{isBlocked ? 'Desbloquear' : 'Bloquear'}</button></>}{(isOwner || isAdmin) && <>{isOwner && <button type="button" onClick={onEdit} className="rounded-lg bg-red-600 px-3 py-2 text-xs font-bold text-white hover:bg-red-500">Editar perfil</button>}<button type="button" disabled={deleting} onClick={deleteAccount} className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/30 px-3 py-2 text-xs font-bold text-red-300 hover:bg-red-500/10 disabled:opacity-50"><Trash2 className="h-3.5 w-3.5" />{deleting ? 'Eliminando...' : isOwner ? 'Eliminar mi cuenta' : 'Eliminar usuario'}</button></>}</div></div>
    <section className="overflow-hidden rounded-2xl border border-[#2e2e34] bg-[#1a1a1e]">
      <div className="h-40 bg-[#222226] sm:h-56">{safeHttpLink(profile.banner) && <img src={safeHttpLink(profile.banner)} alt="Portada del perfil" className="h-full w-full object-cover" />}</div>
      <div className="relative px-5 pb-6 sm:px-8"><div className="-mt-12 flex flex-col items-center gap-4 sm:-mt-16 sm:flex-row sm:items-end"><img src={safeHttpLink(profile.photo) || ''} alt={profile.name || 'Creador'} className="h-24 w-24 rounded-full border-4 border-[#1a1a1e] bg-[#2a2a30] object-cover sm:h-32 sm:w-32" /><div className="min-w-0 flex-1 pb-1 text-center sm:text-left"><h1 className="flex flex-wrap items-center justify-center gap-2 text-2xl font-black text-white sm:justify-start sm:text-3xl">{profile.name || 'Creador de TuRodaje'}{profile.isPatreonSupporter && <span className="rounded-full border border-[#ff424d]/50 bg-[#ff424d]/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-[#ff8b83]">Colaborador Patreon</span>}</h1><p className="mt-1 text-xs text-gray-500">Creador de TuRodaje</p></div></div>
        {profile.bio && <p className="mt-5 whitespace-pre-wrap text-sm leading-6 text-gray-300">{profile.bio}</p>}
        <div className="mt-4 flex flex-wrap justify-center gap-2 sm:justify-start">{safeHttpLink(profile.websiteUrl) && <a href={safeHttpLink(profile.websiteUrl)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-[#34343b] px-3 py-2 text-xs text-gray-300 hover:text-white">Sitio web <ExternalLink className="h-3 w-3" /></a>}{safeHttpLink(profile.patreonUrl) && <a href={safeHttpLink(profile.patreonUrl)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-[#ff424d]/30 px-3 py-2 text-xs text-[#ff8b83]">Patreon <ExternalLink className="h-3 w-3" /></a>}{safeHttpLink(profile.kofiUrl) && <a href={safeHttpLink(profile.kofiUrl)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-teal-500/30 px-3 py-2 text-xs text-teal-300">Ko-fi <ExternalLink className="h-3 w-3" /></a>}{[['youtubeUrl', 'YouTube'], ['instagramUrl', 'Instagram'], ['tiktokUrl', 'TikTok'], ['artstationUrl', 'ArtStation'], ['xUrl', 'X / Twitter']].filter(([field]) => safeHttpLink(profile[field])).map(([field, label]) => <a key={field} href={safeHttpLink(profile[field])} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-[#34343b] px-3 py-2 text-xs text-gray-300 hover:text-white">{label} <ExternalLink className="h-3 w-3" /></a>)}</div>
      </div>
    </section>
    <section className="space-y-4"><div className="flex items-end justify-between gap-3"><div><span className="text-xs font-semibold uppercase tracking-wider text-gray-500">PORTAFOLIO EN TURODAJE</span><h2 className="mt-1 text-2xl font-bold text-white">Proyectos publicados desde esta cuenta</h2></div><span className="text-xs text-gray-500">{visibleProjects.length} proyecto(s)</span></div>{projectsError && <p role="status" className="text-xs text-amber-300">{projectsError}</p>}{projectsLoading && visibleProjects.length === 0 ? <p className="text-sm text-gray-400">Cargando proyectos...</p> : visibleProjects.length === 0 && projectsError ? <p className="text-sm text-amber-300">No se puede confirmar todavía si este creador tiene proyectos publicados.</p> : visibleProjects.length === 0 ? <div className="rounded-xl border border-dashed border-[#34343b] p-8 text-center"><UserRound className="mx-auto h-8 w-8 text-gray-700" /><p className="mt-2 text-sm text-gray-500">Este creador todavía no tiene proyectos publicados.</p></div> : <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">{visibleProjects.map(project => <button key={project.id} type="button" onClick={() => onOpenProject?.(project)} className={`overflow-hidden rounded-xl border border-[#2e2e34] bg-[#1a1a1e] text-left transition hover:border-red-500/40 ${project.hasHonorFrame ? 'honor-project-card' : ''}`}><div className={`relative ${project.hasHonorFrame ? 'honor-project-thumbnail' : ''}`}><img src={project.thumbnail || ''} alt={project.title || ''} className="aspect-video w-full object-cover" />{project.hasHonorFrame && <img src="/images/escudo-de-honor.webp" alt="Escudo de Honor" className="honor-badge-image" />}</div><div className="p-3"><h3 className="truncate text-sm font-bold text-white">{project.title}</h3><p className="mt-1 text-xs text-gray-500">{project.format || 'Proyecto'} · {project.year || ''}{project.creatorName && project.creatorName !== profile.name ? ` · Autoría: ${project.creatorName}` : ''}</p></div></button>)}</div>}</section>
    {isAdmin && !isOwner && <p className="flex items-center gap-2 text-xs text-amber-300"><ShieldAlert className="h-4 w-4" />La eliminación retirará también los proyectos asociados a esta cuenta.</p>}
  </main>;
}
