"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { groupProjectsByFolder } from "@agency-os/domain";
import { Badge, Button, Input, Label, Modal, readableTextOn } from "@agency-os/ui";
import {
  createProjectFolderAction,
  deleteProjectFolderAction,
  setProjectFolderAction,
  updateProjectFolderAction,
  type ProjectFolderInput,
} from "@/lib/project-folder-actions";
import { projectHref } from "@/lib/project-paths";

export interface ProjectFolderView {
  id: string;
  name: string;
  color: string;
  sortOrder: number;
}

export interface FolderProjectRow {
  id: string;
  title: string;
  folderId: string | null;
  tasksCount: number;
  progress: number;
  projectState: "active" | "completed" | "archived";
}

/** Misma paleta que project-status-manager.tsx (estados del tablero) — Hexes
 * legibles en ambos temas. Duplicada a propósito: es un array trivial, no
 * amerita compartir un módulo solo por esto (mismo criterio que otros
 * pequeños duplicados ya establecidos en el proyecto). */
const SWATCHES = [
  "#9aa1ab",
  "#7eb8ff",
  "#f5c95a",
  "#8b5cf6",
  "#86c99a",
  "#e5675f",
  "#3bc9c9",
  "#1f8f4d",
  "#e879b9",
  "#f59e42",
];

const STATE_BADGE: Record<
  FolderProjectRow["projectState"],
  { label: string; tone: "success" | "info" | "neutral" }
> = {
  active: { label: "Activo", tone: "info" },
  completed: { label: "Completado", tone: "success" },
  archived: { label: "Archivado", tone: "neutral" },
};

type Editing = null | "new" | ProjectFolderView;

