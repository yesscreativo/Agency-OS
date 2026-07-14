import { redirect } from "next/navigation";
import { getCurrentUser, hasPermission } from "@/lib/auth";
import { logout } from "@/lib/auth-actions";

const NAV_ITEMS = [
  { href: "/crm", label: "Cotizaciones" },
  { href: "/crm/kanban", label: "Kanban" },
  { href: "/crm/dashboard", label: "Dashboard" },
  { href: "/crm/clientes", label: "Clientes" },
  { href: "/crm/usuarios", label: "Usuarios", permission: "users.manage" },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const visibleNavItems = NAV_ITEMS.filter(
    (item) => !item.permission || hasPermission(user, item.permission),
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="flex items-center justify-between border-b bg-white px-6 py-3">
        <div className="flex items-center gap-6">
          <span className="font-semibold">Agency OS</span>
          <nav className="flex gap-4 text-sm text-slate-600">
            {visibleNavItems.map((item) => (
              <a key={item.href} href={item.href} className="hover:text-slate-900">
                {item.label}
              </a>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-slate-600">
            {user.fullName}
            {user.roles.length > 0 && (
              <span className="ml-1 text-slate-400">
                ({user.roles.map((r) => r.name).join(", ")})
              </span>
            )}
          </span>
          <form action={logout}>
            <button type="submit" className="text-slate-500 hover:text-slate-900 hover:underline">
              Salir
            </button>
          </form>
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}
