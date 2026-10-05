import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Bell, CircleAlert, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { CustomerApiError, customerApi } from '../services/customerApi';
import './notification-center.css';

type ToastNotice = {
  id: string;
  title: string;
  message: string;
  href?: string;
  actionLabel?: string;
  notificationId?: string;
  tone?: 'success' | 'warning' | 'notice';
};

type ToastInput = Omit<ToastNotice, 'id'>;
type NotificationCenterValue = {
  unreadCount: number;
  notify: (notice: ToastInput) => void;
};

const NotificationCenterContext = createContext<NotificationCenterValue>({
  unreadCount: 0,
  notify: () => undefined,
});

const toastLifetimeMs = 6500;
const safeInternalHref = (href?: string) =>
  href && href.startsWith('/') && !href.startsWith('//') ? href : undefined;

export function useNotificationCenter() {
  return useContext(NotificationCenterContext);
}

export function NotificationCenterProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastNotice[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [sessionUserId, setSessionUserId] = useState('');
  const timers = useRef(new Map<string, number>());
  const seenNotificationIds = useRef(new Set<string>());
  const pollStarted = useRef(false);

  const dismiss = useCallback((id: string) => {
    const timer = timers.current.get(id);
    if (timer !== undefined) window.clearTimeout(timer);
    timers.current.delete(id);
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const notify = useCallback(
    (notice: ToastInput) => {
      const id =
        globalThis.crypto?.randomUUID?.() ||
        String(Date.now()) + Math.random().toString(36).slice(2);
      const toast = { ...notice, id, href: safeInternalHref(notice.href) };
      setToasts((current) => [...current, toast].slice(-3));
      const timer = window.setTimeout(() => dismiss(id), toastLifetimeMs);
      timers.current.set(id, timer);
    },
    [dismiss],
  );

  const refreshSession = useCallback(async () => {
    try {
      const { user } = await customerApi.me();
      setSessionUserId(user.id);
    } catch {
      setSessionUserId('');
      setUnreadCount(0);
      pollStarted.current = false;
      seenNotificationIds.current.clear();
    }
  }, []);

  useEffect(() => {
    void refreshSession();
    const handleSessionChanged = () => void refreshSession();
    window.addEventListener('customer-session-changed', handleSessionChanged);
    return () => window.removeEventListener('customer-session-changed', handleSessionChanged);
  }, [refreshSession]);

  useEffect(() => {
    if (!sessionUserId) return;
    let active = true;
    let polling = false;
    const poll = async () => {
      if (!active || polling || document.visibilityState === 'hidden') return;
      polling = true;
      try {
        const result = await customerApi.notifications(1, 10, true);
        if (!active) return;
        setUnreadCount(result.unread);
        if (!pollStarted.current) {
          result.notifications.forEach((item) => seenNotificationIds.current.add(item.id));
          pollStarted.current = true;
          return;
        }
        const unseen = result.notifications
          .filter((item) => !item.readAt && !seenNotificationIds.current.has(item.id))
          .slice(0, 2)
          .reverse();
        unseen.forEach((item) => seenNotificationIds.current.add(item.id));
        if (seenNotificationIds.current.size > 100) {
          const keep = result.notifications
            .map((item) => item.id)
            .filter((id) => seenNotificationIds.current.has(id));
          seenNotificationIds.current = new Set(keep);
        }
        unseen.forEach((item) =>
          notify({
            title: item.title,
            message: item.message,
            href: item.href,
            actionLabel: 'Xem chi tiết',
            notificationId: item.id,
            tone: 'notice',
          }),
        );
      } catch (cause) {
        if (active && cause instanceof CustomerApiError && cause.status === 401) {
          setSessionUserId('');
          setUnreadCount(0);
          pollStarted.current = false;
          seenNotificationIds.current.clear();
        }
      } finally {
        polling = false;
      }
    };
    void poll();
    const interval = window.setInterval(() => void poll(), 15000);
    const handleFocus = () => void poll();
    window.addEventListener('focus', handleFocus);
    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
    };
  }, [sessionUserId, notify]);

  useEffect(
    () => () => {
      timers.current.forEach((timer) => window.clearTimeout(timer));
      timers.current.clear();
    },
    [],
  );

  function openNotification(toast: ToastNotice) {
    if (toast.notificationId) {
      setUnreadCount((count) => Math.max(0, count - 1));
      void customerApi.readNotification(toast.notificationId).catch(() => undefined);
    }
    dismiss(toast.id);
  }

  return (
    <NotificationCenterContext.Provider value={{ unreadCount, notify }}>
      {children}
      <div
        className="notification-toast-stack"
        aria-live="polite"
        aria-relevant="additions removals"
      >
        {toasts.map((toast) => (
          <article className={'notification-toast is-' + (toast.tone || 'notice')} key={toast.id}>
            <span className="notification-toast-icon" aria-hidden="true">
              {toast.tone === 'warning' ? <CircleAlert size={18} /> : <Bell size={18} />}
            </span>
            <div className="notification-toast-copy">
              <strong>{toast.title}</strong>
              <p>{toast.message}</p>
              {toast.href && (
                <Link to={toast.href} onClick={() => openNotification(toast)}>
                  {toast.actionLabel || 'Xem chi tiết'}
                </Link>
              )}
            </div>
            <button type="button" aria-label="Đóng thông báo" onClick={() => dismiss(toast.id)}>
              <X size={16} />
            </button>
          </article>
        ))}
      </div>
    </NotificationCenterContext.Provider>
  );
}
