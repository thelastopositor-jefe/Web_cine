import { useEffect, useState } from 'react';
import { collection, deleteDoc, doc, onSnapshot, setDoc } from 'firebase/firestore';
import { getDownloadURL, ref as storageRef, uploadBytes, deleteObject } from 'firebase/storage';
import { ExternalLink, Newspaper, Pencil, Plus, Trash2, Wrench, X } from 'lucide-react';
import { db, storage } from '../firebase';

const EMPTY_FORM = { title: '', description: '', category: '', imagesText: '', url: '', country: '', recommended: false, featured: false };
const timestampValue = value => {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  return new Date(value).getTime() || 0;
};
const safeExternalUrl = value => {
  if (!value) return '';
  try {
    const parsed = new URL(value.trim());
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : '';
  } catch { return ''; }
};

export default function ManagedContentSection({ type, isAdmin, user }) {
  const isNews = type === 'news';
  const collectionName = isNews ? 'news' : 'resources';
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [showEditor, setShowEditor] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [imageFiles, setImageFiles] = useState([]);
  const [error, setError] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('Todas');
  const [countryFilter, setCountryFilter] = useState('Todos');
  const [expanded, setExpanded] = useState({});
  const toggleExpanded = id => setExpanded(current => ({ ...current, [id]: !current[id] }));


  useEffect(() => onSnapshot(collection(db, collectionName), snapshot => {
    const next = snapshot.docs.map(item => ({ ...item.data(), id: item.id }));
    next.sort((a, b) => isNews
      ? timestampValue(b.createdAt) - timestampValue(a.createdAt)
      : Number(Boolean(b.recommended)) - Number(Boolean(a.recommended)) || String(a.title || '').localeCompare(String(b.title || ''), 'es'));
    setItems(next);
    setLoading(false);
    setError('');
  }, err => {
    console.error(`No se pudo cargar ${collectionName}:`, err);
    setLoading(false);
    setError('No se pudo cargar el contenido. Comprueba las reglas de Firestore.');
  }), [collectionName, isNews]);


  const openNew = () => {
    setEditing(null);
    setForm({ ...EMPTY_FORM, category: isNews ? 'Noticias' : 'Software de edición' });
    setImageFiles([]);
    setShowEditor(true);
    setError('');
  };

  const openEdit = item => {
    setEditing(item);
    setImageFiles([]);
    setShowEditor(true);
    setForm({
      title: item.title || '',
      description: item.description || '',
      category: item.category || '',
      imagesText: (isNews ? (item.images || []) : [item.image].filter(Boolean)).join('\n'),
      url: isNews ? (item.externalUrl || '') : (item.url || ''),
      country: item.country || '',
      recommended: item.recommended === true,
      featured: item.featured === true
    });
    setError('');
  };

  const save = async event => {
    event.preventDefault();
    if (!isAdmin || !user?.id || saving) return;
    const title = form.title.trim();
    const description = form.description.trim();
    const urls = form.imagesText.split('\n').map(value => value.trim()).filter(Boolean);
    const images = urls.map(safeExternalUrl);
    const files = Array.from(imageFiles || []);
    if (!title || !description || (urls.length && images.some(value => !value))) {
      setError('Completa el título y la descripción. Las imágenes por URL deben empezar por https:// o http://.');
      return;
    }
    const externalUrl = safeExternalUrl(form.url);
    if (form.url.trim() && !externalUrl) {
      setError('El enlace externo debe ser una URL válida que empiece por https:// o http://.');
      return;
    }
    const maxImages = isNews ? 8 : 1;
    if (urls.length + files.length > maxImages) {
      setError(isNews ? 'Una noticia puede contener un máximo de 8 imágenes en total.' : 'Un recurso admite una sola imagen o logotipo.');
      return;
    }
    if (files.some(file => !file.type.startsWith('image/') || file.size > 5 * 1024 * 1024)) {
      setError('Solo se permiten imágenes de hasta 5 MB cada una.');
      return;
    }
    setSaving(true);
    setError('');
    const now = new Date().toISOString();
    const targetRef = editing ? doc(db, collectionName, editing.id) : doc(collection(db, collectionName));
    const uploaded = [];
    try {
      for (const [index, file] of files.entries()) {
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-90) || `image-${index}.jpg`;
        const path = `moderation/${collectionName}/${targetRef.id}/${Date.now()}-${index}-${safeName}`;
        const uploadedRef = await uploadBytes(storageRef(storage, path), file, {
          contentType: file.type,
          customMetadata: { uploadedBy: user.id }
        });
        uploaded.push({ url: await getDownloadURL(uploadedRef.ref), path });
      }
      const existingUrls = isNews ? (editing?.images || []) : [editing?.image].filter(Boolean);
      const existingPaths = isNews ? (editing?.imagePaths || []) : [editing?.imagePath || ''];
      const pathByUrl = new Map(existingUrls.map((url, index) => [url, existingPaths[index] || '']));
      const finalImages = [...images, ...uploaded.map(item => item.url)];
      const finalPaths = [...images.map(url => pathByUrl.get(url) || ''), ...uploaded.map(item => item.path)];
      const common = {
        title, description,
        category: form.category.trim() || (isNews ? 'Noticias' : 'Otros'),
        createdBy: editing?.createdBy || user.id,
        updatedBy: user.id,
        updatedAt: now,
        ...(editing ? {} : { createdAt: now })
      };
      const payload = isNews ? {
        ...common, images: finalImages, imagePaths: finalPaths,
        externalUrl, featured: form.featured
      } : {
        ...common, image: finalImages[0] || '', imagePath: finalPaths[0] || '',
        url: externalUrl, country: form.country, recommended: form.recommended
      };
      await setDoc(targetRef, payload, { merge: Boolean(editing) });
      setEditing(null);
      setForm(EMPTY_FORM);
      setImageFiles([]);
      setShowEditor(false);
      setError('');
    } catch (err) {
      console.error(`No se pudo guardar ${collectionName}:`, err);
      await Promise.all(uploaded.map(item => deleteObject(storageRef(storage, item.path)).catch(() => null)));
      setError('No se pudo guardar o subir la imagen. Comprueba las reglas de Firestore y Storage para moderadores.');
    } finally { setSaving(false); }
  };

  const remove = async item => {
    if (!isAdmin || !window.confirm(`¿Eliminar definitivamente «${item.title}»?`)) return;
    try { await deleteDoc(doc(db, collectionName, item.id)); }
    catch (err) { console.error(err); setError('No se pudo eliminar el elemento.'); }
  };

  const categories = isNews
    ? ['Noticias','Novedades','Estrenos','Festivales','Eventos','Convocatorias y concursos','Cineastas y productoras','Rodajes','Industria audiovisual','TuRodaje']
    : ['Software de edición','Guiones y plantillas','LUTs y color','Audio y efectos sonoros','Música y licencias','Equipamiento','Preproducción','Rodaje','Postproducción','VFX y animación','Formación','Portales de empleo','Agencias de actores','Centros educativos','Otros'];

  const latamCountries = ['Argentina','Bolivia','Brasil','Chile','Colombia','Costa Rica','Cuba','Ecuador','El Salvador','Guatemala','Haití','Honduras','México','Nicaragua','Panamá','Paraguay','Perú','República Dominicana','Uruguay','Venezuela'];
  const europeCountries = ['Alemania','Andorra','Austria','Bélgica','Bielorrusia','Bosnia y Herzegovina','Bulgaria','Chipre','Croacia','Dinamarca','Eslovaquia','Eslovenia','España','Estonia','Finlandia','Francia','Grecia','Hungría','Irlanda','Islandia','Italia','Letonia','Liechtenstein','Lituania','Luxemburgo','Malta','Moldavia','Mónaco','Montenegro','Noruega','Países Bajos','Polonia','Portugal','Reino Unido','República Checa','Rumanía','San Marino','Serbia','Suecia','Suiza','Ucrania','Vaticano'];
  const countries = [
    'Argentina','Bolivia','Brasil','Chile','Colombia','Costa Rica','Cuba','Ecuador','El Salvador','Guatemala','Haití','Honduras','México','Nicaragua','Panamá','Paraguay','Perú','República Dominicana','Uruguay','Venezuela',
    'Alemania','Andorra','Austria','Bélgica','Bielorrusia','Bosnia y Herzegovina','Bulgaria','Chipre','Croacia','Dinamarca','Eslovaquia','Eslovenia','España','Estonia','Finlandia','Francia','Grecia','Hungría','Irlanda','Islandia','Italia','Letonia','Liechtenstein','Lituania','Luxemburgo','Malta','Moldavia','Mónaco','Montenegro','Noruega','Países Bajos','Polonia','Portugal','Reino Unido','República Checa','Rumanía','San Marino','Serbia','Suecia','Suiza','Ucrania','Vaticano',
    'Estados Unidos'
  ].sort((a,b) => a.localeCompare(b,'es'));
  const availableCategories = [...new Set([...categories, ...items.map(item => item.category).filter(Boolean)])];
  const filteredItems = items.filter(item =>
    (categoryFilter === 'Todas' || item.category === categoryFilter) &&
    (isNews || countryFilter === 'Todos' || (countryFilter === 'Sin especificar' ? !item.country : countryFilter === 'LATAM' ? (item.country === 'LATAM' || latamCountries.includes(item.country)) : countryFilter === 'EUROPA' ? (item.country === 'EUROPA' || europeCountries.includes(item.country)) : item.country === countryFilter))
  );

  return <section className="mx-auto max-w-7xl space-y-7 px-4 py-8 sm:px-6 lg:px-12">
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><span className="text-xs font-semibold uppercase tracking-wider text-red-400">{isNews ? 'ACTUALIDAD DEL CINE INDEPENDIENTE' : 'HERRAMIENTAS PARA CREADORES'}</span><h1 className="mt-2 flex items-center gap-3 text-3xl font-black text-white">{isNews ? <Newspaper className="h-8 w-8 text-red-400" /> : <Wrench className="h-8 w-8 text-red-400" />}{isNews ? 'Actualidad' : 'Recursos'}</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-gray-400">{isNews ? 'Festivales, estrenos, concursos, eventos y novedades del cine independiente.' : 'Un directorio de herramientas, materiales y recursos útiles para cineastas y equipos audiovisuales.'}</p></div>{isAdmin && <button type="button" onClick={openNew} className="inline-flex items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-3 text-sm font-bold text-white hover:bg-red-500"><Plus className="h-4 w-4" />{isNews ? 'Publicar noticia' : 'Añadir recurso'}</button>}</div>
    {error && <p role="alert" className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">{error}</p>}
    <div className="flex flex-wrap gap-3 rounded-xl border border-[#34343b] bg-[#1a1a1e] p-3">
      <label className="min-w-44 flex-1 text-xs text-gray-400">Filtrar por categoría
        <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} className="mt-1 w-full rounded-lg border border-[#34343b] bg-[#111113] p-2 text-sm text-white">
          <option value="Todas">Todas las categorías</option>{availableCategories.map(category => <option key={category} value={category}>{category}</option>)}
        </select>
      </label>
      {!isNews && <label className="min-w-44 flex-1 text-xs text-gray-400">Filtrar por país
        <select value={countryFilter} onChange={e => setCountryFilter(e.target.value)} className="mt-1 w-full rounded-lg border border-[#34343b] bg-[#111113] p-2 text-sm text-white">
          <option value="Todos">Todos los países</option><option value="Sin especificar">Sin especificar</option><option value="LATAM">LATAM (todos los países)</option><option value="EUROPA">EUROPA (todos los países)</option>{countries.map(country => <option key={country} value={country}>{country}</option>)}
        </select>
      </label>}
    </div>
    {loading ? <p className="rounded-xl border border-[#2e2e34] p-8 text-center text-sm text-gray-400">Cargando...</p>
      : filteredItems.length === 0 ? <p className="rounded-xl border border-[#34343b] p-8 text-center text-sm text-gray-400">{items.length ? 'No hay publicaciones con esos filtros.' : `Todavía no hay ${isNews ? 'noticias publicadas' : 'recursos añadidos'}.`}</p>
      : <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
        {filteredItems.map(item => {
          const images = isNews ? (item.images || []) : [item.image].filter(Boolean);
          const isExpanded = Boolean(expanded[item.id]);
          const description = item.description || '';
          const hasMore = description.length > 170;
          return <article key={item.id} className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-[#2e2e34] bg-[#1a1a1e] transition hover:border-red-500/30">
            <div className="flex min-w-0 gap-3 p-3">
              <div className="h-20 w-24 shrink-0 overflow-hidden rounded-lg bg-[#222226] sm:h-24 sm:w-28">
                {images.length ? <img src={images[0]} alt={item.title} loading="lazy" className={`h-full w-full ${isNews ? 'object-cover' : 'object-contain p-1'}`} /> : <div className="flex h-full items-center justify-center">{isNews ? <Newspaper className="h-7 w-7 text-gray-600" /> : <Wrench className="h-7 w-7 text-gray-600" />}</div>}
              </div>
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap gap-1.5 text-[10px]"><span className="rounded-full bg-red-500/10 px-2 py-0.5 text-red-300">{item.category || 'Otros'}</span>
                  {!isNews && item.country && <span className="text-gray-400">{item.country}</span>}
                  {isNews && item.createdAt && <span className="text-gray-500">{new Date(timestampValue(item.createdAt)).toLocaleDateString('es-ES')}</span>}
                  {item.recommended && !isNews && <span className="text-emerald-300">Recomendado</span>}
                  {item.featured && isNews && <span className="text-amber-300">Destacada</span>}
                </div>
                <h2 className="line-clamp-2 text-sm font-bold leading-snug text-white">{item.title}</h2>
                <p className={`whitespace-pre-wrap break-words text-xs leading-5 text-gray-400 ${isExpanded ? '' : 'line-clamp-3'}`}>{description}</p>
                {hasMore && <button type="button" onClick={() => toggleExpanded(item.id)} aria-expanded={isExpanded} className="text-xs font-semibold text-red-300 hover:text-red-200">{isExpanded ? 'Leer menos' : 'Leer más'}</button>}
              </div>
            </div>
            {isExpanded && isNews && images.length > 1 && <div className="grid grid-cols-3 gap-1 px-3 pb-3">{images.slice(1).map((image, index) => <img key={image + index} src={image} alt="" loading="lazy" className="h-20 w-full rounded object-cover" />)}</div>}
            <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-[#2e2e34] px-3 py-2">
              {(isNews ? item.externalUrl : item.url) && <a href={isNews ? item.externalUrl : item.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-red-300 hover:text-red-200">{isNews ? 'Abrir enlace' : 'Visitar recurso'}<ExternalLink className="h-3 w-3" /></a>}
              {isAdmin && <div className="ml-auto flex gap-2"><button type="button" onClick={() => openEdit(item)} className="inline-flex items-center gap-1 text-xs text-gray-300 hover:text-white"><Pencil className="h-3.5 w-3.5" />Editar</button><button type="button" onClick={() => remove(item)} className="inline-flex items-center gap-1 text-xs text-red-300"><Trash2 className="h-3.5 w-3.5" />Eliminar</button></div>}
            </div>
          </article>;
        })}
      </div>}
    {isAdmin && showEditor && <div className="fixed inset-0 z-[90] flex items-center justify-center overflow-y-auto bg-black/80 p-4"><form onSubmit={save} className="my-auto max-h-[90vh] w-full max-w-2xl space-y-4 overflow-y-auto rounded-2xl border border-[#34343b] bg-[#17171b] p-5 shadow-2xl"><div className="flex items-center justify-between"><h2 className="text-lg font-bold text-white">{editing ? 'Editar' : 'Crear'} {isNews ? 'noticia' : 'recurso'}</h2><button type="button" onClick={() => { setEditing(null); setForm(EMPTY_FORM); setImageFiles([]); setShowEditor(false); }} className="rounded-lg p-2 text-gray-400 hover:bg-[#292930]"><X className="h-4 w-4" /></button></div><label className="block text-xs text-gray-400">Título<input required maxLength={160} value={form.title} onChange={event => setForm(current => ({ ...current, title: event.target.value }))} className="mt-1 w-full rounded-xl border border-[#34343b] bg-[#111113] p-3 text-sm text-white" /></label><label className="block text-xs text-gray-400">Categoría<select value={form.category} onChange={event => setForm(current => ({ ...current, category: event.target.value }))} className="mt-1 w-full rounded-xl border border-[#34343b] bg-[#111113] p-3 text-sm text-white">{categories.map(category => <option key={category}>{category}</option>)}</select></label><label className="block text-xs text-gray-400">Descripción<textarea required rows={5} maxLength={8000} value={form.description} onChange={event => setForm(current => ({ ...current, description: event.target.value }))} className="mt-1 w-full rounded-xl border border-[#34343b] bg-[#111113] p-3 text-sm text-white" /></label><label className="block text-xs text-gray-400">{isNews ? 'Imágenes por URL (una por línea)' : 'Imagen por URL (opcional)'}<textarea rows={3} value={form.imagesText} onChange={event => setForm(current => ({ ...current, imagesText: event.target.value }))} placeholder="https://..." className="mt-1 w-full rounded-xl border border-[#34343b] bg-[#111113] p-3 text-sm text-white" /></label><label className="block text-xs text-gray-400">Subir imagen{isNews ? 'es' : ''} desde tu dispositivo<input type="file" accept="image/*" multiple={isNews} onChange={event => setImageFiles(Array.from(event.target.files || []))} className="mt-1 block w-full text-xs text-gray-400 file:mr-3 file:rounded-lg file:border-0 file:bg-[#292930] file:px-3 file:py-2 file:text-xs file:font-semibold file:text-gray-200" /><span className="mt-1 block text-[10px] text-gray-500">Hasta 5 MB por imagen. {isNews ? 'Máximo 8 imágenes combinando archivos y URLs.' : 'Un solo logotipo o imagen.'} {imageFiles.length ? `Seleccionadas: ${imageFiles.map(file => file.name).join(', ')}` : ''}</span></label><label className="block text-xs text-gray-400">{isNews ? 'Enlace externo (opcional)' : 'Enlace del recurso'}<input type="url" value={form.url} onChange={event => setForm(current => ({ ...current, url: event.target.value }))} placeholder="https://..." className="mt-1 w-full rounded-xl border border-[#34343b] bg-[#111113] p-3 text-sm text-white" /></label> {!isNews && <><label className="block text-xs text-gray-400">País<select value={form.country} onChange={event => setForm(current => ({ ...current, country: event.target.value }))} className="mt-1 w-full rounded-xl border border-[#34343b] bg-[#111113] p-3 text-sm text-white"><option value="">Sin especificar</option><option value="LATAM">LATAM</option><option value="EUROPA">EUROPA</option>{countries.map(country => <option key={country} value={country}>{country}</option>)}</select></label><label className="flex items-center gap-2 text-sm text-gray-300"><input type="checkbox" checked={form.recommended} onChange={event => setForm(current => ({ ...current, recommended: event.target.checked }))} />Marcar como recomendado</label></>}{isNews && <label className="flex items-center gap-2 text-sm text-gray-300"><input type="checkbox" checked={form.featured} onChange={event => setForm(current => ({ ...current, featured: event.target.checked }))} />Marcar como noticia destacada</label>}{error && <p role="alert" className="text-xs text-red-300">{error}</p>}<div className="flex gap-2"><button type="button" onClick={() => { setEditing(null); setForm(EMPTY_FORM); setImageFiles([]); setShowEditor(false); }} className="flex-1 rounded-xl bg-[#292930] py-3 text-sm text-gray-200">Cancelar</button><button type="submit" disabled={saving} className="flex-1 rounded-xl bg-red-600 py-3 text-sm font-bold text-white disabled:opacity-50">{saving ? 'Guardando...' : 'Guardar'}</button></div></form></div>}
  </section>;
}
