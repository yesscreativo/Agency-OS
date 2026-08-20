"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Input, Label, Modal, Table, Td, Th, readableTextOn } from "@agency-os/ui";
import {
  deleteProjectStatus,
  reorderProjectStatuses,
  saveProjectStatus,
} from "@/lib/project-actions";

export interface ProjectStatusRow {
  id: string;
  label: string;
  color: string;
  isDone: boolean;
}

/** Paleta curada del design system (misma que el gestor de estados del CRM y el
 * seed de `seed_default_work_item_statuses`). Hexes legibles en ambos temas. */
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

/** Firma de las columnas para re-sincronizar el estado local tras un
 * `router.refresh()` (que refresca las props desde el server). */
function signatureOf(rows: ProjectStatusRow[]): string {
  return rows.map((r) => `${r.id}:${r.label}:${r.color}:${r.isDone ? 1 : 0}`).join("|");
}

type Editing = null | "new" | ProjectStatusRow;

/** Gestor de columnas del tablero (`work_item_statuses`) por proyecto: crear,
 * editar, reordenar (drag&drop) y marcar cuáles cuentan como "hecho" (`is_done`,
 * define el progreso). Calca `crm/quote-status-manager.tsx` pero scopeado a un
 * `projectId` y sin los conceptos propios de cotización (código/sistema/activo).
 * Se monta solo para usuarios con `project.manage`; las actions lo revalidan igual. */
