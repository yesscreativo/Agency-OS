import { redirect } from "next/navigation";
import { listModules } from "@agency-os/db";
import { getCurrentUser, canAccessModule } from "@/lib/auth";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { ModuleIcon } from "@/components/module-icons";

export const dynamic = "force-dynamic";

/** Ruta a la que entra cada módulo operativo. */
const MODULE_HREFS: Record<string, string> = {
  crm: "/crm",
  proyectos: "/proyectos",
};

export default async function InicioPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const db = await getSupabaseServerClient();
  const modules = await listModules(db);
  const hasAnyAccess = modules.some((m) => m.is_active && canAccessModule(user, m.code));

  const firstName = user.fullName.split(/\s+/)[0] ?? user.fullName;

  return (
    <div>
      <div className="max-w-[60ch]">
        <h1 className="text-3xl font-bold tracking-tight">Hola, {firstName}</h1>
        <p className="mt-1 text-sm text-muted">
          {hasAnyAccess
            ? "Elige un módulo para empezar."
            : "Aún no tienes acceso a ningún módulo. Solicita acceso a un administrador."}
        </p>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {modules.map((mod) => {
          const href = MODULE_HREFS[mod.code];
          const accessible = mod.is_active && href && canAccessModule(user, mod.code);

          const chip = !mod.is_active
            ? { label: "Próximamente", cls: "text-muted" }
            : accessible
              ? { label: "Abrir →", cls: "text-green" }
              : { label: "Sin acceso", cls: "text-muted" };

          const card = (
            <div
              className={`h-full rounded-lg border border-line bg-glass p-5 backdrop-blur-xl transition ${
                accessible ? "hover:border-green" : "opacity-60"
              }`}
            >
              <div className="flex items-start justify-between">
                <div
                  className={`flex h-11 w-11 items-center justify-center rounded-lg ${
                    accessible ? "bg-green-soft text-green" : "bg-surface-2 text-muted"
                  }`}
                >
                  <ModuleIcon code={mod.code} />
                </div>
                <span className={`font-mono text-xs font-semibold ${chip.cls}`}>{chip.label}</span>
              </div>
              <div className="mt-4 text-lg font-bold tracking-tight">{mod.name}</div>
              {mod.description && (
                <p className="mt-1 text-sm text-muted">{mod.description}</p>
              )}
            </div>
          );

          return accessible ? (
            <a key={mod.code} href={href} className="block">
              {card}
            </a>
          ) : (
            <div key={mod.code}>{card}</div>
          );
        })}
      </div>
    </div>
  );
}
