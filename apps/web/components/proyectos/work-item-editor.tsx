"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import {
  Badge,
  Button,
  FieldError,
  Input,
  Label,
  Modal,
  Select,
  Textarea,
} from "@agency-os/ui";
import { parseDuration, WORK_ITEM_PRIORITIES, type WorkItemPriority } from "@agency-os/domain";
import {
  deleteWorkItem,
  deleteWorkItemAttachment,
  listWorkItemAttachments,
  saveWorkItem,
  setWorkItemAssignees,
  uploadWorkItemAttachment,
  type WorkItemAttachment,
} from "@/lib/project-actions";
import type { BoardOrgUser, BoardStatus, BoardTask } from "./project-board";
import {
  AssigneeMultiSelect,
  AttachmentCard,
  MAX_ATTACHMENT_BYTES,
  PendingFileCard,
  PRIORITY_LABEL,
} from "./work-item-fields";

export function WorkItemEditor({
  open,
  onClose,
  projectId,
  statuses,
  orgUsers,
  canManage,
  canAssign,
  task,
  parentId,
  parentTitle,
  defaultStatusId,
  subtasks,
  onSaved,
  onDeleted,
  onOpenSubtask,
  onAddSubtask,
}: {
  open: boolean;
  onClose: () => void;
  projectId: string;
  statuses: BoardStatus[];
  orgUsers: BoardOrgUser[];
  canManage: boolean;
  canAssign: boolean;
  /** Tarea/subtarea que se está editando; null al crear. */
  task: BoardTask | null;
  /** Tarea padre al crear una subtarea (null en el resto de los casos). */
  parentId?: string | null;
  parentTitle?: string | null;
  /** Columna preseleccionada al crear una tarea desde el tablero. */
  defaultStatusId?: string | null;
  /** Subtareas de `task`, solo cuando se edita una tarea de nivel superior. */
  subtasks?: BoardTask[];
  onSaved: () => void;
  onDeleted: () => void;
  onOpenSubtask?: (id: string) => void;
  onAddSubtask?: () => void;
}) {
  const isCreatingSubtask = !task && Boolean(parentId);

  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [priority, setPriority] = useState<WorkItemPriority>(task?.priority ?? "normal");
  const [statusId, setStatusId] = useState(task?.statusId ?? defaultStatusId ?? "");
  const [startDate, setStartDate] = useState(task?.startDate ?? "");
  const [dueDate, setDueDate] = useState(task?.dueDate ?? "");
  const [estimated, setEstimated] = useState("");
  const [assigneeIds, setAssigneeIds] = useState<string[]>(task?.assignees.map((a) => a.id) ?? []);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Adjuntos: los de una tarea existente se cargan al abrir; los elegidos al
  // crear (aún sin id) se bufferean en `pendingFiles` y se suben tras guardar.
  const [attachments, setAttachments] = useState<WorkItemAttachment[]>([]);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [attachmentBusy, setAttachmentBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!task?.id) return;
    let active = true;
    listWorkItemAttachments(task.id).then((res) => {
      if (active && "attachments" in res && res.attachments) setAttachments(res.attachments);
    });
    return () => {
      active = false;
    };
  }, [task?.id]);

  const onFilesSelected = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setAttachmentError(null);
    const list = Array.from(files);
    const tooBig = list.find((f) => f.size > MAX_ATTACHMENT_BYTES);
    if (tooBig) {
      setAttachmentError(`"${tooBig.name}" supera el límite de 10 MB.`);
    } else if (task?.id) {
      // Tarea existente: subir de inmediato.
      const targetId = task.id;
      setAttachmentBusy(true);
      startTransition(async () => {
        for (const file of list) {
          const fd = new FormData();
          fd.append("file", file);
          const res = await uploadWorkItemAttachment(targetId, fd);
          if (res.error || !res.attachment) {
            setAttachmentError(res.error ?? "No se pudo subir el archivo.");
            break;
          }
          const uploaded = res.attachment;
          setAttachments((prev) => [...prev, uploaded]);
        }
        setAttachmentBusy(false);
      });
    } else {
      // Creando: bufferear hasta que la tarea exista.
      setPendingFiles((prev) => [...prev, ...list]);
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeAttachment = (id: string) => {
    setAttachmentError(null);
    startTransition(async () => {
      const res = await deleteWorkItemAttachment(id);
      if (res.error) setAttachmentError(res.error);
      else setAttachments((prev) => prev.filter((a) => a.id !== id));
    });
  };

  const removePending = (index: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const canSubmit = Boolean(title.trim());
  const modalTitle = task
    ? task.type === "subtask"
      ? "Editar subtarea"
      : "Editar tarea"
    : isCreatingSubtask
      ? "Nueva subtarea"
      : "Nueva tarea";
  const modalDescription = isCreatingSubtask && parentTitle ? `En: ${parentTitle}` : undefined;

  const toggleAssignee = (userId: string) => {
    setAssigneeIds((ids) => (ids.includes(userId) ? ids.filter((id) => id !== userId) : [...ids, userId]));
  };

  const onSave = () => {
    if (!canSubmit) return;
    setError(null);
    const parsedEstimate = parseDuration(estimated);
    if (parsedEstimate.error) {
      setError(parsedEstimate.error);
      return;
    }
    startTransition(async () => {
      // `saveWorkItem` (project.manage) y `setWorkItemAssignees` (project.assign)
      // son permisos independientes en el servidor: un usuario con solo
      // project.assign puede reasignar una tarea existente sin poder editar sus
      // demás campos (que ya están deshabilitados en el form vía `canManage`).
      let savedId = task?.id;
      if (canManage) {
        const res = await saveWorkItem({
          id: task?.id,
          projectId,
          parentId: task ? undefined : (parentId ?? undefined),
          type: task ? undefined : parentId ? "subtask" : "task",
          title: title.trim(),
          description: description.trim() || null,
          statusId: statusId || null,
          priority,
          startDate: startDate || null,
          dueDate: dueDate || null,
          estimatedMinutes: parsedEstimate.minutes,
        });
        if (res.error || !res.id) {
          setError(res.error ?? "No se pudo guardar la tarea. Intenta de nuevo.");
          return;
        }
        savedId = res.id;
      }
      if (canAssign && savedId) {
        const assignRes = await setWorkItemAssignees(savedId, assigneeIds);
        if (assignRes.error) {
          setError(assignRes.error);
          return;
        }
      }
      // Sube los adjuntos que se eligieron mientras la tarea aún no existía.
      if (canManage && savedId && pendingFiles.length > 0) {
        for (const file of pendingFiles) {
          const fd = new FormData();
          fd.append("file", file);
          const res = await uploadWorkItemAttachment(savedId, fd);
          if (res.error) {
            setError(res.error);
            return;
          }
        }
      }
      onSaved();
    });
  };

  const onDeleteClick = () => {
    if (!task) return;
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await deleteWorkItem(task.id);
      if (res.error) {
        setError(res.error);
        setConfirmingDelete(false);
        return;
      }
      onDeleted();
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={modalTitle}
      description={modalDescription}
      size="lg"
      footer={
        <>
          {task && canManage && (
            <Button
              variant="danger"
              size="sm"
              onClick={onDeleteClick}
              disabled={isPending}
              className="mr-auto"
            >
              {confirmingDelete ? "¿Confirmar?" : "Eliminar"}
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={onClose} disabled={isPending}>
            Cancelar
          </Button>
          {(canManage || canAssign) && (
            <Button variant="primary" size="sm" onClick={onSave} disabled={isPending || !canSubmit}>
              Guardar
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <Label htmlFor="wi-title">Título *</Label>
          <Input
            id="wi-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={!canManage}
          />
        </div>
        <div>
          <Label htmlFor="wi-description">Descripción</Label>
          <Textarea
            id="wi-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            disabled={!canManage}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="wi-status">Estado</Label>
            <Select
              id="wi-status"
              value={statusId}
              onChange={(e) => setStatusId(e.target.value)}
              disabled={!canManage}
            >
              <option value="">Sin estado</option>
              {statuses.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="wi-priority">Prioridad</Label>
            <Select
              id="wi-priority"
              value={priority}
              onChange={(e) => setPriority(e.target.value as WorkItemPriority)}
              disabled={!canManage}
            >
              {WORK_ITEM_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABEL[p]}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="wi-start">Inicio</Label>
            <Input
              id="wi-start"
              type="date"
              value={startDate ?? ""}
              onChange={(e) => setStartDate(e.target.value)}
              disabled={!canManage}
            />
          </div>
          <div>
            <Label htmlFor="wi-due">Vence</Label>
            <Input
              id="wi-due"
              type="date"
              value={dueDate ?? ""}
              onChange={(e) => setDueDate(e.target.value)}
              disabled={!canManage}
            />
          </div>
        </div>

        <div>
          <Label htmlFor="wi-estimate">Duración estimada</Label>
          <Input
            id="wi-estimate"
            value={estimated}
            onChange={(e) => setEstimated(e.target.value)}
            placeholder="p. ej. 2h, 90m, 1h 30m"
            disabled={!canManage}
          />
        </div>

        <div>
          <Label>Asignados</Label>
          {orgUsers.length === 0 ? (
            <p className="text-sm text-muted">No hay usuarios en la organización.</p>
          ) : (
            <AssigneeMultiSelect
              users={orgUsers}
              selectedIds={assigneeIds}
              onToggle={toggleAssignee}
              disabled={!canAssign}
            />
          )}
        </div>

        <div>
          <Label>Adjuntos</Label>
          {attachments.length > 0 || pendingFiles.length > 0 ? (
            <div className="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {attachments.map((a) => (
                <AttachmentCard
                  key={a.id}
                  attachment={a}
                  onRemove={canManage ? () => removeAttachment(a.id) : undefined}
                />
              ))}
              {pendingFiles.map((f, i) => (
                <PendingFileCard
                  key={`${f.name}-${i}`}
                  file={f}
                  onRemove={canManage ? () => removePending(i) : undefined}
                />
              ))}
            </div>
          ) : (
            <p className="mt-1 text-sm text-faint">Sin archivos.</p>
          )}
          {canManage && (
            <div className="mt-2">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => onFilesSelected(e.target.files)}
              />
              <Button
                variant="outline"
                size="sm"
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={attachmentBusy}
              >
                {attachmentBusy ? "Subiendo…" : "+ Agregar archivo"}
              </Button>
            </div>
          )}
          {attachmentError && <p className="mt-1 text-sm text-danger">{attachmentError}</p>}
        </div>

        {task && task.type === "task" && (
          <div>
            <div className="flex items-center justify-between">
              <Label>Subtareas</Label>
              {canManage && onAddSubtask && (
                <button
                  type="button"
                  onClick={onAddSubtask}
                  className="text-xs font-semibold text-green hover:underline"
                >
                  + Agregar subtarea
                </button>
              )}
            </div>
            {subtasks && subtasks.length > 0 ? (
              <div className="mt-1 space-y-1.5">
                {subtasks.map((st) => (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => onOpenSubtask?.(st.id)}
                    className="flex w-full items-center justify-between gap-2 rounded-md border border-line bg-glass px-3 py-2 text-left text-sm transition hover:border-line-strong"
                  >
                    <span className="truncate">{st.title}</span>
                    <Badge tone="neutral">{PRIORITY_LABEL[st.priority]}</Badge>
                  </button>
                ))}
              </div>
            ) : (
              <p className="mt-1 text-sm text-faint">Sin subtareas.</p>
            )}
          </div>
        )}

        {error && <FieldError>{error}</FieldError>}
      </div>
    </Modal>
  );
}
