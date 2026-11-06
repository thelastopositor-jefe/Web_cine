import { useEffect, useState } from 'react';
import { collection, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { History } from 'lucide-react';
import { db } from '../firebase';

const dateValue = value => {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  return new Date(value).getTime() || 0;
};
const actionLabel = action => ({
  account_deleted: 'Cuenta eliminada',
  project_approved: 'Proyecto aprobado',
  project_rejected: 'Proyecto rechazado',
  project_deleted: 'Proyecto eliminado',
  project_featured: 'Proyecto añadido a Destacados',
  project_unfeatured: 'Proyecto retirado de Destacados',
  patreon_supporter_enabled: 'Distintivo Patreon activado',
  patreon_supporter_disabled: 'Distintivo Patreon retirado',
  report_reviewed: 'Denuncia revisada',
  broadcast_created: 'Aviso general creado',
  news_created: 'Noticia creada',
  news_updated: 'Noticia editada',
  news_deleted: 'Noticia eliminada',
  resource_created: 'Recurso añadido',
  resource_updated: 'Recurso editado',
  resource_deleted: 'Recurso eliminado',
  carousel_item_created: 'Imagen añadida al carrusel',
  carousel_item_updated: 'Imagen del carrusel editada',
  carousel_item_deleted: 'Imagen retirada del carrusel'
}[action] || action || 'Acción de moderación');

export default function ModerationAudit() {
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');
  useEffect(() => onSnapshot(query(collection(db, 'moderationAudit'), orderBy('createdAt', 'desc'), limit(100)), snapshot => {
    const records = snapshot.docs.map(item => ({ ...item.data(), id: item.id }));
    setItems(records);
    setError('');
  }, err => { console.error('No se pudo cargar el registro de moderación:', err); setError('No se pudo cargar el registro. Comprueba los permisos de moderación.'); }), []);

  return <section className="space-y-4">
    <div className="flex items-center gap-3"><History className="h-5 w-5 text-gray-400" /><div><h3 className="text-xl font-bold text-white">Registro de acciones</h3><p className="mt-1 text-xs text-gray-400">Últimas 100 acciones administrativas registradas.</p></div></div>
    {error && <p role="alert" className="text-xs text-red-300">{error}</p>}
    <div className="max-h-[360px] space-y-2 overflow-y-auto pr-1">{items.length === 0 ? <p className="rounded-xl border border-dashed border-[#34343b] p-5 text-center text-xs text-gray-500">Todavía no hay acciones registradas.</p> : items.map(item => <div key={item.id} className="rounded-xl border border-[#2e2e34] bg-[#1a1a1e] p-3"><div className="flex flex-wrap items-start justify-between gap-2"><p className="text-sm font-semibold text-white">{actionLabel(item.action)}</p><span className="text-[10px] text-gray-500">{dateValue(item.createdAt) ? new Date(dateValue(item.createdAt)).toLocaleString('es-ES') : 'Fecha no disponible'}</span></div><p className="mt-1 break-all text-[10px] text-gray-500">Moderador: {item.actorUid || 'No disponible'}{item.targetUid ? ` · Usuario: ${item.targetUid}` : ''}{item.projectId ? ` · Proyecto: ${item.projectId}` : ''}{item.reportId ? ` · Denuncia: ${item.reportId}` : ''}</p>{(item.reason || item.projectTitle || item.title || item.collectionName) && <p className="mt-1 text-xs text-gray-400">{item.reason || item.projectTitle || item.title || item.collectionName}</p>}</div>)}</div>
  </section>;
}
