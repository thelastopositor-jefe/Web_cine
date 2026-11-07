import React, { useState, useEffect, useMemo, useRef } from 'react';
import { CAROUSEL_ITEMS } from './data/carouselData';
import JobsSection from './components/JobsSection';
import MessagingCenter from './components/MessagingCenter';
import NotificationsBell from './components/NotificationsBell';
import ReportsAdmin from './components/ReportsAdmin';
import PublicProfilePage from './components/PublicProfilePage';
import ManagedContentSection from './components/ManagedContentSection';
import PatreonManager from './components/PatreonManager';
import BroadcastManager from './components/BroadcastManager';
import ModerationAudit from './components/ModerationAudit';
const TURODAJE_LOGO = '/logo-turodaje.webp';

// Carga compartida de la API oficial de YouTube (permite detectar el final del vídeo).
let toonKnightYouTubeApiPromise;
const loadToonKnightYouTubeApi = () => {
  if (typeof window === 'undefined') return Promise.reject(new Error('YouTube requiere navegador'));
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (toonKnightYouTubeApiPromise) return toonKnightYouTubeApiPromise;
  toonKnightYouTubeApiPromise = new Promise((resolve, reject) => {
    const previousReady = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (typeof previousReady === 'function') previousReady();
      resolve(window.YT);
    };
    if (!document.querySelector('script[data-toonknight-youtube-api]')) {
      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      script.async = true;
      script.dataset.toonknightYoutubeApi = 'true';
      script.onerror = () => {
        toonKnightYouTubeApiPromise = null;
        reject(new Error('No se pudo cargar la API de YouTube'));
      };
      document.head.appendChild(script);
    }
  });
  return toonKnightYouTubeApiPromise;
};

function ToonKnightPlayer({ videoId, title, onEnded }) {
  const containerRef = useRef(null);
  const playerRef = useRef(null);
  const endedRef = useRef(onEnded);
  const lastIdRef = useRef(videoId);
  useEffect(() => { endedRef.current = onEnded; }, [onEnded]);
  useEffect(() => {
    let cancelled = false;
    loadToonKnightYouTubeApi().then(YT => {
      if (cancelled || !containerRef.current) return;
      playerRef.current = new YT.Player(containerRef.current, {
        width: '100%', height: '100%', videoId: lastIdRef.current,
        playerVars: { autoplay: 1, playsinline: 1, rel: 0, origin: window.location.origin },
        events: {
          onReady: event => {
            if (cancelled) return;
            if (lastIdRef.current) event.target.loadVideoById(lastIdRef.current);
          },
          onStateChange: event => {
            if (!cancelled && event.data === YT.PlayerState.ENDED) endedRef.current?.();
          }
        }
      });
    }).catch(error => console.error('Error al cargar el reproductor:', error));
    return () => {
      cancelled = true;
      try { playerRef.current?.destroy(); } catch (error) { console.warn('No se pudo cerrar el reproductor:', error); }
      playerRef.current = null;
    };
  }, []);
  useEffect(() => {
    if (!videoId || videoId === lastIdRef.current) return;
    lastIdRef.current = videoId;
    try { playerRef.current?.loadVideoById(videoId); } catch (error) { console.warn('No se pudo cambiar de vídeo:', error); }
  }, [videoId]);
  return <div className="w-full h-full" aria-label={title || 'Reproductor de TuRodaje'}><div ref={containerRef} className="w-full h-full" /></div>;
}


const trackAnalyticsEvent = (event, parameters = {}) => {
  if (typeof window !== 'undefined' && Array.isArray(window.dataLayer)) {
    window.dataLayer.push({ event, ...parameters });
  }
};

// Límites de carga: se validan antes de enviar imágenes a Storage.
const PROFILE_IMAGE_LIMITS = {
  photo: { bytes: 2 * 1024 * 1024, width: 2048, height: 2048, label: 'foto de perfil (2 MB, máximo 2048 × 2048 px)' },
  banner: { bytes: 4 * 1024 * 1024, width: 4096, height: 2048, label: 'banner (4 MB, máximo 4096 × 2048 px)' }
};
const validateProfileImage = (file, field) => new Promise(resolve => {
  if (!file) return resolve('');
  const limits = PROFILE_IMAGE_LIMITS[field];
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type))
    return resolve(`El archivo de ${field === 'photo' ? 'foto' : 'banner'} debe ser JPG, PNG, WebP o GIF.`);
  if (file.size > limits.bytes) return resolve(`La ${limits.label} supera el tamaño permitido.`);
  const image = new Image();
  const url = URL.createObjectURL(file);
  image.onload = () => {
    URL.revokeObjectURL(url);
    resolve(image.naturalWidth > limits.width || image.naturalHeight > limits.height
      ? `La ${limits.label} supera las dimensiones permitidas.` : '');
  };
  image.onerror = () => { URL.revokeObjectURL(url); resolve('No se pudo leer la imagen seleccionada.'); };
  image.src = url;
});

const isSafeHttpUrl = value => {
  if (!value) return true;
  try { return ['http:', 'https:'].includes(new URL(value).protocol); }
  catch { return false; }
};
import { auth, googleProvider, signInWithPopup, signOut, db, functions, storage } from './firebase';
import { httpsCallable } from 'firebase/functions';
import { getDownloadURL, ref as storageRef, uploadBytes, deleteObject } from 'firebase/storage';
import { collection, addDoc, getDocs, doc, getDoc, setDoc, updateDoc, deleteDoc, arrayUnion, arrayRemove, onSnapshot, serverTimestamp, query, where, writeBatch } from 'firebase/firestore';
import {
  Search, Heart, Bookmark, Share2, Play, Plus, CheckCircle, XCircle,
  Trash2, ShieldCheck, User, Bell, ExternalLink, MessageSquare, ThumbsUp,
  Tv, Film, Sparkles, Filter, ChevronLeft, ChevronRight, X, LogIn, Upload, Menu, Flag, Building2
} from 'lucide-react';

// ==========================================
// CONFIGURACIÓN DE ADMINISTRADORES
// ==========================================
const ADMIN_EMAILS = ['roman82ap@gmail.com', 'thelastopositor@gmail.com'];
const GENRES_LIST = ['Acción', 'Aventura', 'Ciencia ficción', 'Fantasía', 'Fantasía oscura', 'Drama', 'Comedia', 'Terror', 'Suspenso', 'Infantil', 'Adulto', 'Social', 'Musical', 'Romance'];
const PROJECT_CATEGORIES = ['Cortometraje', 'Largometraje', 'Serie', 'Tráiler', 'Musical', 'Crowdfunding', 'Tutoriales', 'Making of'];

