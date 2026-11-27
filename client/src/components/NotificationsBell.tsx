import { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { apiClient } from '../api/client';
import { AR } from '../constants/ar';
import { useAuth } from '../context/authContext';
import type { AppNotification, NotificationsResponse } from '../types';
import { formatNumber } from '../utils/format';
import { NotificationsPanel } from './NotificationsPanel';

/**
 * In-app notifications bell (students): shows the unread count and a panel
 * with the latest notifications. Opening the panel marks everything read.
 * This is the delivery surface for manager warnings such as absence alerts.
 * Load failures are surfaced honestly (an error state in the panel and no
 * badge) instead of being swallowed — an empty-looking bell must never
 * claim "no notifications" when the fetch actually failed.
 */
export function NotificationsBell() {
  const { user } = useAuth();
  const location = useLocation();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loadFailed, setLoadFailed] = useState(false);
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
        setLoadFailed(false);
      })
      .catch((error: unknown) => {
        console.error('Failed to load notifications:', error);
        setLoadFailed(true);
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
        .catch((error: unknown) => {
          // The badge stays as-is (nothing is presented as read that the
          // server did not confirm); the failure is logged, not swallowed.
          console.error('Failed to mark notifications as read:', error);
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
        {!loadFailed && unreadCount > 0 && (
          <span className="absolute -top-1.5 -end-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-black text-white ring-2 ring-mnu-700">
            {formatNumber(unreadCount)}
          </span>
        )}
      </button>

      {open && (
        <NotificationsPanel
          notifications={notifications}
          loadFailed={loadFailed}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}
