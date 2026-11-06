import { createHash } from 'node:crypto';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldPath, FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { onDocumentCreated, onDocumentUpdated, onDocumentDeleted } from 'firebase-functions/v2/firestore';
import { setGlobalOptions } from 'firebase-functions/v2';
import { onSchedule } from 'firebase-functions/v2/scheduler';

initializeApp();
setGlobalOptions({ region: 'europe-west1', maxInstances: 10 });

const db = getFirestore();
const auth = getAuth();
const ADMIN_EMAILS = new Set(['roman82ap@gmail.com', 'thelastopositor@gmail.com']);
const MESSAGE_MAX_LENGTH = 500;
const MESSAGE_BURST_LIMIT = 3;
const MESSAGE_WINDOW_MS = 10 * 60 * 1000;
const MESSAGE_WINDOW_LIMIT = 12;
const URL_PATTERN = /(?:https?:\/\/|www\.|mailto:|[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}|(?:^|\s)[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/\S*)?)/i;

const requireUser = request => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Inicia sesión para realizar esta acción.');
  return request.auth;
};

const isModerator = authContext => ADMIN_EMAILS.has(String(authContext.token.email || '').toLowerCase());

const cleanText = (value, maxLength) => {
  if (typeof value !== 'string') throw new HttpsError('invalid-argument', 'El texto enviado no es válido.');
  const text = value.trim();
  if (!text || text.length > maxLength) throw new HttpsError('invalid-argument', `El texto debe tener entre 1 y ${maxLength} caracteres.`);
  return text;
};

const notificationRef = (uid, id) => db.collection('users').doc(uid).collection('notifications').doc(id);

/** Devuelve el portafolio público sin exponer el correo privado del creador; incluye documentos antiguos por email. */
export const getCreatorProjects = onCall(async request => {
  const targetUid = String(request.data?.targetUid || '');
  if (!targetUid) throw new HttpsError('invalid-argument', 'Falta el identificador del creador.');
  const profileSnapshot = await db.collection('publicProfiles').doc(targetUid).get();
  if (!profileSnapshot.exists) throw new HttpsError('not-found', 'No se encontró el perfil público.');
  const userSnapshot = await db.collection('users').doc(targetUid).get();
  const email = String(userSnapshot.data()?.email || '').toLowerCase();
  const queries = [db.collection('projects').where('creatorId', '==', targetUid).get()];
  if (email) {
    queries.push(db.collection('projects').where('creatorEmail', '==', email).get());
    queries.push(db.collection('projects').where('authorEmail', '==', email).get());
  }
  const canInspectCounts = request.auth?.uid === targetUid || isModerator(request.auth);
  const [snapshots, jobsById, jobsByEmail, topicsById, topicsByEmail, commentsSnapshot] = await Promise.all([
    Promise.all(queries),
    canInspectCounts ? db.collection('jobListings').where('authorId', '==', targetUid).get() : Promise.resolve({ docs: [] }),
    canInspectCounts && email ? db.collection('jobListings').where('authorEmail', '==', email).get() : Promise.resolve({ docs: [] }),
    canInspectCounts ? db.collection('discussions').where('authorId', '==', targetUid).get() : Promise.resolve({ docs: [] }),
    canInspectCounts && email ? db.collection('discussions').where('authorEmail', '==', email).get() : Promise.resolve({ docs: [] }),
    canInspectCounts ? db.collectionGroup('comments').where('authorId', '==', targetUid).get() : Promise.resolve({ size: 0 })
  ]);
  const jobsMap = new Map([...jobsById.docs, ...jobsByEmail.docs].filter(item => !item.data().authorId || item.data().authorId === targetUid).map(item => [item.id, item]));
  const topicsMap = new Map([...topicsById.docs, ...topicsByEmail.docs].filter(item => !item.data().authorId || item.data().authorId === targetUid).map(item => [item.id, item]));
  const docs = new Map();
  for (const snapshot of snapshots) {
    for (const item of snapshot.docs) {
      const data = item.data();
      if (data.creatorId && data.creatorId !== targetUid) continue;
      docs.set(item.id, { id: item.id, ...data });
    }
  }
  const all = [...docs.values()];
  const approved = all.filter(project => project.status === 'approved').map(project => ({
    id: project.id,
    title: project.title || '',
    creatorName: project.creatorName || project.creator || '',
    format: project.format || '',
    year: project.year || '',
    thumbnail: project.thumbnail || '',
    youtubeId: project.youtubeId || '',
    creatorPatreonSupporter: project.creatorPatreonSupporter === true,
    hasHonorFrame: project.hasHonorFrame === true,
    createdAt: typeof project.createdAt?.toMillis === 'function' ? project.createdAt.toMillis() : (typeof project.createdAt === 'number' ? project.createdAt : (Date.parse(project.createdAt || '') || 0))
  }));
  approved.sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
  return { totalOwnedCount: all.length, jobsCount: jobsMap.size, discussionsCount: topicsMap.size, commentsCount: commentsSnapshot.size, projects: approved };
});

