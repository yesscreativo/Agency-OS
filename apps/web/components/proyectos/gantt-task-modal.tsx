"use client";

import { useState, useTransition } from "react";
import { Button, FieldError, Input, Label, Modal, Select } from "@agency-os/ui";
import { saveGanttTaskAction, type GanttTaskInput } from "@/lib/gantt-actions";
import type { BoardOrgUser, BoardStatus } from "./project-board";
import { AssigneeMultiSelect } from "./work-item-fields";
// `BoardOrgUser`/`BoardStatus` se importan solo como tipo (erasable) — evita un
// ciclo de módulo en runtime con project-board.tsx, que a su vez importa este
// archivo (el componente `GanttTaskModal`, no un tipo) en la Task 8.

export interface GanttTask {
  id: string;
  parentId: string | null;
  title: string;
  statusId: string | null;
  startDate: string | null;
  dueDate: string | null;
  assigneeIds: string[];
  dependsOnIds: string[];
}

/** Selector simple de bloqueantes: checklist de las demás tareas del Gantt de
 * este proyecto (mismo patrón visual que `AssigneeMultiSelect`, sin buscador
 * porque el volumen esperado por proyecto es bajo). */
function BlockerMultiSelect({
  options,
  selectedIds,
  onToggle,
}: {
  options: { id: string; title: string }[];
  selectedIds: string[];
  onToggle: (id: string) => void;
}) {
  if (options.length === 0) {
    return <p className="text-sm text-muted">No hay otras tareas en el Gantt todavía.</p>;
  }
  return (
    <div className="ds-scroll flex max-h-40 flex-col gap-1 overflow-y-auto rounded-md border border-line p-2">
      {options.map((o) => (
        <label key={o.id} className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            className="h-4 w-4 accent-[var(--green)]"
            checked={selectedIds.includes(o.id)}
            onChange={() => onToggle(o.id)}
          />
          {o.title}
        </label>
      ))}
    </div>
  );
}

export function GanttTaskModal({
  open,
  onClose,
  projectId,
  statuses,
  orgUsers,
  otherTasks,
  task,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  projectId: string;
  statuses: BoardStatus[];
  orgUsers: BoardOrgUser[];
  /** Resto de tareas del Gantt de este proyecto, para elegir bloqueantes. */
  otherTasks: { id: string; title: string }[];
  /** Tarea que se edita; null al crear. */
  task: GanttTask | null;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(task?.title ?? "");
  const [statusId, setStatusId] = useState(task?.statusId ?? statuses[0]?.id ?? "");
  const [startDate, setStartDate] = useState(task?.startDate ?? "");
  const [dueDate, setDueDate] = useState(task?.dueDate ?? "");
  const [assigneeIds, setAssigneeIds] = useState<string[]>(task?.assigneeIds ?? []);
  const [dependsOnIds, setDependsOnIds] = useState<string[]>(task?.dependsOnIds ?? []);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const toggleAssignee = (id: string) =>
    setAssigneeIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const toggleDependsOn = (id: string) =>
    setDependsOnIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const submit = () => {
    setError(null);
    if (!title.trim()) return setError("El título es obligatorio.");
    if (!startDate || !dueDate) return setError("Fecha de inicio y fin son obligatorias.");
    if (dueDate < startDate) return setError("La fecha de fin no puede ser anterior al inicio.");

    const input: GanttTaskInput = {
      id: task?.id,
      projectId,
      parentId: task?.parentId ?? null,
      title,
      statusId: statusId || null,
      assigneeIds,
      startDate,
      dueDate,
      dependsOnIds,
    };
    startTransition(async () => {
      const result = await saveGanttTaskAction(input);
      if (result.error) return setError(result.error);
      onSaved();
    });
  };

  return (
    <Modal open={open} onClose={onClose} title={task ? "Editar tarea del Gantt" : "Agregar tarea al Gantt"} size="sm">
      <div className="space-y-4">
        {error && <FieldError>{error}</FieldError>}

        <div>
          <Label htmlFor="gantt-title">Nombre</Label>
          <Input id="gantt-title" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>

        <div>
          <Label htmlFor="gantt-status">Estado</Label>
          <Select id="gantt-status" value={statusId} onChange={(e) => setStatusId(e.target.value)}>
            {statuses.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </Select>
        </div>

        <div className="flex gap-3">
          <div className="flex-1">
            <Label htmlFor="gantt-start">Fecha inicio</Label>
            <Input
              id="gantt-start"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div className="flex-1">
            <Label htmlFor="gantt-due">Fecha fin</Label>
            <Input id="gantt-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
        </div>

        <div>
          <Label>Responsables</Label>
          <AssigneeMultiSelect users={orgUsers} selectedIds={assigneeIds} onToggle={toggleAssignee} disabled={false} />
        </div>

        <div>
          <Label>Depende de (bloqueantes)</Label>
          <BlockerMultiSelect
            options={otherTasks.filter((t) => t.id !== task?.id)}
            selectedIds={dependsOnIds}
            onToggle={toggleDependsOn}
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={submit} disabled={pending}>
            Guardar
          </Button>
        </div>
      </div>
    </Modal>
  );
}
