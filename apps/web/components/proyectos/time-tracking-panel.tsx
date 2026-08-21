"use client";

// Panel de registro de tiempo del detalle de tarea (ClickUp Parity Fase C).
// Muestra el total registrado, el desglose por colaborador y el listado de
// entradas, más un formulario manual para agregar tiempo. Cada entrada la puede
// editar/borrar su dueño (o cualquiera con `canManage`).
//
// El parseo de la duración ocurre AQUÍ (cliente) con `parseDuration`; la action
// `addTimeEntry`/`editTimeEntry` recibe minutos ya numéricos. Tras cada mutación
// se hace `router.refresh()` para recargar las entradas del server.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Avatar, Button, Input, Textarea } from "@agency-os/ui";
import { formatDuration, groupMinutesByUser, initialsOf, parseDuration, sumMinutes } from "@agency-os/domain";
import {
  addTimeEntry,
  deleteTimeEntryAction,
  editTimeEntry,
  type TimeEntryDTO,
} from "@/lib/time-tracking-actions";

const DURATION_PLACEHOLDER = "p. ej. 2h, 90m, 1h 30m…";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Formatea "YYYY-MM-DD" a algo legible ("21 ago"). Cae al string crudo si no parsea. */
function formatDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("es", { day: "numeric", month: "short" });
}