export function ProjectStatusManager({
  projectId,
  statuses,
}: {
  projectId: string;
  statuses: ProjectStatusRow[];
}) {
  const router = useRouter();
  const [rows, setRows] = useState(statuses);
  const [editing, setEditing] = useState<Editing>(null);
  const [deleting, setDeleting] = useState<ProjectStatusRow | null>(null);
  const [label, setLabel] = useState("");
  const [color, setColor] = useState("#7eb8ff");
  const [isDone, setIsDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const dragIndex = useRef<number | null>(null);

  // Tras un router.refresh() las props traen la verdad del server; re-seedeamos
  // el estado local para que gestor y tablero queden consistentes.
  const propsSignature = signatureOf(statuses);
  useEffect(() => {
    setRows(statuses);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propsSignature]);

  const openModal = (target: Exclude<Editing, null>) => {
    setEditing(target);
    setError(null);
    if (target === "new") {
      setLabel("");
      setColor("#7eb8ff");
      setIsDone(false);
    } else {
      setLabel(target.label);
      setColor(target.color);
      setIsDone(target.isDone);
    }
  };

  const submit = () => {
    startTransition(async () => {
      const trimmed = label.trim();
      if (!trimmed) return;
      const result =
        editing === "new"
          ? await saveProjectStatus({
              projectId,
              label: trimmed,
              color,
              isDone,
              sortOrder: rows.length,
            })
          : editing
            ? await saveProjectStatus({ id: editing.id, projectId, label: trimmed, color, isDone })
            : { error: "Sin selección." };
      if ("error" in result && result.error) {
        setError(result.error);
        return;
      }
      if (editing === "new" && "id" in result && result.id) {
        setRows((prev) => [...prev, { id: result.id!, label: trimmed, color, isDone }]);
      } else if (editing && editing !== "new") {
        setRows((prev) =>
          prev.map((r) => (r.id === editing.id ? { ...r, label: trimmed, color, isDone } : r)),
        );
      }
      setEditing(null);
      router.refresh();
    });
  };

  const confirmDelete = () => {
    if (!deleting) return;
    startTransition(async () => {
      const result = await deleteProjectStatus(deleting.id);
      if (result.error) {
        setError(result.error);
        return;
      }
      setRows((prev) => prev.filter((r) => r.id !== deleting.id));
      setDeleting(null);
      router.refresh();
    });
  };

  const onDrop = (index: number) => {
    const from = dragIndex.current;
    dragIndex.current = null;
    if (from === null || from === index) return;
    const next = [...rows];
    const [moved] = next.splice(from, 1);
    if (!moved) return;
    next.splice(index, 0, moved);
    setRows(next);
    startTransition(async () => {
      const result = await reorderProjectStatuses(
        projectId,
        next.map((r) => r.id),
      );
      if (result.error) setError(result.error);
      else router.refresh();
    });
  };

  // Aviso de contraste: color claro en variante suave puede quedar flojo en tema claro.
  const lightColorSoft = readableTextOn(color) === "#0d0f08";

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Estados del tablero</h2>
          <p className="mt-1 text-sm text-muted">
            Personaliza las columnas de este proyecto: nombre, color y orden. Marca las que cuentan
            como completadas para el progreso.
          </p>
        </div>
        <Button onClick={() => openModal("new")}>+ Nuevo estado</Button>
      </div>

      {error && !editing && !deleting && (
        <div className="mt-4 rounded-md border border-danger/40 bg-glass px-4 py-2 text-sm text-danger backdrop-blur-xl">
          {error}
        </div>
      )}

      <div className="mt-6">
        <Table>
          <thead>
            <tr>
              <Th className="w-8"> </Th>
              <Th>Estado</Th>
              <Th>Completado</Th>
              <Th className="text-right"> </Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr
                key={row.id}
                draggable
                onDragStart={() => (dragIndex.current = index)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => onDrop(index)}
                className="transition hover:bg-surface-2"
              >
                <Td
                  className="cursor-grab select-none text-center text-faint"
                  title="Arrastra para reordenar"
                >
                  ⠿
                </Td>
                <Td>
                  <Badge color={row.color}>{row.label}</Badge>
                </Td>
                <Td>
                  <Badge tone={row.isDone ? "success" : "neutral"}>{row.isDone ? "Sí" : "No"}</Badge>
                </Td>
                <Td className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={() => openModal(row)}>
                      Editar
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      disabled={pending}
                      onClick={() => {
                        setError(null);
                        setDeleting(row);
                      }}
                    >
                      Eliminar
                    </Button>
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </div>

      {/* Modal crear/editar */}
      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === "new" ? "Nuevo estado" : "Editar estado"}
        description="Se mostrará como columna del tablero y etiqueta en la lista de tareas."
        footer={
          <>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancelar
            </Button>
            <Button onClick={submit} disabled={pending || !label.trim()}>
              {pending ? "Guardando…" : "Guardar"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <Label htmlFor="ps-label">Nombre</Label>
            <Input
              id="ps-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Ej. En revisión"
              autoFocus
            />
          </div>

          <div>
            <Label htmlFor="ps-color">Color</Label>
            <div className="flex items-center gap-3">
              <input
                id="ps-color"
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

          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isDone}
              onChange={(e) => setIsDone(e.target.checked)}
              className="h-4 w-4 accent-[var(--green)]"
            />
            Las tareas en este estado cuentan como completadas (progreso del proyecto)
          </label>

          <div className="flex items-center gap-3 rounded-md border border-line bg-glass p-3 backdrop-blur-xl">
            <span className="text-xs text-muted">Vista previa:</span>
            <Badge color={color}>{label.trim() || "Estado"}</Badge>
          </div>

          {lightColorSoft && (
            <p className="text-xs text-warn">
              Color claro: en tema claro el texto puede tener bajo contraste.
            </p>
          )}
          {error && <p className="text-sm text-danger">{error}</p>}
        </div>
      </Modal>

      {/* Modal confirmar borrado */}
      <Modal
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title="Eliminar estado"
        description={
          deleting
            ? `Se eliminará la columna "${deleting.label}". Las tareas que la usaban quedarán sin estado.`
            : undefined
        }
        footer={
          <>
            <Button variant="outline" onClick={() => setDeleting(null)}>
              Cancelar
            </Button>
            <Button variant="danger" onClick={confirmDelete} disabled={pending}>
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
