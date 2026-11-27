import { Link } from 'react-router-dom';
import { AR } from '../constants/ar';
import type { AppNotification } from '../types';
import { formatDateTimeAr } from '../utils/format';

interface NotificationsPanelProps {
  notifications: AppNotification[];
  loadFailed: boolean;
  onClose: () => void;
}

/**
 * The notifications dropdown: latest items, an honest error state when the
 * load failed (instead of pretending the list is empty), and an empty state.
 */
export function NotificationsPanel({ notifications, loadFailed, onClose }: NotificationsPanelProps) {
  return (
    <>
      <button
        type="button"
        aria-hidden="true"
        tabIndex={-1}
        onClick={onClose}
        className="fixed inset-0 z-40 cursor-default bg-transparent"
      />
      <div className="absolute end-0 top-full z-50 mt-2 w-80 max-w-[86vw] rounded-2xl border border-slate-100 bg-white text-slate-800 shadow-2xl overflow-hidden">
        <p className="px-4 py-3 text-xs font-black border-b border-slate-100">
          {AR.notifications.title}
        </p>
        {loadFailed ? (
          <p className="px-4 py-6 text-center text-[11px] font-bold text-rose-500">
            {AR.notifications.loadError}
          </p>
        ) : notifications.length === 0 ? (
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
                    onClick={onClose}
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
