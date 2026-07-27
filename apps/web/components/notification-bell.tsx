"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { formatDate } from "@agency-os/domain";
import { fetchNotificationState, markNotificationsRead } from "@/lib/notification-actions";

export interface NotificationItem {
  id: string;
  title: string;
  body: string | null;
  quoteId: string | null;
  readAt: string | null;
  createdAt: string;
}

/** Cada cuánto se consulta el estado de notificaciones mientras la app está
 * abierta. Sin push: es un polling ligero, no realtime. */
const POLL_MS = 25_000;

const hrefFor = (n: NotificationItem) => (n.quoteId ? `/crm/${n.quoteId}` : "/notificaciones");

/** "Ding" corto sintetizado con Web Audio API (dos tonos), para no depender de
 * un archivo de audio. Silencioso ante cualquier error o bloqueo de autoplay. */
function playChime() {
  try {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    void ctx.resume();
    const base = ctx.currentTime;
    [880, 1174.7].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const start = base + i * 0.12;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.14, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.25);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.3);
    });
    setTimeout(() => void ctx.close().catch(() => {}), 800);
  } catch {
    /* audio no disponible: se ignora */
  }
}

/** Notificación del sistema (app abierta). Requiere permiso concedido; al hacer
 * clic enfoca la ventana y navega a la cotización. */
function systemNotify(item: NotificationItem) {
  try {
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    const n = new Notification(item.title, {
      body: item.body ?? undefined,
      tag: item.id,
    });
    n.onclick = () => {
      window.focus();
      window.location.href = hrefFor(item);
      n.close();
    };
  } catch {
    /* notificaciones no disponibles: se ignora */
  }
}

/** Aviso emergente dentro de la app (no depende de permisos del navegador/OS).
 * Entra con una transición suave y se auto-descarta a los 6s. */
function Toast({
  item,
  onDismiss,
}: {
  item: NotificationItem;
  onDismiss: (id: string) => void;
}) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setShown(true));
    const timer = setTimeout(() => onDismiss(item.id), 6000);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
    };
  }, [item.id, onDismiss]);

  return (
    <a
      href={hrefFor(item)}
      role="status"
      className={`pointer-events-auto flex gap-2.5 rounded-lg border border-line bg-glass-strong px-4 py-3 shadow-overlay backdrop-blur-xl transition-all duration-300 ${
        shown ? "translate-x-0 opacity-100" : "translate-x-4 opacity-0"
      }`}
    >
      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-pill bg-green" />
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-ink">{item.title}</span>
        {item.body && (
          <span className="block truncate text-[13px] text-muted">{item.body}</span>
        )}
      </span>
    </a>
  );
}

export function NotificationBell({
  initial,
  unread,
}: {
  initial: NotificationItem[];
  unread: number;
}) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>(initial);
  const [unreadCount, setUnreadCount] = useState(unread);
  const [toasts, setToasts] = useState<NotificationItem[]>([]);
  const router = useRouter();
  const seenIds = useRef<Set<string>>(new Set(initial.map((n) => n.id)));

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Re-sincroniza con el servidor cuando cambian los props (navegación / refresh).
  useEffect(() => {
    setItems(initial);
    setUnreadCount(unread);
    for (const n of initial) seenIds.current.add(n.id);
  }, [initial, unread]);

  // Polling en vivo (app abierta). Al detectar notificaciones nuevas NO leídas,
  // suena el "ding" y dispara la notificación del sistema.
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const state = await fetchNotificationState();
        if (cancelled || !state) return;
        const fresh = state.items.filter((n) => !seenIds.current.has(n.id));
        const alertable = fresh.filter((n) => !n.readAt);
        if (alertable.length > 0) {
          playChime();
          for (const n of alertable) systemNotify(n);
          // Toast in-app (visible siempre, sin depender de permisos del OS).
          setToasts((prev) => [...alertable, ...prev].slice(0, 3));
        }
        for (const n of state.items) seenIds.current.add(n.id);
        setItems(state.items);
        setUnreadCount(state.unread);
      } catch {
        /* red intermitente: se reintenta en el próximo tick */
      }
    };
    const id = setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const onToggle = () => {
    // Pide permiso de notificaciones aprovechando el gesto del usuario (mejor
    // práctica que pedirlo al cargar la página).
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      void Notification.requestPermission().catch(() => {});
    }
    const next = !open;
    setOpen(next);
    if (next) {
      const unreadIds = items.filter((n) => !n.readAt).map((n) => n.id);
      if (unreadIds.length > 0) {
        const now = new Date().toISOString();
        setItems((prev) => prev.map((n) => (n.readAt ? n : { ...n, readAt: now })));
        setUnreadCount(0);
        markNotificationsRead(unreadIds).then(() => router.refresh());
      }
    }
  };

  return (
    <>
    <div className="relative">
      <button
        type="button"
        onClick={onToggle}
        aria-label="Notificaciones"
        className="relative flex h-9 w-9 items-center justify-center rounded-pill border border-line-strong bg-surface text-ink transition hover:border-green"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-pill bg-green px-1 text-[10px] font-bold text-green-ink">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-label="Cerrar"
            className="fixed inset-0 z-30 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 z-40 mt-2 w-80 overflow-hidden rounded-lg border border-line bg-surface shadow-xl">
            <div className="border-b border-line px-4 py-3 text-sm font-semibold">
              Notificaciones
            </div>
            {items.length === 0 ? (
              <p className="px-4 py-8 text-center text-[13px] text-muted">
                No tienes notificaciones.
              </p>
            ) : (
              <ul className="max-h-96 overflow-y-auto">
                {items.map((n) => {
                  const href = hrefFor(n);
                  return (
                    <li key={n.id} className="border-b border-line last:border-0">
                      <a
                        href={href}
                        className="flex gap-2 px-4 py-3 transition hover:bg-surface-2"
                        onClick={() => setOpen(false)}
                      >
                        <span
                          className={`mt-1.5 h-2 w-2 shrink-0 rounded-pill ${
                            n.readAt ? "bg-transparent" : "bg-green"
                          }`}
                        />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold">{n.title}</span>
                          {n.body && (
                            <span className="block truncate text-[13px] text-muted">{n.body}</span>
                          )}
                          <span className="mt-0.5 block text-xs text-faint">
                            {formatDate(n.createdAt)}
                          </span>
                        </span>
                      </a>
                    </li>
                  );
                })}
              </ul>
            )}
            <a
              href="/notificaciones"
              className="block border-t border-line px-4 py-2.5 text-center text-[13px] font-semibold text-green transition hover:bg-surface-2"
              onClick={() => setOpen(false)}
            >
              Ver todas
            </a>
          </div>
        </>
      )}
    </div>

      {/* Toasts in-app: visibles siempre, sin depender de permisos del OS. */}
      {toasts.length > 0 && (
        <div
          className="pointer-events-none fixed right-4 top-16 z-[60] flex w-80 flex-col gap-2"
          aria-live="polite"
        >
          {toasts.map((t) => (
            <Toast key={t.id} item={t} onDismiss={dismissToast} />
          ))}
        </div>
      )}
    </>
  );
}
