import { initializeApp } from "firebase/app";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";
import { readFileSync } from "node:fs";

// Busca projects.json en ../data/ o junto a este archivo.
const candidatePaths = [
  new URL("../data/projects.json", import.meta.url),
  new URL("./projects.json", import.meta.url),
];

const projectsPath = candidatePaths.find((path) => {
  try {
    readFileSync(path, "utf8");
    return true;
  } catch {
    return false;
  }
});

if (!projectsPath) {
  throw new Error(
    "No se encontró projects.json en ../data/ ni junto a seedProjects.js."
  );
}

const projectsData = JSON.parse(readFileSync(projectsPath, "utf8"));

const firebaseConfig = {
  apiKey: "AIzaSyC2iexQvY1xjFMjy9qZSRjZsLYkfqGU0uk",
  authDomain: "onlytoon-82f3f.firebaseapp.com",
  projectId: "onlytoon-82f3f",
  storageBucket: "onlytoon-82f3f.firebasestorage.app",
  messagingSenderId: "1049602208943",
  appId: "1:1049602208943:web:a8b9f17768e8dce4e6905a",
  measurementId: "G-XG19QHBTYK",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Extrae el ID de un vídeo de YouTube.
function getYouTubeId(value = "") {
  const input = String(value || "").trim();

  if (/^[\w-]{11}$/.test(input)) {
    return input;
  }

  try {
    const url = new URL(input);
    const host = url.hostname.replace(/^www\./, "").toLowerCase();

    if (host === "youtu.be") {
      const id = url.pathname.split("/").filter(Boolean)[0];
      return /^[\w-]{11}$/.test(id || "") ? id : "";
    }

    if (
      [
        "youtube.com",
        "m.youtube.com",
        "music.youtube.com",
      ].includes(host)
    ) {
      const fromQuery = url.searchParams.get("v");

      if (fromQuery && /^[\w-]{11}$/.test(fromQuery)) {
        return fromQuery;
      }

      const parts = url.pathname.split("/").filter(Boolean);

      const markerIndex = parts.findIndex((part) =>
        ["embed", "shorts", "live", "v"].includes(part)
      );

      const candidate =
        markerIndex >= 0 ? parts[markerIndex + 1] : "";

      return /^[\w-]{11}$/.test(candidate || "")
        ? candidate
        : "";
    }
  } catch {
    // URL inválida.
  }

  return "";
}

function cleanString(value, fallback = "") {
  return typeof value === "string" && value.trim()
    ? value.trim()
    : fallback;
}

// Normaliza el tipo de animación.
// Este campo NO es el formato del proyecto.
function normalizeType(project) {
  const raw = cleanString(
    project.type || project.projectType,
    "2D"
  ).toLowerCase();

  if (raw.includes("stop")) return "Stop Motion";
  if (raw.includes("3d")) return "3D";

  if (
    raw === "ia" ||
    raw.includes("inteligencia artificial") ||
    raw.includes("ai")
  ) {
    return "IA";
  }

  if (raw.includes("2d")) return "2D";

  return "2D";
}

// Normaliza el formato de publicación de la obra.
function normalizeFormat(project) {
  const allowedFormats = [
    "Cortometraje",
    "Largometraje",
    "Serie",
    "Tráiler",
    "Musical",
    "Crowdfunding",
    "Tutoriales",
    "Making of",
  ];

  function normalizeLabel(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim()
      .replace(/[-_]+/g, " ")
      .replace(/\s+/g, " ");
  }

  const aliases = new Map([
    ["cortometraje", "Cortometraje"],
    ["corto", "Cortometraje"],
    ["cortos", "Cortometraje"],
    ["short film", "Cortometraje"],
    ["short films", "Cortometraje"],
    ["short", "Cortometraje"],

    ["largometraje", "Largometraje"],
    ["largometrajes", "Largometraje"],
    ["pelicula", "Largometraje"],
    ["pelicula completa", "Largometraje"],
    ["feature film", "Largometraje"],
    ["feature", "Largometraje"],
    ["full movie", "Largometraje"],

    ["serie", "Serie"],
    ["series", "Serie"],
    ["webserie", "Serie"],
    ["web series", "Serie"],
    ["episodio", "Serie"],
    ["episode", "Serie"],

    ["trailer", "Tráiler"],
    ["teaser", "Tráiler"],

    ["musical", "Musical"],

    ["crowdfunding", "Crowdfunding"],
    ["financiacion colectiva", "Crowdfunding"],

    ["tutorial", "Tutoriales"],
    ["tutoriales", "Tutoriales"],
    ["how to", "Tutoriales"],

    ["making of", "Making of"],
    ["making off", "Making of"],
    ["behind the scenes", "Making of"],
    ["behind the scene", "Making of"],
    ["bts", "Making of"],
  ]);

  function resolveFormat(value) {
    const normalized = normalizeLabel(value);

    if (!normalized) return null;

    if (aliases.has(normalized)) {
      return aliases.get(normalized);
    }

    const exact = allowedFormats.find(
      (format) => normalizeLabel(format) === normalized
    );

    return exact || null;
  }

  // 1. Prioridad al campo format y a los campos explícitos equivalentes.
  for (const candidate of [
    project.format,
    project.projectFormat,
    project.category,
  ]) {
    const result = resolveFormat(candidate);

    if (result) return result;
  }

  // 2. Compatibilidad con registros antiguos que guardaban el formato
  // en projectType o type. Solo acepta valores que sean formatos válidos.
  for (const candidate of [
    project.projectType,
    project.type,
  ]) {
    const result = resolveFormat(candidate);

    if (result) return result;
  }

  // 3. Detecta formatos que algunas versiones de la lista guardaban
  // incorrectamente en genre o genres.
  const rawGenres = Array.isArray(project.genres)
    ? project.genres
    : [project.genre].filter(Boolean);

  for (const genre of rawGenres) {
    const result = resolveFormat(genre);

    if (result) return result;
  }

  // 4. Si el formato no está indicado, lo infiere del título.
  const title = normalizeLabel(project.title);

  if (
    /\b(tutorial|tutoriales|how to|como hacer)\b/.test(title)
  ) {
    return "Tutoriales";
  }

  if (
    /\b(making of|making off|behind the scenes|behind the scene|bts)\b/.test(
      title
    )
  ) {
    return "Making of";
  }

  if (
    /\b(crowdfunding|kickstarter|indiegogo)\b/.test(title)
  ) {
    return "Crowdfunding";
  }

  if (/\b(trailer|teaser)\b/.test(title)) {
    return "Tráiler";
  }

  if (
    /\b(serie|series|webserie|web series|episodio|episode)\b/.test(
      title
    )
  ) {
    return "Serie";
  }

  if (
    /\b(largometraje|feature film|pelicula completa|full movie)\b/.test(
      title
    )
  ) {
    return "Largometraje";
  }

  if (/\bmusical\b/.test(title)) {
    return "Musical";
  }

  // 5. Valor por defecto si no existe información suficiente.
  return "Cortometraje";
}

// Conserva los géneros como géneros, separados del formato.
function normalizeGenres(project) {
  const rawGenres = Array.isArray(project.genres)
    ? project.genres
    : project.genre
      ? [project.genre]
      : [];

  const formatLabels = new Set([
    "tutorial",
    "tutoriales",
    "making of",
    "making off",
    "behind the scenes",
    "behind the scene",
    "bts",
  ]);

  return [
    ...new Set(
      rawGenres
        .map((genre) => String(genre).trim())
        .filter(Boolean)
        .filter(
          (genre) =>
            !formatLabels.has(
              genre
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "")
                .toLowerCase()
                .trim()
            )
        ),
    ),
  ];
}