// Normaliza tildes, mayúsculas y espacios para comparar etiquetas de la interfaz
// con los valores internos que pueden estar guardados en Firestore.
const normalizeFilterText = (value) => String(value ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .trim()
  .toLowerCase();

// Convierte los formatos de fecha históricos de Firestore a milisegundos.
// Los proyectos sin fecha válida quedan al final, sin inventarles una fecha.
const getCreatedAtMillis = (value) => {
  if (!value) return 0;
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (typeof value?.toDate === 'function') return value.toDate().getTime();
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const GENRE_ALIASES = {
  accion: 'accion',
  aventura: 'aventura',
  'ciencia ficcion': 'scifi',
  scifi: 'scifi',
  fantasia: 'fantasia',
  'fantasia oscura': 'fantasia oscura',
  drama: 'drama',
  comedia: 'comedia',
  terror: 'terror',
  suspenso: 'suspenso',
  infantil: 'infantil',
  adulto: 'adulto',
  social: 'social',
  musical: 'musical',
  romance: 'romance'
};

const normalizeGenre = (value) => {
  const normalized = normalizeFilterText(value);
  return GENRE_ALIASES[normalized] || normalized;
};

// ==========================================
// DATOS MOCK INICIALES
// ==========================================
const INITIAL_PROJECTS = [
  {
    id: 'proj_1',
    title: 'Los gigantes del hielo',
    creator: 'Luna Norte Studio',
    creatorEmail: 'lunanorte@gmail.com',
    status: 'approved',
    youtubeId: 'L_LUpnjgPso',
    patreonUrl: 'https://patreon.com/lunanorte',
    thumbnail: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=1200&q=80',
    type: 'Acción real',
    genre: 'Fantasía',
    format: 'Cortometraje',
    year: '2026',
    duration: '12:48',
    description: 'Un viaje místico a través de valles helados donde seres de proporciones titánicas despiertan tras siglos de letargo.',
    isFeatured: true,
    likesCount: 342,
    seasons: [],
    rejectionReason: ''
  },
  {
    id: 'proj_2',
    title: 'Órbita interior',
    creator: 'Martín Ochoa',
    creatorEmail: 'martin@ochoa.com',
    status: 'approved',
    youtubeId: 'dQw4w9WgXcQ',
    patreonUrl: 'https://patreon.com/martinochoa',
    thumbnail: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?auto=format&fit=crop&w=1200&q=80',
    type: 'IA',
    genre: 'Musical',
    format: 'Musical',
    year: '2025',
    duration: '08:20',
    description: 'Exploración psicodélica y sensorial generada mediante inteligencia artificial sintética en sinfonía con ritmos synthwave.',
    isFeatured: true,
    likesCount: 189,
    seasons: [],
    rejectionReason: ''
  },
  {
    id: 'proj_3',
    title: 'Archipiélago violeta',
    creator: 'Luna Norte Studio',
    creatorEmail: 'lunanorte@gmail.com',
    status: 'approved',
    youtubeId: 'L_LUpnjgPso',
    patreonUrl: 'https://patreon.com/lunanorte',
    thumbnail: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1200&q=80',
    type: 'Acción real',
    genre: 'Ciencia ficción',
    format: 'Serie',
    year: '2024',
    duration: '22:14',
    description: 'Una historia sobre paisajes imposibles, memoria perdida y la belleza de volver a empezar en las nubes.',
    isFeatured: true,
    likesCount: 512,
    seasons: [
      {
        seasonNumber: 1,
        episodes: [
          { title: 'Capítulo 1: El despertar de la bruma', youtubeId: 'L_LUpnjgPso', duration: '22:14' },
          { title: 'Capítulo 2: Vientos de cristal', youtubeId: 'dQw4w9WgXcQ', duration: '19:40' }
        ]
      }
    ],
    rejectionReason: ''
  },
  {
    id: 'proj_4',
    title: 'Neón, capítulo cero',
    creator: 'Marea Films',
    creatorEmail: 'marea@films.com',
    status: 'approved',
    youtubeId: 'dQw4w9WgXcQ',
    patreonUrl: '',
    thumbnail: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?auto=format&fit=crop&w=1200&q=80',
    type: 'IA',
    genre: 'Acción',
    format: 'Tráiler',
    year: '2025',
    duration: '04:56',
    description: 'Sumergidos en los oscuros callejones cyber-noir de la metrópoli.',
    isFeatured: false,
    likesCount: 95,
    seasons: [],
    rejectionReason: ''
  },
  {
    id: 'proj_5',
    title: 'Último tren a casa',
    creator: 'Taller Bruma',
    creatorEmail: 'bruma@taller.com',
    status: 'approved',
    youtubeId: 'L_LUpnjgPso',
    patreonUrl: '',
    thumbnail: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=1200&q=80',
    type: 'Acción real',
    genre: 'Drama',
    format: 'Cortometraje',
    year: '2026',
    duration: '16:03',
    description: 'Artesanía física y marionetas de arcilla en un trayecto nocturno nostálgico.',
    isFeatured: false,
    likesCount: 220,
    seasons: [],
    rejectionReason: ''
  },
  {
    id: 'proj_6',
    title: 'Proyecto en revisión',
    creator: 'Alex Rivera',
    creatorEmail: 'alex@rivera.com',
    status: 'pending',
    youtubeId: 'dQw4w9WgXcQ',
    patreonUrl: '',
    thumbnail: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?auto=format&fit=crop&w=1200&q=80',
    type: 'Acción real',
    genre: 'Aventura',
    format: 'Cortometraje',
    year: '2026',
    duration: '07:15',
    description: 'Un experimento de animación tradicional en blanco y negro esperando aprobación.',
    isFeatured: false,
    likesCount: 0,
    seasons: [],
    rejectionReason: ''
  }
];

const PRODUCTS_DATA = [
  {
    id: 'prod_1',
    title: 'Blender 3D - Suite Completa',
    category: 'Software',
    price: 'Gratis / Open Source',
    image: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=800&q=80',
    description: 'Herramienta integral para modelado, esculpido, rigging, animación 2D/3D y renderizado.',
    link: 'https://www.blender.org/'
  },
  {
    id: 'prod_2',
    title: 'Wacom Cintiq Pro 16',
    category: 'Hardware',
    price: '1,499.00 €',
    image: 'https://images.unsplash.com/photo-1527864550417-7fd91fc51a46?auto=format&fit=crop&w=800&q=80',
    description: 'Pantalla interactiva con resolución 4K y precisión de lápiz Pro Pen 2 para ilustradores profesionales.',
    link: 'https://www.wacom.com/'
  },
  {
    id: 'prod_3',
    title: 'Toon Boom Harmony Premium',
    category: 'Software',
    price: '49.00 € / mes',
    image: 'https://images.unsplash.com/photo-1626785774573-4b799315345d?auto=format&fit=crop&w=800&q=80',
    description: 'El estándar de la industria global para la producción de animación 2D cut-out y tradicional.',
    link: 'https://www.toonboom.com/'
  },
  {
    id: 'prod_4',
    title: 'Dragonframe 5 - Stop Motion',
    category: 'Software',
    price: '325.00 €',
    image: 'https://images.unsplash.com/photo-1512756290469-ec264b7fbf87?auto=format&fit=crop&w=800&q=80',
    description: 'Software profesional de captura fotográfica e iluminación para largometrajes de Stop Motion.',
    link: 'https://www.dragonframe.com/'
  }
];

const INITIAL_FORUM_TOPICS = [
  {
    id: 'topic_1',
    title: '¿Qué software recomendáis para empezar en animación 2D tradicional?',
    category: 'Herramientas',
    authorName: 'Elena Ruiz',
    authorEmail: 'elena@gmail.com',
    createdAt: 'Hace 2 horas',
    content: 'Hola a todos. Estoy comenzando mis primeros estudios en animación frame a frame. ¿Me recomiendan Clip Studio Paint, Krita o saltar directo a Toon Boom?',
    likes: 24,
    comments: [
      { id: 'c1', author: 'Carlos V.', text: 'Krita es totalmente gratuito y genial para practicar los 12 principios.', createdAt: 'Hace 1 hora' },
      { id: 'c2', author: 'Luna Norte', text: 'Clip Studio EX tiene muy buena línea de tiempo para rotoscopia.', createdAt: 'Hace 30 min' }
    ]
  },
  {
    id: 'topic_2',
    title: 'Buscamos animador 3D/Rigger para cortometraje de fantasía',
    category: 'Colaboraciones',
    authorName: 'Martín Ochoa',
    authorEmail: 'martin@ochoa.com',
    createdAt: 'Ayer',
    content: 'Estamos en fase de preproducción para un proyecto de 10 minutos en Blender. Interesados responder con portafolio o Demo Reel.',
    likes: 15,
    comments: []
  }
];

// ==========================================
// COMPONENTE PRINCIPAL
// ==========================================
export default function App() {
  // Evita que varios toques abran solicitudes de Google simultáneas.
  const googleLoginInProgressRef = useRef(false);
  // --- Estados de Aplicación ---
  const [activeTab, setActiveTab] = useState('explorar'); // Secciones principales de ToonKnight.
  const [notificationConversationId, setNotificationConversationId] = useState('');
  const [selectedPublicProfileId, setSelectedPublicProfileId] = useState('');
  const [forumPublicAuthors, setForumPublicAuthors] = useState({});
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [user, setUser] = useState(() => {
    try {
      const savedUser = localStorage.getItem('turodaje_user');
      return savedUser ? JSON.parse(savedUser) : null;
    } catch (error) {
      console.warn('No se pudo recuperar la sesión guardada:', error);
      localStorage.removeItem('turodaje_user');
      return null;
    }
  });

  const [projects, setProjects] = useState([]);
  // Los nombres visibles dependen del UID, no de copias antiguas guardadas en vídeos.
  const [projectPublicProfiles, setProjectPublicProfiles] = useState({});
  const [products, setProducts] = useState(PRODUCTS_DATA);
  const [forumTopics, setForumTopics] = useState([]);
  const [showProductModal, setShowProductModal] = useState(false);
  const [editingProductId, setEditingProductId] = useState(null);
  const [productForm, setProductForm] = useState({ title: '', category: 'Software', subtype: '', techniques: [], uses: [], software: [], price: '', image: '', description: '', link: '', isAffiliate: false });
  const [productCategoryFilter, setProductCategoryFilter] = useState('Todos');
  const [productTechniqueFilter, setProductTechniqueFilter] = useState('Todos');
  const [productUseFilter, setProductUseFilter] = useState('Todos');
  const [productSubtypeFilter, setProductSubtypeFilter] = useState('Todos');
  const [educationItems, setEducationItems] = useState([]);
  const [showEducationModal, setShowEducationModal] = useState(false);
  const [editingEducationId, setEditingEducationId] = useState(null);
  const [educationForm, setEducationForm] = useState({ title: '', provider: '', url: '', price: 'Gratis', image: '', description: '', techniques: [], topics: [], software: [] });
  const [educationTechniqueFilter, setEducationTechniqueFilter] = useState('Todos');
  const [educationTopicFilter, setEducationTopicFilter] = useState('Todos');
  const [educationSoftwareFilter, setEducationSoftwareFilter] = useState('Todos');
  const [showContactModal, setShowContactModal] = useState(false);
  const [contactForm, setContactForm] = useState({ name: '', email: '', subject: '', message: '' });
  const [sendingContact, setSendingContact] = useState(false);

  const isAdmin = useMemo(() => Boolean(user?.email && ADMIN_EMAILS.includes(user.email.toLowerCase())), [user]);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'products'), async (snapshot) => {
      if (!snapshot.empty) {
        setProducts(snapshot.docs.map(productDoc => ({ ...productDoc.data(), id: productDoc.id })));
      } else if (isAdmin) {
        // Inicializa una sola vez la colección para que los productos de ejemplo también puedan editarse y eliminarse de forma persistente.
        try {
          await Promise.all(PRODUCTS_DATA.map(product => setDoc(doc(db, 'products', product.id), product, { merge: true })));
        } catch (error) {
          console.error('No se pudieron inicializar los productos:', error);
        }
      }
    }, (error) => console.error('Error al sincronizar productos:', error));
    return () => unsubscribe();
  }, [isAdmin]);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'education'), snapshot => setEducationItems(snapshot.docs.map(item => ({ ...item.data(), id: item.id }))), error => console.error('Error al sincronizar cursos:', error));
    return () => unsubscribe();
  }, []);

  // Usuarios normales solo consultan proyectos aprobados y los propios; moderación puede ver todos.
  useEffect(() => {
    const unsubscribers = [];
    const resultSets = { public: [], owned: [], legacyOwned: [], all: null };
    const publish = () => {
      const merged = new Map();
      const sources = isAdmin ? [resultSets.all || []] : [resultSets.public, resultSets.owned, resultSets.legacyOwned];
      sources.flat().forEach(project => merged.set(project.id, project));
      setProjects([...merged.values()]);
    };
    const subscribe = (source, projectQuery) => {
      unsubscribers.push(onSnapshot(projectQuery, snapshot => {
        resultSets[source] = snapshot.docs.map(projectDoc => ({ ...projectDoc.data(), id: projectDoc.id }));
        publish();
      }, error => console.error(`Error al sincronizar proyectos (${source}):`, error)));
    };

    if (isAdmin) {
      subscribe('all', collection(db, 'projects'));
    } else {
      subscribe('public', query(collection(db, 'projects'), where('status', '==', 'approved')));
      if (user?.id) subscribe('owned', query(collection(db, 'projects'), where('creatorId', '==', user.id)));
      if (user?.email) subscribe('legacyOwned', query(collection(db, 'projects'), where('creatorEmail', '==', user.email)));
    }
    return () => unsubscribers.forEach(unsubscribe => unsubscribe());
  }, [isAdmin, user?.id, user?.email]);

  // Una suscripción por cuenta distinta (no por vídeo), actualizada en tiempo real.
  const projectProfileIds = useMemo(() => [...new Set(projects.map(project => project.creatorId).filter(Boolean))].sort().join('|'), [projects]);
  useEffect(() => {
    const ids = projectProfileIds ? projectProfileIds.split('|') : [];
    const unsubscribers = ids.map(uid => onSnapshot(doc(db, 'publicProfiles', uid), snapshot => {
      setProjectPublicProfiles(previous => ({
        ...previous, [uid]: snapshot.exists() ? snapshot.data() : null
      }));
    }, error => console.warn('No se pudo leer el perfil público del proyecto:', uid, error)));
    return () => unsubscribers.forEach(unsubscribe => unsubscribe());
  }, [projectProfileIds]);

  const projectDisplayName = project => projectPublicProfiles[project?.creatorId]?.name
    || project?.creator || project?.creatorName || 'Creador';
  const projectDisplayPhoto = project => projectPublicProfiles[project?.creatorId]?.photo || project?.creatorPhoto || '';

  useEffect(() => {
    if (!user?.id) return undefined;
    return onSnapshot(doc(db, 'publicProfiles', user.id), snapshot => {
      if (!snapshot.exists()) return;
      const supporter = snapshot.data().isPatreonSupporter === true;
      setUser(current => {
        if (!current || current.id !== user.id || current.isPatreonSupporter === supporter) return current;
        const updated = { ...current, isPatreonSupporter: supporter };
        localStorage.setItem('turodaje_user', JSON.stringify(updated));
        return updated;
      });
    }, error => console.warn('No se pudo sincronizar el distintivo del perfil:', error));
  }, [user?.id]);

  // Las discusiones se leen de Firestore; los datos de ejemplo solo sirven mientras carga.
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'discussions'), (snapshot) => {
      const topics = snapshot.docs.map(topicDoc => ({ ...topicDoc.data(), id: topicDoc.id }));
      topics.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
      setForumTopics(topics);
    }, (error) => {
      console.error('Error al sincronizar las discusiones:', error);
    });
    return () => unsubscribe();
  }, []);

  const [selectedProject, setSelectedProject] = useState(null);
  const [autoPlayNext, setAutoPlayNext] = useState(() => localStorage.getItem('toonknight_autoplay_next') !== 'false');
  // Historial de esta pestaña: no se reinicia al cambiar de proyecto ni al recargar.
  const [playedVideoKeys, setPlayedVideoKeys] = useState(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem('toonknight_played_video_keys') || '[]');
      return Array.isArray(saved) ? saved.filter(key => typeof key === 'string') : [];
    } catch { return []; }
  });
  useEffect(() => {
    try { sessionStorage.setItem('toonknight_played_video_keys', JSON.stringify(playedVideoKeys)); }
    catch (error) { console.warn('No se pudo guardar el historial de reproducción:', error); }
  }, [playedVideoKeys]);
  // Registrar también los vídeos abiertos manualmente y los episodios elegidos por el espectador.
  useEffect(() => {
    if (!selectedProject?.id || !selectedProject?.youtubeId) return;
    const key = `${selectedProject.id}:${selectedProject.youtubeId}`;
    setPlayedVideoKeys(previous => previous.includes(key) ? previous : [...previous, key]);
  }, [selectedProject?.id, selectedProject?.youtubeId]);
  // Semilla por visita: cambia el creador elegido entre sesiones, pero no en cada render.
  const creatorShuffleSeed = useRef(Math.floor(Math.random() * 0x7fffffff));
  useEffect(() => { localStorage.setItem('toonknight_autoplay_next', String(autoPlayNext)); }, [autoPlayNext]);

  // Prioriza episodios de la serie, después obras del mismo creador y finalmente otros creadores.
  // Se excluyen vídeos ya reproducidos para evitar bucles de reproducción.
  const getNextToonKnightVideo = (current, seen = playedVideoKeys) => {
    if (!current) return null;
    const seenKeys = new Set([...seen, `${current.id}:${current.youtubeId}`]);
    const episodes = (current.seasons || []).flatMap((season, seasonIndex) =>
      (season.episodes || []).map((episode, episodeIndex) => ({ ...episode, seasonIndex, episodeIndex })));
    const currentEpisodeIndex = episodes.findIndex(ep => ep.youtubeId === current.youtubeId);
    if (normalizeFilterText(current.format) === 'serie' && currentEpisodeIndex >= 0) {
      const nextEpisode = episodes.slice(currentEpisodeIndex + 1).find(ep => ep.youtubeId && !seenKeys.has(`${current.id}:${ep.youtubeId}`));
      if (nextEpisode) return { project: current, youtubeId: nextEpisode.youtubeId, episode: nextEpisode };
    }
    const eligible = projects.filter(p => p.id !== current.id && p.youtubeId && (p.status === 'approved' || p.status === 'aprobado') && !seenKeys.has(`${p.id}:${p.youtubeId}`));
    const creatorKey = p => p.creatorProfileId ? `profile:${p.creatorProfileId}`
      : (p.creatorName || p.creator) ? `name:${normalizeFilterText(p.creatorName || p.creator)}`
      : p.creatorId ? `uploader:${p.creatorId}` : '';
    const currentKey = creatorKey(current);
    const ordered = [...eligible].sort((a, b) => getCreatedAtMillis(b.createdAt) - getCreatedAtMillis(a.createdAt));
    // Se mantiene el orden habitual para el mismo creador.
    const sameCreator = currentKey && ordered.find(p => creatorKey(p) === currentKey);
    if (sameCreator) return { project: sameCreator, youtubeId: sameCreator.youtubeId };

    // Al cambiar de creador, se escoge uno al azar entre los disponibles.
    // La elección es estable mientras se muestra este vídeo (también para el botón «Siguiente»).
    const otherCreators = new Map();
    for (const project of ordered) {
      const key = creatorKey(project) || `project:${project.id}`;
      if (key !== currentKey && !otherCreators.has(key)) otherCreators.set(key, project);
    }
    const candidates = [...otherCreators.values()];
    if (!candidates.length) return null;
    const choiceKey = `${current.id}:${current.youtubeId}:${[...seenKeys].sort().join('|')}`;
    let hash = creatorShuffleSeed.current;
    for (let i = 0; i < choiceKey.length; i++) hash = Math.imul(hash ^ choiceKey.charCodeAt(i), 16777619);
    const next = candidates[(hash >>> 0) % candidates.length];
    return { project: next, youtubeId: next.youtubeId };
  };
  const nextToonKnightVideo = getNextToonKnightVideo(selectedProject);
  const playNextToonKnightVideo = () => {
    if (!selectedProject) return;
    const next = getNextToonKnightVideo(selectedProject);
    if (!next) return;
    setPlayedVideoKeys(prev => {
      const key = `${selectedProject.id}:${selectedProject.youtubeId}`;
      return prev.includes(key) ? prev : [...prev, key];
    });
    if (next.project.id === selectedProject.id) {
      setActiveSeasonIndex(next.episode.seasonIndex);
      setSelectedProject(current => current ? { ...current, youtubeId: next.youtubeId } : current);
    } else {
      openProject(next.project, true);
    }
  };

  const [likedProjectIds, setLikedProjectIds] = useState(() => new Set());
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportReason, setReportReason] = useState('Derechos de autor');
  const [reportDetails, setReportDetails] = useState('');
  const [legalPage, setLegalPage] = useState('');
  const [selectedGenres, setSelectedGenres] = useState([]);
  const [seasons, setSeasons] = useState([{ seasonNumber: 1, episodes: [{ title: 'Episodio 1', youtubeUrl: '', episodeNumber: 1 }] }]);
  const [activeSeasonIndex, setActiveSeasonIndex] = useState(0);

  // Modales
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [showPublishWarning, setShowPublishWarning] = useState(false);
  const [editingProject, setEditingProject] = useState(null);
  const [editProjectForm, setEditProjectForm] = useState({ title: '', description: '', year: '', youtubeUrl: '', type: 'Acción real', format: 'Cortometraje', duration: '05:00', patreonUrl: '', campaignUrl: '' });
  const [editProjectGenres, setEditProjectGenres] = useState([]);
  const [editSeasons, setEditSeasons] = useState([]);
  const [showNewTopicModal, setShowNewTopicModal] = useState(false);
  const [showEditProfileModal, setShowEditProfileModal] = useState(false);
  const [profileForm, setProfileForm] = useState({
    name: '', bio: '', banner: '', photo: '', patreonUrl: '', kofiUrl: '', websiteUrl: '', youtubeUrl: '', instagramUrl: '', tiktokUrl: '', artstationUrl: '', xUrl: '', contactEmail: ''
  });
  const [profileImageFiles, setProfileImageFiles] = useState({ photo: null, banner: null });
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [selectedForumTopic, setSelectedForumTopic] = useState(null);

  // ==========================================
  // ESTADO Y EFECTO DEL CARRUSEL (ÚNICO)
  // ==========================================
  const [heroIndex, setHeroIndex] = useState(0);
  const [carouselItems, setCarouselItems] = useState([]);
  const [carouselStored, setCarouselStored] = useState(false);
  const [showCarouselEditor, setShowCarouselEditor] = useState(false);
  const [editingCarouselId, setEditingCarouselId] = useState(null);
  const [carouselForm, setCarouselForm] = useState({ title: '', tagline: '', category: '', thumbnail: '', thumbnailPath: '', videoUrl: '', linkText: 'Ver proyecto', darkOverlay: true });
  const [carouselImageFile, setCarouselImageFile] = useState(null);
  const [savingCarousel, setSavingCarousel] = useState(false);
  const [featuredOffset, setFeaturedOffset] = useState(0);
  const [featuredOrder, setFeaturedOrder] = useState([]);
  const [featuredSearchQuery, setFeaturedSearchQuery] = useState('');
  const [honorSearchQuery, setHonorSearchQuery] = useState('');
  const [honorSavingId, setHonorSavingId] = useState(null);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'carouselItems'), snapshot => {
      if (snapshot.empty) {
        setCarouselItems([]);
        setCarouselStored(false);
        return;
      }
      const storedItems = snapshot.docs.map(item => ({ ...item.data(), id: item.id }));
      storedItems.sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
      setCarouselItems(storedItems.slice(0, 8));
      setCarouselStored(true);
    }, error => console.error('No se pudo sincronizar el carrusel:', error));
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!carouselItems.length) return undefined;
    const timer = window.setInterval(() => {
      setHeroIndex(previous => (previous + 1) % carouselItems.length);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [carouselItems.length]);

  useEffect(() => {
    if (heroIndex >= carouselItems.length) setHeroIndex(0);
  }, [heroIndex, carouselItems.length]);

  // Buscador y Filtros (Únicos)
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('Todos'); // Acción real, documental, experimental, híbrido
  const [filterGenre, setFilterGenre] = useState('Todos'); // Acción, Fantasía, etc.
  const [filterYear, setFilterYear] = useState('Todos');
  const [filterFormat, setFilterFormat] = useState('Todos'); // Cortometraje, Serie, etc.

  // Formulario Nuevo Proyecto
  const [newProjectForm, setNewProjectForm] = useState({
    title: '',
    creator: user?.name || '',
    linkCreatorToProfile: true,
    youtubeUrl: '',
    patreonUrl: '',
    type: 'Acción real',
    genre: 'Acción',
    format: 'Cortometraje',
    year: '2026',
    duration: '05:00',
    description: '',
    campaignUrl: ''
  });

  // Formulario Rechazo Admin
  const [rejectionNote, setRejectionNote] = useState({});

  // Formulario Nuevo Tema Foro
  const [newTopicForm, setNewTopicForm] = useState({
    title: '',
    category: 'Herramientas',
    content: ''
  });
  const [newCommentText, setNewCommentText] = useState('');

  useEffect(() => {
    trackAnalyticsEvent('toonknight_page_view', { page_name: activeTab });
  }, [activeTab]);

  // Proyectos Destacados para el Carrusel
  const featuredProjects = useMemo(() => {
    return projects.filter(p => p.status === 'approved' && p.isFeatured);
  }, [projects]);

  const honorProjects = useMemo(() => projects.filter(project => project.status === 'approved' && project.hasHonorFrame === true), [projects]);

  // Orden cronológico por fecha de incorporación a ToonKnight, no por año de producción.
  const recentProjects = useMemo(() => projects
    .filter(project => project.status === 'approved')
    .sort((a, b) => getCreatedAtMillis(b.createdAt) - getCreatedAtMillis(a.createdAt)), [projects]);

  useEffect(() => {
    const shuffled = [...featuredProjects];
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
    }
    setFeaturedOrder(shuffled);
    setFeaturedOffset(0);
  }, [featuredProjects]);

  useEffect(() => {
    if (featuredOrder.length <= 4) return undefined;
    const timer = window.setInterval(() => {
      setFeaturedOffset(current => (current + 4) % featuredOrder.length);
    }, 4000);
    return () => window.clearInterval(timer);
  }, [featuredOrder.length]);

  const visibleFeaturedProjects = useMemo(() => {
    if (featuredOrder.length <= 4) return featuredOrder;
    return Array.from({ length: 4 }, (_, index) => featuredOrder[(featuredOffset + index) % featuredOrder.length]);
  }, [featuredOrder, featuredOffset]);

  // Proyectos Aprobados y Filtrados para la Rejilla
  const filteredProjects = useMemo(() => {
    return projects.filter(p => {
      if (p.status !== 'approved') return false;

      // Filtro de Búsqueda
      if (searchQuery.trim() !== '') {
        const query = searchQuery.toLowerCase();
        const matchTitle = String(p.title || '').toLowerCase().includes(query);
        const matchCreator = projectDisplayName(p).toLowerCase().includes(query);
        if (!matchTitle && !matchCreator) return false;
      }

      // Filtros desplegables. El campo type representa la técnica de animación
      // (2D, 3D, Stop Motion o IA); format representa el formato del proyecto.
      if (filterType !== 'Todos' && normalizeFilterText(p.type) !== normalizeFilterText(filterType)) return false;

      // Firestore puede guardar el género como etiqueta visible ("Ciencia ficción")
      // o como código interno ("scifi"). También admitimos el campo genres como array.
      if (filterGenre !== 'Todos') {
        const targetGenre = normalizeGenre(filterGenre);
        const projectGenres = [
          ...(Array.isArray(p.genres) ? p.genres : []),
          ...(p.genre != null ? [p.genre] : [])
        ];
        const matchesGenre = projectGenres.some(genre => normalizeGenre(genre) === targetGenre);
        if (!matchesGenre) return false;
      }

      if (filterYear !== 'Todos' && normalizeFilterText(p.year) !== normalizeFilterText(filterYear)) return false;

      if (filterFormat !== 'Todos') {
        const projectFormat = normalizeFilterText(p.format);
        const targetFormat = normalizeFilterText(filterFormat);
        const matchesFormat = targetFormat === 'crowdfunding'
          ? (projectFormat === 'crowdfunding' || Boolean(String(p.campaignUrl || '').trim()))
          : (projectFormat === targetFormat || (targetFormat === 'cortometraje' && !projectFormat));
        if (!matchesFormat) return false;
      }

      return true;
    });
  }, [projects, searchQuery, filterType, filterGenre, filterYear, filterFormat]);

  // --- Manejadores de Eventos ---
  const handleToggleFavorite = async (projectId) => {
    if (!user?.id) {
      setShowAuthModal(true);
      return;
    }
    const alreadyFavorite = (user.favorites || []).includes(projectId);
    const nextFavorites = alreadyFavorite
      ? (user.favorites || []).filter(id => id !== projectId)
      : [...(user.favorites || []), projectId];
    const nextUser = { ...user, favorites: nextFavorites };
    setUser(nextUser);
    localStorage.setItem('turodaje_user', JSON.stringify(nextUser));
    try {
      await setDoc(doc(db, 'users', user.id), {
        favorites: alreadyFavorite ? arrayRemove(projectId) : arrayUnion(projectId)
      }, { merge: true });
    } catch (error) {
      console.error('Error al guardar favoritos:', error);
      alert('No se pudieron sincronizar los favoritos con Firestore.');
    }
  };

  const handleLikeProject = async (projectId) => {
    if (!user?.id) {
      setShowAuthModal(true);
      return;
    }
    if (likedProjectIds.has(projectId)) return;
    try {
      const callLikeProject = httpsCallable(functions, 'likeProject');
      const response = await callLikeProject({ projectId });
      const result = response.data || {};
      setLikedProjectIds(current => new Set(current).add(projectId));
      if (result.liked) trackAnalyticsEvent('toonknight_project_like', { project_id: projectId });
      if (result.liked) {
        setProjects(prev => prev.map(project => project.id === projectId
          ? { ...project, likesCount: Number(result.likesCount ?? ((project.likesCount || 0) + 1)) } : project));
        setSelectedProject(current => current?.id === projectId
          ? { ...current, likesCount: Number(result.likesCount ?? ((current.likesCount || 0) + 1)) } : current);
      }
    } catch (error) {
      console.error('Error al guardar el me gusta:', error);
      const message = error?.code === 'functions/permission-denied'
        ? 'No tienes permiso para votar en este proyecto.'
        : 'No se pudo guardar el me gusta. Comprueba la conexión e inténtalo de nuevo.';
      alert(message);
    }
  };

  useEffect(() => {
    let cancelled = false;
    const loadLikeStatus = async () => {
      if (!user?.id || !selectedProject?.id) return;
      try {
        const likeSnapshot = await getDoc(doc(db, 'projects', selectedProject.id, 'likes', user.id));
        if (!cancelled && likeSnapshot.exists()) {
          setLikedProjectIds(current => new Set(current).add(selectedProject.id));
        }
      } catch (error) {
        console.error('No se pudo consultar el estado del like:', error);
      }
    };
    loadLikeStatus();
    return () => { cancelled = true; };
  }, [user?.id, selectedProject?.id]);

  const toggleGenre = (genre) => {
    setSelectedGenres(current => {
      if (current.includes(genre)) return current.filter(item => item !== genre);
      if (current.length >= 3) { alert('Solo puedes seleccionar un máximo de 3 géneros.'); return current; }
      return [...current, genre];
    });
  };

  const handleAddEpisode = (seasonIndex) => {
    setSeasons(current => current.map((season, idx) => idx !== seasonIndex ? season : ({
      ...season, episodes: [...season.episodes, { title: `Episodio ${season.episodes.length + 1}`, youtubeUrl: '', episodeNumber: season.episodes.length + 1 }]
    })));
  };

  const handleEpisodeChange = (seasonIndex, episodeIndex, field, value) => {
    setSeasons(current => current.map((season, idx) => idx !== seasonIndex ? season : ({
      ...season, episodes: season.episodes.map((episode, epIdx) => epIdx !== episodeIndex ? episode : ({ ...episode, [field]: value }))
    })));
  };

  const handleAddSeason = () => {
    setSeasons(current => [...current, { seasonNumber: current.length + 1, episodes: [{ title: 'Episodio 1', youtubeUrl: '', episodeNumber: 1 }] }]);
  };

  const openProject = (project, preservePlayback = false) => {
    if (!project?.id) return;
    const url = new URL(window.location.href);
    url.searchParams.delete('creator');
    url.searchParams.set('project', project.id);
    window.history.pushState({ projectId: project.id }, '', `${url.pathname}${url.search}${url.hash}`);
    setSelectedPublicProfileId('');
    setSelectedProject(project);
    setActiveTab('explorar');
    setActiveSeasonIndex(0);
    trackAnalyticsEvent('toonknight_project_open', { project_id: project.id, project_format: project.format || 'unknown' });
  };

  const closeProject = () => {
    const url = new URL(window.location.href);
    url.searchParams.delete('project');
    window.history.pushState({}, '', `${url.pathname}${url.search}${url.hash}`);
    setSelectedProject(null);
  };

  // Las entradas creadas dentro de ToonKnight se distinguen de enlaces directos.
  // Se conserva el estado existente para no interferir con la navegación de proyectos.
  const openPublicProfile = (profileId) => {
    if (typeof profileId !== 'string' || !profileId.trim()) return;
    const uid = profileId.trim();
    const currentUrl = new URL(window.location.href);
    if (currentUrl.searchParams.get('creator') === uid && selectedPublicProfileId === uid) return;

    const previousState = window.history.state || {};
    const originTab = activeTab === 'publicProfile'
      ? (previousState.toonknightOriginTab || 'explorar')
      : activeTab;
    window.history.replaceState({ ...previousState, toonknightTab: activeTab }, '', window.location.href);

    currentUrl.searchParams.delete('project');
    currentUrl.searchParams.set('creator', uid);
    window.history.pushState({ ...previousState, creatorId: uid, projectId: null,
      toonknightProfileEntry: true, toonknightOriginTab: originTab, toonknightTab: 'publicProfile'
    }, '', `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`);
    setSelectedProject(null);
    setSelectedPublicProfileId(uid);
    setActiveTab('publicProfile');
    trackAnalyticsEvent('toonknight_creator_profile_open', { creator_id: uid });
  };

  const closePublicProfile = () => {
    if (window.history.state?.toonknightProfileEntry) {
      // Una entrada interna siempre tiene una pantalla anterior en este historial.
      window.history.back();
      return;
    }
    // Un enlace directo (incluso recargado) no debe navegar a una web externa.
    const url = new URL(window.location.href);
    url.searchParams.delete('creator');
    const previousState = window.history.state || {};
    window.history.replaceState({ ...previousState, creatorId: null,
      toonknightProfileEntry: false, toonknightTab: 'explorar'
    }, '', `${url.pathname}${url.search}${url.hash}`);
    setSelectedPublicProfileId('');
    setSelectedProject(null);
    setActiveTab('explorar');
  };

  const handleShareProject = async (project) => {
    const shareText = `${project.title} — ${projectDisplayName(project)}`;
    const shareUrl = `${window.location.origin}${window.location.pathname}?project=${encodeURIComponent(project.id)}`;
    try {
      if (navigator.share) await navigator.share({ title: project.title, text: shareText, url: shareUrl });
      else if (navigator.clipboard) { await navigator.clipboard.writeText(shareUrl); alert('Enlace directo al vídeo copiado.'); }
      else window.prompt('Copia el enlace al vídeo:', shareUrl);
    } catch (error) { if (error?.name !== 'AbortError') console.error('No se pudo compartir el proyecto:', error); }
  };

  // Abre automáticamente el proyecto cuando alguien entra mediante un enlace compartido.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const profileId = params.get('creator');
    if (profileId) {
      setSelectedPublicProfileId(profileId);
      setActiveTab('publicProfile');
      setSelectedProject(null);
      return;
    }
    const projectId = params.get('project');
    if (!projectId || !projects.length) return;
    const sharedProject = projects.find(project => project.id === projectId && project.status === 'approved');
    if (sharedProject) setSelectedProject(current => current?.id === projectId ? current : sharedProject);
  }, [projects]);

  useEffect(() => {
    const syncProjectFromHistory = () => {
      const params = new URLSearchParams(window.location.search);
      const profileId = params.get('creator');
      if (profileId) {
        setSelectedProject(null);
        setSelectedPublicProfileId(profileId);
        setActiveTab('publicProfile');
        return;
      }
      setSelectedPublicProfileId('');
      const projectId = params.get('project');
      if (projectId) {
        const sharedProject = projects.find(project => project.id === projectId && project.status === 'approved');
        setSelectedProject(sharedProject || null);
        setActiveTab('explorar');
        return;
      }
      setSelectedProject(null);
      const restoredTab = window.history.state?.toonknightTab;
      setActiveTab(restoredTab && restoredTab !== 'publicProfile' ? restoredTab : 'explorar');
    };
    window.addEventListener('popstate', syncProjectFromHistory);
    return () => window.removeEventListener('popstate', syncProjectFromHistory);
  }, [projects]);

  const extractYoutubeId = (value) => {
    if (typeof value !== 'string' || !value.trim()) return null;
    try {
      const parsed = new URL(value.trim());
      const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
      let videoId = null;
      if (host === 'youtu.be') videoId = parsed.pathname.split('/').filter(Boolean)[0];
      else if (['youtube.com', 'm.youtube.com', 'youtube-nocookie.com'].includes(host)) {
        videoId = parsed.searchParams.get('v')
          || parsed.pathname.match(/^\/(?:embed|shorts|live)\/([^/?]+)/)?.[1];
      }
      return videoId && /^[A-Za-z0-9_-]{11}$/.test(videoId) ? videoId : null;
    } catch {
      return null;
    }
  };

  const openSubmitProjectModal = () => {
    setNewProjectForm(current => ({
      ...current,
      creator: current.linkCreatorToProfile ? (user?.name || current.creator || '') : (current.creator || user?.name || ''),
      linkCreatorToProfile: current.linkCreatorToProfile !== false
    }));
    setShowSubmitModal(true);
  };

  const handleSubmitProject = async (e) => {
    e.preventDefault();

    // La publicación requiere una sesión para guardar la autoría correctamente.
    if (!user?.id || !user?.email) {
      alert('Inicia sesión con Google antes de publicar un proyecto.');
      setShowAuthModal(true);
      return;
    }

    const title = newProjectForm.title.trim();
    if (!title) {
      alert('Escribe un título para el proyecto.');
      return;
    }

    const isSeries = newProjectForm.format === 'Serie';
    if (isSeries && (!seasons.length || seasons.some(season => !season.episodes.length || season.episodes.some(ep => !ep.title.trim() || !extractYoutubeId(ep.youtubeUrl.trim()))))) {
      alert('Completa el título y añade un enlace válido de YouTube para todos los episodios antes de enviar la serie.');
      return;
    }
    if (!isSeries && !extractYoutubeId(newProjectForm.youtubeUrl.trim())) { alert('Añade un enlace válido de YouTube para el proyecto.'); return; }
    const normalizedSeasons = isSeries ? seasons.map((season, seasonIndex) => ({
      seasonNumber: seasonIndex + 1,
      episodes: season.episodes.map((ep, episodeIndex) => ({
        title: ep.title.trim(), episodeNumber: Number(ep.episodeNumber) || episodeIndex + 1,
        youtubeId: extractYoutubeId(ep.youtubeUrl.trim()), thumbnail: `https://img.youtube.com/vi/${extractYoutubeId(ep.youtubeUrl.trim())}/hqdefault.jpg`
      }))
    })) : [];
    const firstEpisodeId = isSeries ? normalizedSeasons[0]?.episodes[0]?.youtubeId : extractYoutubeId(newProjectForm.youtubeUrl.trim());
    const ytId = firstEpisodeId || extractYoutubeId(newProjectForm.youtubeUrl.trim());
    const genres = selectedGenres.length ? selectedGenres : [newProjectForm.genre || 'Acción'];
    const projectCreatorName = newProjectForm.creator?.trim() || user.name || 'Anónimo';
    const creatorIsAccount = newProjectForm.linkCreatorToProfile === true;
    const createdAt = new Date().toISOString();
    const projectPayload = {
      title,
      creator: projectCreatorName,
      creatorName: projectCreatorName,
      creatorId: user.id, // Cuenta que sube el proyecto: se usa para permisos y eliminación.
      creatorEmail: user.email || auth.currentUser?.email || '', // Requerido por las reglas de Firestore.
      creatorProfileId: creatorIsAccount ? user.id : null,
      creatorPhoto: creatorIsAccount ? (user.photo || '') : '',
      creatorBio: creatorIsAccount ? (user.bio || '') : '',
      creatorPatreon: creatorIsAccount ? (user.patreonUrl || newProjectForm.patreonUrl || '') : (newProjectForm.patreonUrl || ''),
      creatorKofi: creatorIsAccount ? (user.kofiUrl || '') : '',
      creatorWeb: creatorIsAccount ? (user.websiteUrl || '') : '',
      status: 'pending',
      youtubeId: ytId,
      patreonUrl: newProjectForm.patreonUrl || '',
      campaignUrl: (newProjectForm.campaignUrl || '').trim(),
      thumbnail: `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`,
      type: newProjectForm.type || 'Acción real',
      genre: genres[0],
      genres,
      format: newProjectForm.format || 'Cortometraje',
      year: newProjectForm.year || String(new Date().getFullYear()),
      duration: newProjectForm.duration || '05:00',
      description: newProjectForm.description.trim(),
      isFeatured: false,
      likesCount: 0,
      // Los episodios viven dentro de seasons[].episodes[].
      seasons: isSeries ? normalizedSeasons : [{ seasonNumber: 1, episodes: [{ title, episodeNumber: 1, youtubeId: ytId, duration: newProjectForm.duration || '05:00' }] }],
      createdAt: serverTimestamp(),
      rejectionReason: ''
    };

    try {
      const docRef = await addDoc(collection(db, 'projects'), projectPayload);
      const createdProject = { id: docRef.id, ...projectPayload, createdAt };

      setProjects(prevProjects => [createdProject, ...prevProjects]);
      trackAnalyticsEvent('toonknight_project_submit', { project_format: projectPayload.format, project_type: projectPayload.type });
      setShowSubmitModal(false);
      setSelectedGenres([]);
      setSeasons([{ seasonNumber: 1, episodes: [{ title: 'Episodio 1', youtubeUrl: '', episodeNumber: 1 }] }]);
      setNewProjectForm({
        title: '',
        creator: user.name || '',
        linkCreatorToProfile: true,
        youtubeUrl: '',
        patreonUrl: '',
        type: 'Acción real',
        genre: 'Acción',
        format: 'Cortometraje',
        year: String(new Date().getFullYear()),
        duration: '05:00',
        description: '',
        campaignUrl: ''
      });
      alert('¡Proyecto enviado a revisión y guardado en Firestore!');
    } catch (error) {
      console.error('Error al guardar el proyecto en Firestore:', error);
      alert('No se pudo publicar el proyecto. Comprueba tu conexión y las reglas de seguridad de Firestore e inténtalo de nuevo.');
    }
  };

  const handleSubmitReport = async (e) => {
    e.preventDefault();
    if (!user?.id) {
      setShowReportModal(false);
      setShowAuthModal(true);
      return;
    }
    if (!selectedProject?.id) return;
    try {
      const submitReport = httpsCallable(functions, 'reportContent');
      await submitReport({
        type: 'project',
        projectId: selectedProject.id,
        reason: reportReason,
        details: reportDetails.trim()
      });
      setShowReportModal(false);
      setReportDetails('');
      alert('Gracias. Hemos recibido la denuncia para revisión.');
    } catch (error) {
      console.error('No se pudo guardar la denuncia:', error);
      alert('No se pudo enviar la denuncia. Comprueba que las funciones de Firebase estén desplegadas.');
    }
  };

  // Acciones de Moderación Admin
  const handleApproveProject = async (id) => {
    try {
      const moderate = httpsCallable(functions, 'moderateProject');
      await moderate({ projectId: id, status: 'approved' });
      setProjects(prev => prev.map(project => project.id === id ? { ...project, status: 'approved' } : project));
    } catch (error) { console.error('Error al aprobar el proyecto:', error); alert('No se pudo guardar la aprobación. Comprueba que Cloud Functions esté desplegado.'); }
  };

  const handleRejectProject = async (id) => {
    const reason = (rejectionNote[id] || '').trim() || 'El contenido no cumple con nuestras directrices comunitarias.';
    try {
      const moderate = httpsCallable(functions, 'moderateProject');
      await moderate({ projectId: id, status: 'rejected', reason });
      setProjects(prev => prev.map(project => project.id === id ? { ...project, status: 'rejected', rejectionReason: reason, moderatorMessage: reason } : project));
    } catch (error) { console.error('Error al rechazar el proyecto:', error); alert('No se pudo guardar el rechazo. Comprueba que Cloud Functions esté desplegado.'); }
  };

  // Elimina el documento del proyecto en Firestore y sincroniza la interfaz.
  const handleDeleteProject = async (projectId) => {
    if (!isAdmin) {
      alert('No tienes permisos para eliminar proyectos.');
      return;
    }

    if (!window.confirm('¿Estás seguro de que deseas eliminar permanentemente este proyecto? Esta acción no se puede deshacer.')) return;

    try {
      const removeProject = httpsCallable(functions, 'deleteProjectAsModerator');
      await removeProject({ projectId, reason: 'Eliminación manual desde el panel de moderación.' });
      setProjects(prevProjects => prevProjects.filter(project => project.id !== projectId));
      if (selectedProject?.id === projectId) closeProject();
      alert('Proyecto eliminado de Firestore.');
    } catch (error) {
      console.error('Error al eliminar el proyecto:', error);
      alert('No se pudo eliminar el proyecto. Comprueba las reglas de seguridad de Firestore y vuelve a intentarlo.');
    }
  };

  // Los episodios de ToonKnight están organizados dentro de seasons[].episodes[].
  // Como los episodios actuales no tienen id propio, se identifican por sus índices.
  const handleDeleteEpisode = async (projectId, seasonIndex, episodeIndex) => {
    if (!isAdmin) {
      alert('No tienes permisos para eliminar episodios.');
      return;
    }

    if (!window.confirm('¿Seguro que deseas eliminar este episodio? Esta acción no se puede deshacer.')) return;

    try {
      const projectRef = doc(db, 'projects', projectId);
      const projectSnap = await getDoc(projectRef);
      if (!projectSnap.exists()) {
        alert('No se encontró este proyecto en Firestore.');
        return;
      }

      const projectData = projectSnap.data();
      const seasons = Array.isArray(projectData.seasons) ? projectData.seasons : [];
      if (!seasons[seasonIndex] || !Array.isArray(seasons[seasonIndex].episodes) || !seasons[seasonIndex].episodes[episodeIndex]) {
        alert('No se encontró el episodio que quieres eliminar.');
        return;
      }

      const updatedSeasons = seasons.map((season, idx) => idx === seasonIndex
        ? { ...season, episodes: season.episodes.filter((_, epIdx) => epIdx !== episodeIndex) }
        : season
      );

      await updateDoc(projectRef, { seasons: updatedSeasons });
      setProjects(prevProjects => prevProjects.map(project => project.id === projectId ? { ...project, seasons: updatedSeasons } : project));
      setSelectedProject(current => current?.id === projectId ? { ...current, seasons: updatedSeasons } : current);
      alert('Episodio eliminado correctamente.');
    } catch (error) {
      console.error('Error al eliminar el episodio:', error);
      alert('No se pudo eliminar el episodio. Comprueba las reglas de seguridad de Firestore y vuelve a intentarlo.');
    }
  };

  const handleOpenEditProject = (project) => {
    const genres = Array.isArray(project.genres) && project.genres.length
      ? project.genres
      : (project.genre ? [project.genre] : []);
    setEditProjectGenres(genres.slice(0, 3));
    setEditProjectForm({
      title: project.title || '',
      creator: project.creatorName || project.creator || '',
      linkCreatorToProfile: Boolean(project.creatorProfileId),
      description: project.description || '',
      year: String(project.year || new Date().getFullYear()),
      youtubeUrl: project.youtubeId ? `https://www.youtube.com/watch?v=${project.youtubeId}` : '',
      type: project.type || 'Acción real',
      format: project.format || 'Cortometraje',
      duration: project.duration || '05:00',
      patreonUrl: project.patreonUrl || '',
      campaignUrl: project.campaignUrl || ''
    });
    setEditSeasons((Array.isArray(project.seasons) ? project.seasons : []).map((season, seasonIndex) => ({
      ...season,
      seasonNumber: Number(season.seasonNumber) || seasonIndex + 1,
      episodes: (Array.isArray(season.episodes) ? season.episodes : []).map((episode, episodeIndex) => ({
        ...episode,
        episodeNumber: Number(episode.episodeNumber) || episodeIndex + 1,
        youtubeUrl: episode.youtubeUrl || (episode.youtubeId ? `https://www.youtube.com/watch?v=${episode.youtubeId}` : '')
      }))
    })));
    setEditingProject(project);
  };

  const handleEditSeasonChange = (seasonIndex, episodeIndex, field, value) => {
    setEditSeasons(current => current.map((season, index) => index !== seasonIndex ? season : ({
      ...season,
      episodes: season.episodes.map((episode, epIndex) => epIndex !== episodeIndex ? episode : ({ ...episode, [field]: value }))
    })));
  };

  const handleAddEditSeason = () => {
    setEditSeasons(current => [...current, {
      seasonNumber: current.length + 1,
      episodes: [{ title: `Episodio 1`, episodeNumber: 1, youtubeUrl: '' }]
    }]);
  };

  const handleAddEditEpisode = (seasonIndex) => {
    setEditSeasons(current => current.map((season, index) => index !== seasonIndex ? season : ({
      ...season,
      episodes: [...season.episodes, {
        title: `Episodio ${season.episodes.length + 1}`,
        episodeNumber: season.episodes.length + 1,
        youtubeUrl: ''
      }]
    })));
  };

  const handleSaveEditedProject = async (e) => {
    e.preventDefault();
    if (!editingProject || !user?.id || (editingProject.creatorId !== user.id && editingProject.creatorEmail !== user.email && !isAdmin)) { alert('No tienes permiso para editar este proyecto.'); return; }
    const isSeries = editProjectForm.format === 'Serie';
    if (isSeries && (!editSeasons.length || editSeasons.some(season => !season.episodes?.length || season.episodes.some(episode => !episode.title?.trim() || !episode.youtubeUrl?.trim() || !extractYoutubeId(episode.youtubeUrl.trim()))))) {
      alert('Completa el título y un enlace válido de YouTube para todos los episodios de la serie.');
      return;
    }
    if (!isSeries && editProjectForm.youtubeUrl.trim() && !extractYoutubeId(editProjectForm.youtubeUrl.trim())) {
      alert('Introduce un enlace válido de YouTube.');
      return;
    }
    const normalizedSeasons = isSeries ? editSeasons.map((season, seasonIndex) => ({
      ...season,
      seasonNumber: seasonIndex + 1,
      episodes: season.episodes.map((episode, episodeIndex) => {
        const youtubeId = extractYoutubeId(episode.youtubeUrl.trim());
        return {
          ...episode,
          title: episode.title.trim(),
          episodeNumber: Number(episode.episodeNumber) || episodeIndex + 1,
          youtubeId,
          thumbnail: `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg`
        };
      })
    })) : (Array.isArray(editingProject.seasons) ? editingProject.seasons : []);
    const firstEpisodeId = isSeries ? normalizedSeasons[0]?.episodes[0]?.youtubeId : null;
    const ytId = firstEpisodeId || (editProjectForm.youtubeUrl.trim()
      ? extractYoutubeId(editProjectForm.youtubeUrl.trim())
      : editingProject.youtubeId);
    const genres = editProjectGenres.length ? editProjectGenres : [editingProject.genre || 'Acción'];
    const updates = {
      title: editProjectForm.title.trim(),
      creator: editProjectForm.creator.trim() || editingProject.creator || 'Creador',
      creatorName: editProjectForm.creator.trim() || editingProject.creatorName || editingProject.creator || 'Creador',
      creatorProfileId: editProjectForm.linkCreatorToProfile ? editingProject.creatorId : null,
      creatorPhoto: editProjectForm.linkCreatorToProfile ? (editingProject.creatorPhoto || (editingProject.creatorId === user.id ? user.photo : '')) : '',
      creatorBio: editProjectForm.linkCreatorToProfile ? (editingProject.creatorBio || (editingProject.creatorId === user.id ? user.bio : '')) : '',
      creatorPatreon: editProjectForm.linkCreatorToProfile ? (editingProject.creatorPatreon || (editingProject.creatorId === user.id ? user.patreonUrl : '')) : editProjectForm.patreonUrl.trim(),
      creatorKofi: editProjectForm.linkCreatorToProfile ? (editingProject.creatorKofi || (editingProject.creatorId === user.id ? user.kofiUrl : '')) : '',
      creatorWeb: editProjectForm.linkCreatorToProfile ? (editingProject.creatorWeb || (editingProject.creatorId === user.id ? user.websiteUrl : '')) : '',
      description: editProjectForm.description.trim(),
      year: String(editProjectForm.year),
      youtubeId: ytId,
      thumbnail: ytId ? `https://img.youtube.com/vi/${ytId}/hqdefault.jpg` : editingProject.thumbnail,
      type: editProjectForm.type || 'Acción real',
      format: editProjectForm.format || 'Cortometraje',
      genre: genres[0],
      genres,
      duration: editProjectForm.duration || '05:00',
      patreonUrl: editProjectForm.patreonUrl.trim(),
      campaignUrl: editProjectForm.campaignUrl.trim(),
      seasons: normalizedSeasons
    };
    if (!updates.title) { alert('El título es obligatorio.'); return; }
    try {
      await updateDoc(doc(db, 'projects', editingProject.id), updates);
      setProjects(prev => prev.map(p => p.id === editingProject.id ? { ...p, ...updates } : p));
      setSelectedProject(prev => prev?.id === editingProject.id ? { ...prev, ...updates } : prev);
      setEditingProject(null);
      alert('Proyecto actualizado correctamente.');
    } catch (error) { console.error('Error al editar proyecto:', error); alert('No se pudo editar el proyecto.'); }
  };

  const handleDeleteOwnProject = async (project) => {
    if (!user?.id || (project.creatorId !== user.id && project.creatorEmail !== user.email && !isAdmin)) { alert('Solo puedes eliminar tus propios proyectos.'); return; }
    if (!window.confirm('¿Quieres eliminar este proyecto? Esta acción no se puede deshacer.')) return;
    try {
      await deleteDoc(doc(db, 'projects', project.id));
      setProjects(prev => prev.filter(p => p.id !== project.id));
      closeProject();
      alert('Proyecto eliminado.');
    } catch (error) { console.error('Error al eliminar proyecto:', error); alert('No se pudo eliminar el proyecto.'); }
  };

  useEffect(() => {
    if (!selectedProject?.id) return;
    const projectId = selectedProject.id;
    trackAnalyticsEvent('toonknight_video_play', { project_id: projectId, project_format: selectedProject.format || 'unknown' });
    const recordView = httpsCallable(functions, 'recordProjectView');
    recordView({ projectId }).then(response => {
      const viewsCount = Number(response.data?.viewsCount || 0);
      setProjects(prev => prev.map(project => project.id === projectId ? { ...project, viewsCount } : project));
      setSelectedProject(prev => prev?.id === projectId ? { ...prev, viewsCount } : prev);
    }).catch(error => console.error('No se pudo registrar la visita:', error));
  }, [selectedProject?.id]);

  const handleImportCurrentCarousel = async () => {
    if (!isAdmin || carouselStored || !window.confirm('¿Quieres importar los elementos actuales del carrusel a Firestore para poder administrarlos desde la web?')) return;
    try {
      await Promise.all(CAROUSEL_ITEMS.slice(0, 8).map((item, index) => setDoc(doc(db, 'carouselItems', `slide-${item.id || index + 1}`), {
        ...item,
        darkOverlay: item.darkOverlay !== false,
        order: index,
        createdBy: user?.id || '',
        updatedBy: user?.id || '',
        updatedAt: new Date().toISOString()
      })));
      alert('Carrusel importado. Ahora puedes editarlo desde este panel.');
    } catch (error) {
      console.error('No se pudo importar el carrusel:', error);
      alert('No se pudo importar el carrusel. Comprueba las reglas de Firestore.');
    }
  };

  const openNewCarouselItem = () => {
    if (!isAdmin || !carouselStored || carouselItems.length >= 8) return;
    setEditingCarouselId(null);
    setCarouselForm({ title: '', tagline: '', category: '', thumbnail: '', thumbnailPath: '', videoUrl: '', linkText: 'Ver proyecto', darkOverlay: true });
    setCarouselImageFile(null);
    setShowCarouselEditor(true);
  };

  const openEditCarouselItem = item => {
    setEditingCarouselId(item.id);
    setCarouselForm({
      title: item.title || '', tagline: item.tagline || '', category: item.category || '',
      thumbnail: item.thumbnail || '', thumbnailPath: item.thumbnailPath || '', videoUrl: item.videoUrl || '', linkText: item.linkText || 'Ver proyecto', darkOverlay: item.darkOverlay !== false
    });
    setCarouselImageFile(null);
    setShowCarouselEditor(true);
  };

  const saveCarouselItem = async event => {
    event.preventDefault();
    if (!isAdmin || savingCarousel) return;
    const thumbnail = carouselForm.thumbnail.trim();
    const videoUrl = carouselForm.videoUrl.trim();
    if ((!thumbnail && !carouselImageFile) || !videoUrl) { alert('La imagen y el enlace del botón son obligatorios.'); return; }
    if ((!carouselImageFile && !(thumbnail.startsWith('/') || isSafeHttpUrl(thumbnail))) || !isSafeHttpUrl(videoUrl)) { alert('La imagen debe ser una ruta local o URL http(s), y el botón debe tener un enlace http(s).'); return; }
    if (carouselImageFile && (!carouselImageFile.type.startsWith('image/') || carouselImageFile.size > 5 * 1024 * 1024)) { alert('Selecciona una imagen de hasta 5 MB.'); return; }
    setSavingCarousel(true);
    const targetRef = editingCarouselId ? doc(db, 'carouselItems', editingCarouselId) : doc(collection(db, 'carouselItems'));
    let uploadedPath = '';
    try {
      let finalThumbnail = thumbnail;
      let finalThumbnailPath = carouselForm.thumbnailPath || '';
      if (carouselImageFile) {
        const safeName = carouselImageFile.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-90) || 'carousel-image.jpg';
        uploadedPath = `moderation/carouselItems/${targetRef.id}/${Date.now()}-${safeName}`;
        const uploadedRef = await uploadBytes(storageRef(storage, uploadedPath), carouselImageFile, {
          contentType: carouselImageFile.type,
          customMetadata: { uploadedBy: user?.id || '' }
        });
        finalThumbnail = await getDownloadURL(uploadedRef.ref);
        finalThumbnailPath = uploadedPath;
      } else if (thumbnail !== carouselForm.thumbnail) {
        finalThumbnailPath = '';
      }
      const payload = {
        ...carouselForm,
        title: carouselForm.title.trim(), tagline: carouselForm.tagline.trim(), category: carouselForm.category.trim(),
        thumbnail: finalThumbnail, thumbnailPath: finalThumbnailPath, videoUrl,
        linkText: carouselForm.linkText.trim() || 'Ver proyecto',
        updatedBy: user?.id || '', updatedAt: new Date().toISOString()
      };
      if (!editingCarouselId) payload.createdBy = user?.id || '';
      if (editingCarouselId) await setDoc(targetRef, payload, { merge: true });
      else await setDoc(targetRef, { ...payload, order: carouselItems.length, createdAt: new Date().toISOString() });
      setShowCarouselEditor(false);
      setCarouselImageFile(null);
    } catch (error) {
      if (uploadedPath) await deleteObject(storageRef(storage, uploadedPath)).catch(() => null);
      console.error('No se pudo guardar el elemento del carrusel:', error);
      alert('No se pudo guardar el elemento. Comprueba las reglas de Firestore y Storage.');
    } finally { setSavingCarousel(false); }
  };

  const deleteCarouselItem = async item => {
    if (!isAdmin) return;
    if (carouselItems.length <= 1) { alert('El carrusel debe conservar al menos una imagen.'); return; }
    if (!window.confirm(`¿Eliminar «${item.title || 'esta imagen'}» del carrusel?`)) return;
    try { await deleteDoc(doc(db, 'carouselItems', item.id)); }
    catch (error) { console.error(error); alert('No se pudo eliminar la imagen del carrusel.'); }
  };

  const handleToggleHonor = async (project) => {
    if (!isAdmin || honorSavingId) return;
    const enabled = project.hasHonorFrame !== true;
    setHonorSavingId(project.id);
    try {
      const setHonor = httpsCallable(functions, 'setProjectHonor');
      await setHonor({ projectId: project.id, enabled });
      // onSnapshot sincroniza todos los proyectos, también en otras sesiones.
    } catch (error) {
      console.error('No se pudo actualizar Escudo de Honor:', error);
      alert(error?.message || 'No se pudo actualizar Escudo de Honor.');
    } finally {
      setHonorSavingId(null);
    }
  };

  const handleToggleFeatured = async (id) => {
    const project = projects.find(item => item.id === id);
    if (!project) return;
    const featured = !project.isFeatured;
    try {
      const setFeatured = httpsCallable(functions, 'setProjectFeatured');
      await setFeatured({ projectId: id, featured });
      setProjects(prev => prev.map(item => item.id === id ? { ...item, isFeatured: featured } : item));
    } catch (error) { console.error('Error al actualizar destacado:', error); alert('No se pudo guardar el cambio. Comprueba que Cloud Functions esté desplegado.'); }
  };

  // Administración de productos (solo administradores).
  const openNewProduct = () => {
    if (!isAdmin) return alert('Solo los administradores pueden gestionar productos.');
    setEditingProductId(null);
    setProductForm({ title: '', category: 'Software', subtype: '', techniques: [], uses: [], software: [], price: '', image: '', description: '', link: '', isAffiliate: false });
    setShowProductModal(true);
  };

  const openEditProduct = (product) => {
    if (!isAdmin) return alert('Solo los administradores pueden gestionar productos.');
    setEditingProductId(product.id);
    setProductForm({ title: product.title || '', category: product.category || 'Software', subtype: product.subtype || '', techniques: product.techniques || [], uses: product.uses || [], software: product.software || [], price: product.price || '', image: product.image || '', description: product.description || '', link: product.link || '', isAffiliate: Boolean(product.isAffiliate) });
    setShowProductModal(true);
  };

  const handleSaveProduct = async (e) => {
    e.preventDefault();
    if (!isAdmin) return alert('No tienes permisos para gestionar productos.');
    const payload = { ...productForm, title: productForm.title.trim(), description: productForm.description.trim(), updatedAt: new Date().toISOString() };
    if (!payload.title || !payload.link) return alert('El título y el enlace del producto son obligatorios.');
    const productId = editingProductId || `product_${Date.now()}`;
    try {
      await setDoc(doc(db, 'products', productId), payload, { merge: true });
      setProducts(prev => editingProductId ? prev.map(item => item.id === productId ? { ...payload, id: productId } : item) : [...prev, { ...payload, id: productId }]);
      setShowProductModal(false);
      alert(editingProductId ? 'Producto actualizado.' : 'Producto agregado.');
    } catch (error) {
      console.error('Error al guardar producto:', error);
      alert('No se pudo guardar el producto. Revisa las reglas de Firestore.');
    }
  };

  const handleDeleteProduct = async (product) => {
    if (!isAdmin) return alert('Solo los administradores pueden gestionar productos.');
    if (!window.confirm(`¿Eliminar el producto «${product.title}»?`)) return;
    try {
      await deleteDoc(doc(db, 'products', product.id));
      setProducts(prev => prev.filter(item => item.id !== product.id));
    } catch (error) {
      console.error('Error al eliminar producto:', error);
      alert('No se pudo eliminar el producto. Revisa las reglas de Firestore.');
    }
  };

  const toggleArrayValue = (form, setForm, field, value) => setForm(current => ({ ...current, [field]: current[field].includes(value) ? current[field].filter(item => item !== value) : [...current[field], value] }));
  const openNewEducation = () => { if (!isAdmin) return; setEditingEducationId(null); setEducationForm({ title: '', provider: '', url: '', price: 'Gratis', image: '', description: '', techniques: [], topics: [], software: [] }); setShowEducationModal(true); };
  const openEditEducation = item => { setEditingEducationId(item.id); setEducationForm({ title: item.title || '', provider: item.provider || '', url: item.url || '', price: item.price || 'Gratis', image: item.image || '', description: item.description || '', techniques: item.techniques || [], topics: item.topics || [], software: item.software || [] }); setShowEducationModal(true); };
  const handleSaveEducation = async e => { e.preventDefault(); if (!isAdmin) return; const payload = { ...educationForm, title: educationForm.title.trim(), updatedAt: new Date().toISOString() }; if (!payload.title || !payload.url) return alert('El título y el enlace del curso son obligatorios.'); const id = editingEducationId || `course_${Date.now()}`; try { await setDoc(doc(db, 'education', id), payload, { merge: true }); setEducationItems(prev => editingEducationId ? prev.map(item => item.id === id ? { ...payload, id } : item) : [...prev, { ...payload, id }]); setShowEducationModal(false); } catch (error) { console.error('Error al guardar curso:', error); alert('No se pudo guardar el curso. Revisa las reglas de Firestore.'); } };
  const handleDeleteEducation = async item => { if (!isAdmin || !window.confirm(`¿Eliminar el curso «${item.title}»?`)) return; try { await deleteDoc(doc(db, 'education', item.id)); setEducationItems(prev => prev.filter(course => course.id !== item.id)); } catch (error) { console.error(error); alert('No se pudo eliminar el curso.'); } };

  const handleDeleteTopic = async (topic) => {
    if (!user?.id) return setShowAuthModal(true);
    if (!isAdmin && topic.authorId !== user.id && topic.authorEmail !== user.email) {
      alert('Solo puedes eliminar tus propios temas del foro.');
      return;
    }
    if (!window.confirm(`¿Eliminar el tema «${topic.title}»? Esta acción no se puede deshacer.`)) return;
    try {
      await deleteDoc(doc(db, 'discussions', topic.id));
      setForumTopics(prev => prev.filter(item => item.id !== topic.id));
      setSelectedForumTopic(current => current?.id === topic.id ? null : current);
    } catch (error) {
      console.error('Error al eliminar tema:', error);
      alert('No se pudo eliminar el tema. Revisa las reglas de Firestore.');
    }
  };

  const handleSendContact = async (e) => {
    e.preventDefault();
    const payload = {
      name: contactForm.name.trim(),
      email: contactForm.email.trim(),
      subject: contactForm.subject.trim(),
      message: contactForm.message.trim()
    };
    if (!payload.name || !payload.email || !payload.message) {
      alert('Completa tu nombre, correo y mensaje.');
      return;
    }

    alert('El formulario de contacto de TuRodaje estará disponible cuando se configure su correo.');
    return;
    setSendingContact(true);
    try {
      // El titular confirma que contacto@toonknight.com ya está operativo. Verificar el envío real mediante FormSubmit antes de publicar.
      const response = await fetch('https://example.invalid/contact-disabled', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          name: payload.name,
          email: payload.email,
          subject: payload.subject,
          message: payload.message,
          _subject: payload.subject || 'Nuevo mensaje desde TuRodaje',
          _replyto: payload.email,
          _captcha: 'false'
        })
      });

      let result = null;
      try {
        result = await response.json();
      } catch {
        // Una respuesta no JSON no debe interpretarse como un envío confirmado.
      }

      if (!response.ok || !result || result.success === false || result.success === 'false') {
        console.error('Respuesta de FormSubmit:', { status: response.status, result });
        throw new Error(result?.message || `El servicio de correo respondió con HTTP ${response.status}`);
      }

      setContactForm({ name: '', email: '', subject: '', message: '' });
      setShowContactModal(false);
      alert('FormSubmit ha aceptado el mensaje. Comprueba que llegó a contacto@toonknight.com, incluida la carpeta de spam.');
    } catch (error) {
      console.error('Error al enviar mensaje de contacto:', error);
      alert('FormSubmit no confirmó el envío. Si es la primera vez que usas este correo, revisa si FormSubmit te envió un mensaje de activación y confírmalo. Si ya está activado, abre la consola del navegador para ver el error exacto.');
    } finally {
      setSendingContact(false);
    }
  };

  // Los nombres del foro se actualizan en tiempo real al editar el perfil.
  const forumAuthorIds = useMemo(() => [...new Set(forumTopics.flatMap(topic => [topic.authorId,
    ...(topic.comments || []).map(comment => comment.authorId)]).filter(Boolean))].sort().join('|'), [forumTopics]);
  useEffect(() => {
    const ids = forumAuthorIds ? forumAuthorIds.split('|') : [];
    const unsubscribers = ids.map(uid => onSnapshot(doc(db, 'publicProfiles', uid), snapshot => {
      setForumPublicAuthors(previous => ({ ...previous, [uid]: snapshot.exists() ? snapshot.data() : null }));
    }, error => console.warn('No se pudo leer un perfil público del foro:', uid, error)));
    return () => unsubscribers.forEach(unsubscribe => unsubscribe());
  }, [forumAuthorIds]);

  const forumAuthor = (uid, fallbackName) => {
    const profile = uid ? forumPublicAuthors[uid] : null;
    const name = profile?.name || fallbackName || 'Usuario';
    return (
      <button type="button" disabled={!uid} onClick={(event) => {
        event.stopPropagation();
        openPublicProfile(uid);
      }} className={`inline-flex items-center gap-2 text-left ${uid ? 'hover:text-gold-300' : 'cursor-default'}`}>
        {profile?.photo ? <img src={profile.photo} alt="" className="h-6 w-6 rounded-full object-cover bg-[#292B2E]" />
          : <span aria-hidden="true" className="flex h-6 w-6 items-center justify-center rounded-full bg-[#34343d]"><User className="h-3.5 w-3.5" /></span>}
        <span>{name}</span>
      </button>
    );
  };

  // Foro
  const handleCreateTopic = async (e) => {
    e.preventDefault();
    if (!user?.id) {
      setShowAuthModal(true);
      return;
    }
    const topicPayload = {
      title: newTopicForm.title.trim(),
      category: newTopicForm.category,
      authorName: user.name || 'Usuario',
      authorId: user.id,
      authorEmail: user.email,
      createdAt: new Date().toISOString(),
      content: newTopicForm.content.trim(),
      likes: 0,
      comments: []
    };
    if (!topicPayload.title || !topicPayload.content) {
      alert('Completa el título y el contenido de la discusión.');
      return;
    }
    try {
      await addDoc(collection(db, 'discussions'), topicPayload);
      setShowNewTopicModal(false);
      setNewTopicForm({ title: '', category: 'Herramientas', content: '' });
    } catch (error) {
      console.error('Error al crear la discusión:', error);
      alert('No se pudo publicar la discusión. Comprueba las reglas de Firestore.');
    }
  };

  const handleAddComment = async (topicId) => {
    const text = newCommentText.trim();
    if (!text || !user?.id) {
      if (!user?.id) setShowAuthModal(true);
      return;
    }
    const comment = {
      author: user.name || 'Usuario',
      authorId: user.id,
      text,
      createdAt: new Date().toISOString()
    };
    try {
      // Subcolección escalable para comentarios: discussions/{topicId}/comments.
      const commentRef = await addDoc(collection(db, 'discussions', topicId, 'comments'), comment);
      const savedComment = { ...comment, id: commentRef.id };
      // También se mantiene un resumen embebido para que la vista actual pueda leer comentarios
      // desde el documento principal; la subcolección permite escalar a muchos comentarios.
      await updateDoc(doc(db, 'discussions', topicId), { comments: arrayUnion(savedComment) });
      setForumTopics(prev => prev.map(topic => topic.id === topicId
        ? { ...topic, comments: [...(topic.comments || []), savedComment] }
        : topic));
      setSelectedForumTopic(current => current?.id === topicId
        ? { ...current, comments: [...(current.comments || []), savedComment] }
        : current);
      setNewCommentText('');
    } catch (error) {
      console.error('Error al guardar el comentario:', error);
      alert('No se pudo guardar el comentario en Firestore.');
    }
  };

  // ==========================================
  // AUTENTICACIÓN REAL CON FIREBASE + GOOGLE
  // ==========================================
  // --- INICIO DE SESIÓN CON GOOGLE Y FIRESTORE ---
  const processGoogleUser = async (firebaseUser) => {
    const email = (firebaseUser.email || '').toLowerCase();
    if (!email) {
      alert('La cuenta de Google no tiene un correo electrónico disponible.');
      return;
    }

    const isAdmin = ADMIN_EMAILS.includes(email);
    const userRef = doc(db, 'users', firebaseUser.uid);
    const userSnap = await getDoc(userRef);

    const existingData = userSnap.exists() ? userSnap.data() : {};
    const loggedUser = {
      id: firebaseUser.uid,
      name: existingData.name || firebaseUser.displayName || email.split('@')[0],
      email,
      photo: existingData.photo || firebaseUser.photoURL || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80',
      photoPath: existingData.photoPath || '',
      banner: existingData.banner || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=1200&q=80',
      bannerPath: existingData.bannerPath || '',
      bio: existingData.bio ?? '¡Hola! Soy cineasta en TuRodaje.',
      patreonUrl: existingData.patreonUrl ?? '',
      kofiUrl: existingData.kofiUrl ?? '',
      websiteUrl: existingData.websiteUrl ?? '',
      youtubeUrl: existingData.youtubeUrl ?? '',
      instagramUrl: existingData.instagramUrl ?? '',
      tiktokUrl: existingData.tiktokUrl ?? '',
      artstationUrl: existingData.artstationUrl ?? '',
      xUrl: existingData.xUrl ?? '',
      contactEmail: existingData.contactEmail || email,
      favorites: Array.isArray(existingData.favorites) ? existingData.favorites : [],
      isPatreonSupporter: existingData.isPatreonSupporter === true,
      role: isAdmin ? 'admin' : (existingData.role || 'user'),
      createdAt: existingData.createdAt || new Date().toISOString()
    };

    await setDoc(userRef, loggedUser, { merge: true });
    await setDoc(doc(db, 'publicProfiles', firebaseUser.uid), {
      name: loggedUser.name,
      nameLower: loggedUser.name.toLocaleLowerCase('es'),
      photo: loggedUser.photo,
      photoPath: loggedUser.photoPath,
      banner: loggedUser.banner,
      bannerPath: loggedUser.bannerPath,
      bio: loggedUser.bio,
      patreonUrl: loggedUser.patreonUrl,
      kofiUrl: loggedUser.kofiUrl,
      websiteUrl: loggedUser.websiteUrl,
      youtubeUrl: loggedUser.youtubeUrl,
      instagramUrl: loggedUser.instagramUrl,
      tiktokUrl: loggedUser.tiktokUrl,
      artstationUrl: loggedUser.artstationUrl,
      xUrl: loggedUser.xUrl,
      createdAt: loggedUser.createdAt
    }, { merge: true }).catch(error => console.warn('El perfil público se sincronizará cuando estén desplegadas sus reglas:', error));

    setUser(loggedUser);
    localStorage.setItem('turodaje_user', JSON.stringify(loggedUser));
    setShowAuthModal(false);

    if (isAdmin) {
      alert('¡Bienvenido de nuevo, Román! Panel de Administrador activado.');
    } else {
      alert(`¡Sesión iniciada con éxito, ${loggedUser.name}!`);
    }
  };

  const handleGoogleLogin = async () => {
    // El bloqueo se activa antes del primer await, incluso con toques rápidos.
    if (googleLoginInProgressRef.current) return;
    googleLoginInProgressRef.current = true;
    try {
      const result = await signInWithPopup(auth, googleProvider);
      await processGoogleUser(result.user);
    } catch (error) {
      console.error('Error al iniciar sesión con Google:', error);
      console.error('Código:', error?.code);
      console.error('Mensaje:', error?.message);

      if (error?.code === 'auth/popup-closed-by-user') {
        return;
      }

      if (error?.code === 'auth/popup-blocked') {
        alert('El navegador bloqueó la ventana de Google. Permite las ventanas emergentes para este sitio e inténtalo de nuevo.');
        return;
      }

      if (error?.code === 'auth/unauthorized-domain') {
        alert('Este dominio no está autorizado en Firebase Authentication. Añade el dominio actual en Firebase > Authentication > Settings > Authorized domains.');
        return;
      }

      alert(`No se pudo iniciar sesión con Google.\n\n${error?.code || error?.message || 'Error desconocido'}`);
    } finally {
      googleLoginInProgressRef.current = false;
    }
  };

  // Abre el editor precargando los datos actuales del perfil.
  const handleOpenEditProfile = () => {
    if (!user) return;
    setProfileForm({
      name: user.name || '',
      bio: user.bio || '',
      banner: user.banner || '',
      bannerPath: user.bannerPath || '',
      photo: user.photo || '',
      photoPath: user.photoPath || '',
      patreonUrl: user.patreonUrl || '',
      kofiUrl: user.kofiUrl || '',
      websiteUrl: user.websiteUrl || '',
      youtubeUrl: user.youtubeUrl || '',
      instagramUrl: user.instagramUrl || '',
      tiktokUrl: user.tiktokUrl || '',
      artstationUrl: user.artstationUrl || '',
      xUrl: user.xUrl || '',
      contactEmail: user.contactEmail || user.email || ''
    });
    setProfileImageFiles({ photo: null, banner: null });
    setShowEditProfileModal(true);
  };

  // Guarda únicamente los campos editables en Firestore y sincroniza la sesión local.
  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    if (!user?.id) {
      alert('No se ha encontrado el identificador de tu cuenta. Cierra sesión y vuelve a entrar.');
      return;
    }

    let updatedData = {
      name: profileForm.name.trim(),
      bio: profileForm.bio.trim(),
      banner: profileForm.banner.trim(),
      bannerPath: profileForm.bannerPath || '',
      photo: profileForm.photo.trim(),
      photoPath: profileForm.photoPath || '',
      patreonUrl: profileForm.patreonUrl.trim(),
      kofiUrl: profileForm.kofiUrl.trim(),
      websiteUrl: profileForm.websiteUrl.trim(),
      youtubeUrl: profileForm.youtubeUrl.trim(),
      instagramUrl: profileForm.instagramUrl.trim(),
      tiktokUrl: profileForm.tiktokUrl.trim(),
      artstationUrl: profileForm.artstationUrl.trim(),
      xUrl: profileForm.xUrl.trim(),
      contactEmail: profileForm.contactEmail.trim()
    };

    if (!updatedData.name) {
      alert('El nombre no puede estar vacío.');
      return;
    }
    const profileLinks = [updatedData.photo, updatedData.banner, updatedData.patreonUrl, updatedData.kofiUrl, updatedData.websiteUrl, updatedData.youtubeUrl, updatedData.instagramUrl, updatedData.tiktokUrl, updatedData.artstationUrl, updatedData.xUrl];
    if (profileLinks.some(link => !isSafeHttpUrl(link))) {
      alert('Los enlaces del perfil deben utilizar http:// o https://.');
      return;
    }
    for (const field of ['photo', 'banner']) {
      const validationError = await validateProfileImage(profileImageFiles[field], field);
      if (validationError) { alert(validationError); return; }
    }

    const uploadedProfilePaths = [];
    try {
      setIsSavingProfile(true);
      for (const field of ['photo', 'banner']) {
        const file = profileImageFiles[field];
        if (!file) continue;
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-90) || `${field}.jpg`;
        const path = `profiles/${user.id}/${field}-${Date.now()}-${safeName}`;
        const uploadedRef = await uploadBytes(storageRef(storage, path), file, { contentType: file.type, customMetadata: { ownerUid: user.id } });
        updatedData = { ...updatedData, [field]: await getDownloadURL(uploadedRef.ref), [`${field}Path`]: path };
        uploadedProfilePaths.push(path);
      }
      const userRef = doc(db, 'users', user.id);
      const publicProfileRef = doc(db, 'publicProfiles', user.id);
      const profileBatch = writeBatch(db);
      profileBatch.set(userRef, { ...updatedData, id: user.id, email: user.email }, { merge: true });
      profileBatch.set(publicProfileRef, {
        name: updatedData.name,
        nameLower: updatedData.name.toLocaleLowerCase('es'),
        photo: updatedData.photo,
        photoPath: updatedData.photoPath,
        banner: updatedData.banner,
        bannerPath: updatedData.bannerPath,
        bio: updatedData.bio,
        patreonUrl: updatedData.patreonUrl,
        kofiUrl: updatedData.kofiUrl,
        websiteUrl: updatedData.websiteUrl,
        youtubeUrl: updatedData.youtubeUrl,
        instagramUrl: updatedData.instagramUrl,
        tiktokUrl: updatedData.tiktokUrl,
        artstationUrl: updatedData.artstationUrl,
        xUrl: updatedData.xUrl
      }, { merge: true });
      await profileBatch.commit();
      const newUserData = { ...user, ...updatedData };
      setUser(newUserData);
      localStorage.setItem('turodaje_user', JSON.stringify(newUserData));
      // No reescribimos los vídeos ni comentarios históricos al renombrar la cuenta.
      // Las vistas leen el perfil público vigente mediante UID.
      setProfileImageFiles({ photo: null, banner: null });
      setShowEditProfileModal(false);
      alert('¡Perfil actualizado con éxito en la nube!');
    } catch (error) {
      await Promise.all(uploadedProfilePaths.map(path => deleteObject(storageRef(storage, path)).catch(() => null)));
      console.error('Error al actualizar el perfil:', error);
      alert('Hubo un error al actualizar el perfil. Comprueba tu conexión y las reglas de Firestore y Storage.');
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleLogout = async () => {
    let logoutError = null;
    try {
      await signOut(auth);
    } catch (error) {
      logoutError = error;
      console.error('Error al cerrar sesión en Firebase:', error);
    } finally {
      setUser(null);
      localStorage.removeItem('turodaje_user');
            setActiveTab('explorar');
    }
    if (logoutError) alert('La sesión local se ha cerrado. Si Google sigue mostrando la cuenta, vuelve a cargar la página.');
    else alert('Has cerrado sesión correctamente.');
  };

  return (
    <div className="min-h-screen bg-[#101113] text-gray-100 font-sans flex flex-col selection:bg-gold-600 selection:text-white">

      {/* ==========================================
          TOPBAR / NAVEGACIÓN RESPONSIVA
      ========================================== */}
      <header className="sticky top-0 z-40 bg-[#17191B]/95 backdrop-blur-md border-b border-[#343537] px-3 sm:px-4 lg:px-8 py-3 flex items-center justify-between gap-2 sm:gap-4 w-full">
        {/* Logo */}
        <button
          type="button"
          onClick={() => { setActiveTab('explorar'); setMobileMenuOpen(false); }}
          className="flex items-center gap-2 cursor-pointer shrink-0 min-w-0"
          aria-label="TuRodaje, ir a explorar"
        >
          <img
            src={TURODAJE_LOGO}
            alt="TuRodaje — Cine independiente"
            className="h-14 sm:h-16 w-auto max-w-[48vw] object-contain"
          />
        </button>

        {/* Buscador central: solo escritorio */}
        <div className="flex-1 max-w-md hidden md:block">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar películas, cineastas o productoras..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={event => { if (event.key === 'Enter' && searchQuery.trim()) trackAnalyticsEvent('toonknight_search', { query_length: searchQuery.trim().length }); }}
              className="w-full bg-[#1B1D20] border border-[#343537] text-sm rounded-full pl-10 pr-4 py-2 text-gray-200 placeholder-gray-500 focus:outline-none focus:border-gold-500 transition-colors"
            />
            {searchQuery && <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-white">Limpiar</button>}
          </div>
        </div>

        {/* Navegación de escritorio */}
        <nav className="hidden md:flex items-center gap-1 lg:gap-2 shrink-0">
          <button onClick={() => setActiveTab('explorar')} className={`px-3 py-2 rounded-lg text-sm font-medium ${activeTab === 'explorar' ? 'bg-[#222326] text-gold-400' : 'text-gray-400 hover:text-white'}`}>Explorar</button>
          <button onClick={() => setActiveTab('productos')} className={`px-3 py-2 rounded-lg text-sm font-medium ${activeTab === 'productos' ? 'bg-[#222326] text-gold-400' : 'text-gray-400 hover:text-white'}`}>Productos</button>
          <button onClick={() => setActiveTab('educacion')} className={`px-3 py-2 rounded-lg text-sm font-medium ${activeTab === 'educacion' ? 'bg-[#222326] text-gold-400' : 'text-gray-400 hover:text-white'}`}>Cursos</button>
          <button onClick={() => setActiveTab('comunidad')} className={`px-3 py-2 rounded-lg text-sm font-medium ${activeTab === 'comunidad' ? 'bg-[#222326] text-gold-400' : 'text-gray-400 hover:text-white'}`}>Comunidad</button>
          <button onClick={() => setActiveTab('noticias')} className={`px-3 py-2 rounded-lg text-sm font-medium ${activeTab === 'noticias' ? 'bg-[#222326] text-gold-400' : 'text-gray-400 hover:text-white'}`}>Actualidad</button>
          <button onClick={() => setActiveTab('recursos')} className={`px-3 py-2 rounded-lg text-sm font-medium ${activeTab === 'recursos' ? 'bg-[#222326] text-gold-400' : 'text-gray-400 hover:text-white'}`}>Recursos</button>
          <button onClick={() => setActiveTab('empleo')} className={`px-3 py-2 rounded-lg text-sm font-medium ${activeTab === 'empleo' ? 'bg-[#222326] text-gold-400' : 'text-gray-400 hover:text-white'}`}>Oportunidades</button>
          {user && <button onClick={() => setActiveTab('mensajes')} className={`px-3 py-2 rounded-lg text-sm font-medium ${activeTab === 'mensajes' ? 'bg-[#222326] text-gold-400' : 'text-gray-400 hover:text-white'}`}>Mensajes</button>}
          {isAdmin && <button onClick={() => setActiveTab('admin')} className={`px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-1 ${activeTab === 'admin' ? 'bg-amber-500/20 text-amber-400' : 'text-amber-400 hover:bg-amber-500/10'}`}><ShieldCheck className="w-4 h-4" /><span>Moderación</span></button>}
        </nav>

        {/* Acciones y menú móvil */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <button onClick={() => { setShowPublishWarning(true); setMobileMenuOpen(false); }} className="bg-gold-600 hover:bg-gold-500 text-white text-xs sm:text-sm font-semibold px-2.5 sm:px-4 py-2 rounded-full flex items-center gap-1.5 whitespace-nowrap">
            <Plus className="w-4 h-4" /><span className="hidden sm:inline">Publicar</span>
          </button>
          {user && <NotificationsBell user={user} onOpenNotification={notification => {
            if (notification.conversationId) {
              setNotificationConversationId(notification.conversationId);
              setActiveTab('mensajes');
            } else if (notification.projectId) {
              const targetProject = projects.find(project => project.id === notification.projectId);
              if (targetProject) openProject(targetProject);
            } else if (notification.newsId || notification.target?.newsId) {
              setActiveTab('noticias');
            } else if (notification.target?.projectId) {
              const targetProject = projects.find(project => project.id === notification.target.projectId);
              if (targetProject) openProject(targetProject);
            }
          }} />}
          {user ? (
            <button onClick={() => { setActiveTab('perfil'); setMobileMenuOpen(false); }} className="w-8 h-8 sm:w-9 sm:h-9 rounded-full overflow-hidden border-2 border-[#343537] hover:border-gold-500 shrink-0" title={user.name} aria-label="Mi perfil">
              <img src={user.photo || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80'} alt={user.name || 'Perfil'} className="w-full h-full object-cover" />
            </button>
          ) : (
            <button onClick={handleGoogleLogin} className="text-xs sm:text-sm font-semibold text-gray-300 hover:text-white px-1.5 sm:px-3 py-2 flex items-center gap-1.5 whitespace-nowrap" aria-label="Iniciar sesión">
              <LogIn className="w-4 h-4" /><span className="hidden lg:inline">Iniciar sesión</span>
            </button>
          )}
          {user && <button type="button" onClick={handleLogout} className="hidden md:inline-flex items-center gap-1.5 text-xs font-semibold text-gray-300 hover:text-white px-2.5 py-2 rounded-lg border border-[#343537] hover:bg-[#222326] whitespace-nowrap"><LogIn className="w-4 h-4 rotate-180" />Cerrar sesión</button>}
          <button type="button" onClick={() => setMobileMenuOpen(open => !open)} className="md:hidden p-2 rounded-lg text-gray-300 hover:text-white hover:bg-[#222326]" aria-label={mobileMenuOpen ? 'Cerrar menú' : 'Abrir menú'} aria-expanded={mobileMenuOpen}>
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </header>

      {/* Menú desplegable móvil */}
      {mobileMenuOpen && (
        <nav className="md:hidden sticky top-[57px] z-30 bg-[#17191B] border-b border-[#343537] px-4 py-3 shadow-xl space-y-1">
          {[['explorar', 'Explorar'], ['productos', 'Productos'], ['educacion', 'Cursos'], ['comunidad', 'Comunidad'], ['noticias', 'Actualidad'], ['recursos', 'Recursos'], ['empleo', 'Oportunidades']].map(([tab, label]) => (
            <button key={tab} onClick={() => { setActiveTab(tab); setMobileMenuOpen(false); }} className={`block w-full text-left px-3 py-3 rounded-lg text-sm font-medium ${activeTab === tab ? 'bg-[#222326] text-gold-400' : 'text-gray-200 hover:bg-[#222326]'}`}>{label}</button>
          ))}
          {isAdmin && <button onClick={() => { setActiveTab('admin'); setMobileMenuOpen(false); }} className="block w-full text-left px-3 py-3 rounded-lg text-sm font-medium text-amber-400 hover:bg-[#222326]">Moderación</button>}
          {user && <button onClick={() => { setActiveTab('mensajes'); setMobileMenuOpen(false); }} className="block w-full text-left px-3 py-3 rounded-lg text-sm font-medium text-gray-200 hover:bg-[#222326]">Mensajes</button>}
          {user && <button onClick={() => { setActiveTab('perfil'); setMobileMenuOpen(false); }} className="block w-full text-left px-3 py-3 rounded-lg text-sm font-medium text-gold-400 hover:bg-[#222326]">Mi perfil</button>}
          {user && <button onClick={() => { setMobileMenuOpen(false); handleLogout(); }} className="block w-full text-left px-3 py-3 rounded-lg text-sm font-medium text-gray-400 hover:bg-[#222326] hover:text-white">Cerrar sesión</button>}
          {!user && <button onClick={() => { setMobileMenuOpen(false); handleGoogleLogin(); }} className="block w-full text-left px-3 py-3 rounded-lg text-sm font-medium text-gray-200 hover:bg-[#222326]">Iniciar sesión con Google</button>}
          <div className="px-3 pt-2 md:hidden">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input type="search" placeholder="Buscar proyectos..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-full bg-[#1B1D20] border border-[#343537] text-sm rounded-xl pl-9 pr-3 py-2.5 text-gray-200 placeholder-gray-500 focus:outline-none focus:border-gold-500" />
            </div>
          </div>
        </nav>
      )}

      {/* ==========================================
          CONTENIDO PRINCIPAL (CAMBIO DE PESTAÑAS)
      ========================================== */}
      <main className="flex-1">
        {activeTab === 'publicProfile' && selectedPublicProfileId && <PublicProfilePage
          profileId={selectedPublicProfileId}
          user={user}
          isAdmin={isAdmin}
          availableProjects={projects}
          onClose={closePublicProfile}
          onEdit={handleOpenEditProfile}
          onOpenProject={openProject}
          onDeleted={deletedUid => {
            setSelectedPublicProfileId('');
            setActiveTab('explorar');
            if (deletedUid === user?.id) handleLogout();
          }}
        />}
        {activeTab === 'mensajes' && user && <MessagingCenter user={user} initialConversationId={notificationConversationId} />}

        {/* ------------------------------------------
            PESTAÑA 1: EXPLORAR (HOME)
        ------------------------------------------ */}
        {activeTab === 'explorar' && (
          <div className="space-y-8 sm:space-y-12 pb-10 sm:pb-16 w-full overflow-x-hidden">

            {/* HERO / CARRUSEL DESTACADO */}
            {carouselItems.length > 0 && (
              <section className="relative w-full bg-black sm:h-[440px] lg:h-[560px] sm:bg-[#1B1D20] overflow-hidden border-b border-[#343537]">
                {/* Imagen de fondo nítida con gradiente solo en la izquierda */}
<div className="relative aspect-video w-full sm:absolute sm:inset-0 sm:aspect-auto sm:h-full">
  <img
    src={carouselItems[heroIndex]?.thumbnail}
    alt={carouselItems[heroIndex]?.title}
    className="w-full h-full object-contain sm:object-cover opacity-100 scale-100"
  />
  {/* Gradiente más suave: deja ver mejor la imagen sin perder legibilidad del texto */}
  {carouselItems[heroIndex]?.darkOverlay !== false && (
    <div className="absolute inset-0 bg-gradient-to-t from-[#101113]/55 via-transparent to-transparent sm:bg-gradient-to-r sm:from-[#101113]/75 sm:via-[#101113]/35 sm:to-transparent" />
  )}
</div>

                {/* Contenido Hero */}
                <div className="relative max-w-7xl mx-auto h-auto sm:h-full px-4 sm:px-6 lg:px-12 pt-5 sm:pt-0 flex flex-col justify-start sm:justify-end pb-7 sm:pb-12">
                  <div className="max-w-2xl space-y-4">
                    <span className="text-xs font-bold tracking-widest text-gold-400 uppercase bg-gold-500/10 px-3 py-1 rounded-full border border-gold-500/20 inline-block">
                      {carouselItems[heroIndex]?.category || 'DESTACADO'}
                    </span>
                    <h1 className="text-2xl sm:text-4xl lg:text-6xl font-black text-white tracking-tight leading-tight sm:leading-none">
                      {carouselItems[heroIndex]?.title}
                    </h1>
                    <p className="text-gray-300 text-sm lg:text-base line-clamp-2 leading-relaxed">
                      {carouselItems[heroIndex]?.tagline}
                    </p>

                    <div className="pt-2 flex items-center gap-4">
                      <a
                        href={carouselItems[heroIndex]?.videoUrl}
                        onClick={() => trackAnalyticsEvent('toonknight_carousel_click', { carousel_item_id: carouselItems[heroIndex]?.id || heroIndex })}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="bg-gold-600 hover:bg-gold-500 text-white font-semibold px-6 py-3 rounded-xl flex items-center gap-2 shadow-lg shadow-gold-600/30 transition-all hover:scale-105"
                      >
                        <Play className="w-5 h-5 fill-current" />
                        {carouselItems[heroIndex]?.linkText || 'Ver proyecto'}
                      </a>
                    </div>
                  </div>

                  {/* Controles del Carrusel */}
                  <div className="absolute right-4 top-4 sm:right-6 sm:top-auto sm:bottom-12 flex items-center gap-4 bg-[#1B1D20]/80 backdrop-blur-md px-4 py-2 rounded-full border border-[#343537]">
                    <span className="text-xs font-mono text-gray-400">
                      0{heroIndex + 1} / 0{carouselItems.length}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setHeroIndex((prev) => (prev === 0 ? carouselItems.length - 1 : prev - 1))}
                        className="p-1.5 hover:bg-[#343537] rounded-full text-gray-300 hover:text-white"
                      >
                        <ChevronLeft className="w-5 h-5" />
                      </button>
                      <button
                        onClick={() => setHeroIndex((prev) => (prev === carouselItems.length - 1 ? 0 : prev + 1))}
                        className="p-1.5 hover:bg-[#343537] rounded-full text-gray-300 hover:text-white"
                      >
                        <ChevronRight className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                </div>
              </section>
            )}

            {/* SECCIÓN DE PROYECTOS DESTACADOS */}
            {visibleFeaturedProjects.length > 0 && (
              <section className="max-w-7xl mx-auto px-6 lg:px-12 space-y-6">
                <div>
                  <span className="text-xs font-semibold tracking-wider text-amber-400 uppercase">SELECCIÓN DE TURODAJE</span>
                  <h2 className="text-2xl font-bold text-white">Destacados</h2>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {visibleFeaturedProjects.map((item, index) => (
                    <button key={item.id} type="button" onClick={() => { trackAnalyticsEvent('toonknight_featured_click', { project_id: item.id }); openProject(item); }} className="min-w-0 text-left bg-[#1B1D20] hover:bg-[#222326] border border-[#343537] p-3.5 rounded-xl flex flex-col gap-3 transition-all hover:border-amber-500/50 group">
                      <span className={`relative block w-full ${item.hasHonorFrame ? 'honor-project-thumbnail' : ''}`}><img src={item.thumbnail} alt={item.title} className="w-full aspect-video rounded-lg object-cover" /></span>
                      <span className={`relative block flex-1 min-w-0 ${item.hasHonorFrame ? 'honor-featured-details' : ''}`}><span className="block text-[10px] font-bold tracking-wider text-amber-400 uppercase">Destacado {index + 1}</span><span className="block text-sm font-semibold text-white truncate group-hover:text-amber-300 transition-colors">{item.title}</span><span className="block text-xs text-gray-400 truncate">{projectDisplayName(item)}</span>{item.hasHonorFrame && <img src="/images/escudo-de-honor.webp" alt="Escudo de Honor" className="honor-badge-image honor-badge-image-small" />}</span>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {/* SECCIÓN "LO MÁS RECIENTE" (LISTA NUMERADA) */}
            <section className="max-w-7xl mx-auto px-6 lg:px-12 space-y-6">
              <div>
                <span className="text-xs font-semibold tracking-wider text-gray-500 uppercase">RECIÉN PUBLICADOS</span>
                <h2 className="text-2xl font-bold text-white">Lo más reciente</h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {recentProjects.slice(0, 4).map((item, idx) => (
                  <div
                    key={item.id}
                    onClick={() => openProject(item)}
                    className="bg-[#1B1D20] hover:bg-[#222326] border border-[#343537] p-3.5 rounded-xl flex items-center gap-4 cursor-pointer transition-all hover:border-gray-600 group"
                  >
                    <span className="text-xl font-bold text-gray-500 group-hover:text-gold-400 font-mono">
                      0{idx + 1}
                    </span>
                    <span className={`relative block shrink-0 ${item.hasHonorFrame ? 'honor-project-thumbnail' : ''}`}><img src={item.thumbnail} alt={item.title} className="h-12 w-16 rounded-lg object-cover" />{item.hasHonorFrame && <img src="/images/escudo-de-honor.webp" alt="Escudo de Honor" className="honor-badge-image honor-badge-image-small" />}</span>
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-semibold text-white truncate group-hover:text-gold-400 transition-colors">
                        {item.title}
                      </h4>
                      <p className="text-xs text-gray-400 truncate">{projectDisplayName(item)} • {item.year}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* BARRA DE FILTROS DESPLEGABLES */}
            <section className="max-w-7xl mx-auto px-6 lg:px-12 space-y-6">
              <div className="bg-[#1B1D20] border border-[#343537] p-4 rounded-2xl flex flex-wrap items-center justify-between gap-4">
                <div className="flex flex-wrap items-center gap-4">

                  {/* Filtro Animación */}
                  <div className="flex flex-col">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Tipo de producción</label>
                    <select
                      value={filterType}
                      onChange={(e) => setFilterType(e.target.value)}
                      className="bg-[#101113] border border-[#343537] text-xs rounded-lg px-3 py-2 text-gray-200 focus:outline-none focus:border-gold-500"
                    >
                      <option value="Todos">Todos</option>
                      <option value="Acción real">Acción real</option>
                      <option value="Documental">Documental</option>
                      <option value="Experimental">Experimental</option>
                      <option value="Híbrido">Híbrido</option>
                    <option value="Animación">Animación</option>
                    </select>
                  </div>

                  {/* Filtro Género */}
                  <div className="flex flex-col">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Género</label>
                    <select
                      value={filterGenre}
                      onChange={(e) => setFilterGenre(e.target.value)}
                      className="bg-[#101113] border border-[#343537] text-xs rounded-lg px-3 py-2 text-gray-200 focus:outline-none focus:border-gold-500"
                    >
                      <option value="Todos">Todos</option>
                      <option value="Acción">Acción</option>
                      <option value="Aventura">Aventura</option>
                      <option value="Ciencia ficción">Ciencia ficción</option>
                      <option value="Fantasía">Fantasía</option>
                      <option value="Drama">Drama</option>
                      <option value="Comedia">Comedia</option>
                      <option value="Terror">Terror</option>
                      <option value="Musical">Musical</option>
                      <option value="Romance">Romance</option>
                      {GENRES_LIST.filter(g => !['Acción','Aventura','Ciencia ficción','Fantasía','Drama','Comedia','Terror','Musical'].includes(g)).map(g => <option key={g} value={g}>{g}</option>)}
                    </select>
                  </div>

                  {/* Filtro Año */}
                  <div className="flex flex-col">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Año</label>
                    <select
                      value={filterYear}
                      onChange={(e) => setFilterYear(e.target.value)}
                      className="bg-[#101113] border border-[#343537] text-xs rounded-lg px-3 py-2 text-gray-200 focus:outline-none focus:border-gold-500"
                    >
                      <option value="Todos">Todos</option>
                      <option value="2026">2026</option>
                      <option value="2025">2025</option>
                      <option value="2024">2024</option>
                    </select>
                  </div>

                  {/* Filtro Formato Proyecto */}
                  <div className="flex flex-col">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Proyecto</label>
                    <select
                      value={filterFormat}
                      onChange={(e) => setFilterFormat(e.target.value)}
                      className="bg-[#101113] border border-[#343537] text-xs rounded-lg px-3 py-2 text-gray-200 focus:outline-none focus:border-gold-500"
                    >
                      <option value="Todos">Todos</option>
                      <option value="Cortometraje">Cortometraje</option>
                      <option value="Largometraje">Largometraje</option>
                      <option value="Serie">Serie</option>
                      <option value="Tráiler">Tráiler</option>
                      <option value="Musical">Musical</option>
                      <option value="Crowdfunding">Crowdfunding / Kickstarter</option>
                      <option value="Tutoriales">Tutoriales</option>
                      <option value="Making of">Making of</option>
                    </select>
                  </div>
                </div>

                {/* Limpiar Filtros */}
                {(filterType !== 'Todos' || filterGenre !== 'Todos' || filterYear !== 'Todos' || filterFormat !== 'Todos') && (
                  <button
                    onClick={() => {
                      setFilterType('Todos');
                      setFilterGenre('Todos');
                      setFilterYear('Todos');
                      setFilterFormat('Todos');
                    }}
                    className="text-xs text-gold-400 hover:text-gold-300 font-medium underline"
                  >
                    Limpiar filtros
                  </button>
                )}
              </div>

              {/* Contado de proyectos */}
              <div className="flex items-center justify-between text-xs text-gray-400">
                <span>{filteredProjects.length} proyectos encontrados</span>
              </div>

              {/* REJILLA DE PROYECTOS (VIDEO GRID) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {filteredProjects.map((project) => (
                  <div
                    key={project.id}
                    className={`bg-[#1B1D20] border border-[#343537] rounded-xl overflow-hidden group hover:border-gray-500 transition-all flex flex-col justify-between ${project.hasHonorFrame ? 'honor-project-card' : ''}`}
                  >
                    {/* Miniatura con Duración */}
                    <div
                      onClick={() => openProject(project)}
                      className={`relative aspect-video bg-black cursor-pointer overflow-hidden ${project.hasHonorFrame ? 'honor-project-thumbnail' : ''}`}
                    >
                      <img
                        src={project.thumbnail}
                        alt={project.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                      <span className={`absolute ${project.hasHonorFrame ? 'top-2 left-2' : 'bottom-2 right-2'} bg-black/80 backdrop-blur-sm text-white text-[10px] font-mono px-2 py-0.5 rounded`}>
                        {project.duration}
                      </span>
                      <span className="absolute bottom-2 left-2 bg-black/80 backdrop-blur-sm text-white text-[10px] px-2 py-0.5 rounded">
                        {(project.viewsCount || 0).toLocaleString('es-ES')} visitas
                      </span>

                      {/* Botón Admin para Borrado Rápido */}
                      {isAdmin && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteProject(project.id);
                          }}
                          className="absolute top-2 right-2 p-1.5 bg-gold-600/80 hover:bg-gold-600 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                          title="Eliminar proyecto inmediatamente"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    {/* Metadatos */}
                    <div className={`p-4 space-y-2 flex-1 flex flex-col justify-between ${project.hasHonorFrame ? 'honor-project-details' : ''}`}>
                      <div>
                        <h3
                          onClick={() => openProject(project)}
                          className="text-base font-bold text-white group-hover:text-gold-400 cursor-pointer truncate transition-colors"
                        >
                          {project.title}
                        </h3>
                        <p className="text-xs text-gray-400 truncate">{projectDisplayName(project)}</p>
                      </div>

                      {project.hasHonorFrame && <img src="/images/escudo-de-honor.webp" alt="Escudo de Honor" className="honor-badge-image honor-badge-image-details" />}

                      {/* Badges de Categoría */}
                      <div className={`flex items-center gap-2 pt-2 flex-wrap ${project.hasHonorFrame ? 'honor-project-categories' : ''}`}>
                        <span className="text-[10px] font-bold bg-[#222326] text-gray-300 px-2 py-0.5 rounded border border-[#343537]">
                          {project.type}
                        </span>
                        <span className="text-[10px] font-bold bg-[#222326] text-gray-300 px-2 py-0.5 rounded border border-[#343537]">
                          {project.format}
                        </span>
                        {(project.campaignUrl || normalizeFilterText(project.format) === 'crowdfunding') && <span className="text-[10px] font-bold bg-amber-950/70 text-amber-300 px-2 py-0.5 rounded border border-amber-800/70">En campaña</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}

        {/* ------------------------------------------
            PESTAÑA 2: PRODUCTOS Y RECURSOS
        ------------------------------------------ */}
        {activeTab === 'productos' && (
          <div className="max-w-7xl mx-auto px-6 lg:px-12 py-10 space-y-8">
            <div>
              <span className="text-xs font-semibold text-gold-400 uppercase tracking-wider">RECURSOS RECOMENDADOS</span>
              <h1 className="text-3xl font-bold text-white">Equipamiento y software para cineastas</h1>
              <p className="text-gray-400 text-sm mt-1">Cámaras, objetivos, iluminación, sonido, edición y herramientas para cineastas.</p>
              {isAdmin && <button onClick={openNewProduct} className="mt-4 bg-gold-600 hover:bg-gold-500 text-white text-sm font-semibold px-4 py-2.5 rounded-xl inline-flex items-center gap-2"><Plus className="w-4 h-4" />Agregar producto</button>}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 rounded-2xl border border-[#343537] bg-[#1B1D20] p-4">
              <label className="text-xs text-gray-400">Categoría<select value={productCategoryFilter} onChange={e => setProductCategoryFilter(e.target.value)} className="mt-1 w-full bg-[#101113] border border-[#343537] rounded-lg p-2 text-white"><option>Todos</option><option>Software</option><option>Hardware</option><option>Accesorio</option><option>Equipo</option></select></label>
              <label className="text-xs text-gray-400">Área audiovisual<select value={productTechniqueFilter} onChange={e => setProductTechniqueFilter(e.target.value)} className="mt-1 w-full bg-[#101113] border border-[#343537] rounded-lg p-2 text-white"><option>Todos</option>{['Cine de ficción','Documental','Videoclip','Publicidad','Animación','Experimental','Producción virtual','Otro'].map(x => <option key={x}>{x}</option>)}</select></label>
              <label className="text-xs text-gray-400">Uso profesional<select value={productUseFilter} onChange={e => setProductUseFilter(e.target.value)} className="mt-1 w-full bg-[#101113] border border-[#343537] rounded-lg p-2 text-white"><option>Todos</option>{['Grabación y cámara','Fotografía cinematográfica','Iluminación','Sonido directo','Diseño sonoro','Montaje y edición','Colorización','Postproducción','Efectos visuales','Producción','Preproducción','Guion y storyboard','Dirección','Streaming','Animación','Almacenamiento y copias','Otro'].map(x => <option key={x}>{x}</option>)}</select></label>
              <label className="text-xs text-gray-400">Tipo de equipo / subtipo<select value={productSubtypeFilter} onChange={e => setProductSubtypeFilter(e.target.value)} className="mt-1 w-full bg-[#101113] border border-[#343537] rounded-lg p-2 text-white"><option>Todos</option>{['Cámara','Objetivo','Trípode','Estabilizador / gimbal','Slider / dolly','Drone','Monitor de cámara','Grabador externo','Micrófono','Grabadora de audio','Auriculares','Kit de iluminación','Panel LED','Foco','Modificador de luz','Reflector','Soporte / grip','Teleprompter','Capturadora','Ordenador','Monitor de edición','Almacenamiento','Accesorio','Otro'].map(x => <option key={x}>{x}</option>)}</select></label>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {products.filter(prod => (productCategoryFilter === 'Todos' || prod.category === productCategoryFilter) && (productTechniqueFilter === 'Todos' || (prod.techniques || []).includes(productTechniqueFilter)) && (productUseFilter === 'Todos' || (prod.uses || []).includes(productUseFilter)) && (productSubtypeFilter === 'Todos' || prod.subtype === productSubtypeFilter)).map((prod) => (
                <article key={prod.id} className="bg-[#1B1D20] border border-[#343537] rounded-2xl overflow-hidden flex flex-col hover:border-gold-500/40 transition-colors">
                  <div className="relative h-32 sm:h-36 bg-[#111115] overflow-hidden">
                    <img
                      src={prod.image || 'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=800&q=80'}
                      alt={prod.title}
                      loading="lazy"
                      className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
                    />
                  </div>
                  <div className="p-3 flex flex-col gap-2 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-bold text-gold-400 bg-gold-500/10 px-2 py-0.5 rounded-full border border-gold-500/20">{prod.category}</span>
                      <span className="text-[11px] font-semibold text-gray-200 text-right">{prod.price}</span>
                    </div>
                    <h3 className="text-sm sm:text-base font-bold text-white leading-snug line-clamp-2" title={prod.title}>{prod.title}</h3>
                    {prod.description && <details className="group/details text-xs">
                      <summary className="cursor-pointer select-none font-semibold text-gold-400 hover:text-gold-300">
                        <span className="group-open/details:hidden">Leer más +</span>
                        <span className="hidden group-open/details:inline">Leer menos −</span>
                      </summary>
                      <div className="mt-2 space-y-2 text-gray-400 leading-relaxed">
                        {prod.isAffiliate && <p className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-2 text-[11px] text-amber-300">Enlace de afiliado · TuRodaje podría recibir una comisión.</p>}
                        <p className="whitespace-pre-line">{prod.description}</p>
                        <div className="flex flex-wrap gap-1">{[...(prod.techniques || []), ...(prod.uses || []), ...(prod.subtype ? [prod.subtype] : [])].map(tag => <span key={tag} className="rounded-full bg-[#292B2E] px-2 py-1 text-[10px] text-gray-300">{tag}</span>)}</div>
                      </div>
                    </details>}
                    {prod.description && <p className="line-clamp-2 text-xs leading-5 text-gray-400">{prod.description}</p>}
                    {prod.isAffiliate && <span className="text-[10px] text-amber-300">Enlace de afiliado</span>}
                    <div className="mt-auto pt-1 space-y-2">
                      <a
                        href={prod.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full bg-[#222326] hover:bg-gold-600 text-gray-200 hover:text-white text-xs font-semibold py-2.5 rounded-xl flex items-center justify-center gap-2 border border-[#343537] transition-all"
                      >
                        <span>Obtener recurso</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                      {isAdmin && (
                        <div className="grid grid-cols-2 gap-2">
                          <button onClick={() => openEditProduct(prod)} className="rounded-lg border border-gold-500/30 bg-gold-500/10 py-1.5 text-xs font-semibold text-gold-300 hover:bg-gold-500/20">Editar</button>
                          <button onClick={() => handleDeleteProduct(prod)} className="rounded-lg border border-gold-500/30 bg-gold-500/10 py-1.5 text-xs font-semibold text-gold-300 hover:bg-gold-500/20">Eliminar</button>
                        </div>
                      )}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        )}

        {/* ------------------------------------------
            PESTAÑA: APRENDER / EDUCACIÓN
        ------------------------------------------ */}
        {activeTab === 'educacion' && (
          <div className="max-w-7xl mx-auto px-6 lg:px-12 py-10 space-y-8">
            <div><span className="text-xs font-semibold text-gold-400 uppercase tracking-wider">FORMACIÓN PARA CREADORES</span><h1 className="text-3xl font-bold text-white">Cursos</h1><p className="text-sm text-gray-400 mt-1">Cursos y tutoriales de cine y producción audiovisual: dirección, guion, fotografía, iluminación, sonido, montaje, VFX y animación.</p>{isAdmin && <button onClick={openNewEducation} className="mt-4 bg-gold-600 hover:bg-gold-500 text-white text-sm font-semibold px-4 py-2.5 rounded-xl inline-flex items-center gap-2"><Plus className="w-4 h-4"/>Agregar curso</button>}</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 rounded-2xl border border-[#343537] bg-[#1B1D20] p-4">
              <label className="text-xs text-gray-400">Área audiovisual<select value={educationTechniqueFilter} onChange={e => setEducationTechniqueFilter(e.target.value)} className="mt-1 w-full bg-[#101113] border border-[#343537] rounded-lg p-2 text-white"><option>Todos</option>{['Cine de ficción','Documental','Videoclip','Publicidad','Animación','Experimental','Producción virtual','Otro'].map(x => <option key={x}>{x}</option>)}</select></label>
              <label className="text-xs text-gray-400">Especialidad<select value={educationTopicFilter} onChange={e => setEducationTopicFilter(e.target.value)} className="mt-1 w-full bg-[#101113] border border-[#343537] rounded-lg p-2 text-white"><option>Todos</option>{['Dirección','Guion','Producción','Dirección de fotografía','Cámara y ópticas','Iluminación','Sonido directo','Diseño sonoro','Montaje y edición','Colorización','Interpretación','Dirección de arte','Vestuario y maquillaje','Casting','Distribución y festivales','Efectos visuales','Animación','Storyboard','Postproducción','Otro'].map(x => <option key={x}>{x}</option>)}</select></label>
              <label className="text-xs text-gray-400">Software utilizado<select value={educationSoftwareFilter} onChange={e => setEducationSoftwareFilter(e.target.value)} className="mt-1 w-full bg-[#101113] border border-[#343537] rounded-lg p-2 text-white"><option>Todos</option>{['DaVinci Resolve','Premiere Pro','Final Cut Pro','After Effects','Avid Media Composer','Pro Tools','Audition','Reaper','Blender','Cinema 4D','Unreal Engine','Nuke','Photoshop','Lightroom','Storyboard Pro','Otro','No requiere software'].map(x => <option key={x}>{x}</option>)}</select></label>
            </div>
            {educationItems.filter(item => (educationTechniqueFilter === 'Todos' || (item.techniques || []).includes(educationTechniqueFilter)) && (educationTopicFilter === 'Todos' || (item.topics || []).includes(educationTopicFilter)) && (educationSoftwareFilter === 'Todos' || (item.software || []).includes(educationSoftwareFilter))).length ? <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">{educationItems.filter(item => (educationTechniqueFilter === 'Todos' || (item.techniques || []).includes(educationTechniqueFilter)) && (educationTopicFilter === 'Todos' || (item.topics || []).includes(educationTopicFilter)) && (educationSoftwareFilter === 'Todos' || (item.software || []).includes(educationSoftwareFilter))).map(item => <article key={item.id} className="bg-[#1B1D20] border border-[#343537] rounded-2xl overflow-hidden flex flex-col">{item.image && <img src={item.image} alt={item.title} className="w-full h-44 object-cover"/>}<div className="p-5 flex-1 space-y-3"><div className="flex justify-between gap-2"><span className="text-[10px] rounded-full bg-gold-500/10 text-gold-300 px-2 py-1">{item.price || 'Consultar precio'}</span><span className="text-xs text-gray-400">{item.provider}</span></div><h3 className="text-lg font-bold text-white">{item.title}</h3><p className="text-sm text-gray-400">{item.description}</p>{[...(item.techniques || []), ...(item.topics || []), ...(item.software || [])].map(tag => <span key={tag} className="inline-block text-[10px] rounded-full bg-[#292B2E] px-2 py-1 mr-1 mb-1 text-gray-300">{tag}</span>)}</div><div className="p-5 pt-0 flex gap-2"><a href={item.url} target="_blank" rel="noopener noreferrer" className="flex-1 text-center bg-gold-600 hover:bg-gold-500 rounded-xl py-2.5 text-sm font-semibold text-white">Ver curso <ExternalLink className="inline w-3 h-3"/></a>{isAdmin && <><button onClick={() => openEditEducation(item)} className="px-3 rounded-lg bg-gold-500/10 text-gold-300 text-xs">Editar</button><button onClick={() => handleDeleteEducation(item)} className="px-3 rounded-lg bg-gold-500/10 text-gold-300 text-xs">Eliminar</button></>}</div></article>)}</div> : <p className="text-sm text-gray-500 rounded-2xl border border-dashed border-[#343537] p-8 text-center">Aún no hay cursos con estos filtros. {isAdmin ? 'Agrega el primero desde el botón superior.' : 'Vuelve más tarde para descubrir nuevos recursos.'}</p>}
          </div>
        )}

        {/* ------------------------------------------
            PESTAÑA 3: COMUNIDAD Y FORO
        ------------------------------------------ */}
        {/* ------------------------------------------
            PESTAÑA: EMPLEO Y COLABORACIONES
        ------------------------------------------ */}
        {activeTab === 'noticias' && <ManagedContentSection type="news" isAdmin={isAdmin} user={user} />}
        {activeTab === 'recursos' && <ManagedContentSection type="resources" isAdmin={isAdmin} user={user} />}
        {activeTab === 'empleo' && (
          <JobsSection user={user} isAdmin={isAdmin} onLogin={handleGoogleLogin} />
        )}

        {activeTab === 'comunidad' && (
          <div className="max-w-7xl mx-auto px-6 lg:px-12 py-10 space-y-8">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <span className="text-xs font-semibold text-gold-400 uppercase tracking-wider">FORO Y DISCUSIÓN</span>
                <h1 className="text-3xl font-bold text-white">Comunidad de Creadores</h1>
                <p className="text-gray-400 text-sm mt-1">Resuelve dudas, encuentra colaboradores y comparte tus procesos.</p>
              </div>

              <button
                onClick={() => setShowNewTopicModal(true)}
                className="bg-gold-600 hover:bg-gold-500 text-white text-sm font-semibold px-5 py-2.5 rounded-xl flex items-center gap-2 shadow-lg shadow-gold-600/30"
              >
                <Plus className="w-4 h-4" />
                Crear nuevo tema
              </button>
            </div>

            {/* Vista Lista de Temas o Vista Detallada */}
            {!selectedForumTopic ? (
              <div className="space-y-4">
                {forumTopics.map((topic) => (
                  <div
                    key={topic.id}
                    onClick={() => setSelectedForumTopic(topic)}
                    className="bg-[#1B1D20] hover:bg-[#222326] border border-[#343537] p-5 rounded-2xl cursor-pointer transition-all hover:border-gray-500 space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-gold-400 bg-gold-500/10 px-3 py-1 rounded-full border border-gold-500/20">
                        {topic.category}
                      </span>
                      <span className="text-xs text-gray-500">{topic.createdAt}</span>
                    </div>

                    <h3 className="text-lg font-bold text-white hover:text-gold-400 transition-colors">
                      {topic.title}
                    </h3>
                    <p className="text-xs text-gray-400 line-clamp-2">{topic.content}</p>

                    <div className="flex items-center justify-between pt-2 border-t border-[#343537] text-xs text-gray-400">
                      <span className="inline-flex items-center gap-1">Por {forumAuthor(topic.authorId, topic.authorName)}</span>
                      <div className="flex items-center gap-4">
                        <span className="flex items-center gap-1"><ThumbsUp className="w-3.5 h-3.5" /> {topic.likes}</span>
                        <span className="flex items-center gap-1"><MessageSquare className="w-3.5 h-3.5" /> {(topic.comments || []).length} comentarios</span>
                      </div>
                    </div>
                    {(isAdmin || (user && (topic.authorId === user.id || topic.authorEmail === user.email))) && <div className="flex justify-end"><button onClick={(event) => { event.stopPropagation(); handleDeleteTopic(topic); }} className="inline-flex items-center gap-1.5 rounded-lg border border-gold-500/30 bg-gold-500/10 px-3 py-1.5 text-xs font-semibold text-gold-300 hover:bg-gold-500/20"><Trash2 className="w-3.5 h-3.5" />Eliminar tema</button></div>}
                  </div>
                ))}
              </div>
            ) : (
              /* Vista Detallada de un Tema */
              <div className="bg-[#1B1D20] border border-[#343537] p-6 lg:p-8 rounded-2xl space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-3"><button
                  onClick={() => setSelectedForumTopic(null)}
                  className="text-xs text-gray-400 hover:text-white flex items-center gap-1"
                >
                  <ChevronLeft className="w-4 h-4" /> Volver al listado de temas
                </button>{(isAdmin || (user && (selectedForumTopic.authorId === user.id || selectedForumTopic.authorEmail === user.email))) && <button onClick={() => handleDeleteTopic(selectedForumTopic)} className="inline-flex items-center gap-1.5 rounded-lg border border-gold-500/30 bg-gold-500/10 px-3 py-2 text-xs font-semibold text-gold-300 hover:bg-gold-500/20"><Trash2 className="w-3.5 h-3.5" />Eliminar tema</button>}</div>

                <div className="space-y-2">
                  <span className="text-xs font-bold text-gold-400 bg-gold-500/10 px-3 py-1 rounded-full border border-gold-500/20">
                    {selectedForumTopic.category}
                  </span>
                  <h2 className="text-2xl font-bold text-white">{selectedForumTopic.title}</h2>
                  <div className="flex items-center gap-2 text-xs text-gray-400">Publicado por {forumAuthor(selectedForumTopic.authorId, selectedForumTopic.authorName)} <span>• {selectedForumTopic.createdAt}</span></div>
                </div>

                <div className="p-4 bg-[#101113] rounded-xl border border-[#343537] text-sm text-gray-200 leading-relaxed whitespace-pre-line">
                  {selectedForumTopic.content}
                </div>

                {/* Sección Comentarios */}
                <div className="space-y-4 pt-4 border-t border-[#343537]">
                  <h4 className="text-base font-bold text-white">Respuestas ({(selectedForumTopic.comments || []).length})</h4>

                  <div className="space-y-3">
                    {(selectedForumTopic.comments || []).map((comment) => (
                      <div key={comment.id} className="bg-[#222326] p-3.5 rounded-xl border border-[#343537] space-y-1">
                        <div className="flex justify-between text-xs text-gray-400">
                          <strong className="text-gray-200">{forumAuthor(comment.authorId, comment.author)}</strong>
                          <span>{comment.createdAt}</span>
                        </div>
                        <p className="text-xs text-gray-300">{comment.text}</p>
                      </div>
                    ))}
                  </div>

                  {/* Escribir Comentario */}
                  <div className="flex gap-2 pt-2">
                    <input
                      type="text"
                      placeholder="Escribe tu respuesta..."
                      value={newCommentText}
                      onChange={(e) => setNewCommentText(e.target.value)}
                      className="flex-1 bg-[#101113] border border-[#343537] rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-gold-500"
                    />
                    <button
                      onClick={() => handleAddComment(selectedForumTopic.id)}
                      className="bg-gold-600 hover:bg-gold-500 text-white text-xs font-semibold px-5 rounded-xl"
                    >
                      Responder
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ------------------------------------------
            PESTAÑA 4: PERFIL DE USUARIO
        ------------------------------------------ */}
        {activeTab === 'perfil' && user && (
          <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-8">
            {/* Banner del Perfil */}
            <div className="relative h-48 rounded-xl overflow-hidden shadow-lg bg-gray-800">
              <img
                src={user?.banner || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=1200&q=80'}
                alt="Banner"
                className="w-full h-full object-cover"
              />
            </div>

            {/* Información principal del usuario */}
            <div className="relative px-6 pb-6 bg-gray-900 rounded-b-xl border border-gray-800 shadow-xl -mt-8">
              <div className="flex flex-col sm:flex-row items-center sm:items-end justify-between -mt-16 mb-4 gap-4">
                <div className="flex flex-col sm:flex-row items-center gap-4 text-center sm:text-left">
                  <img
                    src={user?.photo || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80'}
                    alt={user?.name || 'Usuario'}
                    className="w-28 h-28 rounded-full border-4 border-gray-900 object-cover shadow-2xl"
                  />
                  <div className="mt-2 sm:mt-0">
                    <h1 className="text-2xl font-bold text-white flex items-center justify-center sm:justify-start gap-2">
                      {user?.name}
                      {ADMIN_EMAILS.includes(user?.email?.toLowerCase()) && (
                        <span className="bg-amber-500 text-black text-xs px-2 py-0.5 rounded-full font-bold uppercase tracking-wide">
                          Administrador
                        </span>
                      )}
                    </h1>
                    <p className="text-gray-400 text-sm">{user?.email}</p>
                  </div>
                </div>
              </div>

              <div className="flex justify-center sm:justify-end mb-4">
                <div className="flex flex-wrap justify-center gap-2">
                  <button type="button" onClick={() => openPublicProfile(user.id)} className="rounded-xl border border-[#3A3B3E] px-4 py-2 text-sm font-semibold text-gray-200 hover:bg-[#222326]">Ver perfil público</button>
                  <button
                    onClick={handleOpenEditProfile}
                    className="bg-gold-600 hover:bg-gold-500 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors"
                  >
                    Editar perfil
                  </button>
                </div>
              </div>

              {user?.bio && (
                <p className="text-sm text-gray-300 whitespace-pre-line mb-4">{user.bio}</p>
              )}
              {user?.patreonUrl && (
                <a href={user.patreonUrl} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-sm text-pink-400 hover:text-pink-300 mb-4">
                  <ExternalLink className="w-4 h-4" /> Mi Patreon
                </a>
              )}

              {/* Estadísticas */}
              <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-800 text-center">
                <div className="bg-gray-800/50 p-3 rounded-lg">
                  <span className="block text-2xl font-bold text-purple-400">
                    {user?.favorites?.length || 0}
                  </span>
                  <span className="text-xs text-gray-400 uppercase tracking-wider">Favoritos</span>
                </div>
                <div className="bg-gray-800/50 p-3 rounded-lg">
                  <span className="block text-2xl font-bold text-gold-400">
                    {projects.filter(p => p.creatorId === user?.id || (p.authorEmail || p.creatorEmail)?.toLowerCase() === user?.email?.toLowerCase()).length}
                  </span>
                  <span className="text-xs text-gray-400 uppercase tracking-wider">Proyectos Subidos</span>
                </div>
              </div>
            </div>

            {/* Mis Favoritos */}
            <div className="mb-10">
              <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                <span>❤️</span> Mis Proyectos Favoritos
              </h2>

              {user?.favorites && user.favorites.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {projects
                    .filter(proj => user.favorites.includes(proj.id))
                    .map(proj => (
                      <div
                        key={proj.id}
                        onClick={() => openProject(proj)}
                        className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex gap-4 items-center cursor-pointer hover:border-purple-500/50 transition-colors"
                      >
                        <span className={`relative block shrink-0 ${proj.hasHonorFrame ? 'honor-project-thumbnail' : ''}`}><img src={proj.thumbnail || proj.image} alt={proj.title} className="h-16 w-24 rounded-lg object-cover" />{proj.hasHonorFrame && <img src="/images/escudo-de-honor.webp" alt="Escudo de Honor" className="honor-badge-image honor-badge-image-small" />}</span>
                        <div className="min-w-0">
                          <h3 className="font-semibold text-white text-sm truncate">{proj.title}</h3>
                          <p className="text-gray-400 text-xs">{proj.genre}</p>
                        </div>
                      </div>
                    ))}
                </div>
              ) : (
                <p className="text-gray-500 text-sm">Aún no tienes proyectos guardados en favoritos.</p>
              )}
            </div>

            {/* Mis Proyectos Subidos */}
            <div className="pt-6 border-t border-gray-800">
              <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                <span>🎬</span> Mis Proyectos Subidos
              </h2>

              {projects.filter(p => p.creatorId === user?.id || (p.authorEmail || p.creatorEmail)?.toLowerCase() === user?.email?.toLowerCase()).length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {projects
                    .filter(p => p.creatorId === user?.id || (p.authorEmail || p.creatorEmail)?.toLowerCase() === user?.email?.toLowerCase())
                    .map(proj => (
                      <div
                        key={proj.id}
                        onClick={() => openProject(proj)}
                        className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex gap-4 items-center cursor-pointer hover:border-gold-500/50 transition-colors"
                      >
                        <span className={`relative block shrink-0 ${proj.hasHonorFrame ? 'honor-project-thumbnail' : ''}`}><img src={proj.thumbnail || proj.image} alt={proj.title} className="h-16 w-24 rounded-lg object-cover" />{proj.hasHonorFrame && <img src="/images/escudo-de-honor.webp" alt="Escudo de Honor" className="honor-badge-image honor-badge-image-small" />}</span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <h3 className="font-semibold text-white text-sm truncate">{proj.title}</h3>
                            {proj.status === 'approved' && (
                              <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full shrink-0">Aprobado</span>
                            )}
                            {proj.status === 'pending' && (
                              <span className="text-[10px] text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full shrink-0">Pendiente</span>
                            )}
                            {proj.status === 'rejected' && (
                              <span className="text-[10px] text-gold-400 bg-gold-500/10 px-2 py-0.5 rounded-full shrink-0">Rechazado</span>
                            )}
                          </div>
                          <p className="text-gray-400 text-xs">{proj.genre} • {proj.format}</p>
                          {proj.status === 'rejected' && (proj.moderatorMessage || proj.rejectionReason) && <p className="mt-2 rounded-lg border border-gold-500/20 bg-gold-500/5 p-2 text-xs text-gold-200"><strong>Mensaje del moderador:</strong> {proj.moderatorMessage || proj.rejectionReason}</p>}
                          {proj.status === 'approved' && proj.moderatorMessage && <p className="mt-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-2 text-xs text-emerald-200"><strong>Mensaje del moderador:</strong> {proj.moderatorMessage}</p>}
                          <div className="flex flex-wrap gap-2 mt-3" onClick={e => e.stopPropagation()}>
                            <button
                              type="button"
                              onClick={() => handleOpenEditProject(proj)}
                              className="px-3 py-1.5 rounded-lg bg-gold-600/20 border border-gold-500/30 text-gold-300 text-xs font-semibold hover:bg-gold-600/30 transition-colors"
                            >
                              ✏️ Editar
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteOwnProject(proj)}
                              className="px-3 py-1.5 rounded-lg bg-gold-600/20 border border-gold-500/30 text-gold-300 text-xs font-semibold hover:bg-gold-600/30 transition-colors"
                            >
                              🗑️ Eliminar
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              ) : (
                <p className="text-gray-500 text-sm">Todavía no has subido ningún proyecto.</p>
              )}
            </div>
          </div>
        )}

        {/* ------------------------------------------
            PESTAÑA 5: PANEL DE MODERACIÓN ADMIN
        ------------------------------------------ */}
        {activeTab === 'admin' && isAdmin && (
          <div className="max-w-7xl mx-auto px-6 lg:px-12 py-10 space-y-8">
            <div className="bg-amber-500/10 border border-amber-500/20 p-4 rounded-2xl flex items-center gap-3">
              <ShieldCheck className="w-6 h-6 text-amber-400" />
              <div>
                <h2 className="text-base font-bold text-amber-400">Panel de Control Administrador</h2>
                <p className="text-xs text-amber-300/80">Revisa los contenidos en cola de aprobación antes de que sean visibles en la plataforma.</p>
              </div>
            </div>

            {/* Gestión del carrusel principal: máximo 8 elementos */}
            <section className="space-y-4">
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><h3 className="text-xl font-bold text-white">Gestionar carrusel principal</h3><p className="mt-1 text-xs text-gray-400">Hasta 8 imágenes. Puedes editar la imagen, el texto y el destino del botón.</p></div><span className="text-xs text-gray-400">{carouselItems.length}/8 imágenes</span></div>
              {!carouselStored ? <div className="rounded-xl border border-dashed border-[#3A3B3E] p-4"><p className="text-sm text-gray-300">El carrusel actual está cargado desde los archivos del proyecto.</p><button type="button" onClick={handleImportCurrentCarousel} className="mt-3 rounded-lg bg-gold-600 px-3 py-2 text-xs font-bold text-white hover:bg-gold-500">Importar carrusel actual para administrarlo</button></div> : <>
                <div className="space-y-2">{carouselItems.map(item => <div key={item.id} className="flex items-center gap-3 rounded-xl border border-[#343537] bg-[#1B1D20] p-3"><img src={item.thumbnail} alt="" className="h-12 w-20 shrink-0 rounded-lg object-cover" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-white">{item.title || 'Imagen sin título'}</p><p className="truncate text-xs text-gray-500">{item.linkText || 'Ver proyecto'} · {item.videoUrl}</p></div><button type="button" onClick={() => openEditCarouselItem(item)} className="rounded-lg border border-[#3A3B3E] px-2.5 py-2 text-xs text-gray-300">Editar</button><button type="button" onClick={() => deleteCarouselItem(item)} className="rounded-lg border border-gold-500/30 px-2.5 py-2 text-xs text-gold-300">Eliminar</button></div>)}</div>
                <button type="button" disabled={carouselItems.length >= 8} onClick={openNewCarouselItem} className="rounded-lg bg-gold-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-gold-500 disabled:cursor-not-allowed disabled:opacity-40">+ Añadir imagen {carouselItems.length >= 8 ? '(límite alcanzado)' : ''}</button>
              </>}
            </section>

            {/* Gestión de proyectos destacados */}
            <section className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
                <div><h3 className="text-xl font-bold text-white">Gestionar destacados</h3><p className="text-xs text-gray-400 mt-1">Selecciona tantos proyectos aprobados como quieras. La portada mostrará cuatro y los rotará cada cuatro segundos.</p></div>
                <span className="text-xs text-amber-300">{featuredProjects.length} seleccionados</span>
              </div>
              <input type="search" value={featuredSearchQuery} onChange={event => setFeaturedSearchQuery(event.target.value)} placeholder="Buscar proyectos por título o creador..." className="w-full bg-[#101113] border border-[#343537] rounded-xl px-3 py-2.5 text-sm text-white" />
              <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                {projects.filter(project => project.status === 'approved' && (!featuredSearchQuery.trim() || `${project.title || ''} ${projectDisplayName(project)}`.toLowerCase().includes(featuredSearchQuery.trim().toLowerCase()))).map(project => (
                  <div key={`featured-admin-${project.id}`} className="flex items-center gap-3 bg-[#1B1D20] border border-[#343537] rounded-xl p-3">
                    <img src={project.thumbnail} alt="" className="w-16 h-11 object-cover rounded-lg shrink-0" />
                    <div className="flex-1 min-w-0"><p className="text-sm text-white font-semibold truncate">{project.title}</p><p className="text-xs text-gray-400 truncate">{projectDisplayName(project)}</p></div>
                    <button type="button" onClick={(event) => { event.preventDefault(); event.stopPropagation(); handleToggleFeatured(project.id); }} className={`shrink-0 px-3 py-2 rounded-lg text-xs font-bold border ${project.isFeatured ? 'bg-amber-500/15 border-amber-500/40 text-amber-300' : 'bg-[#222326] border-[#3a3a42] text-gray-300 hover:border-amber-500/40'}`}>{project.isFeatured ? 'Quitar' : 'Destacar'}</button>
                  </div>
                ))}
              </div>
            </section>

            {/* Escudo de Honor: independiente de Destacados, sin límite de proyectos por creador. */}
            <section className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
                <div><h3 className="text-xl font-bold text-white">Escudo de Honor</h3><p className="mt-1 text-xs text-gray-400">Promoción Patreon: puedes activar varios proyectos por creador. Cada escudo se gestiona individualmente.</p></div>
                <span className="text-xs text-orange-300">{honorProjects.length} activos</span>
              </div>
              <div className="rounded-xl border border-orange-500/25 bg-orange-500/5 p-3 space-y-2">
                <h4 className="text-sm font-semibold text-orange-200">Proyectos con marco activo</h4>
                {honorProjects.length === 0 ? <p className="text-xs text-gray-400">No hay proyectos con Escudo de Honor activo.</p> : honorProjects.map(project => (
                  <div key={`honor-active-${project.id}`} className="flex items-center gap-3 rounded-lg bg-[#1B1D20] p-2">
                    <img src={project.thumbnail} alt="" className="h-10 w-16 rounded object-cover" />
                    <div className="min-w-0 flex-1"><p className="truncate text-sm text-white">{project.title}</p><p className="truncate text-xs text-gray-400">{projectDisplayName(project)}</p></div>
                    <button type="button" disabled={Boolean(honorSavingId)} onClick={event => { event.preventDefault(); event.stopPropagation(); handleToggleHonor(project); }} className="rounded-lg border border-orange-500/40 px-3 py-2 text-xs text-orange-200 disabled:opacity-50">Desactivar</button>
                  </div>
                ))}
              </div>
              <input type="search" value={honorSearchQuery} onChange={event => setHonorSearchQuery(event.target.value)} placeholder="Buscar proyecto o creador para activar Escudo de Honor..." className="w-full rounded-xl border border-[#343537] bg-[#101113] px-3 py-2.5 text-sm text-white" />
              <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
                {projects.filter(project => project.status === 'approved' && (!honorSearchQuery.trim() || `${project.title || ''} ${projectDisplayName(project)}`.toLowerCase().includes(honorSearchQuery.trim().toLowerCase()))).map(project => (
                  <div key={`honor-search-${project.id}`} className="flex items-center gap-3 rounded-xl border border-[#343537] bg-[#1B1D20] p-3">
                    <img src={project.thumbnail} alt="" className="h-11 w-16 shrink-0 rounded-lg object-cover" />
                    <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-white">{project.title}</p><p className="truncate text-xs text-gray-400">{projectDisplayName(project)}</p></div>
                    <button type="button" disabled={Boolean(honorSavingId) || (!project.hasHonorFrame && !project.creatorId)} title={!project.creatorId ? 'El proyecto no tiene una cuenta de creador vinculada' : ''} onClick={event => { event.preventDefault(); event.stopPropagation(); handleToggleHonor(project); }} className={`shrink-0 rounded-lg border px-3 py-2 text-xs font-bold disabled:opacity-40 ${project.hasHonorFrame ? 'border-orange-500/40 bg-orange-500/15 text-orange-300' : 'border-[#3a3a42] bg-[#222326] text-gray-300 hover:border-orange-500/40'}`}>{honorSavingId === project.id ? 'Guardando...' : project.hasHonorFrame ? 'Quitar' : 'Activar'}</button>
                  </div>
                ))}
              </div>
            </section>

            <ReportsAdmin />
            <PatreonManager isAdmin={isAdmin} onOpenProfile={openPublicProfile} />
            <BroadcastManager isAdmin={isAdmin} />
            <ModerationAudit />

            {/* Proyectos Pendientes */}
            <div className="space-y-4">
              <h3 className="text-xl font-bold text-white">Proyectos Pendientes ({projects.filter(p => p.status === 'pending').length})</h3>

              <div className="space-y-4">
                {projects.filter(p => p.status === 'pending').map((proj) => (
                  <div key={proj.id} className="bg-[#1B1D20] border border-[#343537] p-5 rounded-2xl flex flex-col md:flex-row gap-6 justify-between">
                    <div className="flex gap-4">
                      <img src={proj.thumbnail} alt={proj.title} className="w-32 h-20 object-cover rounded-xl" />
                      <div className="space-y-1">
                        <h4 className="text-base font-bold text-white">{proj.title}</h4>
                        <p className="text-xs text-gray-400">Por {proj.creator} ({proj.creatorEmail})</p>
                        <p className="text-xs text-gray-300 line-clamp-2">{proj.description}</p>
                        <div className="flex gap-2 pt-1">
                          <span className="text-[10px] bg-[#222326] text-gray-300 px-2 py-0.5 rounded">{proj.type}</span>
                          <span className="text-[10px] bg-[#222326] text-gray-300 px-2 py-0.5 rounded">{proj.format}</span>
                        </div>
                      </div>
                    </div>

                    {/* Acciones de Moderación */}
                    <div className="flex flex-col justify-between gap-3 min-w-[240px]">
                      <button
                        onClick={() => handleApproveProject(proj.id)}
                        className="w-full bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold py-2 rounded-xl flex items-center justify-center gap-1.5"
                      >
                        <CheckCircle className="w-4 h-4" /> Aprobar y publicar
                      </button>

                      <div className="space-y-1.5">
                        <input
                          type="text"
                          placeholder="Mensaje para el usuario (se guardará al aprobar o rechazar)..."
                          value={rejectionNote[proj.id] || ''}
                          onChange={(e) => setRejectionNote({ ...rejectionNote, [proj.id]: e.target.value })}
                          className="w-full bg-[#101113] border border-[#343537] text-xs rounded-lg px-2.5 py-1.5 text-gray-200 focus:outline-none"
                        />
                        <button
                          onClick={() => handleRejectProject(proj.id)}
                          className="w-full bg-gold-600/20 hover:bg-gold-600/40 text-gold-400 border border-gold-500/30 text-xs font-bold py-1.5 rounded-xl flex items-center justify-center gap-1.5"
                        >
                          <XCircle className="w-4 h-4" /> Rechazar
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

      </main>

      {/* ==========================================
          MODAL DE REPRODUCCIÓN / DETALLE DE PROYECTO
      ========================================== */}
      {selectedProject && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 lg:p-8 overflow-y-auto">
          <div className="bg-[#17191B] border border-[#343537] w-full max-w-5xl max-h-[92vh] rounded-3xl overflow-y-auto shadow-2xl my-auto">
            {/* 1. Reproductor principal */}
            <div className="relative aspect-video bg-black">
              <ToonKnightPlayer videoId={selectedProject.youtubeId} title={selectedProject.title} onEnded={() => { if (autoPlayNext) playNextToonKnightVideo(); }} />
              <button
                onClick={closeProject}
                aria-label="Cerrar detalle del proyecto"
                className="absolute top-4 right-4 bg-black/80 hover:bg-black text-white p-2 rounded-full backdrop-blur-sm transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-5 py-5 sm:px-7 lg:px-8 space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#222326] border border-[#33333b] p-3">
                <label className="flex items-center gap-2 text-sm font-semibold text-white cursor-pointer">
                  <input type="checkbox" checked={autoPlayNext} onChange={e => setAutoPlayNext(e.target.checked)} className="accent-gold-500 w-4 h-4" />
                  Reproducción continua
                </label>
                {nextToonKnightVideo ? (
                  <button type="button" onClick={playNextToonKnightVideo} className="text-xs font-bold text-gold-300 hover:text-white text-right">
                    Siguiente: {nextToonKnightVideo.episode?.title || nextToonKnightVideo.project.title} ▶
                  </button>
                ) : <span className="text-xs text-gray-400">No hay más vídeos disponibles</span>}
              </div>
              {/* 2. Título, interacción y géneros */}
              <section className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <h2 className="text-2xl sm:text-3xl font-black text-white">{selectedProject.title}</h2>
                  <p className="text-sm text-gray-400 mt-2">
                    {selectedProject.year || '2026'} <span className="mx-1">•</span> {selectedProject.format || selectedProject.type || 'Proyecto'} <span className="mx-1">•</span> {selectedProject.viewsCount || 0} visitas
                  </p>
                  <div className="flex flex-wrap gap-2 mt-3">
                    {(selectedProject.genres || [selectedProject.genre].filter(Boolean)).map(genre => (
                      <span key={genre} className="px-3 py-1 rounded-full bg-gold-950/60 border border-gold-800/50 text-gold-300 text-xs font-semibold">{genre}</span>
                    ))}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    onClick={() => handleLikeProject(selectedProject.id)}
                    disabled={likedProjectIds.has(selectedProject.id)}
                    aria-pressed={likedProjectIds.has(selectedProject.id)}
                    className={`text-xs font-bold px-3 py-2.5 rounded-xl border flex items-center gap-1.5 ${likedProjectIds.has(selectedProject.id) ? 'bg-gold-950/40 border-gold-900/60 text-gold-200 cursor-not-allowed' : 'bg-[#222326] hover:bg-[#343537] text-gray-200 border-[#343537]'}`}
                  >
                    <Heart className="w-4 h-4 text-gold-500 fill-current" /> {likedProjectIds.has(selectedProject.id) ? 'Te gusta' : 'Me gusta'} · {selectedProject.likesCount || 0}
                  </button>
                  {(user?.id && (selectedProject.creatorId === user.id || selectedProject.creatorEmail === user.email || isAdmin)) && <>
                    <button onClick={() => handleOpenEditProject(selectedProject)} className="bg-[#222326] hover:bg-gold-700 text-gray-200 text-xs font-bold px-3 py-2.5 rounded-xl border border-[#343537]">Editar</button>
                    <button onClick={() => handleDeleteOwnProject(selectedProject)} className="bg-gold-900/70 hover:bg-gold-700 text-white text-xs font-bold px-3 py-2.5 rounded-xl border border-gold-800">Eliminar</button>
                  </>}
                  <button onClick={() => handleShareProject(selectedProject)} title="Compartir proyecto" className="bg-[#222326] hover:bg-[#343537] text-gray-200 text-xs font-bold px-3 py-2.5 rounded-xl border border-[#343537] flex items-center gap-1.5">
                    <Share2 className="w-4 h-4" /> Compartir
                  </button>
                  <button onClick={() => { setReportReason('Derechos de autor'); setReportDetails(''); setShowReportModal(true); }} title="Denunciar este proyecto" className="bg-gold-950/50 hover:bg-gold-900/70 text-gold-200 text-xs font-bold px-3 py-2.5 rounded-xl border border-gold-900/70 flex items-center gap-1.5"><Flag className="w-4 h-4" /> Denunciar</button>
                  <button
                    onClick={() => handleToggleFavorite(selectedProject.id)}
                    title="Guardar en favoritos"
                    aria-label="Guardar en favoritos"
                    className={`p-2.5 rounded-xl border border-[#343537] transition-colors ${user?.favorites?.includes(selectedProject.id) ? 'bg-gold-600 text-white' : 'bg-[#222326] text-gray-300'}`}
                  >
                    <Bookmark className="w-4 h-4" />
                  </button>
                </div>
              </section>

              <p className="text-sm text-gray-300 leading-relaxed bg-[#101113] p-4 rounded-xl border border-[#343537]">
                {selectedProject.description}
              </p>

              {selectedProject.campaignUrl && <section className="rounded-xl border border-amber-700/50 bg-amber-950/25 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"><div><p className="text-sm font-bold text-amber-300">Este proyecto está en una campaña de crowdfunding</p><p className="text-xs text-gray-300 mt-1">La campaña se gestiona en una plataforma externa a TuRodaje.</p></div><a href={selectedProject.campaignUrl} target="_blank" rel="noopener noreferrer" className="shrink-0 inline-flex items-center justify-center gap-2 rounded-lg bg-amber-600 hover:bg-amber-500 px-4 py-2.5 text-xs font-bold text-white">Ver campaña <ExternalLink className="w-3.5 h-3.5" /></a></section>}

              {/* 3. Tarjeta del creador: destacada antes de temporadas */}
              <section className="bg-[#1c1c22] border border-[#34343d] p-4 sm:p-5 rounded-2xl flex flex-col sm:flex-row items-center sm:items-start gap-4">
                {(selectedProject.creatorId || selectedProject.creatorProfileId) ? <button type="button" onClick={() => openPublicProfile((selectedProject.creatorId || selectedProject.creatorProfileId))} aria-label={`Ver perfil de ${projectDisplayName(selectedProject)}`} className="shrink-0">{projectDisplayPhoto(selectedProject) ? <img
                  src={projectDisplayPhoto(selectedProject)}
                  alt={`Avatar de ${projectDisplayName(selectedProject)}`}
                  className="h-16 w-16 rounded-full border-2 border-gold-500/70 bg-[#292B2E] object-cover transition hover:border-gold-300 sm:h-20 sm:w-20"
                /> : <span className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-gold-500/70 bg-[#292B2E] text-gray-300 sm:h-20 sm:w-20"><User className="h-8 w-8" /></span>}</button> : <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border border-[#45454d] bg-[#24242a] text-gray-400 sm:h-20 sm:w-20"><Building2 className="h-8 w-8" /></div>}
                <div className="min-w-0 flex-1 text-center sm:text-left">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-gold-300 font-bold mb-1">{(selectedProject.creatorId || selectedProject.creatorProfileId) ? 'Conoce al creador' : 'Autor / estudio'}</p>
                  <h3 className="text-lg font-bold text-white">{(selectedProject.creatorId || selectedProject.creatorProfileId) ? <button type="button" onClick={() => openPublicProfile((selectedProject.creatorId || selectedProject.creatorProfileId))} className="hover:text-gold-300">{projectDisplayName(selectedProject)}</button> : (selectedProject.creatorName || selectedProject.creator || 'Creador de TuRodaje')}</h3>
                  <p className="text-sm text-gray-400 mt-1 whitespace-pre-wrap">{selectedProject.creatorBio || ((selectedProject.creatorId || selectedProject.creatorProfileId) ? 'Creador de contenido en TuRodaje.' : 'Proyecto atribuido a un creador, estudio o equipo. La cuenta que lo publica puede ser diferente.')}</p>
                  <div className="flex flex-wrap gap-2 mt-3 justify-center sm:justify-start">
                    {(selectedProject.creatorPatreon || selectedProject.patreonUrl) && (
                      <a href={selectedProject.creatorPatreon || selectedProject.patreonUrl} target="_blank" rel="noopener noreferrer" className="bg-[#D6AD60] hover:bg-[#C59A50] text-white text-xs font-bold px-3 py-2 rounded-lg transition-colors">
                        Apoyar en Patreon ↗
                      </a>
                    )}
                    {selectedProject.creatorKofi && (
                      <a href={selectedProject.creatorKofi} target="_blank" rel="noopener noreferrer" className="bg-teal-700 hover:bg-teal-600 text-white text-xs font-bold px-3 py-2 rounded-lg transition-colors">Ko-fi ↗</a>
                    )}
                    {selectedProject.creatorWeb && (
                      <a href={selectedProject.creatorWeb} target="_blank" rel="noopener noreferrer" className="bg-[#2a2a32] hover:bg-[#363640] text-white text-xs font-bold px-3 py-2 rounded-lg transition-colors">Sitio web ↗</a>
                    )}
                  </div>
                </div>
              </section>

              {/* 4. Temporadas y episodios */}
              {selectedProject.format === 'Serie' && selectedProject.seasons?.length > 0 && (
                <section className="space-y-4 pt-1">
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider">Temporadas y episodios</h3>
                  <div className="flex flex-wrap gap-2 border-b border-[#343537] pb-3">
                    {selectedProject.seasons.map((season, idx) => (
                      <button key={season.seasonNumber || idx} type="button" onClick={() => setActiveSeasonIndex(idx)} className={`px-4 py-2 rounded-xl text-xs font-bold border transition-colors ${activeSeasonIndex === idx ? 'bg-gold-600 border-gold-500 text-white' : 'bg-[#222326] border-[#343537] text-gray-300 hover:bg-[#343537]'}`}>
                        Temporada {season.seasonNumber || idx + 1}
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {(selectedProject.seasons[Math.min(activeSeasonIndex, selectedProject.seasons.length - 1)]?.episodes || []).map((ep, idx) => (
                      <div key={ep.id || `${selectedProject.id}-s${activeSeasonIndex}-e${idx}`} className={`p-3 rounded-xl flex items-center gap-3 transition-colors border ${selectedProject.youtubeId === ep.youtubeId ? 'bg-gold-950/40 border-gold-600' : 'bg-[#222326] hover:bg-[#343537] border-[#343537]'}`}>
                        <button type="button" onClick={() => { setActiveSeasonIndex(activeSeasonIndex); setSelectedProject(current => current ? { ...current, youtubeId: ep.youtubeId } : current); }} className="flex-1 min-w-0 text-left flex items-center gap-3">
                          <img src={ep.thumbnail || (ep.youtubeId ? `https://img.youtube.com/vi/${ep.youtubeId}/mqdefault.jpg` : selectedProject.thumbnail)} alt="" className="w-24 aspect-video object-cover rounded-lg bg-black" />
                          <span className="min-w-0"><span className="block text-[10px] text-gold-400 font-bold uppercase">Episodio {ep.episodeNumber || idx + 1}</span><span className="block text-xs font-bold text-gray-200 mt-1">{ep.title || `Episodio ${idx + 1}`}</span><span className="block text-[10px] text-gray-400 mt-1">Reproducir episodio</span></span>
                        </button>
                        {isAdmin && <button type="button" onClick={() => handleDeleteEpisode(selectedProject.id, Math.min(activeSeasonIndex, selectedProject.seasons.length - 1), idx)} title="Eliminar episodio" aria-label={`Eliminar episodio ${ep.title || idx + 1}`} className="shrink-0 p-2 bg-gold-600/20 hover:bg-gold-600 text-gold-300 hover:text-white rounded-lg transition-colors"><Trash2 className="w-4 h-4" /></button>}
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* 5. Otros proyectos: al final de la vista */}
              {projects.filter(project => project.id !== selectedProject.id && (
                (selectedProject.creatorId && project.creatorId === selectedProject.creatorId) ||
                ((project.creatorEmail || '').toLowerCase() && (project.creatorEmail || '').toLowerCase() === (selectedProject.creatorEmail || '').toLowerCase()) ||
                (!selectedProject.creatorId && !selectedProject.creatorEmail && (project.creatorName || project.creator) === (selectedProject.creatorName || selectedProject.creator))
              )).length > 0 && (
                <section className="border-t border-[#343537] pt-5 space-y-3">
                  <h3 className="text-sm font-bold text-white">Más proyectos de este creador</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {projects.filter(project => project.id !== selectedProject.id && (
                      (selectedProject.creatorId && project.creatorId === selectedProject.creatorId) ||
                      ((project.creatorEmail || '').toLowerCase() && (project.creatorEmail || '').toLowerCase() === (selectedProject.creatorEmail || '').toLowerCase()) ||
                      (!selectedProject.creatorId && !selectedProject.creatorEmail && (project.creatorName || project.creator) === (selectedProject.creatorName || selectedProject.creator))
                    )).map(project => (
                      <button key={project.id} type="button" onClick={() => openProject(project)} className="bg-[#222326] hover:bg-[#343537] border border-[#343537] rounded-xl p-3 text-left flex gap-3 items-center transition-colors">
                        <span className={`relative block w-24 shrink-0 ${project.hasHonorFrame ? 'honor-project-thumbnail' : ''}`}><img src={project.thumbnail || (project.youtubeId ? `https://img.youtube.com/vi/${project.youtubeId}/mqdefault.jpg` : '')} alt="" className="aspect-video w-full rounded-lg bg-black object-cover" />{project.hasHonorFrame && <img src="/images/escudo-de-honor.webp" alt="Escudo de Honor" className="honor-badge-image honor-badge-image-small" />}</span>
                        <span className="min-w-0"><span className="block text-sm font-semibold text-white truncate">{project.title}</span><span className="block text-xs text-gray-400 mt-1">{project.format || project.type || 'Proyecto'}</span></span>
                      </button>
                    ))}
                  </div>
                </section>
              )}
            </div>
          </div>
        </div>
      )}

      {showReportModal && selectedProject && (
        <div className="fixed inset-0 z-[70] bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div role="dialog" aria-modal="true" aria-labelledby="report-title" className="bg-[#17191B] border border-gold-900/70 w-full max-w-lg rounded-2xl p-6 space-y-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4"><div><h2 id="report-title" className="text-xl font-bold text-white">Denunciar proyecto</h2><p className="text-sm text-gray-400 mt-1">La denuncia se refiere a «{selectedProject.title}».</p></div><button type="button" onClick={() => setShowReportModal(false)} aria-label="Cerrar denuncia" className="text-gray-400 hover:text-white"><X className="w-5 h-5" /></button></div>
            <form onSubmit={handleSubmitReport} className="space-y-4">
              <label className="block text-xs font-bold text-gray-300">Motivo de la denuncia<select value={reportReason} onChange={e => setReportReason(e.target.value)} className="mt-1 w-full bg-[#101113] border border-[#343537] rounded-xl p-3 text-white"><option>Derechos de autor</option><option>Contenido ilegal</option><option>Contenido sexual o violento inapropiado</option><option>Spam o enlace engañoso</option><option>El vídeo no corresponde al proyecto</option><option>Otro motivo</option></select></label>
              <label className="block text-xs font-bold text-gray-300">Detalles (opcional)<textarea rows={4} maxLength={1500} value={reportDetails} onChange={e => setReportDetails(e.target.value)} placeholder="Explica brevemente el problema y, si procede, aporta contexto." className="mt-1 w-full bg-[#101113] border border-[#343537] rounded-xl p-3 text-white" /></label>
              <p className="text-[11px] text-gray-500">Usa esta función de buena fe. Se enviarán el identificador del proyecto, el motivo y los detalles; si has iniciado sesión, también se asociará tu cuenta a la denuncia.</p>
              <div className="flex gap-3"><button type="button" onClick={() => setShowReportModal(false)} className="flex-1 bg-[#222326] hover:bg-[#343537] text-gray-200 py-3 rounded-xl">Cancelar</button><button type="submit" className="flex-1 bg-gold-700 hover:bg-gold-600 text-white font-bold py-3 rounded-xl">Enviar denuncia</button></div>
            </form>
          </div>
        </div>
      )}

      {showPublishWarning && (
        <div className="fixed inset-0 z-[60] bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div role="alertdialog" aria-modal="true" className="bg-[#17191B] border border-amber-500/40 w-full max-w-lg rounded-3xl p-6 sm:p-8 space-y-5 shadow-2xl">
            <div className="flex items-center gap-3"><ShieldCheck className="w-7 h-7 text-amber-400" /><h2 className="text-xl font-bold text-white">Antes de publicar tu proyecto</h2></div>
            <p className="text-sm text-gray-300 leading-relaxed">Asegúrate de que tienes los derechos necesarios sobre el contenido y que los enlaces funcionan. La publicación quedará pendiente de revisión antes de aparecer públicamente. No publiques material ilegal, ofensivo o que infrinja derechos de terceros.</p>
            <div className="flex gap-3">
              <button onClick={() => setShowPublishWarning(false)} className="flex-1 bg-[#222326] hover:bg-[#343537] text-gray-200 font-semibold py-3 rounded-xl">Cancelar</button>
              <button onClick={() => { setShowPublishWarning(false); openSubmitProjectModal(); }} className="flex-1 bg-gold-600 hover:bg-gold-500 text-white font-bold py-3 rounded-xl">Entendido, continuar</button>
            </div>
          </div>
        </div>
      )}
      {showCarouselEditor && isAdmin && (
        <div className="fixed inset-0 z-[75] flex items-center justify-center overflow-y-auto bg-black/80 p-4">
          <form onSubmit={saveCarouselItem} className="my-auto max-h-[90vh] w-full max-w-xl space-y-4 overflow-y-auto rounded-2xl border border-[#3A3B3E] bg-[#17171b] p-6">
            <div className="flex items-center justify-between"><h2 className="text-lg font-bold text-white">{editingCarouselId ? 'Editar imagen del carrusel' : 'Añadir imagen al carrusel'}</h2><button type="button" onClick={() => { setShowCarouselEditor(false); setCarouselImageFile(null); }} className="rounded-lg p-2 text-gray-400 hover:bg-[#292B2E]"><X className="h-4 w-4" /></button></div>
            <label className="block text-xs text-gray-400">Título<input value={carouselForm.title} onChange={event => setCarouselForm(current => ({ ...current, title: event.target.value }))} maxLength={140} className="mt-1 w-full rounded-xl border border-[#3A3B3E] bg-[#101113] p-3 text-sm text-white" /></label>
            <label className="block text-xs text-gray-400">Descripción breve<textarea rows={3} value={carouselForm.tagline} onChange={event => setCarouselForm(current => ({ ...current, tagline: event.target.value }))} maxLength={500} className="mt-1 w-full rounded-xl border border-[#3A3B3E] bg-[#101113] p-3 text-sm text-white" /></label>
            <label className="block text-xs text-gray-400">Categoría<input value={carouselForm.category} onChange={event => setCarouselForm(current => ({ ...current, category: event.target.value }))} maxLength={60} className="mt-1 w-full rounded-xl border border-[#3A3B3E] bg-[#101113] p-3 text-sm text-white" /></label>
            <label className="block text-xs text-gray-400">URL de imagen (opcional si subes un archivo)<input value={carouselForm.thumbnail} onChange={event => setCarouselForm(current => ({ ...current, thumbnail: event.target.value, thumbnailPath: event.target.value === current.thumbnail ? current.thumbnailPath : '' }))} placeholder="/images/carousel/imagen.jpg o https://..." className="mt-1 w-full rounded-xl border border-[#3A3B3E] bg-[#101113] p-3 text-sm text-white" /></label><label className="block text-xs text-gray-400">O subir imagen desde tu dispositivo<input type="file" accept="image/*" onChange={event => setCarouselImageFile(event.target.files?.[0] || null)} className="mt-1 block w-full text-xs text-gray-400 file:mr-3 file:rounded-lg file:border-0 file:bg-[#292B2E] file:px-3 file:py-2 file:text-xs file:font-semibold file:text-gray-200" /><span className="mt-1 block text-[10px] text-gray-500">Imagen de hasta 5 MB. {carouselImageFile ? `Seleccionada: ${carouselImageFile.name}` : ''}</span></label>
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-[#3A3B3E] bg-[#1B1D20] p-3">
              <input type="checkbox" checked={carouselForm.darkOverlay !== false} onChange={event => setCarouselForm(current => ({ ...current, darkOverlay: event.target.checked }))} className="mt-0.5 h-4 w-4 accent-[#C6A76B]" />
              <span className="text-sm text-gray-200"><span className="block font-semibold text-white">Aplicar degradado oscuro a esta imagen</span><span className="mt-1 block text-xs text-gray-400">Desmárcalo para mostrar el banner sin el oscurecimiento negro. Cada imagen conserva su propia elección.</span></span>
            </label>
            <label className="block text-xs text-gray-400">Enlace del botón<input required type="url" value={carouselForm.videoUrl} onChange={event => setCarouselForm(current => ({ ...current, videoUrl: event.target.value }))} placeholder="https://..." className="mt-1 w-full rounded-xl border border-[#3A3B3E] bg-[#101113] p-3 text-sm text-white" /></label>
            <label className="block text-xs text-gray-400">Texto del botón<input value={carouselForm.linkText} onChange={event => setCarouselForm(current => ({ ...current, linkText: event.target.value }))} maxLength={40} className="mt-1 w-full rounded-xl border border-[#3A3B3E] bg-[#101113] p-3 text-sm text-white" /></label>
            <div className="flex gap-2"><button type="button" onClick={() => { setShowCarouselEditor(false); setCarouselImageFile(null); }} className="flex-1 rounded-xl bg-[#292B2E] py-3 text-sm text-gray-200">Cancelar</button><button type="submit" disabled={savingCarousel} className="flex-1 rounded-xl bg-gold-600 py-3 text-sm font-bold text-white disabled:opacity-50">{savingCarousel ? 'Guardando...' : 'Guardar'}</button></div>
          </form>
        </div>
      )}

      {editingProject && (
        <div className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4 overflow-y-auto">
          <form onSubmit={handleSaveEditedProject} className="bg-[#17191B] border border-[#343537] w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl p-6 lg:p-8 space-y-4 my-auto">
            <h2 className="text-xl font-bold text-white">Editar proyecto</h2>
            <label className="block text-xs text-gray-400">Título<input required value={editProjectForm.title} onChange={e => setEditProjectForm({ ...editProjectForm, title: e.target.value })} className="mt-1 w-full bg-[#101113] border border-[#343537] rounded-xl p-3 text-white" /></label>
            {editProjectForm.format !== 'Serie' && <label className="block text-xs text-gray-400">Enlace de YouTube<input type="url" value={editProjectForm.youtubeUrl} onChange={e => setEditProjectForm({ ...editProjectForm, youtubeUrl: e.target.value })} placeholder="https://www.youtube.com/watch?v=..." className="mt-1 w-full bg-[#101113] border border-[#343537] rounded-xl p-3 text-white" /></label>}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="block text-xs text-gray-400">Técnica
                <select value={editProjectForm.type} onChange={e => setEditProjectForm({ ...editProjectForm, type: e.target.value })} className="mt-1 w-full bg-[#101113] border border-[#343537] rounded-xl p-3 text-white">
                  <option value="Acción real">Acción real</option><option value="Documental">Documental</option><option value="Experimental">Experimental</option><option value="Híbrido">Híbrido</option>
                    <option value="Animación">Animación</option>
                </select>
              </label>
              <label className="block text-xs text-gray-400">Categoría de proyecto
                <select value={editProjectForm.format} onChange={e => setEditProjectForm({ ...editProjectForm, format: e.target.value })} className="mt-1 w-full bg-[#101113] border border-[#343537] rounded-xl p-3 text-white">
                  <option value="Cortometraje">Cortometraje</option><option value="Largometraje">Largometraje</option><option value="Serie">Serie</option><option value="Tráiler">Tráiler</option><option value="Musical">Musical</option><option value="Crowdfunding">Crowdfunding / Kickstarter</option><option value="Tutoriales">Tutoriales</option><option value="Making of">Making of</option>
                </select>
              </label>
              <label className="block text-xs text-gray-400">Año de realización
                <input type="number" min="1900" max="2100" required value={editProjectForm.year} onChange={e => setEditProjectForm({ ...editProjectForm, year: e.target.value })} className="mt-1 w-full bg-[#101113] border border-[#343537] rounded-xl p-3 text-white" />
              </label>
              <label className="block text-xs text-gray-400">Duración
                <input value={editProjectForm.duration} onChange={e => setEditProjectForm({ ...editProjectForm, duration: e.target.value })} placeholder="05:00" className="mt-1 w-full bg-[#101113] border border-[#343537] rounded-xl p-3 text-white" />
              </label>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-2">Géneros (hasta 3)</label>
              <div className="flex flex-wrap gap-2">
                {GENRES_LIST.map(genre => {
                  const isSelected = editProjectGenres.includes(genre);
                  return <button key={genre} type="button" onClick={() => setEditProjectGenres(current => isSelected ? current.filter(item => item !== genre) : (current.length < 3 ? [...current, genre] : current))} className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all border ${isSelected ? 'bg-gold-600 border-gold-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700'}`}>{genre}{isSelected ? ' ✓' : ''}</button>;
                })}
              </div>
              <p className="text-[10px] text-gray-500 mt-2">{editProjectGenres.length}/3 géneros seleccionados</p>
            </div>
            <label className="block text-xs text-gray-400">Enlace de Patreon (opcional)<input type="url" value={editProjectForm.patreonUrl} onChange={e => setEditProjectForm({ ...editProjectForm, patreonUrl: e.target.value })} placeholder="https://www.patreon.com/..." className="mt-1 w-full bg-[#101113] border border-[#343537] rounded-xl p-3 text-white" /></label>
            <label className="block text-xs text-gray-400">Enlace de campaña (Kickstarter u otra plataforma, opcional)<input type="url" value={editProjectForm.campaignUrl} onChange={e => setEditProjectForm({ ...editProjectForm, campaignUrl: e.target.value })} placeholder="https://www.kickstarter.com/..." className="mt-1 w-full bg-[#101113] border border-[#343537] rounded-xl p-3 text-white" /></label>
            <label className="block text-xs text-gray-400">Nombre del creador, estudio o equipo<input value={editProjectForm.creator || ''} onChange={event => setEditProjectForm(current => ({ ...current, creator: event.target.value, linkCreatorToProfile: normalizeFilterText(event.target.value) === normalizeFilterText(editingProject.creatorName || editingProject.creator || '') ? current.linkCreatorToProfile : false }))} maxLength={120} className="mt-1 w-full bg-[#101113] border border-[#343537] rounded-xl p-3 text-white" /></label>
            <label className="flex items-start gap-2 text-[11px] text-gray-400"><input type="checkbox" checked={Boolean(editProjectForm.linkCreatorToProfile)} onChange={event => setEditProjectForm(current => ({ ...current, linkCreatorToProfile: event.target.checked }))} className="mt-0.5" />Vincular el creador al perfil público de la cuenta que subió el proyecto. Desmárcalo si pertenece a un estudio, equipo u otra persona.</label>
            <label className="block text-xs text-gray-400">Descripción<textarea rows={4} value={editProjectForm.description} onChange={e => setEditProjectForm({ ...editProjectForm, description: e.target.value })} className="mt-1 w-full bg-[#101113] border border-[#343537] rounded-xl p-3 text-white" /></label>
            {editProjectForm.format === 'Serie' && (
              <div className="space-y-4 border border-[#343537] bg-[#101113] p-4 rounded-2xl">
                <div><h3 className="text-sm font-bold text-white">Temporadas y episodios</h3><p className="text-[10px] text-gray-500 mt-1">Puedes editar los episodios existentes, añadir nuevos o eliminar temporadas.</p></div>
                {editSeasons.map((season, seasonIndex) => <div key={`edit-season-${seasonIndex}`} className="space-y-3 border-b border-[#343537] pb-4 last:border-0 last:pb-0">
                  <div className="flex items-center justify-between gap-3"><h4 className="text-xs font-bold text-gold-300">Temporada {seasonIndex + 1}</h4>{editSeasons.length > 1 && <button type="button" onClick={() => setEditSeasons(current => current.filter((_, index) => index !== seasonIndex).map((item, index) => ({ ...item, seasonNumber: index + 1 })))} className="text-[10px] text-gold-300 border border-gold-500/30 rounded-lg px-2.5 py-1.5">Eliminar temporada</button>}</div>
                  {season.episodes.map((episode, episodeIndex) => <div key={`edit-episode-${seasonIndex}-${episodeIndex}`} className="grid grid-cols-1 sm:grid-cols-6 gap-2 p-3 rounded-xl bg-[#1B1D20]">
                    <label className="sm:col-span-1 text-[10px] text-gray-400">N.º<input type="number" min="1" required value={episode.episodeNumber} onChange={event => handleEditSeasonChange(seasonIndex, episodeIndex, 'episodeNumber', event.target.value)} className="mt-1 w-full bg-[#101113] border border-[#343537] rounded-lg px-2 py-2 text-xs text-white" /></label>
                    <label className="sm:col-span-2 text-[10px] text-gray-400">Título del episodio<input required value={episode.title || ''} onChange={event => handleEditSeasonChange(seasonIndex, episodeIndex, 'title', event.target.value)} className="mt-1 w-full bg-[#101113] border border-[#343537] rounded-lg px-2 py-2 text-xs text-white" /></label>
                    <label className="sm:col-span-3 text-[10px] text-gray-400">Enlace de YouTube<input type="url" required value={episode.youtubeUrl || ''} onChange={event => handleEditSeasonChange(seasonIndex, episodeIndex, 'youtubeUrl', event.target.value)} placeholder="https://youtube.com/watch?v=..." className="mt-1 w-full bg-[#101113] border border-[#343537] rounded-lg px-2 py-2 text-xs text-white" /></label>
                    <div className="sm:col-span-6 flex justify-end">{season.episodes.length > 1 && <button type="button" onClick={() => setEditSeasons(current => current.map((item, index) => index !== seasonIndex ? item : ({ ...item, episodes: item.episodes.filter((_, index) => index !== episodeIndex) })))} className="text-[10px] text-gold-300 hover:text-gold-200">Eliminar episodio</button>}</div>
                  </div>)}
                  <button type="button" onClick={() => handleAddEditEpisode(seasonIndex)} className="text-xs font-bold text-gold-300 hover:text-gold-200">+ Añadir episodio</button>
                </div>)}
                <button type="button" onClick={handleAddEditSeason} className="w-full border border-dashed border-gold-500/50 text-gold-300 hover:bg-gold-600/10 rounded-xl py-2.5 text-xs font-bold">+ Añadir temporada</button>
              </div>
            )}
            <div className="flex gap-3"><button type="button" onClick={() => setEditingProject(null)} className="flex-1 bg-[#222326] hover:bg-[#343537] text-gray-200 py-3 rounded-xl">Cancelar</button><button type="submit" className="flex-1 bg-gold-600 hover:bg-gold-500 text-white py-3 rounded-xl font-bold">Guardar cambios</button></div>
          </form>
        </div>
      )}

      {/* ==========================================
          MODAL PUBLICAR TRABAJO
      ========================================== */}
      {showSubmitModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#17191B] border border-[#343537] w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-3xl p-6 lg:p-8 space-y-6 shadow-2xl my-auto">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-white">Publica tu trabajo</h2>
              <button onClick={() => setShowSubmitModal(false)} className="text-gray-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitProject} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-gray-400 block mb-1">Título del proyecto</label>
                <input
                  type="text"
                  required
                  value={newProjectForm.title}
                  onChange={(e) => setNewProjectForm({ ...newProjectForm, title: e.target.value })}
                  className="w-full bg-[#101113] border border-[#343537] text-xs rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:border-gold-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-gray-400 block mb-1">Nombre del creador, estudio o equipo</label>
                <input type="text" maxLength={120} value={newProjectForm.creator} onChange={event => {
                  const creator = event.target.value;
                  setNewProjectForm(current => ({ ...current, creator, linkCreatorToProfile: !creator.trim() || normalizeFilterText(creator) === normalizeFilterText(user?.name || '') }));
                }} placeholder={user?.name || 'Nombre del creador o estudio'} className="w-full bg-[#101113] border border-[#343537] text-xs rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:border-gold-500" />
                <label className="mt-2 flex items-start gap-2 text-[11px] text-gray-400"><input type="checkbox" checked={newProjectForm.linkCreatorToProfile} onChange={event => setNewProjectForm(current => ({ ...current, linkCreatorToProfile: event.target.checked }))} className="mt-0.5" />Vincular este creador a mi perfil público. Desmárcalo si el proyecto pertenece a un estudio, equipo u otra persona.</label>
                <p className="mt-1 text-[10px] text-gray-500">La cuenta que publica el proyecto se guarda por separado para permisos y gestión; no tiene por qué ser el autor indicado.</p>
              </div>

              {newProjectForm.format !== 'Serie' && <div>
                <label className="text-xs font-bold text-gray-400 block mb-1">Enlace de YouTube</label>
                <input
                  type="url"
                  required
                  placeholder="https://www.youtube.com/watch?v=..."
                  value={newProjectForm.youtubeUrl}
                  onChange={(e) => setNewProjectForm({ ...newProjectForm, youtubeUrl: e.target.value })}
                  className="w-full bg-[#101113] border border-[#343537] text-xs rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:border-gold-500"
                />
              </div>}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-gray-400 block mb-1">Tipo de producción</label>
                  <select
                    value={newProjectForm.type}
                    onChange={(e) => setNewProjectForm({ ...newProjectForm, type: e.target.value })}
                    className="w-full bg-[#101113] border border-[#343537] text-xs rounded-xl px-3 py-2.5 text-white"
                  >
                    <option value="Acción real">Acción real</option>
                    <option value="Documental">Documental</option>
                    <option value="Experimental">Experimental</option>
                    <option value="Híbrido">Híbrido</option>
                    <option value="Animación">Animación</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-gray-400 block mb-1">Proyecto</label>
                  <select
                    value={newProjectForm.format}
                    onChange={(e) => setNewProjectForm({ ...newProjectForm, format: e.target.value })}
                    className="w-full bg-[#101113] border border-[#343537] text-xs rounded-xl px-3 py-2.5 text-white"
                  >
                    <option value="Cortometraje">Cortometraje</option>
                    <option value="Largometraje">Largometraje</option>
                    <option value="Serie">Serie</option>
                    <option value="Tráiler">Tráiler</option>
                    <option value="Musical">Musical</option>
                    <option value="Crowdfunding">Crowdfunding / Kickstarter</option>
                    <option value="Tutoriales">Tutoriales</option>
                    <option value="Making of">Making of</option>
                  </select>
                </div>
              </div>

              <label className="block text-xs font-bold text-gray-400">Enlace de campaña de crowdfunding (opcional)
                <input type="url" value={newProjectForm.campaignUrl} onChange={e => setNewProjectForm({ ...newProjectForm, campaignUrl: e.target.value })} placeholder="https://www.kickstarter.com/... o enlace de otra campaña" className="mt-1 w-full bg-[#101113] border border-[#343537] text-xs rounded-xl px-3.5 py-2.5 text-white" />
                <span className="block mt-1 text-[10px] text-gray-500">Si añades un enlace, el proyecto también aparecerá en el filtro Crowdfunding / Kickstarter.</span>
              </label>

              <div>
                <label className="text-xs font-bold text-gray-400 block mb-2">Selecciona hasta 3 géneros</label>
                <div className="flex flex-wrap gap-2">
                  {GENRES_LIST.map(genre => { const isSelected = selectedGenres.includes(genre); return <button key={genre} type="button" onClick={() => toggleGenre(genre)} className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all border ${isSelected ? 'bg-gold-600 border-gold-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700'}`}>{genre}{isSelected ? ' ✓' : ''}</button>; })}
                </div>
                <p className="text-[10px] text-gray-500 mt-2">{selectedGenres.length}/3 géneros seleccionados</p>
              </div>

              {newProjectForm.format === 'Serie' && (
                <div className="space-y-4 border border-[#343537] bg-[#101113] p-4 rounded-2xl">
                  <h3 className="text-sm font-bold text-white">Temporadas y episodios</h3>
                  {seasons.map((season, seasonIndex) => <div key={season.seasonNumber} className="space-y-3 border-b border-[#343537] pb-4 last:border-0 last:pb-0">
                    <div className="flex items-center justify-between gap-3">
                      <h4 className="text-xs font-bold text-gold-300">Temporada {season.seasonNumber}</h4>
                      {seasons.length > 1 && <button
                        type="button"
                        onClick={() => setSeasons(current => current.filter((_, idx) => idx !== seasonIndex).map((item, idx) => ({ ...item, seasonNumber: idx + 1 })))}
                        className="text-[10px] font-semibold text-gold-300 hover:text-gold-200 border border-gold-500/30 rounded-lg px-2.5 py-1.5"
                        aria-label={`Eliminar temporada ${season.seasonNumber}`}
                      >Eliminar temporada</button>}
                    </div>
                    {season.episodes.map((episode, episodeIndex) => <div key={`${season.seasonNumber}-${episodeIndex}`} className="grid grid-cols-1 sm:grid-cols-6 gap-2 p-3 rounded-xl bg-[#1B1D20]">
                      <div className="sm:col-span-1"><label className="text-[10px] text-gray-400 block mb-1">N.º</label><input type="number" min="1" required value={episode.episodeNumber} onChange={e => handleEpisodeChange(seasonIndex, episodeIndex, 'episodeNumber', e.target.value)} className="w-full bg-[#101113] border border-[#343537] rounded-lg px-2 py-2 text-xs text-white" /></div>
                      <div className="sm:col-span-2"><label className="text-[10px] text-gray-400 block mb-1">Título del episodio</label><input type="text" required value={episode.title} onChange={e => handleEpisodeChange(seasonIndex, episodeIndex, 'title', e.target.value)} className="w-full bg-[#101113] border border-[#343537] rounded-lg px-2 py-2 text-xs text-white" /></div>
                      <div className="sm:col-span-3"><label className="text-[10px] text-gray-400 block mb-1">Enlace de YouTube</label><input type="url" required placeholder="https://youtube.com/watch?v=..." value={episode.youtubeUrl} onChange={e => handleEpisodeChange(seasonIndex, episodeIndex, 'youtubeUrl', e.target.value)} className="w-full bg-[#101113] border border-[#343537] rounded-lg px-2 py-2 text-xs text-white" /></div>
                      <div className="sm:col-span-6 flex justify-end">{season.episodes.length > 1 && <button type="button" onClick={() => setSeasons(current => current.map((item, idx) => idx !== seasonIndex ? item : ({ ...item, episodes: item.episodes.filter((_, epIdx) => epIdx !== episodeIndex) })))} className="text-[10px] text-gold-300 hover:text-gold-200">Eliminar episodio</button>}</div>
                    </div>)}
                    <button type="button" onClick={() => handleAddEpisode(seasonIndex)} className="text-xs font-bold text-gold-300 hover:text-gold-200">+ Añadir episodio</button>
                  </div>)}
                  <button type="button" onClick={handleAddSeason} className="w-full border border-dashed border-gold-500/50 text-gold-300 hover:bg-gold-600/10 rounded-xl py-2.5 text-xs font-bold">+ Añadir temporada</button>
                </div>
              )}

              <div>
                <label className="text-xs font-bold text-gray-400 block mb-1">Año de realización</label>
                <input type="number" min="1900" max="2100" required value={newProjectForm.year}
                  onChange={(e) => setNewProjectForm({ ...newProjectForm, year: e.target.value })}
                  className="w-full bg-[#101113] border border-[#343537] text-xs rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:border-gold-500" />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-400 block mb-1">Descripción</label>
                <textarea
                  rows={3}
                  value={newProjectForm.description}
                  onChange={(e) => setNewProjectForm({ ...newProjectForm, description: e.target.value })}
                  className="w-full bg-[#101113] border border-[#343537] text-xs rounded-xl p-3 text-white focus:outline-none"
                />
              </div>

              <button
                type="submit"
                className="w-full bg-gold-600 hover:bg-gold-500 text-white font-bold py-3 rounded-xl shadow-lg shadow-gold-600/30 transition-all"
              >
                Enviar a revisión
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ==========================================
          MODAL NUEVO TEMA FORO
      ========================================== */}
      {showNewTopicModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#17191B] border border-[#343537] w-full max-w-lg rounded-3xl p-6 lg:p-8 space-y-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-white">Crear nuevo tema en el foro</h2>
              <button onClick={() => setShowNewTopicModal(false)} className="text-gray-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateTopic} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-gray-400 block mb-1">Título de la discusión</label>
                <input
                  type="text"
                  required
                  value={newTopicForm.title}
                  onChange={(e) => setNewTopicForm({ ...newTopicForm, title: e.target.value })}
                  className="w-full bg-[#101113] border border-[#343537] text-xs rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:border-gold-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-gray-400 block mb-1">Categoría</label>
                <select
                  value={newTopicForm.category}
                  onChange={(e) => setNewTopicForm({ ...newTopicForm, category: e.target.value })}
                  className="w-full bg-[#101113] border border-[#343537] text-xs rounded-xl px-3 py-2.5 text-white"
                >
                  <option value="Herramientas">Herramientas</option>
                  <option value="Consultas">Consultas</option>
                  <option value="Procesos">Procesos</option>
                  <option value="Colaboraciones">Colaboraciones</option>
                  <option value="Rodajes">Rodajes</option>
                  <option value="Casting">Casting</option>
                  <option value="Guion">Guion</option>
                  <option value="Producción">Producción</option>
                  <option value="Fotografía e iluminación">Fotografía e iluminación</option>
                  <option value="Sonido">Sonido</option>
                  <option value="Montaje y postproducción">Montaje y postproducción</option>
                  <option value="Festivales y distribución">Festivales y distribución</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-400 block mb-1">Contenido</label>
                <textarea
                  rows={4}
                  required
                  value={newTopicForm.content}
                  onChange={(e) => setNewTopicForm({ ...newTopicForm, content: e.target.value })}
                  className="w-full bg-[#101113] border border-[#343537] text-xs rounded-xl p-3 text-white focus:outline-none"
                />
              </div>

              <button
                type="submit"
                className="w-full bg-gold-600 hover:bg-gold-500 text-white font-bold py-3 rounded-xl shadow-lg shadow-gold-600/30 transition-all"
              >
                Publicar discusión
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ==========================================
          MODAL DE EDICIÓN DEL PERFIL
      ========================================== */}
      {showEditProfileModal && user && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#17191B] border border-[#343537] w-full max-w-2xl rounded-3xl p-6 lg:p-8 space-y-6 shadow-2xl my-auto">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-white">Editar perfil</h2>
                <p className="text-xs text-gray-400 mt-1">Los cambios se guardarán en tu cuenta de TuRodaje.</p>
              </div>
              <button type="button" onClick={() => { setShowEditProfileModal(false); setProfileImageFiles({ photo: null, banner: null }); }} className="text-gray-400 hover:text-white" aria-label="Cerrar">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUpdateProfile} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-gray-400 block mb-1">Nombre público</label>
                <input type="text" required maxLength={80} value={profileForm.name}
                  onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })}
                  className="w-full bg-[#101113] border border-[#343537] text-sm rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:border-gold-500" />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-400 block mb-1">Biografía</label>
                <textarea rows={4} maxLength={500} value={profileForm.bio}
                  onChange={(e) => setProfileForm({ ...profileForm, bio: e.target.value })}
                  placeholder="Cuéntale a la comunidad quién eres..."
                  className="w-full bg-[#101113] border border-[#343537] text-sm rounded-xl p-3 text-white focus:outline-none focus:border-gold-500" />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-400 block mb-1">URL de la foto de perfil</label>
                <input type="url" value={profileForm.photo}
                  onChange={(e) => setProfileForm({ ...profileForm, photo: e.target.value, photoPath: e.target.value === profileForm.photo ? profileForm.photoPath : '' })}
                  placeholder="https://..."
                  className="w-full bg-[#101113] border border-[#343537] text-sm rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:border-gold-500" />
                <p className="mt-1 text-[11px] text-gray-500">Máximo 2 MB y 2048 × 2048 píxeles (JPG, PNG, WebP o GIF).</p>
                <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={e => setProfileImageFiles(current => ({ ...current, photo: e.target.files?.[0] || null }))} className="mt-2 block w-full text-xs text-gray-400 file:mr-3 file:rounded-lg file:border-0 file:bg-[#292B2E] file:px-3 file:py-2 file:text-xs file:font-semibold file:text-gray-200" />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-400 block mb-1">URL del banner</label>
                <input type="url" value={profileForm.banner}
                  onChange={(e) => setProfileForm({ ...profileForm, banner: e.target.value, bannerPath: e.target.value === profileForm.banner ? profileForm.bannerPath : '' })}
                  placeholder="https://..."
                  className="w-full bg-[#101113] border border-[#343537] text-sm rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:border-gold-500" />
                <p className="mt-1 text-[11px] text-gray-500">Máximo 4 MB y 4096 × 2048 píxeles (JPG, PNG, WebP o GIF).</p>
                <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={e => setProfileImageFiles(current => ({ ...current, banner: e.target.files?.[0] || null }))} className="mt-2 block w-full text-xs text-gray-400 file:mr-3 file:rounded-lg file:border-0 file:bg-[#292B2E] file:px-3 file:py-2 file:text-xs file:font-semibold file:text-gray-200" />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-400 block mb-1">Enlace de Patreon</label>
                <input type="url" value={profileForm.patreonUrl}
                  onChange={(e) => setProfileForm({ ...profileForm, patreonUrl: e.target.value })}
                  placeholder="https://www.patreon.com/tuusuario"
                  className="w-full bg-[#101113] border border-[#343537] text-sm rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:border-gold-500" />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-400 block mb-1">Enlace de Ko-fi</label>
                <input type="url" value={profileForm.kofiUrl}
                  onChange={(e) => setProfileForm({ ...profileForm, kofiUrl: e.target.value })}
                  placeholder="https://ko-fi.com/tuusuario"
                  className="w-full bg-[#101113] border border-[#343537] text-sm rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:border-gold-500" />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-400 block mb-1">Sitio web / portafolio</label>
                <input type="url" value={profileForm.websiteUrl}
                  onChange={(e) => setProfileForm({ ...profileForm, websiteUrl: e.target.value })}
                  placeholder="https://tusitio.com"
                  className="w-full bg-[#101113] border border-[#343537] text-sm rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:border-gold-500" />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {[
                  ['youtubeUrl', 'YouTube'], ['instagramUrl', 'Instagram'], ['tiktokUrl', 'TikTok'],
                  ['artstationUrl', 'ArtStation'], ['xUrl', 'X / Twitter']
                ].map(([field, label]) => <label key={field} className="block text-xs font-bold text-gray-400">{label}<input type="url" value={profileForm[field]} onChange={event => setProfileForm(current => ({ ...current, [field]: event.target.value }))} placeholder="https://..." className="mt-1 w-full rounded-xl border border-[#343537] bg-[#101113] px-3.5 py-2.5 text-sm text-white focus:border-gold-500 focus:outline-none" /></label>)}
              </div>
              <div>
                <label className="text-xs font-bold text-gray-400 block mb-1">Correo de contacto público</label>
                <input type="email" value={profileForm.contactEmail}
                  onChange={(e) => setProfileForm({ ...profileForm, contactEmail: e.target.value })}
                  placeholder="contacto@ejemplo.com"
                  className="w-full bg-[#101113] border border-[#343537] text-sm rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:border-gold-500" />
                <p className="text-[11px] text-gray-500 mt-1">Este correo es independiente del correo usado para iniciar sesión.</p>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => { setShowEditProfileModal(false); setProfileImageFiles({ photo: null, banner: null }); }}
                  className="flex-1 bg-[#222326] hover:bg-[#343537] text-gray-200 font-semibold py-3 rounded-xl">
                  Cancelar
                </button>
                <button type="submit" disabled={isSavingProfile}
                  className="flex-1 bg-gold-600 hover:bg-gold-500 disabled:opacity-60 text-white font-bold py-3 rounded-xl">
                  {isSavingProfile ? 'Guardando...' : 'Guardar cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL ADMINISTRACIÓN DE PRODUCTOS */}
      {showProductModal && isAdmin && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#17191B] border border-[#343537] w-full max-w-xl rounded-3xl p-6 space-y-5 shadow-2xl my-8">
            <div className="flex items-center justify-between"><h2 className="text-xl font-bold text-white">{editingProductId ? 'Editar producto' : 'Agregar producto'}</h2><button onClick={() => setShowProductModal(false)} className="text-gray-400 hover:text-white" aria-label="Cerrar"><X className="w-5 h-5" /></button></div>
            <form onSubmit={handleSaveProduct} className="space-y-3">
              <div><label className="block text-xs text-gray-400 mb-1">Nombre del producto *</label><input required value={productForm.title} onChange={e => setProductForm({...productForm,title:e.target.value})} className="w-full bg-[#101113] border border-[#343537] rounded-xl px-3 py-2.5 text-sm text-white" /></div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3"><div><label className="block text-xs text-gray-400 mb-1">Categoría *</label><select value={productForm.category} onChange={e => setProductForm({...productForm,category:e.target.value})} className="w-full bg-[#101113] border border-[#343537] rounded-xl px-3 py-2.5 text-sm text-white"><option>Software</option><option>Hardware</option><option>Accesorio</option><option>Equipo</option></select></div><div><label className="block text-xs text-gray-400 mb-1">Precio</label><input value={productForm.price} onChange={e => setProductForm({...productForm,price:e.target.value})} placeholder="Ej. Gratis o 29 €" className="w-full bg-[#101113] border border-[#343537] rounded-xl px-3 py-2.5 text-sm text-white" /></div></div>
              <div><label className="block text-xs text-gray-400 mb-1">Tipo de equipo (opcional)</label><select value={productForm.subtype} onChange={e => setProductForm({...productForm,subtype:e.target.value})} className="w-full bg-[#101113] border border-[#343537] rounded-xl px-3 py-2.5 text-sm text-white"><option value="">Sin subtipo</option>{['Cámara','Objetivo','Trípode','Estabilizador / gimbal','Slider / dolly','Drone','Monitor de cámara','Grabador externo','Micrófono','Grabadora de audio','Auriculares','Kit de iluminación','Panel LED','Foco','Modificador de luz','Reflector','Soporte / grip','Teleprompter','Capturadora','Ordenador','Monitor de edición','Almacenamiento','Accesorio','Otro'].map(x => <option key={x}>{x}</option>)}</select></div>
              <div><label className="block text-xs text-gray-400 mb-1">Áreas audiovisuales (puedes elegir varias)</label><div className="flex flex-wrap gap-2">{['Cine de ficción','Documental','Videoclip','Publicidad','Animación','Experimental','Producción virtual','Otro'].map(x => <label key={x} className="text-xs text-gray-300 flex gap-1 items-center"><input type="checkbox" checked={productForm.techniques.includes(x)} onChange={() => toggleArrayValue(productForm,setProductForm,'techniques',x)}/>{x}</label>)}</div></div>
              <div><label className="block text-xs text-gray-400 mb-1">Usos / especialidades</label><div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-32 overflow-y-auto">{['Grabación y cámara','Fotografía cinematográfica','Iluminación','Sonido directo','Diseño sonoro','Montaje y edición','Colorización','Postproducción','Efectos visuales','Producción','Preproducción','Guion y storyboard','Dirección','Streaming','Animación','Almacenamiento y copias','Otro'].map(x => <label key={x} className="text-xs text-gray-300 flex gap-1 items-center"><input type="checkbox" checked={productForm.uses.includes(x)} onChange={() => toggleArrayValue(productForm,setProductForm,'uses',x)}/>{x}</label>)}</div></div>
              <div><label className="block text-xs text-gray-400 mb-1">URL de imagen</label><input type="url" value={productForm.image} onChange={e => setProductForm({...productForm,image:e.target.value})} placeholder="https://..." className="w-full bg-[#101113] border border-[#343537] rounded-xl px-3 py-2.5 text-sm text-white" /></div>
              <div><label className="block text-xs text-gray-400 mb-1">Enlace del producto *</label><input required type="url" value={productForm.link} onChange={e => setProductForm({...productForm,link:e.target.value})} placeholder="https://..." className="w-full bg-[#101113] border border-[#343537] rounded-xl px-3 py-2.5 text-sm text-white" /></div>
              <label className="flex items-start gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 cursor-pointer"><input type="checkbox" checked={Boolean(productForm.isAffiliate)} onChange={e => setProductForm({...productForm, isAffiliate: e.target.checked})} className="mt-1 accent-amber-400"/><span><span className="block text-sm font-semibold text-white">Este es un enlace de afiliado</span><span className="block text-xs text-gray-400 mt-1">Márcalo solo si TuRodaje puede recibir una comisión u otra compensación por compras o registros a través de este enlace. La web mostrará una indicación junto al producto.</span></span></label>
              <div><label className="block text-xs text-gray-400 mb-1">Descripción</label><textarea rows={3} value={productForm.description} onChange={e => setProductForm({...productForm,description:e.target.value})} className="w-full bg-[#101113] border border-[#343537] rounded-xl px-3 py-2.5 text-sm text-white" /></div>
              <button type="submit" className="w-full bg-gold-600 hover:bg-gold-500 rounded-xl py-3 text-sm font-bold text-white">Guardar producto</button>
            </form>
          </div>
        </div>
      )}

      {showEducationModal && isAdmin && <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto"><div className="bg-[#17191B] border border-[#343537] w-full max-w-2xl rounded-3xl p-6 space-y-5 my-8"><div className="flex items-center justify-between"><h2 className="text-xl font-bold text-white">{editingEducationId ? 'Editar curso' : 'Agregar curso'}</h2><button onClick={() => setShowEducationModal(false)}><X className="w-5 h-5"/></button></div><form onSubmit={handleSaveEducation} className="space-y-3"><input required placeholder="Título del curso *" value={educationForm.title} onChange={e => setEducationForm({...educationForm,title:e.target.value})} className="w-full bg-[#101113] border border-[#343537] rounded-xl p-3 text-sm text-white"/><div className="grid sm:grid-cols-2 gap-3"><input placeholder="Academia / profesor" value={educationForm.provider} onChange={e => setEducationForm({...educationForm,provider:e.target.value})} className="w-full bg-[#101113] border border-[#343537] rounded-xl p-3 text-sm text-white"/><input placeholder="Gratis, 25 €, suscripción…" value={educationForm.price} onChange={e => setEducationForm({...educationForm,price:e.target.value})} className="w-full bg-[#101113] border border-[#343537] rounded-xl p-3 text-sm text-white"/></div><input required type="url" placeholder="Enlace del curso *" value={educationForm.url} onChange={e => setEducationForm({...educationForm,url:e.target.value})} className="w-full bg-[#101113] border border-[#343537] rounded-xl p-3 text-sm text-white"/><input type="url" placeholder="URL de imagen (opcional)" value={educationForm.image} onChange={e => setEducationForm({...educationForm,image:e.target.value})} className="w-full bg-[#101113] border border-[#343537] rounded-xl p-3 text-sm text-white"/><textarea rows={3} placeholder="Descripción del curso" value={educationForm.description} onChange={e => setEducationForm({...educationForm,description:e.target.value})} className="w-full bg-[#101113] border border-[#343537] rounded-xl p-3 text-sm text-white"/>{[['Áreas audiovisuales','techniques',['Cine de ficción','Documental','Videoclip','Publicidad','Animación','Experimental','Producción virtual','Otro']],['Especialidades','topics',['Dirección','Guion','Producción','Dirección de fotografía','Cámara y ópticas','Iluminación','Sonido directo','Diseño sonoro','Montaje y edición','Colorización','Interpretación','Dirección de arte','Vestuario y maquillaje','Casting','Distribución y festivales','Efectos visuales','Animación','Storyboard','Postproducción','Otro']],['Software utilizado','software',['DaVinci Resolve','Premiere Pro','Final Cut Pro','After Effects','Avid Media Composer','Pro Tools','Audition','Reaper','Blender','Cinema 4D','Unreal Engine','Nuke','Photoshop','Lightroom','Storyboard Pro','Otro','No requiere software']]].map(([label,field,options]) => <div key={field}><p className="text-xs text-gray-400 mb-2">{label} (selección múltiple)</p><div className="flex flex-wrap gap-x-3 gap-y-2 max-h-28 overflow-y-auto">{options.map(x => <label key={x} className="text-xs text-gray-300 flex items-center gap-1"><input type="checkbox" checked={educationForm[field].includes(x)} onChange={() => toggleArrayValue(educationForm,setEducationForm,field,x)}/>{x}</label>)}</div></div>)}<button type="submit" className="w-full bg-gold-600 hover:bg-gold-500 rounded-xl py-3 text-sm font-bold text-white">Guardar curso</button></form></div></div>}

      {/* MODAL DE CONTACTO: envía el mensaje desde la web sin mostrar el destinatario */}
      {showContactModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#17191B] border border-[#343537] w-full max-w-lg rounded-3xl p-6 space-y-5 shadow-2xl my-8">
            <div className="flex items-center justify-between"><div><h2 className="text-xl font-bold text-white">Contacta con TuRodaje</h2><p className="text-xs text-gray-400 mt-1">Envíanos tu consulta mediante este formulario.</p><p className="text-xs text-gray-300 mt-2">Correo de contacto: <a className="text-gold-300 underline" href="mailto:contacto@toonknight.com">contacto@toonknight.com</a></p></div><button onClick={() => setShowContactModal(false)} className="text-gray-400 hover:text-white" aria-label="Cerrar"><X className="w-5 h-5" /></button></div>
            <form onSubmit={handleSendContact} className="space-y-3">
              <input required placeholder="Tu nombre" value={contactForm.name} onChange={e => setContactForm({...contactForm,name:e.target.value})} className="w-full bg-[#101113] border border-[#343537] rounded-xl px-3 py-2.5 text-sm text-white" />
              <input required type="email" placeholder="Tu correo para responderte" value={contactForm.email} onChange={e => setContactForm({...contactForm,email:e.target.value})} className="w-full bg-[#101113] border border-[#343537] rounded-xl px-3 py-2.5 text-sm text-white" />
              <input placeholder="Asunto (opcional)" value={contactForm.subject} onChange={e => setContactForm({...contactForm,subject:e.target.value})} className="w-full bg-[#101113] border border-[#343537] rounded-xl px-3 py-2.5 text-sm text-white" />
              <textarea required rows={5} placeholder="Escribe tu mensaje..." value={contactForm.message} onChange={e => setContactForm({...contactForm,message:e.target.value})} className="w-full bg-[#101113] border border-[#343537] rounded-xl px-3 py-2.5 text-sm text-white" />
              <p className="text-[11px] leading-relaxed text-gray-500">Usaremos los datos que facilites para responder a tu consulta. El envío se procesa mediante FormSubmit. Consulta la <button type="button" onClick={() => { setShowContactModal(false); setLegalPage('privacidad'); }} className="text-gold-300 underline">política de privacidad</button>.</p>
              <button disabled={sendingContact} type="submit" className="w-full bg-gold-600 hover:bg-gold-500 disabled:opacity-60 rounded-xl py-3 text-sm font-bold text-white">{sendingContact ? 'Enviando...' : 'Enviar mensaje'}</button>
            </form>
          </div>
        </div>
      )}

      {/* ==========================================
          MODAL DE AUTENTICACIÓN GOOGLE
      ========================================== */}
      {showAuthModal && !user && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#17191B] border border-[#343537] w-full max-w-md rounded-3xl p-6 lg:p-8 space-y-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-white">Iniciar sesión en TuRodaje</h2>
                <p className="text-xs text-gray-400 mt-1">Usa tu cuenta de Google para continuar.</p>
              </div>
              <button onClick={() => setShowAuthModal(false)} className="text-gray-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <button
              onClick={handleGoogleLogin}
              className="w-full bg-white hover:bg-gray-100 text-gray-900 font-bold py-3 rounded-xl flex items-center justify-center gap-3 transition-colors"
            >
              <span className="text-lg font-extrabold">G</span>
              Continuar con Google
            </button>

            <p className="text-[11px] text-gray-500 text-center leading-relaxed">
              El acceso se realiza mediante Firebase Authentication y la ventana oficial de Google.
            </p>
          </div>
        </div>
      )}

      {legalPage && (
        <div className="fixed inset-0 z-[80] bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <section role="dialog" aria-modal="true" aria-labelledby="legal-page-title" className="bg-[#17191B] border border-[#34343d] w-full max-w-3xl max-h-[88vh] overflow-y-auto rounded-2xl p-6 sm:p-8 shadow-2xl">
            <div className="flex items-start justify-between gap-4 mb-5"><div><p className="text-xs uppercase tracking-widest text-gold-300 font-bold">TuRodaje · turodaje.com (dominio previsto)</p><h2 id="legal-page-title" className="text-2xl font-black text-white mt-1">{({ aviso: 'Aviso legal', privacidad: 'Política de privacidad', cookies: 'Política de cookies', condiciones: 'Condiciones de uso', transparencia: 'Transparencia comercial' })[legalPage]}</h2></div><button onClick={() => setLegalPage('')} aria-label="Cerrar página legal" className="text-gray-400 hover:text-white"><X className="w-5 h-5" /></button></div>
            <div className="rounded-xl border border-amber-700/50 bg-amber-950/25 p-3 mb-5 text-sm text-amber-200"><strong>Borrador pendiente de completar.</strong> Antes de publicar la web, sustituye los campos entre corchetes y verifica que el texto coincide con la configuración y los servicios realmente activos.</div>
            <div className="space-y-4 text-sm leading-relaxed text-gray-300">
              {legalPage === 'aviso' && <>
                <h3 className="text-white font-bold">1. Titular y contacto</h3>
                <p>Titular: Roman Arias Pinto, persona física que desarrolla la actividad por cuenta propia (autónomo). Nombre comercial: TuRodaje. Dominio previsto: turodaje.com (pendiente de adquisición). Correo de contacto: contacto@toonknight.com. Domicilio o dirección legal exigible: Madrid, España — [COMPLETAR DIRECCIÓN POSTAL ANTES DE PUBLICAR].</p>
                <h3 className="text-white font-bold">2. Objeto del sitio</h3>
                <p>TuRodaje es un catálogo y una comunidad para descubrir proyectos de cine independiente y creación audiovisual. Los vídeos se muestran mediante enlaces o reproductores de YouTube; TuRodaje no afirma ser titular de los vídeos ni alojarlos en sus propios servidores.</p>
                <h3 className="text-white font-bold">3. Propiedad intelectual y comunicaciones</h3>
                <p>Los vídeos, imágenes, marcas y materiales pertenecen a sus respectivos titulares. La inclusión de una ficha no implica patrocinio, afiliación ni aprobación por parte de sus titulares. Para comunicar una posible infracción, contenido ilícito o error, utiliza contacto@toonknight.com o el formulario de contacto.</p>
                <h3 className="text-white font-bold">4. Enlaces de terceros y actividad comercial</h3>
                <p>La web puede enlazar a YouTube, Kickstarter u otras plataformas de crowdfunding, Patreon, cursos y productos. Esos servicios se rigen por sus propias condiciones. Algunos enlaces de productos pueden ser enlaces de afiliado; se indicará junto al enlace cuando corresponda.</p>
                <h3 className="text-white font-bold">5. Estado del documento</h3>
                <p>Este texto es un borrador personalizado. Debe completarse el domicilio que corresponda y comprobarse que la información describe el sitio desplegado antes de considerarlo definitivo.</p>
              </>}
              {legalPage === 'privacidad' && <>
                <h3 className="text-white font-bold">1. Responsable y contacto</h3>
                <p>Responsable: Roman Arias Pinto, persona física autónoma. Contacto de privacidad: contacto@toonknight.com. Domicilio legal: Madrid, España — [COMPLETAR DIRECCIÓN POSTAL ANTES DE PUBLICAR].</p>
                <h3 className="text-white font-bold">2. Datos que pueden tratarse</h3>
                <p>Según las funciones utilizadas, pueden tratarse identificadores y datos básicos de la cuenta de Google, datos del perfil, favoritos, proyectos enviados, comentarios, interacciones, denuncias, mensajes de contacto y datos técnicos necesarios para seguridad y funcionamiento. Evita publicar datos sensibles o datos personales de terceros en perfiles, comentarios o denuncias.</p>
                <h3 className="text-white font-bold">3. Finalidades y bases jurídicas</h3>
                <p>Los datos se utilizan para crear y mantener cuentas, mostrar perfiles, gestionar favoritos y publicaciones, moderar comentarios y denuncias, responder consultas y proteger el servicio. La base jurídica debe asignarse por operación concreta: ejecución del servicio solicitado, consentimiento cuando proceda, cumplimiento de obligaciones legales o interés legítimo debidamente evaluado para seguridad y moderación. No se utilizarán los datos para una finalidad incompatible con la informada.</p>
                <h3 className="text-white font-bold">4. Proveedores y servicios externos</h3>
                <p>La web utiliza Google Authentication y Firebase/Firestore para autenticación y datos, Vercel para alojamiento y FormSubmit para procesar el formulario de contacto. El formulario está configurado para enviar los mensajes a contacto@toonknight.com; debe probarse el envío real y confirmarse la entrega antes del lanzamiento. Las miniaturas pueden solicitarse a servidores de YouTube/Google y el reproductor se carga al abrir un proyecto. Deben verificarse las condiciones, los acuerdos de tratamiento y las posibles transferencias internacionales de cada proveedor antes del lanzamiento.</p>
                <h3 className="text-white font-bold">5. Conservación</h3>
                <p>Los datos de cuenta se conservarán mientras la cuenta esté activa y durante el tiempo adicional estrictamente necesario para atender obligaciones o reclamaciones. Los mensajes de contacto y las denuncias se conservarán durante el tiempo necesario para responder, moderar, documentar la actuación y atender posibles reclamaciones; deben fijarse y aplicarse plazos internos concretos antes del lanzamiento. Los registros técnicos se conservarán según la configuración real de los proveedores y las necesidades de seguridad, que deben verificarse.</p>
                <h3 className="text-white font-bold">6. Derechos</h3>
                <p>Puedes solicitar acceso, rectificación, supresión, oposición, limitación y portabilidad cuando proceda escribiendo a contacto@toonknight.com. También puedes retirar un consentimiento cuando el tratamiento se base en él y presentar una reclamación ante la Agencia Española de Protección de Datos. La solicitud puede requerir verificar razonablemente tu identidad.</p>
                <h3 className="text-white font-bold">7. Menores y seguridad</h3>
                <p>El servicio está dirigido al público general, pero no se ha definido todavía un procedimiento específico para usuarios menores. No publiques información privada de menores ni de terceros. Antes del lanzamiento deben revisarse la edad mínima de uso, la moderación y la configuración de acceso.</p>
              </>}
              {legalPage === 'cookies' && <>
                <h3 className="text-white font-bold">1. Estado de la auditoría</h3>
                <p>TuRodaje utiliza almacenamiento local del navegador (localStorage) y se conecta a servicios de Google/Firebase y YouTube. Las miniaturas pueden descargarse desde YouTube antes de abrir el reproductor. No se ha completado una auditoría del sitio desplegado para inventariar todas las cookies, identificadores, finalidades, proveedores, duraciones y transferencias.</p>
                <h3 className="text-white font-bold">2. Consentimiento</h3>
                <p>Las tecnologías estrictamente necesarias deben distinguirse de las que requieren consentimiento. Cuando sea exigible, las tecnologías no necesarias deberán permanecer bloqueadas hasta obtener consentimiento válido y se ofrecerán opciones de aceptar y rechazar con igual visibilidad, además de una forma sencilla de cambiar la elección.</p>
                <h3 className="text-white font-bold">3. Gestión de preferencias</h3>
                <p>El sitio todavía debe incorporar o verificar el mecanismo real para gestionar y retirar preferencias. Hasta que se realice la auditoría e implementación, esta política no debe considerarse un inventario definitivo ni prueba de que exista un gestor de consentimiento.</p>
              </>}
              {legalPage === 'condiciones' && <>
                <h3 className="text-white font-bold">1. Uso del servicio</h3>
                <p>Las personas usuarias deben utilizar TuRodaje de forma lícita, respetar los derechos de terceros y abstenerse de publicar spam, amenazas, enlaces maliciosos, suplantaciones o contenido ilícito.</p>
                <h3 className="text-white font-bold">2. Cuentas y contenido de usuarios</h3>
                <p>Quien envíe un proyecto declara que la información aportada es correcta y que tiene derecho o autorización para compartir los textos, imágenes y enlaces que facilite. La inclusión en el catálogo no supone que TuRodaje sea titular del proyecto ni que garantice su calidad o disponibilidad.</p>
                <h3 className="text-white font-bold">3. Comentarios, moderación y denuncias</h3>
                <p>Los comentarios y denuncias deben realizarse de buena fe. TuRodaje podrá revisar, ocultar o retirar contenido de acuerdo con la ley y las reglas de la comunidad, y podrá limitar cuentas en caso de abuso. Las denuncias no garantizan la retirada automática del vídeo original de YouTube; cuando corresponda, se dirigirá la reclamación al titular de la plataforma o del contenido. Contacto: contacto@toonknight.com.</p>
                <h3 className="text-white font-bold">4. Servicios de terceros</h3>
                <p>YouTube, Google, plataformas de crowdfunding, Patreon, vendedores y proveedores de cursos tienen sus propias condiciones. TuRodaje no controla sus servicios, contenido, disponibilidad, compras ni políticas de privacidad.</p>
                <h3 className="text-white font-bold">5. Disponibilidad y cambios</h3>
                <p>El catálogo puede cambiar y el servicio puede sufrir interrupciones. Estas condiciones deberán actualizarse si se habilitan pagos, cursos propios, suscripciones u otras funciones comerciales.</p>
              </>}
              {legalPage === 'transparencia' && <>
                <h3 className="text-white font-bold">1. Enlaces de afiliados</h3>
                <p>TuRodaje puede incluir enlaces de afiliado. Si compras mediante uno de esos enlaces, el titular de TuRodaje podría recibir una comisión sin coste adicional para ti, salvo que se indique expresamente lo contrario. Los enlaces de afiliado deben identificarse claramente junto al producto o recomendación correspondiente; esta nota general no sustituye esa indicación.</p>
                <h3 className="text-white font-bold">2. Apoyo voluntario</h3>
                <p>En el futuro, TuRodaje podría aceptar apoyo voluntario mediante Patreon u otra plataforma externa. Los pagos, cuotas y condiciones serán los de la plataforma y se informarán antes de solicitar el apoyo.</p>
                <h3 className="text-white font-bold">3. Cursos y productos</h3>
                <p>TuRodaje contempla enlaces a cursos de terceros y la posibilidad de ofrecer cursos propios en el futuro. Si se habilitan ventas propias, se publicará antes de la compra la información exigible sobre el vendedor, precio total, impuestos, pago, entrega, desistimiento y reclamaciones, según corresponda.</p>
                <h3 className="text-white font-bold">4. Publicidad de YouTube</h3>
                <p>Los vídeos se reproducen mediante YouTube y esa plataforma puede mostrar anuncios conforme a sus propias condiciones. TuRodaje no afirma insertar ni controlar los anuncios que aparecen dentro del reproductor de YouTube.</p>
              </>}
            </div>
            <div className="flex justify-end mt-7"><button onClick={() => setLegalPage('')} className="bg-gold-600 hover:bg-gold-500 text-white font-bold px-5 py-2.5 rounded-xl">Cerrar</button></div>
          </section>
        </div>
      )}

      {/* FOOTER GLOBAL */}
      <footer className="bg-[#17191B] border-t border-[#343537] py-8 px-6 lg:px-12 mt-auto">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-gray-500">
          <div className="flex items-center gap-2">
            <span className="font-bold text-white">TURODAJE</span>
            <span>— El espacio del cine independiente.</span>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2"><button onClick={() => setShowContactModal(true)} className="text-gold-300 hover:text-white font-semibold">Contacto</button><button onClick={() => setLegalPage('aviso')} className="hover:text-white">Aviso legal</button><button onClick={() => setLegalPage('privacidad')} className="hover:text-white">Privacidad</button><button onClick={() => setLegalPage('cookies')} className="hover:text-white">Cookies</button><button onClick={() => setLegalPage('condiciones')} className="hover:text-white">Condiciones</button><button onClick={() => setLegalPage('transparencia')} className="hover:text-white">Transparencia</button><p>© 2026 TuRodaje. Todos los derechos reservados.</p></div>
        </div>
      </footer>

    </div>
  );
}