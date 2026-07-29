"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, FieldError, Input, Label, Modal, Select, Table, Td, Th } from "@agency-os/ui";
import { createProjectAction } from "@/lib/project-actions";

export type ProjectState = "active" | "completed" | "archived";

export interface ProjectListRow {
  id: string;
  title: string;
  clientName: string;
  clientCompany: string | null;
  tasksCount: number;
  /** % (0-100) de tareas en un estado "hecho". */
  progress: number;
  projectState: ProjectState;
}

export interface ClientOption {
  id: string;
  name: string;
  company: string | null;
}

const PROJECT_STATE_BADGE: Record<ProjectState, { label: string; tone: "success" | "info" | "neutral" }> = {
  active: { label: "Activo", tone: "info" },
  completed: { label: "Completado", tone: "success" },
  archived: { label: "Archivado", tone: "neutral" },
};

export function ProjectsList({
  rows,
  q,
  clients,
}: {
  rows: ProjectListRow[];
  q: string;
  clients: ClientOption[];
}) {
  const router = useRouter();
  const [search, setSearch] = useState(q);
  const [modalOpen, setModalOpen] = useState(false);

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const sp = new URLSearchParams();
    if (search.trim()) sp.set("q", search.trim());
    const qs = sp.toString();
    router.push(qs ? `/proyectos?${qs}` : "/proyectos");
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Proyectos</h1>
          <p className="mt-1 text-sm text-muted">Gestiona los proyectos y sus tareas</p>
        </div>
        <Button variant="primary" onClick={() => setModalOpen(true)}>
          + Nuevo proyecto
        </Button>
      </div>

      <form onSubmit={submitSearch} className="mt-6 flex gap-2">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nombre…"
          aria-label="Buscar proyectos"
          className="max-w-sm"
        />
        <Button variant="secondary" type="submit">
          Buscar
        </Button>
        {q && (
          <a
            href="/proyectos"
            className="self-center text-sm font-semibold text-green hover:underline"
          >
            Limpiar
          </a>
        )}
      </form>

      <div className="mt-5">
        {rows.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-lg border border-line bg-glass px-8 py-16 text-center backdrop-blur-xl">
            <div className="text-lg font-semibold">
              {q ? "Sin resultados" : "Todavía no hay proyectos"}
            </div>
            <p className="max-w-[44ch] text-sm text-muted">
              {q
                ? "Ningún proyecto coincide con la búsqueda."
                : "Crea el primer proyecto para empezar a organizar tareas."}
            </p>
          </div>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Nombre</Th>
                <Th>Cliente</Th>
                <Th className="text-right">Nº tareas</Th>
                <Th>Progreso</Th>
                <Th>Estado</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const state = PROJECT_STATE_BADGE[p.projectState];
                return (
                  <tr key={p.id} className="transition hover:bg-surface-2">
                    <Td>
                      <a
                        href={`/proyectos/${p.id}`}
                        className="max-w-[32ch] truncate whitespace-nowrap font-semibold text-ink hover:text-green"
                      >
                        {p.title}
                      </a>
                    </Td>
                    <Td>
                      <div className="max-w-[28ch] truncate text-sm">{p.clientName}</div>
                      {p.clientCompany && (
                        <div className="max-w-[28ch] truncate text-xs text-muted">
                          {p.clientCompany}
                        </div>
                      )}
                    </Td>
                    <Td className="text-right font-mono text-sm">{p.tasksCount}</Td>
                    <Td>
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-24 overflow-hidden rounded-pill bg-surface-2">
                          <div
                            className="h-full rounded-pill bg-green"
                            style={{ width: `${p.progress}%` }}
                          />
                        </div>
                        <span className="font-mono text-xs text-muted">{p.progress}%</span>
                      </div>
                    </Td>
                    <Td>
                      <Badge tone={state.tone}>{state.label}</Badge>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </div>

      <NewProjectModal open={modalOpen} onClose={() => setModalOpen(false)} clients={clients} />
    </div>
  );
}

/** Alta de proyecto: cliente (obligatorio, no se puede enviar sin él) + título.
 * Al crear navega a la ficha del proyecto. */
function NewProjectModal({
  open,
  onClose,
  clients,
}: {
  open: boolean;
  onClose: () => void;
  clients: ClientOption[];
}) {
  const router = useRouter();
  const [clientId, setClientId] = useState("");
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const canSubmit = Boolean(clientId) && Boolean(title.trim());

  const close = () => {
    onClose();
    setClientId("");
    setTitle("");
    setError(null);
  };

  const onCreate = () => {
    if (!canSubmit) return;
    setError(null);
    startTransition(async () => {
      const res = await createProjectAction({ clientId, title });
      if (res.error) setError(res.error);
      else router.push(`/proyectos/${res.id}`);
    });
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title="Nuevo proyecto"
      description="Selecciona el cliente y el nombre del proyecto."
      footer={
        <>
          <Button variant="outline" size="sm" onClick={close} disabled={isPending}>
            Cancelar
          </Button>
          <Button variant="primary" size="sm" onClick={onCreate} disabled={isPending || !canSubmit}>
            Crear
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <Label htmlFor="np-client">Cliente *</Label>
          <Select
            id="np-client"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
          >
            <option value="">Selecciona…</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.company ? ` · ${c.company}` : ""}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="np-title">Nombre del proyecto *</Label>
          <Input id="np-title" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        {error && <FieldError>{error}</FieldError>}
      </div>
    </Modal>
  );
}
