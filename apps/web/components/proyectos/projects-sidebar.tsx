"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Button, Chip, Input } from "@agency-os/ui";
import type { ClientSpaceRow } from "@agency-os/db";
import { clientHref } from "@/lib/project-paths";
import { ClientAvatar } from "./client-logo";
import { NewProjectModal, type ClientOption } from "./new-project-modal";

type Tab = "todos" | "activos" | "mios";

const TABS: { key: Tab; label: string }[] = [
  { key: "todos", label: "Todos" },
  { key: "activos", label: "Activos" },
  { key: "mios", label: "Míos" },
];

/** Sidebar de Spaces del módulo Proyectos: filtro de clientes + Todos/Activos/Míos
 * + lista de clientes (con nº de proyectos) que navega a cada space. El wireframe
 * también prevé "Carga del equipo"/"Mis tiempos" (Fase C / RRHH): van como
 * placeholders deshabilitados. */
export function ProjectsSidebar({
  clients,
  clientsForCreate,
  canManage = false,
}: {
  clients: ClientSpaceRow[];
  /** Todos los clientes de la org para el modal global de alta de proyecto. */
  clientsForCreate: ClientOption[];
  /** Solo con project.manage se muestra el botón global de "Nuevo proyecto". */
  canManage?: boolean;
}) {
  const pathname = usePathname();
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<Tab>("todos");
  const [createOpen, setCreateOpen] = useState(false);

  const q = query.trim().toLowerCase();
  const filtered = clients.filter((c) => {
    if (tab === "activos" && c.activeCount === 0) return false;
    if (tab === "mios" && !c.mine) return false;
    if (q && !c.name.toLowerCase().includes(q)) return false;
    return true;
  });

  const rootActive = pathname === "/proyectos";

  return (
    <aside className="w-full shrink-0 sm:w-[240px]">
      <a
        href="/proyectos"
        className={`flex items-center justify-between rounded-lg px-3.5 py-2.5 text-sm transition ${
          rootActive
            ? "bg-green font-semibold text-green-ink"
            : "text-muted hover:bg-surface-2 hover:text-ink"
        }`}
      >
        Todos los proyectos
      </a>

      {canManage && (
        <Button
          variant="primary"
          size="sm"
          className="mt-3 w-full"
          onClick={() => setCreateOpen(true)}
        >
          + Nuevo proyecto
        </Button>
      )}

      <div className="mt-4">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filtrar clientes…"
          aria-label="Filtrar clientes"
        />
      </div>

      <div className="mt-3 flex gap-1.5">
        {TABS.map((t) => (
          <Chip key={t.key} active={tab === t.key} onClick={() => setTab(t.key)}>
            {t.label}
          </Chip>
        ))}
      </div>

      <div className="mt-4 px-1 text-[11px] font-semibold uppercase tracking-wide text-faint">
        Clientes · {filtered.length}
      </div>

      <div className="ds-scroll mt-1 max-h-[calc(100vh-360px)] space-y-0.5 overflow-y-auto pr-1">
        {filtered.length === 0 ? (
          <p className="px-3.5 py-2 text-sm text-faint">
            {clients.length === 0 ? "Aún no hay clientes con proyectos." : "Sin resultados."}
          </p>
        ) : (
          filtered.map((c) => {
            const href = clientHref(c);
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <a
                key={c.id}
                href={href}
                className={`flex items-center justify-between gap-2 rounded-lg px-3.5 py-2 text-sm transition ${
                  active
                    ? "bg-green font-semibold text-green-ink"
                    : "text-ink hover:bg-surface-2"
                }`}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <ClientAvatar name={c.name} logoUrl={c.logoUrl} size="sm" />
                  <span className="min-w-0 truncate">{c.name}</span>
                </span>
                <span
                  className={`shrink-0 font-mono text-xs ${active ? "text-green-ink" : "text-muted"}`}
                >
                  {c.projectCount}
                </span>
              </a>
            );
          })
        )}
      </div>

      <div className="mt-5 space-y-0.5 border-t border-line pt-4">
        <SidebarPlaceholder label="Carga del equipo" />
        <SidebarPlaceholder label="Mis tiempos" />
      </div>

      {canManage && (
        <NewProjectModal
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          clients={clientsForCreate}
        />
      )}
    </aside>
  );
}

/** Item deshabilitado del footer: función que llega con módulos futuros
 * (time tracking / capacidad). Visible pero sin navegación. */
function SidebarPlaceholder({ label }: { label: string }) {
  return (
    <div
      className="flex cursor-default items-center justify-between gap-2 rounded-lg px-3.5 py-2 text-sm text-faint"
      title="Próximamente"
    >
      <span>{label}</span>
      <span className="rounded-pill border border-line px-1.5 text-[10px] uppercase tracking-wide">
        pronto
      </span>
    </div>
  );
}