// Genera un ID estable para que las siguientes importaciones
// actualicen el mismo documento.
function stableDocumentId(project, index) {
  const original = cleanString(project.id, "");
  const base =
    original ||
    cleanString(project.title, `proyecto-${index + 1}`);

  const slug = base
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);

  return `seed_${slug || index + 1}`;
}

async function seedProjects() {
  if (!Array.isArray(projectsData)) {
    throw new Error(
      "projects.json debe contener un array de proyectos."
    );
  }

  console.log(
    `Preparando ${projectsData.length} proyectos para OnlyToon...`
  );

  let imported = 0;
  let skipped = 0;
  let failed = 0;

  for (let index = 0; index < projectsData.length; index += 1) {
    const project = projectsData[index] || {};
    const title = cleanString(project.title, "");

    const youtubeId = getYouTubeId(
      project.youtubeId ||
        project.url ||
        project.youtubeUrl
    );

    if (!title) {
      console.warn(
        `Omitido el registro ${index + 1}: no tiene título.`
      );
      skipped += 1;
      continue;
    }

    if (!youtubeId) {
      console.warn(
        `Omitido "${title}": no se encontró un ID/enlace de YouTube válido.`
      );
      skipped += 1;
      continue;
    }

    const genres = normalizeGenres(project);

    const creator = cleanString(
      project.creator ||
        project.creatorName ||
        project.channelTitle,
      "Creador invitado"
    );

    const documentId = stableDocumentId(project, index);
    const projectRef = doc(db, "projects", documentId);
    const format = normalizeFormat(project);

    const payload = {
      title,
      creator,
      creatorName: creator,
      youtubeId,

      url: cleanString(
        project.url,
        `https://www.youtube.com/watch?v=${youtubeId}`
      ),

      creatorChannel: cleanString(
        project.creatorChannel || project.channelUrl,
        ""
      ),

      patreonUrl: cleanString(project.patreonUrl, ""),

      thumbnail:
        cleanString(
          project.thumbnail || project.thumbnailUrl,
          ""
        ) ||
        `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg`,

      // Tipo de animación y formato son campos diferentes.
      type: normalizeType(project),

      // Los géneros no deben utilizarse para guardar el formato.
      genre: genres[0] || "General",
      genres,

      // Campo principal de formato.
      format,

      year: project.year
        ? String(project.year)
        : "",

      duration: cleanString(project.duration, "05:00"),
      description: cleanString(project.description, ""),
      isFeatured: Boolean(project.isFeatured),

      likesCount: Number.isFinite(Number(project.likesCount))
        ? Number(project.likesCount)
        : 0,

      seasons: Array.isArray(project.seasons)
        ? project.seasons
        : [],

      source: "seed",
      updatedAt: serverTimestamp(),
    };

    try {
      const existing = await getDoc(projectRef);

      if (existing.exists()) {
        // Actualiza los campos del seed sin sobrescribir el estado
        // de moderación ni otros campos ajenos a este script.
        await setDoc(projectRef, payload, { merge: true });

        console.log(
          `✓ Actualizado: ${title} | Formato: ${format} (${documentId})`
        );
      } else {
        // Los documentos nuevos se crean aprobados.
        await setDoc(projectRef, {
          ...payload,
          status: "approved",
          rejectionReason: "",
          moderatorMessage: "",
          createdAt: project.createdAt || serverTimestamp(),
        });

        console.log(
          `✓ Importado: ${title} | Formato: ${format} (${documentId})`
        );
      }

      imported += 1;
    } catch (error) {
      failed += 1;

      console.error(
        `✕ Error al guardar "${title}" (${documentId}):`,
        error
      );
    }
  }

  console.log(
    `Carga terminada. Importados/actualizados: ${imported}. ` +
      `Omitidos: ${skipped}. Errores: ${failed}.`
  );

  if (failed > 0) {
    process.exitCode = 1;
  }
}

seedProjects().catch((error) => {
  console.error("Falló la carga inicial de proyectos:", error);
  process.exitCode = 1;
});