export function ProjectsByFolder({
  client,
  folders,
  rows,
  canManage,
}: {
  /** `{id, name}` del cliente — projectHref() necesita el NOMBRE real (no un
   * slug ya armado) para construir el link de cada proyecto, igual que ya
   * hace new-project-modal.tsx. */
  client: { id: string; name: string };
  folders: ProjectFolderView[];
  rows: FolderProjectRow[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [dragId, setDragId] = useState<string | null>(null);
  const [overFolderId, setOverFolderId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing>(null);
  const [deleting, setDeleting] = useState<ProjectFolderView | null>(null);
  const [name, setName] = useState("");
  const [color, setColor] = useState("#7eb8ff");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const groups = groupProjectsByFolder(folders, rows);

  const openModal = (target: Exclude<Editing, null>) => {
    setEditing(target);
    setError(null);
    if (target === "new") {
      setName("");
      setColor("#7eb8ff");
    } else {
      setName(target.name);
      setColor(target.color);
    }
  };

  const submitFolder = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const input: ProjectFolderInput = { name: trimmed, color };
    startTransition(async () => {
      const result =
        editing === "new"
          ? await createProjectFolderAction(client.id, input)
          : editing
            ? await updateProjectFolderAction(editing.id, input)
            : { error: "Sin selección." };
      if (result.error) {
        setError(result.error);
        return;
      }
      setEditing(null);
      router.refresh();
    });
  };

  const confirmDeleteFolder = () => {
    if (!deleting) return;
    startTransition(async () => {
      const result = await deleteProjectFolderAction(deleting.id);
      if (result.error) {
        setError(result.error);
        return;
      }
      setDeleting(null);
      router.refresh();
    });
  };

  const dropOnFolder = (folderId: string | null) => {
    if (!canManage || !dragId) return;
    setOverFolderId(null);
    const projectId = dragId;
    setDragId(null);
    startTransition(async () => {
      const result = await setProjectFolderAction(projectId, folderId);
      if (result.error) setError(result.error);
      else router.refresh();
    });
  };

  return (
    <div>
      {canManage && (
        <div className="mb-4 flex justify-end">
          <Button variant="outline" size="sm" onClick={() => openModal("new")}>
            + Nueva carpeta
          </Button>
        </div>
      )}

      {error && !editing && !deleting && (
        <div className="mb-4 rounded-md border border-danger/40 bg-glass px-4 py-2 text-sm text-danger backdrop-blur-xl">
          {error}
        </div>
      )}

      <div className="space-y-6">
        {groups.map((group) => {
          const key = group.folder?.id ?? "sin-carpeta";
          if (!group.folder && group.projects.length === 0 && folders.length > 0) {
            // "Sin carpeta" vacío: no vale la pena mostrar la sección si ya
            // hay carpetas y no queda ningún proyecto suelto.
            return null;
          }
          return (
            <div
              key={key}
              onDragOver={(e) => {
                if (!canManage || !dragId) return;
                e.preventDefault();
                setOverFolderId(key);
              }}
              onDragLeave={() => setOverFolderId((f) => (f === key ? null : f))}
              onDrop={() => dropOnFolder(group.folder?.id ?? null)}
              // El color del borde es el color de la carpeta (distingue cada
              // sección de un vistazo, no solo el badge) — vía inline style
              // porque es un hex dinámico, no una clase de Tailwind. "Sin
              // carpeta" no tiene color propio, usa el borde neutro de
              // siempre. El highlight de "estás arrastrando algo encima" usa
              // `ring` (box-shadow aparte) en vez de tocar el color del
              // borde, para no pisar el color de la carpeta.
              style={group.folder ? { borderColor: group.folder.color } : undefined}
              className={`rounded-lg border p-4 transition ${
                overFolderId === key ? "ring-2 ring-green" : ""
              } ${group.folder ? "" : "border-line"}`}
            >
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  {group.folder ? (
                    <Badge color={group.folder.color}>{group.folder.name}</Badge>
                  ) : (
                    <Badge tone="neutral">Sin carpeta</Badge>
                  )}
                  <span className="font-mono text-xs font-bold text-muted">
                    {group.projects.length}
                  </span>
                </div>
                {canManage && group.folder && (
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => openModal(group.folder!)}>
                      Editar
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => {
                        setError(null);
                        setDeleting(group.folder);
                      }}
                    >
                      Eliminar
                    </Button>
                  </div>
                )}
              </div>

              {group.projects.length === 0 ? (
                <p className="text-sm text-muted">
                  {group.folder ? "Arrastra un proyecto aquí." : "Sin proyectos sueltos."}
                </p>
              ) : (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {group.projects.map((project) => {
                    const state = STATE_BADGE[project.projectState];
                    return (
                      <Link
                        key={project.id}
                        href={projectHref(client, project)}
                        draggable={canManage}
                        onDragStart={(e) => {
                          if (!canManage) {
                            e.preventDefault();
                            return;
                          }
                          setDragId(project.id);
                        }}
                        onDragEnd={() => {
                          setDragId(null);
                          setOverFolderId(null);
                        }}
                        className={`rounded-md border border-line bg-glass p-3 backdrop-blur-xl transition hover:border-line-strong ${
                          canManage ? "cursor-grab active:cursor-grabbing" : ""
                        } ${dragId === project.id ? "opacity-50" : ""}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-sm font-semibold text-ink">{project.title}</span>
                          <Badge tone={state.tone}>{state.label}</Badge>
                        </div>
                        <div className="mt-2 flex items-center justify-between text-xs text-muted">
                          <span>{project.tasksCount} tareas</span>
                          <span>{project.progress}%</span>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === "new" ? "Nueva carpeta" : "Editar carpeta"}
        footer={
          <>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancelar
            </Button>
            <Button onClick={submitFolder} disabled={pending || !name.trim()}>
              {pending ? "Guardando…" : "Guardar"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <Label htmlFor="folder-name">Nombre</Label>
            <Input
              id="folder-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej. Área Contenidos"
              autoFocus
            />
          </div>
          <div>
            <Label htmlFor="folder-color">Color</Label>
            <div className="flex items-center gap-3">
              <input
                id="folder-color"
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="h-9 w-12 cursor-pointer rounded-md border border-line bg-transparent"
              />
              <div className="flex flex-wrap gap-1.5">
                {SWATCHES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    aria-label={s}
                    onClick={() => setColor(s)}
                    className={`h-6 w-6 rounded-pill border transition ${
                      color.toLowerCase() === s.toLowerCase() ? "border-ink" : "border-line-strong"
                    }`}
                    style={{ background: s }}
                  />
                ))}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-md border border-line bg-glass p-3 backdrop-blur-xl">
            <span className="text-xs text-muted">Vista previa:</span>
            <Badge color={color}>{name.trim() || "Carpeta"}</Badge>
          </div>
          {readableTextOn(color) === "#0d0f08" && (
            <p className="text-xs text-warn">
              Color claro: en tema claro el texto puede tener bajo contraste.
            </p>
          )}
          {error && <p className="text-sm text-danger">{error}</p>}
        </div>
      </Modal>

      <Modal
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title="Eliminar carpeta"
        description={
          deleting
            ? `Se eliminará la carpeta "${deleting.name}". Sus proyectos quedarán en "Sin carpeta".`
            : undefined
        }
        footer={
          <>
            <Button variant="outline" onClick={() => setDeleting(null)}>
              Cancelar
            </Button>
            <Button variant="danger" onClick={confirmDeleteFolder} disabled={pending}>
              {pending ? "Eliminando…" : "Eliminar"}
            </Button>
          </>
        }
      >
        {error && deleting && <p className="text-sm text-danger">{error}</p>}
      </Modal>
    </div>
  );
}
