"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatDate } from "@agency-os/domain";
import { markNotificationsRead } from "@/lib/notification-actions";

export interface NotificationItem {
  id: string;
  title: string;
  body: string | null;
  quoteId: string | null;
  readAt: string | null;
  createdAt: string;
}

export function NotificationBell({
  initial,
  unread,
}: {
  initial: NotificationItem[];
  unread: number;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  const onToggle = () => {
    const next = !open;
    setOpen(next);
    if (next) {
      const unreadIds = initial.filter((n) => !n.readAt).map((n) => n.id);
      if (unreadIds.length > 0) {
        markNotificationsRead(unreadIds).then(() => router.refresh());
      }
    }
  };

  return (
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
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-pill bg-green px-1 text-[10px] font-bold text-green-ink">
            {unread > 9 ? "9+" : unread}
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
            {initial.length === 0 ? (
              <p className="px-4 py-8 text-center text-[13px] text-muted">
                No tienes notificaciones.
              </p>
            ) : (
              <ul className="max-h-96 overflow-y-auto">
                {initial.map((n) => {
                  const href = n.quoteId ? `/crm/${n.quoteId}` : "/notificaciones";
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
  );
}
