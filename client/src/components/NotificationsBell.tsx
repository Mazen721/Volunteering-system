import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { apiClient } from '../api/client';
import { AR } from '../constants/ar';
import { useAuth } from '../context/authContext';
import type { AppNotification, NotificationsResponse } from '../types';
import { formatDateTimeAr, formatNumber } from '../utils/format';

/**
 * In-app notifications bell (students): shows the unread count and a panel
 * with the latest notifications. Opening the panel marks everything read.
 * This is the delivery surface for manager warnings such as absence alerts.
 */
export function NotificationsBell() {
  const { user } = useAuth();
  const location = useLocation();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);

  const isStudent = user?.role === 'student';

  const refresh = useCallback(() => {
    if (!isStudent) {
      return;
    }
    apiClient
      .get<NotificationsResponse>('/notifications')
      .then((response) => {
        setNotifications(response.data.notifications);
        setUnreadCount(response.data.unreadCount);
      })
      .catch(() => {
        // The bell stays silent when notifications cannot be loaded.
      });
  }, [isStudent]);

  useEffect(() => {
    refresh();
  }, [refresh, location.pathname]);

  if (!isStudent) {
    return null;
  }

  function handleToggle() {
    const next = !open;
    setOpen(next);
    if (next && unreadCount > 0) {
      apiClient
        .post('/notifications/mark-read')
        .then(() => {
          setUnreadCount(0);
          setNotifications((current) => current.map((item) => ({ ...item, read: true })));
        })
        .catch(() => {
          // Leave the badge as-is; the next refresh reconciles it.
        });
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={handleToggle}
        aria-label={AR.notifications.title}
        className="relative flex items-center justify-center bg-white/10 hover:bg-white/20 text-white p-2.5 rounded-xl border border-white/20 transition active:scale-95 cursor-pointer"
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-1.5 -end-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-black text-white ring-2 ring-mnu-700">
            {formatNumber(unreadCount)}
          </span>
        )}
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-hidden="true"
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default bg-transparent"
          />
          <div className="absolute end-0 top-full z-50 mt-2 w-80 max-w-[86vw] rounded-2xl border border-slate-100 bg-white text-slate-800 shadow-2xl overflow-hidden">
            <p className="px-4 py-3 text-xs font-black border-b border-slate-100">
              {AR.notifications.title}
            </p>
            {notifications.length === 0 ? (
              <p className="px-4 py-6 text-center text-[11px] font-bold text-slate-500">
                {AR.notifications.empty}
              </p>
            ) : (
              <ul className="max-h-96 overflow-y-auto divide-y divide-slate-100">
                {notifications.map((notification) => (
                  <li key={notification._id}>
                    {notification.link ? (
                      <Link
                        to={notification.link}
                        onClick={() => setOpen(false)}
                        className="block px-4 py-3 hover:bg-slate-50 transition"
                      >
                        <NotificationBody notification={notification} />
                      </Link>
                    ) : (
                      <div className="px-4 py-3">
                        <NotificationBody notification={notification} />
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function NotificationBody({ notification }: { notification: AppNotification }) {
  return (
    <>
      <span className="flex items-center gap-2">
        {!notification.read && <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0" />}
        <span className="text-xs font-black text-slate-800">{notification.title}</span>
      </span>
      <span className="block text-[11px] font-semibold text-slate-600 leading-relaxed mt-1">
        {notification.body}
      </span>
      <span className="block text-[10px] font-bold text-slate-400 mt-1">
        {formatDateTimeAr(notification.createdAt)}
      </span>
    </>
  );
}
