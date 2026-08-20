"use client";

// Campos compartidos entre el modal de creación rápida (`work-item-editor.tsx`)
// y la vista de tarea a pantalla completa (`work-item-detail.tsx`): etiqueta de
// prioridad, tarjetas de adjunto y el selector de asignados con buscador.

import { useState } from "react";
import { Badge, Input } from "@agency-os/ui";
import type { WorkItemPriority } from "@agency-os/domain";
import type { WorkItemAttachment } from "@/lib/project-actions";

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

export const PRIORITY_LABEL: Record<WorkItemPriority, string> = {
  low: "Baja",
  normal: "Normal",
  high: "Alta",
  urgent: "Urgente",
};

/** Usuario para el selector de asignados (estructuralmente compatible con
 * `BoardOrgUser` del board, sin importarlo y evitar un ciclo). */
export interface AssigneeUser {
  id: string;
  name: string;
}

export function isImage(mime: string | null): boolean {
  // Excluye SVG: aunque en <img> no ejecuta scripts, se sube como
  // application/octet-stream (ver safeStorageContentType) y no debe previsualizarse.
  return !!mime && mime.startsWith("image/") && !mime.startsWith("image/svg");
}

/** Tarjeta de un adjunto ya subido: preview de imagen o icono genérico, con
 * enlace a la URL firmada y (si hay permiso) botón para quitarlo. */
export function AttachmentCard({
  attachment,
  onRemove,
}: {
  attachment: WorkItemAttachment;
  onRemove?: () => void;
}) {
  return (
    <div className="relative rounded-md border border-line bg-glass p-2">
      {onRemove && (
        <button
          type="button"
          aria-label={`Quitar ${attachment.filename}`}
          onClick={onRemove}
          className="absolute right-1 top-1 z-10 rounded-pill bg-black/60 px-1.5 text-xs leading-5 text-white transition hover:bg-black/80"
        >
          ✕
        </button>
      )}
      <a
        href={attachment.url ?? undefined}
        target="_blank"
        rel="noreferrer"
        className="block"
        title={attachment.filename}
      >
        {isImage(attachment.mimeType) && attachment.url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={attachment.url}
            alt={attachment.filename}
            className="h-24 w-full rounded object-cover"
          />
        ) : (
          <div className="flex h-24 items-center justify-center rounded bg-surface-2 text-3xl">📄</div>
        )}
        <div className="mt-1 truncate text-xs text-muted">{attachment.filename}</div>
      </a>
    </div>
  );
}

/** Tarjeta de un archivo elegido al crear la tarea (aún no subido). */
export function PendingFileCard({ file, onRemove }: { file: File; onRemove?: () => void }) {
  return (
    <div className="relative rounded-md border border-dashed border-line bg-glass p-2">
      {onRemove && (
        <button
          type="button"
          aria-label={`Quitar ${file.name}`}
          onClick={onRemove}
          className="absolute right-1 top-1 z-10 rounded-pill bg-black/60 px-1.5 text-xs leading-5 text-white transition hover:bg-black/80"
        >
          ✕
        </button>
      )}
      <div className="flex h-24 items-center justify-center rounded bg-surface-2 text-3xl">
        {file.type.startsWith("image/") ? "🖼️" : "📄"}
      </div>
      <div className="mt-1 truncate text-xs text-muted" title={file.name}>
        {file.name}
      </div>
      <div className="text-[11px] text-faint">Se subirá al guardar</div>
    </div>
  );
}

/** Selector de asignados con buscador: muestra los ya asignados como chips
 * removibles y un input que filtra el resto de la organización en vivo. La lista
 * de coincidencias se renderiza inline (no en overlay absoluto) para no
 * recortarse dentro de contenedores scrolleables. */
export function AssigneeMultiSelect({
  users,
  selectedIds,
  onToggle,
  disabled,
}: {
  users: AssigneeUser[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  disabled: boolean;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const selected = users.filter((u) => selectedIds.includes(u.id));
  const q = query.trim().toLowerCase();
  const matches = users.filter(
    (u) => !selectedIds.includes(u.id) && (q === "" || u.name.toLowerCase().includes(q)),
  );

  return (
    <div className="space-y-2">
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((u) => (
            <span
              key={u.id}
              className="inline-flex items-center gap-1.5 rounded-pill border border-line-strong bg-glass px-2.5 py-1 text-sm text-ink"
            >
              {u.name}
              {!disabled && (
                <button
                  type="button"
                  aria-label={`Quitar a ${u.name}`}
                  onClick={() => onToggle(u.id)}
                  className="leading-none text-muted transition hover:text-ink"
                >
                  ✕
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      {!disabled && (
        <div>
          <Input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            placeholder="Buscar persona…"
          />
          {open && (
            <div className="mt-1 max-h-44 overflow-y-auto rounded-md border border-line bg-glass backdrop-blur-xl">
              {matches.length > 0 ? (
                matches.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => {
                      onToggle(u.id);
                      setQuery("");
                    }}
                    className="block w-full px-3 py-2 text-left text-sm text-ink transition hover:bg-surface-2"
                  >
                    {u.name}
                  </button>
                ))
              ) : (
                <p className="px-3 py-2 text-sm text-muted">
                  {q === "" ? "Todos ya están asignados." : "Sin resultados."}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Chip de prioridad para tarjetas/listas (colores del board). */
export const PRIORITY_BADGE: Record<
  WorkItemPriority,
  { label: string; tone: "success" | "info" | "danger" | "neutral"; variant?: "soft" | "solid" }
> = {
  low: { label: "Baja", tone: "neutral" },
  normal: { label: "Normal", tone: "info" },
  high: { label: "Alta", tone: "danger" },
  urgent: { label: "Urgente", tone: "danger", variant: "solid" },
};

/** Badge de prioridad reutilizable. */
export function PriorityBadge({ priority }: { priority: WorkItemPriority }) {
  const p = PRIORITY_BADGE[priority];
  return (
    <Badge tone={p.tone} variant={p.variant}>
      {p.label}
    </Badge>
  );
}
