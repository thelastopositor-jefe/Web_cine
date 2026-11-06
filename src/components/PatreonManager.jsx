import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { Heart, Search } from 'lucide-react';
import { db, functions } from '../firebase';

export default function PatreonManager({ isAdmin, onOpenProfile }) {
  const [profiles, setProfiles] = useState([]);
  const [search, setSearch] = useState('');
  const [savingUid, setSavingUid] = useState('');

  useEffect(() => onSnapshot(collection(db, 'publicProfiles'), snapshot => {
    setProfiles(snapshot.docs.map(item => ({ ...item.data(), id: item.id })).sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'es')));
  }, error => console.error('No se pudieron cargar los perfiles para Patreon:', error)), []);

  const visibleProfiles = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('es');
    return profiles.filter(profile => !term || String(profile.name || '').toLocaleLowerCase('es').includes(term));
  }, [profiles, search]);

  const toggle = async profile => {
    if (!isAdmin || savingUid) return;
    const enabled = !profile.isPatreonSupporter;
    if (!window.confirm(`${enabled ? 'Marcar' : 'Retirar la marca de'} ${profile.name || 'este usuario'} como colaborador de Patreon?`)) return;
    setSavingUid(profile.id);
    try {
      const updateSupporter = httpsCallable(functions, 'setPatreonSupporter');
      const response = await updateSupporter({ targetUid: profile.id, enabled });
      window.alert(`Distintivo actualizado. ${response.data.projectsUpdated} proyecto(s) sincronizado(s).`);
    } catch (error) {
      console.error('No se pudo actualizar el distintivo Patreon:', error);
      window.alert('No se pudo actualizar el distintivo. Comprueba que Cloud Functions esté desplegado.');
    } finally { setSavingUid(''); }
  };

  return <section className="space-y-4">
    <div><h3 className="text-xl font-bold text-white">Colaboradores de Patreon</h3><p className="mt-1 text-xs text-gray-400">Marca a los creadores que apoyan TuRodaje. El distintivo es independiente de Destacados.</p></div>
    <label className="relative block"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar creador..." className="w-full rounded-xl border border-[#34343b] bg-[#111113] py-2.5 pl-9 pr-3 text-sm text-white" /></label>
    <div className="max-h-[380px] space-y-2 overflow-y-auto pr-1">{visibleProfiles.map(profile => <div key={profile.id} className="flex items-center gap-3 rounded-xl border border-[#2e2e34] bg-[#1a1a1e] p-3"><img src={profile.photo || ''} alt="" className="h-10 w-10 rounded-full bg-[#292930] object-cover" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-white">{profile.name || 'Usuario'}</p><p className="text-[10px] text-gray-500">{profile.isPatreonSupporter ? 'Colaborador marcado' : 'Sin distintivo'}</p></div><button type="button" onClick={() => onOpenProfile?.(profile.id)} className="shrink-0 rounded-lg border border-[#34343b] px-2.5 py-2 text-xs text-gray-300 hover:text-white">Ver perfil</button><button type="button" disabled={savingUid === profile.id} onClick={() => toggle(profile)} className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold disabled:opacity-50 ${profile.isPatreonSupporter ? 'border-[#ff424d]/40 bg-[#ff424d]/10 text-[#ff8b83]' : 'border-[#34343b] text-gray-300 hover:border-[#ff424d]/40'}`}><Heart className="h-3.5 w-3.5" />{savingUid === profile.id ? 'Guardando...' : profile.isPatreonSupporter ? 'Retirar' : 'Marcar'}</button></div>)}</div>
  </section>;
}
