import { redirect } from "next/navigation";
import { countUnread, listNotifications } from "@agency-os/db";
import { Avatar, ThemeToggle } from "@agency-os/ui";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { logout } from "@/lib/auth-actions";
import { AppBackground } from "@/components/app-background";
import { NotificationBell } from "@/components/notification-bell";

function initialsOf(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
}

// Shell mínimo compartido por toda la app: logo, tema, usuario, salir.
// La navegación es responsabilidad de cada sección (sidebar del hub en
// /inicio-/usuarios-/perfil, barra propia dentro de cada módulo como /crm).
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const db = await getSupabaseServerClient();
  const [notifs, unread] = await Promise.all([
    listNotifications(db, user.id, { limit: 8 }),
    countUnread(db, user.id),
  ]);

  return (
    // Sin bg sólido en el wrapper: el canvas de AppBackground (-z-10) debe
    // verse; el fallback opaco lo da el background del body.
    <div className="min-h-screen text-ink">
      <AppBackground />
      <header className="sticky top-0 z-20 border-b border-line bg-bg/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1360px] items-center justify-between gap-4 px-8 py-3">
          <a href="/inicio" className="flex items-center">
            {/* Wordmark según tema: blanco sobre oscuro, negro sobre claro */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/assets/images/logo-Aos.png"
              alt="Agency OS"
              className="h-5 w-auto [[data-theme=light]_&]:hidden"
            />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/assets/images/logo-Aos-black.png"
              alt=""
              aria-hidden="true"
              className="hidden h-5 w-auto [[data-theme=light]_&]:block"
            />
          </a>
          <div className="flex items-center gap-3 text-sm">
            <ThemeToggle />
            <NotificationBell
              unread={unread}
              initial={notifs.map((n) => ({
                id: n.id,
                title: n.title,
                body: n.body,
                quoteId: n.quote_id,
                readAt: n.read_at,
                createdAt: n.created_at,
              }))}
            />
            <div className="flex items-center gap-2.5">
              <Avatar initials={initialsOf(user.fullName)} tone="purple" size="md" />
              <div className="leading-tight">
                <div className="font-semibold">{user.fullName}</div>
                {user.roles.length > 0 && (
                  <div className="text-xs text-muted">
                    {user.roles.map((r) => r.name).join(", ")}
                  </div>
                )}
              </div>
            </div>
            <form action={logout}>
              <button
                type="submit"
                className="cursor-pointer rounded-pill border border-line-strong bg-surface px-3.5 py-2 text-xs font-semibold text-ink transition hover:border-green"
              >
                Salir
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[1360px] px-8 py-8">{children}</main>
    </div>
  );
}