export function TimeTrackingPanel({
  workItemId,
  currentUserId,
  canManage,
  entries,
  orgUsers,
}: {
  workItemId: string;
  currentUserId: string;
  canManage: boolean;
  entries: TimeEntryDTO[];
  orgUsers?: { id: string; name: string; avatarUrl?: string | null }[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Formulario de alta.
  const [durationInput, setDurationInput] = useState("");
  const [spentOn, setSpentOn] = useState(today());
  const [note, setNote] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  // Edición inline: id de la entrada en edición + su error.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDuration, setEditDuration] = useState("");
  const [editSpentOn, setEditSpentOn] = useState("");
  const [editNote, setEditNote] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);

  // Nombre/avatar por usuario: se resuelve desde las entries y se completa con
  // orgUsers (para IDs que aún no tienen entradas, aunque hoy no ocurre).
  const userInfo = new Map<string, { name: string; avatarUrl: string | null }>();
  for (const u of orgUsers ?? []) userInfo.set(u.id, { name: u.name, avatarUrl: u.avatarUrl ?? null });
  for (const e of entries) {
    if (!userInfo.has(e.userId)) userInfo.set(e.userId, { name: e.userName, avatarUrl: e.userAvatarUrl });
  }
  const nameOf = (userId: string) => userInfo.get(userId)?.name ?? "—";
  const avatarOf = (userId: string) => userInfo.get(userId)?.avatarUrl ?? null;

  const totalMinutes = sumMinutes(entries);
  const byUser = groupMinutesByUser(entries);

  const resetForm = () => {
    setDurationInput("");
    setSpentOn(today());
    setNote("");
    setFormError(null);
  };

  const onAdd = () => {
    setFormError(null);
    const parsed = parseDuration(durationInput);
    if (parsed.error) return setFormError(parsed.error);
    if (parsed.minutes == null || parsed.minutes <= 0) {
      return setFormError("Ingresa una duración mayor a cero.");
    }
    const minutes = parsed.minutes;
    startTransition(async () => {
      const res = await addTimeEntry({ workItemId, minutes, spentOn, note: note.trim() || null });
      if (res.error) {
        setFormError(res.error);
        return;
      }
      resetForm();
      router.refresh();
    });
  };

  const startEdit = (entry: TimeEntryDTO) => {
    setRowError(null);
    setEditError(null);
    setEditingId(entry.id);
    setEditDuration(formatDuration(entry.minutes));
    setEditSpentOn(entry.spentOn);
    setEditNote(entry.note ?? "");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditError(null);
  };

  const onSaveEdit = (id: string) => {
    setEditError(null);
    const parsed = parseDuration(editDuration);
    if (parsed.error) return setEditError(parsed.error);
    if (parsed.minutes == null || parsed.minutes <= 0) {
      return setEditError("Ingresa una duración mayor a cero.");
    }
    const minutes = parsed.minutes;
    startTransition(async () => {
      const res = await editTimeEntry({ id, minutes, spentOn: editSpentOn, note: editNote.trim() || null });
      if (res.error) {
        setEditError(res.error);
        return;
      }
      setEditingId(null);
      router.refresh();
    });
  };

  const onDelete = (id: string) => {
    setRowError(null);
    startTransition(async () => {
      const res = await deleteTimeEntryAction(id);
      if (res.error) {
        setRowError(res.error);
        return;
      }
      router.refresh();
    });
  };

  const canEditEntry = (entry: TimeEntryDTO) => canManage || entry.userId === currentUserId;

  return (
    <section className="rounded-lg border border-line bg-glass p-6 backdrop-blur-xl" aria-busy={isPending}>
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-ink">Tiempo registrado</h2>
        <span className="text-sm font-semibold text-ink">
          {totalMinutes > 0 ? formatDuration(totalMinutes) : "0m"}
        </span>
      </div>

      {/* Desglose por colaborador */}
      {byUser.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {byUser.map((u) => (
            <div
              key={u.userId}
              className="flex items-center gap-2 rounded-pill border border-line bg-glass px-3 py-1.5 text-sm"
            >
              <Avatar initials={initialsOf(nameOf(u.userId))} src={avatarOf(u.userId)} size="xs" />
              <span className="text-muted">{nameOf(u.userId)}</span>
              <span className="font-semibold text-ink">{formatDuration(u.minutes)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Listado de entradas */}
      <div className="mt-4 space-y-1.5">
        {entries.length === 0 ? (
          <p className="text-sm text-faint">Aún no hay tiempo registrado.</p>
        ) : (
          entries.map((entry) =>
            editingId === entry.id ? (
              <div key={entry.id} className="rounded-md border border-line bg-glass p-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
                  <Input
                    autoFocus
                    value={editDuration}
                    onChange={(e) => setEditDuration(e.target.value)}
                    placeholder={DURATION_PLACEHOLDER}
                    className="sm:w-40"
                  />
                  <Input
                    type="date"
                    value={editSpentOn}
                    onChange={(e) => setEditSpentOn(e.target.value)}
                    className="sm:w-44"
                  />
                </div>
                <Textarea
                  value={editNote}
                  onChange={(e) => setEditNote(e.target.value)}
                  rows={2}
                  placeholder="Nota (opcional)"
                  className="mt-2"
                />
                {editError && <p className="mt-1 text-sm text-danger">{editError}</p>}
                <div className="mt-2 flex items-center gap-2">
                  <Button variant="primary" size="sm" onClick={() => onSaveEdit(entry.id)} disabled={isPending}>
                    Guardar
                  </Button>
                  <Button variant="ghost" size="sm" onClick={cancelEdit} disabled={isPending}>
                    Cancelar
                  </Button>
                </div>
              </div>
            ) : (
              <div
                key={entry.id}
                className="flex items-center gap-3 rounded-md border border-line bg-glass px-3 py-2 text-sm"
              >
                <Avatar initials={initialsOf(nameOf(entry.userId))} src={avatarOf(entry.userId)} size="xs" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-ink">{nameOf(entry.userId)}</span>
                    <span className="font-semibold text-ink">{formatDuration(entry.minutes)}</span>
                    <span className="text-faint">·</span>
                    <span className="text-muted">{formatDay(entry.spentOn)}</span>
                  </div>
                  {entry.note && <p className="truncate text-muted">{entry.note}</p>}
                </div>
                {canEditEntry(entry) && (
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => startEdit(entry)}
                      disabled={isPending}
                      className="rounded-md px-2 py-1 text-xs text-muted transition hover:bg-surface-2 hover:text-ink"
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(entry.id)}
                      disabled={isPending}
                      className="rounded-md px-2 py-1 text-xs text-muted transition hover:bg-surface-2 hover:text-danger"
                    >
                      Borrar
                    </button>
                  </div>
                )}
              </div>
            ),
          )
        )}
      </div>
      {rowError && <p className="mt-1 text-sm text-danger">{rowError}</p>}

      {/* Formulario de alta */}
      <div className="mt-4 border-t border-line pt-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
          <Input
            value={durationInput}
            onChange={(e) => setDurationInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onAdd()}
            placeholder={DURATION_PLACEHOLDER}
            className="sm:w-40"
            aria-label="Duración"
          />
          <Input
            type="date"
            value={spentOn}
            onChange={(e) => setSpentOn(e.target.value)}
            className="sm:w-44"
            aria-label="Fecha"
          />
        </div>
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          placeholder="Nota (opcional)"
          className="mt-2"
          aria-label="Nota"
        />
        {formError && <p className="mt-1 text-sm text-danger">{formError}</p>}
        <div className="mt-2">
          <Button variant="primary" size="sm" onClick={onAdd} disabled={isPending}>
            {isPending ? "Agregando…" : "Agregar"}
          </Button>
        </div>
      </div>
    </section>
  );
}
