import { redirect } from "next/navigation";
import { Avatar, ThemeToggle } from "@agency-os/ui";
import { getCurrentUser, hasPermission } from "@/lib/auth";
import { logout } from "@/lib/auth-actions";

const NAV_ITEMS = [
  { href: "/crm", label: "Cotizaciones" },
  { href: "/crm/kanban", label: "Kanban" },
  { href: "/crm/dashboard", label: "Dashboard" },
  { href: "/crm/clientes", label: "Clientes" },
  { href: "/crm/usuarios", label: "Usuarios", permission: "users.manage" },
];

function initialsOf(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const visibleNavItems = NAV_ITEMS.filter(
    (item) => !item.permission || hasPermission(user, item.permission),
  );

  return (
    <div className="min-h-screen bg-bg text-ink">
      <header className="sticky top-0 z-20 border-b border-line bg-bg/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1120px] items-center justify-between gap-4 px-8 py-3">
          <div className="flex items-center gap-6">
            <a href="/crm" className="flex items-center gap-3 text-ink">
              <span className="flex h-[30px] w-[30px] items-center justify-center rounded-[9px] bg-green text-[15px] font-bold text-green-ink">
                A
              </span>
              <span className="text-base font-bold tracking-tight">
                Agency <span className="text-green">OS</span>
              </span>
            </a>
            <nav className="flex gap-1 text-sm">
              {visibleNavItems.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  className="rounded-pill px-3.5 py-2 font-medium text-muted transition hover:bg-surface-2 hover:text-ink"
                >
                  {item.label}
                </a>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <ThemeToggle />
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
      <main className="mx-auto max-w-[1120px] px-8 py-8">{children}</main>
    </div>
  );
}
