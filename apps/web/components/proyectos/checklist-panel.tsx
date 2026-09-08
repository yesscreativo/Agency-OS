"use client";

// Checklist simple de una tarea/subtarea: una sola lista sin agrupar, que
// arma y tilda quien la ejecuta (asignado) o quien tiene project.manage. Mismo
// patrón visual que las secciones "Subtareas"/"Adjuntos" de work-item-detail.tsx
// y el mismo mecanismo de drag&drop que project-status-manager.tsx.

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@agency-os/ui";
import { checklistProgress } from "@agency-os/domain";
import {
  addChecklistItem,
  deleteChecklistItemAction,
  reorderChecklistItemsAction,
  toggleChecklistItemAction,
} from "@/lib/checklist-actions";

export interface ChecklistItemView {
  id: string;
  label: string;
  isCompleted: boolean;
}

function signatureOf(items: ChecklistItemView[]): string {
  return items.map((i) => `${i.id}:${i.label}:${i.isCompleted ? 1 : 0}`).join("|");
}

export function ChecklistPanel({
  workItemId,
  items,
  canWrite,
}: {
  workItemId: string;
  items: ChecklistItemView[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const [rows, setRows] = useState(items);
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const dragIndex = useRef<number | null>(null);

  // Tras router.refresh(), las props traen la verdad del server (mismo patrón
  // que ProjectStatusManager).
  const propsSignature = signatureOf(items);
  useEffect(() => {
    setRows(items);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propsSignature]);

  const progress = checklistProgress(rows.map((r) => ({ isCompleted: r.isCompleted })));

  const onAdd = () => {
    const trimmed = label.trim();
    if (!trimmed) return;
    setError(null);
    startTransition(async () => {
      const res = await addChecklistItem(workItemId, trimmed);
      if (res.error || !res.item) {
        setError(res.error ?? "No se pudo agregar el ítem.");
        return;
      }
      setRows((prev) => [
        ...prev,
        { id: res.item!.id, label: res.item!.label, isCompleted: res.item!.is_completed },
      ]);
      setLabel("");
      router.refresh();
    });
  };

  const onToggle = (id: string, completed: boolean) => {
    setError(null);
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, isCompleted: completed } : r)));
    startTransition(async () => {
      const res = await toggleChecklistItemAction(id, completed);
      if (res.error) {
        setError(res.error);
        setRows((prev) => prev.map((r) => (r.id === id ? { ...r, isCompleted: !completed } : r)));
        return;
      }
      router.refresh();
    });
  };

  const onDelete = (id: string) => {
    setError(null);
    setRows((prev) => prev.filter((r) => r.id !== id));
    startTransition(async () => {
      const res = await deleteChecklistItemAction(id);
      if (res.error) setError(res.error);
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
      const res = await reorderChecklistItemsAction(
        workItemId,
        next.map((r) => r.id),
      );
      if (res.error) setError(res.error);
      else router.refresh();
    });
  };

  return (
    <section className="rounded-lg border border-line bg-glass p-6 backdrop-blur-xl">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-ink">Checklist</h2>
        {progress.total > 0 && (
          <span className="font-mono text-xs text-muted">
            {progress.completed}/{progress.total}
          </span>
        )}
      </div>

      {progress.total > 0 && (
        <div className="mt-2 h-1 w-full overflow-hidden rounded-pill bg-surface-2">
          <div
            className="h-full rounded-pill bg-green transition-all"
            style={{ width: `${(progress.completed / progress.total) * 100}%` }}
          />
        </div>
      )}

      {rows.length > 0 ? (
        <div className="mt-3 space-y-1">
          {rows.map((row, index) => (
            <div
              key={row.id}
              draggable={canWrite}
              onDragStart={() => (dragIndex.current = index)}
              onDragOver={(e) => canWrite && e.preventDefault()}
              onDrop={() => canWrite && onDrop(index)}
              className={`group flex items-center gap-2 rounded-md px-2 py-1.5 transition hover:bg-surface-2 ${
                canWrite ? "cursor-grab active:cursor-grabbing" : ""
              }`}
            >
              <input
                type="checkbox"
                checked={row.isCompleted}
                disabled={!canWrite || isPending}
                onChange={(e) => onToggle(row.id, e.target.checked)}
                aria-label={row.label}
                className="h-4 w-4 shrink-0 accent-[var(--green)]"
              />
              <span
                className={`flex-1 text-sm ${row.isCompleted ? "text-faint line-through" : "text-ink"}`}
              >
                {row.label}
              </span>
              {canWrite && (
                <button
                  type="button"
                  aria-label={`Quitar "${row.label}"`}
                  onClick={() => onDelete(row.id)}
                  className="text-muted opacity-0 transition hover:text-danger group-hover:opacity-100"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-sm text-faint">Sin ítems.</p>
      )}

      {canWrite && (
        <div className="mt-3">
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onAdd();
              }
            }}
            placeholder="+ Agregar ítem…"
            disabled={isPending}
          />
        </div>
      )}
      {error && <p className="mt-1 text-sm text-danger">{error}</p>}
    </section>
  );
}