/** Registra como máximo una visita diaria por cuenta o IP; nunca guarda la IP en claro. */
export const recordProjectView = onCall(async request => {
  const projectId = String(request.data?.projectId || '');
  if (!projectId) throw new HttpsError('invalid-argument', 'Falta el proyecto.');
  const rawIp = request.rawRequest?.ip || String(request.rawRequest?.headers?.['x-forwarded-for'] || '').split(',')[0].trim();
  const viewerKey = request.auth?.uid || rawIp;
  if (!viewerKey) return { counted: false, viewsCount: 0 };
  const day = new Date().toISOString().slice(0, 10);
  const viewerHash = createHash('sha256').update(`${viewerKey}:${day}`).digest('hex');
  const projectRef = db.collection('projects').doc(projectId);
  const viewRef = projectRef.collection('views').doc(viewerHash);
  return db.runTransaction(async transaction => {
    const [projectSnapshot, viewSnapshot] = await Promise.all([transaction.get(projectRef), transaction.get(viewRef)]);
    if (!projectSnapshot.exists || projectSnapshot.data().status !== 'approved') throw new HttpsError('not-found', 'El proyecto no está disponible.');
    const currentCount = Number(projectSnapshot.data().viewsCount || 0);
    if (viewSnapshot.exists) return { counted: false, viewsCount: currentCount };
    transaction.create(viewRef, { createdAt: FieldValue.serverTimestamp() });
    transaction.update(projectRef, { viewsCount: FieldValue.increment(1) });
    return { counted: true, viewsCount: currentCount + 1 };
  });
});

/** Like único e irreversible por UID y proyecto. La transacción se ejecuta con Admin SDK. */
export const likeProject = onCall(async request => {
  const caller = requireUser(request);
  const projectId = String(request.data?.projectId || '');
  if (!projectId) throw new HttpsError('invalid-argument', 'Falta el proyecto.');
  const projectRef = db.collection('projects').doc(projectId);
  const likeRef = projectRef.collection('likes').doc(caller.uid);
  const result = await db.runTransaction(async transaction => {
    const [projectSnapshot, likeSnapshot] = await Promise.all([
      transaction.get(projectRef),
      transaction.get(likeRef)
    ]);
    if (!projectSnapshot.exists || projectSnapshot.data().status !== 'approved') {
      throw new HttpsError('not-found', 'El proyecto no está disponible.');
    }
    if (likeSnapshot.exists) return { liked: false, likesCount: Number(projectSnapshot.data().likesCount || 0) };
    const likesCount = Number(projectSnapshot.data().likesCount || 0) + 1;
    transaction.create(likeRef, {
      userId: caller.uid,
      createdAt: FieldValue.serverTimestamp()
    });
    transaction.update(projectRef, { likesCount: FieldValue.increment(1) });
    return { liked: true, likesCount };
  });
  return result;
});

/** Mensajes privados: solo texto, 500 caracteres, sin enlaces, 3 mensajes pendientes de respuesta y control de frecuencia. */
export const sendDirectMessage = onCall(async request => {
  const caller = requireUser(request);
  const senderUid = caller.uid;
  const recipientUid = String(request.data?.recipientUid || '');
  const text = cleanText(request.data?.text, MESSAGE_MAX_LENGTH);

  if (!recipientUid || recipientUid === senderUid) throw new HttpsError('invalid-argument', 'Selecciona otro usuario.');
  if (URL_PATTERN.test(text)) throw new HttpsError('invalid-argument', 'No se permiten enlaces en los mensajes.');

  const [senderSnapshot, recipientSnapshot] = await Promise.all([
    db.collection('users').doc(senderUid).get(),
    db.collection('users').doc(recipientUid).get()
  ]);
  if (!senderSnapshot.exists || !recipientSnapshot.exists) throw new HttpsError('not-found', 'No se encontró una de las cuentas.');

  const participants = [senderUid, recipientUid].sort();
  const conversationId = participants.join('__');
  const conversationRef = db.collection('conversations').doc(conversationId);
  const messageRef = conversationRef.collection('messages').doc();
  const senderBlockRef = db.collection('users').doc(senderUid).collection('blockedUsers').doc(recipientUid);
  const recipientBlockRef = db.collection('users').doc(recipientUid).collection('blockedUsers').doc(senderUid);
  const rateRef = db.collection('users').doc(senderUid).collection('private').doc('messageRateLimit');
  const recipientNotificationRef = notificationRef(recipientUid, messageRef.id);

  await db.runTransaction(async transaction => {
    const [conversationSnapshot, senderBlock, recipientBlock, rateSnapshot] = await Promise.all([
      transaction.get(conversationRef),
      transaction.get(senderBlockRef),
      transaction.get(recipientBlockRef),
      transaction.get(rateRef)
    ]);
    if (senderBlock.exists || recipientBlock.exists) throw new HttpsError('permission-denied', 'No se puede enviar el mensaje porque existe un bloqueo entre estas cuentas.');

    const conversation = conversationSnapshot.exists ? conversationSnapshot.data() : null;
    if (conversation && (!Array.isArray(conversation.participants) || !participants.every(uid => conversation.participants.includes(uid)))) {
      throw new HttpsError('permission-denied', 'La conversación no es válida.');
    }
    const consecutiveCount = conversation?.lastSenderId === senderUid ? Number(conversation.consecutiveCount || 0) : 0;
    if (consecutiveCount >= MESSAGE_BURST_LIMIT) {
      throw new HttpsError('failed-precondition', 'Has enviado tres mensajes seguidos. Espera a que la otra persona responda.');
    }

    const now = Date.now();
    const rate = rateSnapshot.exists ? rateSnapshot.data() : {};
    const windowStart = Number(rate.windowStart || 0);
    const currentCount = now - windowStart < MESSAGE_WINDOW_MS ? Number(rate.count || 0) : 0;
    if (currentCount >= MESSAGE_WINDOW_LIMIT) {
      throw new HttpsError('resource-exhausted', 'Has alcanzado el límite temporal de mensajes. Inténtalo más tarde.');
    }

    transaction.set(conversationRef, {
      participants,
      createdAt: conversation?.createdAt || FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      lastMessage: text.slice(0, 120),
      lastSenderId: senderUid,
      consecutiveCount: consecutiveCount + 1,
      participantNames: {
        ...(conversation?.participantNames || {}),
        [senderUid]: senderSnapshot.data().name || 'Usuario',
        [recipientUid]: recipientSnapshot.data().name || 'Usuario'
      },
      participantPhotos: {
        ...(conversation?.participantPhotos || {}),
        [senderUid]: senderSnapshot.data().photo || '',
        [recipientUid]: recipientSnapshot.data().photo || ''
      }
    }, { merge: true });
    transaction.set(messageRef, {
      senderId: senderUid,
      recipientId: recipientUid,
      text,
      createdAt: FieldValue.serverTimestamp()
    });
    transaction.set(rateRef, {
      windowStart: currentCount ? windowStart : now,
      count: currentCount + 1
    });
    transaction.set(recipientNotificationRef, {
      type: 'message',
      title: 'Nuevo mensaje',
      body: text.slice(0, 100),
      conversationId,
      senderId: senderUid,
      createdAt: FieldValue.serverTimestamp(),
      read: false
    });
  });

  return { conversationId, messageId: messageRef.id };
});

