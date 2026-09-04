import { redirect } from "next/navigation";
import { listNotifications } from "@agency-os/db";
import { formatDate } from "@agency-os/domain";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { markAllNotificationsRead } from "@/lib/notification-actions";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const db = await getSupabaseServerClient();
  const notifs = await listNotifications(db, user.id, { limit: 50 });
  const hasUnread = notifs.some((n) => !n.read_at);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Notificaciones</h1>
          <p className="mt-1 text-sm text-muted">Actividad de tus cotizaciones</p>
        </div>
        {hasUnread && (
          <form action={markAllNotificationsRead}>
            <button
              type="submit"
              className="rounded-pill border border-line-strong bg-surface px-4 py-2 text-sm font-semibold text-ink transition hover:border-green"
            >
              Marcar todo como leído
            </button>
          </form>
        )}
      </div>

      <div className="mt-6">
        {notifs.length === 0 ? (
          <div className="rounded-lg border border-line bg-glass px-8 py-16 text-center text-sm text-muted backdrop-blur-xl">
            No tienes notificaciones.
          </div>
        ) : (
          <ul className="space-y-2">
            {notifs.map((n) => {
              const href = n.link ?? (n.quote_id ? `/crm/${n.quote_id}` : undefined);
              const Row = (
                <div
                  className={`flex gap-3 rounded-lg border px-5 py-4 backdrop-blur-xl transition ${
                    n.read_at
                      ? "border-line bg-glass"
                      : "border-green/40 bg-glass hover:border-green"
                  }`}
                >
                  <span
                    className={`mt-1.5 h-2 w-2 shrink-0 rounded-pill ${
                      n.read_at ? "bg-transparent" : "bg-green"
                    }`}
                  />
                  <div className="min-w-0">
                    <div className="text-sm font-semibold">{n.title}</div>
                    {n.body && <div className="text-[13px] text-muted">{n.body}</div>}
                    <div className="mt-1 text-xs text-faint">{formatDate(n.created_at)}</div>
                  </div>
                </div>
              );
              return (
                <li key={n.id}>
                  {href ? (
                    <a href={href} className="block">
                      {Row}
                    </a>
                  ) : (
                    Row
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
