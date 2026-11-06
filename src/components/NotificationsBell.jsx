
import { useEffect, useMemo, useState } from 'react';
import { Bell, CheckCheck, MessageSquare, Newspaper, Video, X } from 'lucide-react';
import { collection, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../firebase';

const timestampValue = value => {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  return new Date(value).getTime() || 0;
};

const getNotificationTitle = notification => {
  if (notification.type === 'project_moderation') {
    const rejected =
      notification.title?.toLowerCase().includes('no ha sido aprobado') ||
      notification.title?.toLowerCase().includes('rechazado') ||
      notification.body?.toLowerCase().includes('no cumple') ||
      Boolean(notification.rejectionReason);

    return rejected
      ? 'Tu proyecto ha sido rechazado'
      : 'Tu proyecto ha sido aprobado';
  }

  return notification.title || 'Notificación';
};

const notificationIcon = type => {
  if (type === 'message') return <MessageSquare className="h-4 w-4 text-red-300" />;
  if (type === 'project_moderation') return <Video className="h-4 w-4 text-emerald-300" />;
  if (type === 'broadcast') return <Newspaper className="h-4 w-4 text-amber-300" />;
  return <Bell className="h-4 w-4 text-gray-300" />;
};

export default function NotificationsBell({ user, onOpenNotification }) {
  const [notifications, setNotifications] = useState([]);
  const [open, setOpen] = useState(false);
  const [marking, setMarking] = useState('');

  useEffect(() => {
    if (!user?.id) {
      setNotifications([]);
      return undefined;
    }

    return onSnapshot(
      collection(db, 'users', user.id, 'notifications'),
      snapshot => {
        const items = snapshot.docs.map(item => ({
          ...item.data(),
          id: item.id
        }));

        items.sort(
          (a, b) => timestampValue(b.createdAt) - timestampValue(a.createdAt)
        );

        setNotifications(items);
      },
      error => console.error('No se pudieron cargar las notificaciones:', error)
    );
  }, [user?.id]);

  const unreadCount = useMemo(
    () => notifications.filter(item => !item.read).length,
    [notifications]
  );

  const openNotification = async notification => {
    if (!notification.read) {
      setMarking(notification.id);

      try {
        const markRead = httpsCallable(functions, 'markNotificationRead');
        await markRead({ notificationId: notification.id });
      } catch (error) {
        console.error('No se pudo marcar la notificación como leída:', error);
      } finally {
        setMarking('');
      }
    }

    setOpen(false);
    onOpenNotification?.(notification);
  };

  if (!user?.id) return null;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(value => !value)}
        aria-label={`Notificaciones${unreadCount ? `, ${unreadCount} sin leer` : ''}`}
        aria-expanded={open}
        className="relative rounded-lg border border-[#2e2e34] p-2 text-gray-300 transition hover:bg-[#222226] hover:text-white"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-[80] mt-2 w-[min(92vw,380px)] overflow-hidden rounded-2xl border border-[#34343b] bg-[#17171b] shadow-2xl">
          <div className="flex items-center justify-between border-b border-[#2e2e34] p-4">
            <div>
              <h3 className="text-sm font-bold text-white">Notificaciones</h3>
              <p className="text-[11px] text-gray-500">{unreadCount} sin leer</p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Cerrar notificaciones"
              className="rounded-lg p-1.5 text-gray-400 hover:bg-[#292930] hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="max-h-[420px] overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="p-6 text-center text-sm text-gray-500">
                No tienes notificaciones todavía.
              </p>
            ) : (
              notifications.map(notification => (
                <button
                  key={notification.id}
                  type="button"
                  onClick={() => openNotification(notification)}
                  disabled={marking === notification.id}
                  className={`flex w-full items-start gap-3 border-b border-[#2e2e34]/70 p-4 text-left transition hover:bg-[#222226] ${
                    notification.read ? 'opacity-65' : 'bg-red-500/[0.04]'
                  }`}
                >
                  <span className="mt-0.5 shrink-0">
                    {notificationIcon(notification.type)}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-white">
                      {getNotificationTitle(notification)}
                    </span>

                    <span className="mt-1 block text-xs leading-relaxed text-gray-400">
                      {notification.body || ''}
                    </span>

                    <span className="mt-1 block text-[10px] text-gray-600">
                      {timestampValue(notification.createdAt)
                        ? new Date(timestampValue(notification.createdAt)).toLocaleString('es-ES')
                        : 'Ahora'}
                    </span>
                  </span>

                  {!notification.read && (
                    <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-red-400" />
                  )}
                </button>
              ))
            )}
          </div>

          <div className="border-t border-[#2e2e34] p-3">
            <span className="inline-flex items-center gap-1.5 text-[10px] text-gray-500">
              <CheckCheck className="h-3.5 w-3.5" />
              Se conservan hasta que las consultes.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