/** Marca como leída una notificación de la propia cuenta. */
export const markNotificationRead = onCall(async request => {
  const caller = requireUser(request);
  const notificationId = String(request.data?.notificationId || '');
  if (!notificationId) throw new HttpsError('invalid-argument', 'Falta la notificación.');
  const ref = notificationRef(caller.uid, notificationId);
  const snapshot = await ref.get();
  if (!snapshot.exists) throw new HttpsError('not-found', 'No se encontró la notificación.');
  await ref.update({ read: true, readAt: FieldValue.serverTimestamp() });
  return { read: true };
});

/** El moderador activa o retira el distintivo Patreon y sincroniza todos los proyectos del creador. */
export const setPatreonSupporter = onCall(async request => {
  const caller = requireUser(request);
  if (!isModerator(caller)) throw new HttpsError('permission-denied', 'Solo el equipo de moderación puede cambiar este distintivo.');
  const targetUid = String(request.data?.targetUid || '');
  const enabled = request.data?.enabled === true;
  if (!targetUid) throw new HttpsError('invalid-argument', 'Falta el usuario.');
  const profileRef = db.collection('publicProfiles').doc(targetUid);
  const profileSnapshot = await profileRef.get();
  if (!profileSnapshot.exists) throw new HttpsError('not-found', 'No se encontró el perfil público.');
  const projectsSnapshot = await db.collection('projects').where('creatorProfileId', '==', targetUid).get();
  const refs = [profileRef, db.collection('users').doc(targetUid)];
  for (let index = 0; index < refs.length; index += 1) {
    const batch = db.batch();
    batch.set(refs[index], { isPatreonSupporter: enabled, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    await batch.commit();
  }
  for (let offset = 0; offset < projectsSnapshot.docs.length; offset += 450) {
    const batch = db.batch();
    projectsSnapshot.docs.slice(offset, offset + 450).forEach(projectDoc => {
      batch.update(projectDoc.ref, { creatorPatreonSupporter: enabled });
    });
    await batch.commit();
  }
  await db.collection('moderationAudit').add({
    action: enabled ? 'patreon_supporter_enabled' : 'patreon_supporter_disabled',
    actorUid: caller.uid,
    targetUid,
    projectsUpdated: projectsSnapshot.size,
    createdAt: FieldValue.serverTimestamp()
  });
  return { enabled, projectsUpdated: projectsSnapshot.size };
});

/** Bloqueo privado entre dos usuarios. */
export const setUserBlock = onCall(async request => {
  const caller = requireUser(request);
  const targetUid = String(request.data?.targetUid || '');
  const blocked = request.data?.blocked === true;
  if (!targetUid || targetUid === caller.uid) throw new HttpsError('invalid-argument', 'El usuario indicado no es válido.');
  const ref = db.collection('users').doc(caller.uid).collection('blockedUsers').doc(targetUid);
  if (blocked) {
    await ref.set({ blockedUid: targetUid, createdAt: FieldValue.serverTimestamp() });
  } else {
    await ref.delete();
  }
  return { blocked };
});

/** Denuncias de mensajes, perfiles o proyectos; solo moderación puede leerlas. */
export const reportContent = onCall(async request => {
  const caller = requireUser(request);
  const type = String(request.data?.type || '');
  const reason = cleanText(request.data?.reason, 120);
  const details = typeof request.data?.details === 'string' ? request.data.details.trim().slice(0, 1500) : '';
  if (!['message', 'user', 'project'].includes(type)) throw new HttpsError('invalid-argument', 'Tipo de denuncia no válido.');

  const reporterSnapshot = await db.collection('users').doc(caller.uid).get();
  const report = {
    type,
    reason,
    details,
    reporterUid: caller.uid,
    reporterName: reporterSnapshot.exists ? (reporterSnapshot.data().name || 'Usuario') : 'Usuario',
    reporterEmail: reporterSnapshot.exists ? (reporterSnapshot.data().email || '') : '',
    status: 'pending',
    createdAt: FieldValue.serverTimestamp()
  };

  if (type === 'user') {
    const targetUid = String(request.data?.targetUid || '');
    if (!targetUid || targetUid === caller.uid) throw new HttpsError('invalid-argument', 'El usuario denunciado no es válido.');
    report.targetUid = targetUid;
  } else if (type === 'project') {
    const projectId = String(request.data?.projectId || '');
    if (!projectId) throw new HttpsError('invalid-argument', 'Falta el proyecto denunciado.');
    const projectSnapshot = await db.collection('projects').doc(projectId).get();
    if (!projectSnapshot.exists) throw new HttpsError('not-found', 'No se encontró el proyecto denunciado.');
    const project = projectSnapshot.data();
    report.projectId = projectId;
    report.projectTitle = project.title || 'Proyecto sin título';
    report.youtubeId = project.youtubeId || '';
    report.targetUid = project.creatorId || null;
    if (report.targetUid) {
      const targetSnapshot = await db.collection('users').doc(report.targetUid).get();
      report.targetName = targetSnapshot.exists ? (targetSnapshot.data().name || project.creatorName || 'Creador') : (project.creatorName || 'Creador');
    }
  } else {
    const conversationId = String(request.data?.conversationId || '');
    const messageId = String(request.data?.messageId || '');
    if (!conversationId || !messageId) throw new HttpsError('invalid-argument', 'Falta el mensaje denunciado.');
    const conversationSnapshot = await db.collection('conversations').doc(conversationId).get();
    if (!conversationSnapshot.exists || !conversationSnapshot.data().participants?.includes(caller.uid)) {
      throw new HttpsError('permission-denied', 'No tienes acceso a esa conversación.');
    }
    const messageSnapshot = await db.collection('conversations').doc(conversationId).collection('messages').doc(messageId).get();
    if (!messageSnapshot.exists) throw new HttpsError('not-found', 'No se encontró el mensaje.');
    report.conversationId = conversationId;
    report.messageId = messageId;
    report.targetUid = messageSnapshot.data().senderId;
    const targetSnapshot = await db.collection('users').doc(report.targetUid).get();
    report.targetName = targetSnapshot.exists ? (targetSnapshot.data().name || 'Usuario') : 'Cuenta no disponible';
    const messagesRef = db.collection('conversations').doc(conversationId).collection('messages');
    const targetMessage = messageSnapshot.data();
    const [beforeSnapshot, afterSnapshot] = await Promise.all([
      messagesRef.where('createdAt', '<=', targetMessage.createdAt).orderBy('createdAt', 'desc').limit(6).get(),
      messagesRef.where('createdAt', '>', targetMessage.createdAt).orderBy('createdAt', 'asc').limit(6).get()
    ]);
    const contextDocs = [...beforeSnapshot.docs.reverse(), ...afterSnapshot.docs];
    report.contextMessages = contextDocs.map(item => ({
      id: item.id,
      senderId: item.data().senderId,
      text: item.data().text,
      createdAt: item.data().createdAt || null
    }));
  }

  if (type === 'user') {
    const targetSnapshot = await db.collection('users').doc(report.targetUid).get();
    report.targetName = targetSnapshot.exists ? (targetSnapshot.data().name || 'Usuario') : 'Cuenta no disponible';
  }
  const ref = await db.collection('reports').add(report);
  return { reportId: ref.id };
});

/** Aprobación y rechazo de proyectos con registro de quién tomó la decisión. */
export const moderateProject = onCall(async request => {
  const caller = requireUser(request);
  if (!isModerator(caller)) throw new HttpsError('permission-denied', 'Solo el equipo de moderación puede moderar proyectos.');
  const projectId = String(request.data?.projectId || '');
  const status = String(request.data?.status || '');
  const reason = typeof request.data?.reason === 'string' ? request.data.reason.trim().slice(0, 1000) : '';
  if (!projectId || !['approved', 'rejected'].includes(status)) throw new HttpsError('invalid-argument', 'La decisión de moderación no es válida.');
  const ref = db.collection('projects').doc(projectId);
  const snapshot = await ref.get();
  if (!snapshot.exists) throw new HttpsError('not-found', 'No se encontró el proyecto.');
  await ref.update({
    status,
    ...(status === 'rejected' ? { rejectionReason: reason || 'El contenido no cumple con nuestras directrices comunitarias.', moderatorMessage: reason || 'El contenido no cumple con nuestras directrices comunitarias.' } : {}),
    moderatedAt: FieldValue.serverTimestamp(),
    moderatedBy: caller.uid
  });
  await db.collection('moderationAudit').add({
    action: status === 'approved' ? 'project_approved' : 'project_rejected',
    actorUid: caller.uid,
    projectId,
    reason,
    createdAt: FieldValue.serverTimestamp()
  });
  return { status };
});

/** Cambia el estado de Destacado mediante servidor y registra la acción. */
export const setProjectFeatured = onCall(async request => {
  const caller = requireUser(request);
  if (!isModerator(caller)) throw new HttpsError('permission-denied', 'Solo el equipo de moderación puede gestionar Destacados.');
  const projectId = String(request.data?.projectId || '');
  const featured = request.data?.featured === true;
  if (!projectId) throw new HttpsError('invalid-argument', 'Falta el proyecto.');
  const ref = db.collection('projects').doc(projectId);
  const snapshot = await ref.get();
  if (!snapshot.exists || snapshot.data().status !== 'approved') throw new HttpsError('not-found', 'El proyecto no está aprobado o no existe.');
  await ref.update({ isFeatured: featured });
  await db.collection('moderationAudit').add({ action: featured ? 'project_featured' : 'project_unfeatured', actorUid: caller.uid, projectId, createdAt: FieldValue.serverTimestamp() });
  return { featured };
});

/** Escudo de Honor: cada proyecto aprobado se gestiona individualmente por moderación. */
export const setProjectHonor = onCall(async request => {
  const caller = requireUser(request);
  if (!isModerator(caller)) throw new HttpsError('permission-denied', 'Solo moderación puede gestionar Escudo de Honor.');
  const projectId = String(request.data?.projectId || '').trim();
  if (!projectId || projectId.length > 150 || projectId.includes('/')) throw new HttpsError('invalid-argument', 'Proyecto inválido.');
  if (typeof request.data?.enabled !== 'boolean') throw new HttpsError('invalid-argument', 'Indica si deseas activar o desactivar.');
  const enabled = request.data.enabled;
  const projectRef = db.collection('projects').doc(projectId);
  const result = await db.runTransaction(async transaction => {
    const projectSnap = await transaction.get(projectRef);
    if (!projectSnap.exists || projectSnap.data().status !== 'approved') throw new HttpsError('failed-precondition', 'El proyecto debe estar aprobado.');
    const creatorId = String(projectSnap.data().creatorId || '').trim();
    if (!creatorId || creatorId.includes('/')) throw new HttpsError('failed-precondition', 'Este proyecto no tiene una cuenta de creador vinculada.');
    transaction.update(projectRef, { hasHonorFrame: enabled });
    return { creatorId };
  });
  await db.collection('moderationAudit').add({
    action: enabled ? 'project_honor_enabled' : 'project_honor_disabled',
    actorUid: caller.uid, projectId, creatorId: result.creatorId,
    createdAt: FieldValue.serverTimestamp()
  });
  return { enabled, ...result };
});

/** Eliminación administrativa de un proyecto con registro de auditoría. */
export const deleteProjectAsModerator = onCall(async request => {
  const caller = requireUser(request);
  if (!isModerator(caller)) throw new HttpsError('permission-denied', 'Solo el equipo de moderación puede eliminar proyectos.');
  const projectId = String(request.data?.projectId || '');
  const reason = typeof request.data?.reason === 'string' ? request.data.reason.trim().slice(0, 500) : '';
  if (!projectId) throw new HttpsError('invalid-argument', 'Falta el proyecto.');
  const ref = db.collection('projects').doc(projectId);
  const snapshot = await ref.get();
  if (!snapshot.exists) throw new HttpsError('not-found', 'No se encontró el proyecto.');
  const projectTitle = snapshot.data().title || '';
  await db.recursiveDelete(ref);
  await db.collection('moderationAudit').add({ action: 'project_deleted', actorUid: caller.uid, projectId, projectTitle, reason, createdAt: FieldValue.serverTimestamp() });
  return { deleted: true };
});

/** El moderador actualiza el estado de una denuncia y deja constancia de la revisión. */
export const reviewReport = onCall(async request => {
  const caller = requireUser(request);
  if (!isModerator(caller)) throw new HttpsError('permission-denied', 'Solo el equipo de moderación puede revisar denuncias.');
  const reportId = String(request.data?.reportId || '');
  const collectionName = request.data?.collectionName === 'jobReports' ? 'jobReports' : 'reports';
  const status = String(request.data?.status || '');
  const note = typeof request.data?.note === 'string' ? request.data.note.trim().slice(0, 1000) : '';
  if (!reportId || !['pending', 'reviewing', 'resolved'].includes(status)) throw new HttpsError('invalid-argument', 'La actualización de la denuncia no es válida.');
  const ref = db.collection(collectionName).doc(reportId);
  const snapshot = await ref.get();
  if (!snapshot.exists) throw new HttpsError('not-found', 'No se encontró la denuncia.');
  await ref.update({
    status,
    moderatorNote: note,
    reviewedBy: caller.uid,
    reviewedAt: FieldValue.serverTimestamp(),
    retentionExpiresAt: status === 'resolved'
      ? Timestamp.fromMillis(Date.now() + 180 * 24 * 60 * 60 * 1000)
      : FieldValue.delete()
  });
  await db.collection('moderationAudit').add({ action: 'report_reviewed', actorUid: caller.uid, reportId, collectionName, status, createdAt: FieldValue.serverTimestamp() });
  return { updated: true };
});

/** El moderador crea un aviso; el trigger lo distribuye a todos los usuarios, también inactivos. */
export const sendBroadcast = onCall(async request => {
  const caller = requireUser(request);
  if (!isModerator(caller)) throw new HttpsError('permission-denied', 'Solo el equipo de moderación puede enviar avisos generales.');
  const title = cleanText(request.data?.title, 120);
  const body = cleanText(request.data?.body, 2000);
  const type = ['news', 'event', 'update', 'contest', 'general'].includes(request.data?.type) ? request.data.type : 'general';
  const rawTarget = request.data?.target && typeof request.data.target === 'object' ? request.data.target : null;
  const target = rawTarget && (typeof rawTarget.newsId === 'string' || typeof rawTarget.projectId === 'string')
    ? (rawTarget.newsId ? { newsId: rawTarget.newsId.slice(0, 200) } : { projectId: rawTarget.projectId.slice(0, 200) })
    : null;
  const ref = await db.collection('broadcasts').add({
    title, body, type,
    target,
    createdBy: caller.uid,
    createdAt: FieldValue.serverTimestamp(),
    status: 'queued'
  });
  await db.collection('moderationAudit').add({ action: 'broadcast_created', actorUid: caller.uid, broadcastId: ref.id, type, createdAt: FieldValue.serverTimestamp() });
  return { broadcastId: ref.id };
});

/** Limpieza diaria: las denuncias resueltas se conservan 180 días desde su resolución. Las pendientes no se borran. */
export const purgeExpiredReports = onSchedule({ schedule: 'every day 03:00', timeZone: 'Europe/Madrid', region: 'europe-west1', maxInstances: 1 }, async () => {
  const now = Timestamp.now();
  let deletedCount = 0;
  for (const collectionName of ['reports', 'jobReports']) {
    let cursor = null;
    while (true) {
      let pageQuery = db.collection(collectionName)
        .where('retentionExpiresAt', '<=', now)
        .orderBy('retentionExpiresAt')
        .limit(400);
      if (cursor) pageQuery = pageQuery.startAfter(cursor);
      const page = await pageQuery.get();
      if (page.empty) break;
      const expired = page.docs.filter(item => item.data().status === 'resolved');
      if (expired.length) {
        const batch = db.batch();
        expired.forEach(item => batch.delete(item.ref));
        await batch.commit();
        deletedCount += expired.length;
      }
      cursor = page.docs[page.docs.length - 1];
      if (page.size < 400) break;
    }
  }
  const viewCutoff = Timestamp.fromMillis(Date.now() - 30 * 24 * 60 * 60 * 1000);
  let deletedViews = 0;
  while (true) {
    const oldViews = await db.collectionGroup('views').where('createdAt', '<', viewCutoff).limit(400).get();
    if (oldViews.empty) break;
    const batch = db.batch();
    oldViews.docs.forEach(item => batch.delete(item.ref));
    await batch.commit();
    deletedViews += oldViews.size;
    if (oldViews.size < 400) break;
  }
  if (deletedCount || deletedViews) await db.collection('moderationAudit').add({ action: 'scheduled_data_cleanup', expiredReportsDeleted: deletedCount, oldProjectViewsDeleted: deletedViews, createdAt: FieldValue.serverTimestamp() });
  return { deletedCount, deletedViews };
});

export const distributeBroadcast = onDocumentCreated('broadcasts/{broadcastId}', async event => {
  const broadcast = event.data?.data();
  if (!broadcast || broadcast.status !== 'queued') return;
  const users = db.collection('users');
  let cursor = null;
  let total = 0;
  while (true) {
    let query = users.orderBy(FieldPath.documentId()).limit(400);
    if (cursor) query = query.startAfter(cursor);
    const page = await query.get();
    if (page.empty) break;
    const batch = db.batch();
    for (const userDoc of page.docs) {
      batch.set(notificationRef(userDoc.id, event.params.broadcastId), {
        type: 'broadcast',
        broadcastType: broadcast.type || 'general',
        title: broadcast.title,
        body: broadcast.body,
        target: broadcast.target || null,
        createdAt: broadcast.createdAt || FieldValue.serverTimestamp(),
        read: false,
        broadcastId: event.params.broadcastId
      });
      total += 1;
    }
    await batch.commit();
    cursor = page.docs[page.docs.length - 1];
    if (page.size < 400) break;
  }
  await event.data.ref.update({ status: 'sent', recipientCount: total, sentAt: FieldValue.serverTimestamp() });
});

/** Sincroniza el distintivo desde el perfil público, nunca desde un valor enviado por el navegador. */
export const syncProjectSupporterBadge = onDocumentCreated('projects/{projectId}', async event => {
  const project = event.data?.data();
  if (!project?.creatorProfileId) return;
  const profileSnapshot = await db.collection('publicProfiles').doc(project.creatorProfileId).get();
  await event.data.ref.update({ creatorPatreonSupporter: profileSnapshot.exists && profileSnapshot.data().isPatreonSupporter === true });
});

/** Aviso automático cuando el moderador aprueba o rechaza un proyecto. */
export const notifyProjectModeration = onDocumentUpdated('projects/{projectId}', async event => {
  const before = event.data?.before.data();
  const after = event.data?.after.data();
  if (!before || !after || before.status === after.status) return;
  if (!['approved', 'rejected'].includes(after.status)) return;
  let recipientUid = after.creatorId || '';
  if (!recipientUid && after.creatorEmail) {
    const ownerSnapshot = await db.collection('users').where('email', '==', String(after.creatorEmail).toLowerCase()).limit(1).get();
    if (!ownerSnapshot.empty) recipientUid = ownerSnapshot.docs[0].id;
  }
  if (!recipientUid) return;
  const approved = after.status === 'approved';
  const id = `project-${event.params.projectId}-${after.status}`;
  await notificationRef(recipientUid, id).set({
    type: 'project_moderation',
    title: approved ? 'Tu proyecto ha sido aprobado' : 'Tu proyecto no ha sido aprobado',
    body: approved ? `«${after.title || 'Tu proyecto'}» ya está publicado.` : (after.moderatorMessage || after.rejectionReason || 'Revisa las observaciones del equipo de moderación.'),
    projectId: event.params.projectId,
    createdAt: FieldValue.serverTimestamp(),
    read: false
  });
});

const removeProfileAsset = async path => {
  if (!path) return;
  await getStorage().bucket().file(path).delete({ ignoreNotFound: true }).catch(error => console.error('No se pudo limpiar un archivo de perfil:', path, error));
};

export const cleanupPublicProfileAssets = onDocumentUpdated('publicProfiles/{uid}', async event => {
  const before = event.data?.before?.data() || {};
  const after = event.data?.after?.data() || {};
  const nextPaths = new Set([after.photoPath, after.bannerPath].filter(Boolean));
  const oldPaths = [before.photoPath, before.bannerPath].filter(Boolean).filter(path => !nextPaths.has(path));
  await Promise.all(oldPaths.map(removeProfileAsset));
});

export const deletePublicProfileAssets = onDocumentDeleted('publicProfiles/{uid}', async event => {
  const data = event.data?.data() || {};
  await Promise.all([data.photoPath, data.bannerPath].filter(Boolean).map(removeProfileAsset));
});

const managedStoragePaths = (data, collectionName) => {
  if (!data) return [];
  if (collectionName === 'news') return Array.isArray(data.imagePaths) ? data.imagePaths.filter(Boolean) : [];
  if (collectionName === 'resources') return data.imagePath ? [data.imagePath] : [];
  if (collectionName === 'carouselItems') return data.thumbnailPath ? [data.thumbnailPath] : [];
  return [];
};

const removeManagedStorageFiles = async paths => {
  if (!paths.length) return;
  const bucket = getStorage().bucket();
  await Promise.all(paths.map(path => bucket.file(path).delete({ ignoreNotFound: true }).catch(error => {
    console.error('No se pudo eliminar un archivo administrado de Storage:', path, error);
  })));
};

const recordManagedContentAction = async (event, collectionName, action) => {
  const before = event.data?.before?.data?.() || null;
  const after = event.data?.after?.data?.() || null;
  const data = after || event.data?.data?.() || before || {};
  if (action.endsWith('_deleted')) {
    await removeManagedStorageFiles(managedStoragePaths(data, collectionName));
  } else if (action.endsWith('_updated') && before && after) {
    const currentPaths = new Set(managedStoragePaths(after, collectionName));
    const removedPaths = managedStoragePaths(before, collectionName).filter(path => !currentPaths.has(path));
    await removeManagedStorageFiles(removedPaths);
  }
  await db.collection('moderationAudit').add({
    action,
    collectionName,
    contentId: event.params.contentId,
    title: data.title || '',
    actorUid: data.updatedBy || data.createdBy || null,
    createdAt: FieldValue.serverTimestamp()
  });
};

export const auditNewsCreated = onDocumentCreated('news/{contentId}', event => recordManagedContentAction(event, 'news', 'news_created'));
export const auditNewsUpdated = onDocumentUpdated('news/{contentId}', event => recordManagedContentAction(event, 'news', 'news_updated'));
export const auditNewsDeleted = onDocumentDeleted('news/{contentId}', event => recordManagedContentAction(event, 'news', 'news_deleted'));
export const auditResourceCreated = onDocumentCreated('resources/{contentId}', event => recordManagedContentAction(event, 'resources', 'resource_created'));
export const auditResourceUpdated = onDocumentUpdated('resources/{contentId}', event => recordManagedContentAction(event, 'resources', 'resource_updated'));
export const auditResourceDeleted = onDocumentDeleted('resources/{contentId}', event => recordManagedContentAction(event, 'resources', 'resource_deleted'));
export const auditCarouselCreated = onDocumentCreated('carouselItems/{contentId}', event => recordManagedContentAction(event, 'carouselItems', 'carousel_item_created'));
export const auditCarouselUpdated = onDocumentUpdated('carouselItems/{contentId}', event => recordManagedContentAction(event, 'carouselItems', 'carousel_item_updated'));
export const auditCarouselDeleted = onDocumentDeleted('carouselItems/{contentId}', event => recordManagedContentAction(event, 'carouselItems', 'carousel_item_deleted'));

/** Eliminación de cuenta con retirada de proyectos propios y registro de moderación. */
export const deleteUserAccount = onCall({ timeoutSeconds: 540, memory: '1GiB' }, async request => {
  const caller = requireUser(request);
  const targetUid = String(request.data?.targetUid || caller.uid);
  const moderator = isModerator(caller);
  const selfDelete = targetUid === caller.uid;
  if (!selfDelete && !moderator) throw new HttpsError('permission-denied', 'No tienes permiso para eliminar esta cuenta.');
  if (!targetUid) throw new HttpsError('invalid-argument', 'Falta el identificador de la cuenta.');
  if (selfDelete) {
    const authTime = Number(caller.token.auth_time || 0);
    if (!authTime || Date.now() / 1000 - authTime > 10 * 60) {
      throw new HttpsError('failed-precondition', 'Por seguridad, vuelve a iniciar sesión antes de eliminar tu cuenta.');
    }
  }
  const reason = selfDelete ? 'Eliminación solicitada por el titular.' : cleanText(request.data?.reason, 500);
  const userRef = db.collection('users').doc(targetUid);
  const userSnapshot = await userRef.get();
  if (!userSnapshot.exists) throw new HttpsError('not-found', 'No se encontró la cuenta.');
  const userData = userSnapshot.data();
  const email = String(userData.email || '').toLowerCase();
  if (ADMIN_EMAILS.has(email) && !selfDelete) {
    throw new HttpsError('failed-precondition', 'Las cuentas de administrador no se pueden eliminar desde este panel.');
  }

  const [byUid, byEmail, jobsById, jobsByEmail, topicsById, topicsByEmail, authoredComments] = await Promise.all([
    db.collection('projects').where('creatorId', '==', targetUid).get(),
    email ? db.collection('projects').where('creatorEmail', '==', email).get() : Promise.resolve({ docs: [] }),
    db.collection('jobListings').where('authorId', '==', targetUid).get(),
    email ? db.collection('jobListings').where('authorEmail', '==', email).get() : Promise.resolve({ docs: [] }),
    db.collection('discussions').where('authorId', '==', targetUid).get(),
    email ? db.collection('discussions').where('authorEmail', '==', email).get() : Promise.resolve({ docs: [] }),
    db.collectionGroup('comments').where('authorId', '==', targetUid).get()
  ]);
  const ownedJobs = new Map([...jobsById.docs, ...jobsByEmail.docs].filter(item => !item.data().authorId || item.data().authorId === targetUid).map(item => [item.id, item.ref]));
  const ownedTopics = new Map([...topicsById.docs, ...topicsByEmail.docs].filter(item => !item.data().authorId || item.data().authorId === targetUid).map(item => [item.id, item.ref]));
  const projectRefs = new Map();
  for (const projectDoc of byUid.docs) projectRefs.set(projectDoc.id, projectDoc.ref);
  for (const projectDoc of byEmail.docs) {
    const projectData = projectDoc.data();
    // Compatibilidad con documentos antiguos sin creatorId; nunca borrar contenido con otro propietario UID.
    if (!projectData.creatorId || projectData.creatorId === targetUid) projectRefs.set(projectDoc.id, projectDoc.ref);
  }

  const auditRef = db.collection('moderationAudit').doc();
  await auditRef.set({
    action: 'account_deleted',
    actorUid: caller.uid,
    targetUid,
    reason,
    projectsDeleted: projectRefs.size,
    jobsDeleted: ownedJobs.size,
    discussionsDeleted: ownedTopics.size,
    commentsDeleted: authoredComments.size,
    createdAt: FieldValue.serverTimestamp()
  });

  // Retira comentarios del usuario de discusiones de otras personas antes de borrar sus propios temas.
  for (const commentDoc of authoredComments.docs) {
    const topicRef = commentDoc.ref.parent.parent;
    if (topicRef) {
      const topicSnapshot = await topicRef.get();
      if (topicSnapshot.exists) {
        const comments = Array.isArray(topicSnapshot.data().comments) ? topicSnapshot.data().comments : [];
        await topicRef.update({ comments: comments.filter(comment => comment.id !== commentDoc.id && comment.authorId !== targetUid) });
      }
    }
    await commentDoc.ref.delete();
  }

  for (const ref of [...projectRefs.values(), ...ownedJobs.values(), ...ownedTopics.values()]) {
    await db.recursiveDelete(ref);
  }

  // Elimina solo rutas de almacenamiento inequívocamente asociadas al UID.
  const bucket = getStorage().bucket();
  for (const prefix of [`users/${targetUid}/`, `avatars/${targetUid}/`]) {
    const [files] = await bucket.getFiles({ prefix });
    if (files.length) await Promise.all(files.map(file => file.delete().catch(error => {
      console.error('No se pudo borrar un archivo asociado al usuario:', file.name, error);
    })));
  }

  // Retira bloqueos recibidos por la cuenta eliminada, conservando el resto de datos de cada usuario.
  const incomingBlocks = await db.collectionGroup('blockedUsers').where('blockedUid', '==', targetUid).get();
  for (const blockDoc of incomingBlocks.docs) await blockDoc.ref.delete();

  await db.recursiveDelete(userRef);
  await db.collection('publicProfiles').doc(targetUid).delete().catch(() => {});
  await auth.deleteUser(targetUid);
  return { deleted: true, projectsDeleted: projectRefs.size, jobsDeleted: ownedJobs.size, discussionsDeleted: ownedTopics.size, auditId: auditRef.id };
});
