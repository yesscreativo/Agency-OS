"use client";

// Vista de tarea a pantalla completa (ruta /proyectos/[cliente]/[proyecto]/tareas/[tarea]).
// Reemplaza al modal angosto para EDITAR: layout de 2 columnas (contenido +
// panel de actividad), con el mismo molde que `quote-form.tsx`. El modal
// `WorkItemEditor` se sigue usando solo para CREAR (tareas rápidas y subtareas).

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge, Button, FieldError, Input, Label, Textarea } from "@agency-os/ui";
import type { WorkItemPriority } from "@agency-os/domain";
import {
  deleteWorkItem,
  deleteWorkItemAttachment,
  saveWorkItem,
  uploadWorkItemAttachment,
  type WorkItemAttachment,
} from "@/lib/project-actions";
import { taskHref } from "@/lib/project-paths";
import type { BoardStatus } from "./project-board";
import { WorkItemEditor } from "./work-item-editor";
import { AttachmentCard, MAX_ATTACHMENT_BYTES, PriorityBadge } from "./work-item-fields";
import { WorkItemFieldsPanel } from "./work-item-fields-panel";
import {
  WorkItemActivityPanel,
  type PanelActivity,
  type PanelComment,
} from "./work-item-activity-panel";

export interface DetailAssignee {
  id: string;
  name: string;
  /** Solo presente en la lista de orgUsers; los asignados de la tarea usan iniciales. */
  avatarUrl?: string | null;
}

export interface DetailTask {
  id: string;
  type: "task" | "subtask";
  title: string;
  description: string | null;
  statusId: string | null;
  priority: WorkItemPriority;
  startDate: string | null;
  dueDate: string | null;
  estimatedMinutes: number | null;
  assignees: DetailAssignee[];
}

export interface DetailSubtask {
  id: string;
  title: string;
  priority: WorkItemPriority;
  statusId: string | null;
}

export function WorkItemDetail({
  projectId,
  projectPath,
  task,
  subtasks,
  statuses,
  orgUsers,
  canManage,
  canAssign,
  initialAttachments,
  currentUserId,
  comments,
  activity,
}: {
  projectId: string;
  /** Ruta canónica del proyecto (/proyectos/[cliente]/[proyecto]); base para
   * enlazar subtareas y para volver tras borrar. */
  projectPath: string;
  task: DetailTask;
  subtasks: DetailSubtask[];
  statuses: BoardStatus[];
  orgUsers: DetailAssignee[];
  canManage: boolean;
  canAssign: boolean;
  initialAttachments: WorkItemAttachment[];
  currentUserId: string;
  comments: PanelComment[];
  activity: PanelActivity[];
}) {
  const router = useRouter();

  // Título y descripción se editan aquí; el resto de campos (estado, prioridad,
  // fechas, duración, asignados) los maneja WorkItemFieldsPanel inline.
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [creatingSubtask, setCreatingSubtask] = useState(false);

  const [attachments, setAttachments] = useState<WorkItemAttachment[]>(initialAttachments);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [attachmentBusy, setAttachmentBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canSubmit = Boolean(title.trim());

  const onFilesSelected = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setAttachmentError(null);
    const list = Array.from(files);
    const tooBig = list.find((f) => f.size > MAX_ATTACHMENT_BYTES);
    if (tooBig) {
      setAttachmentError(`"${tooBig.name}" supera el límite de 10 MB.`);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    setAttachmentBusy(true);
    startTransition(async () => {
      for (const file of list) {
        const fd = new FormData();
        fd.append("file", file);
        const res = await uploadWorkItemAttachment(task.id, fd);
        if (res.error || !res.attachment) {
          setAttachmentError(res.error ?? "No se pudo subir el archivo.");
          break;
        }
        const uploaded = res.attachment;
        setAttachments((prev) => [...prev, uploaded]);
      }
      setAttachmentBusy(false);
    });
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

  // Guarda título + descripción. Reenvía los demás campos desde `task` (estado
  // actual del server) para no pisarlos: saveWorkItem reescribe todo el registro.
  const onSave = () => {
    if (!canSubmit || !canManage) return;
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const res = await saveWorkItem({
        id: task.id,
        projectId,
        title: title.trim(),
        description: description.trim() || null,
        statusId: task.statusId,
        priority: task.priority,
        startDate: task.startDate,
        dueDate: task.dueDate,
        estimatedMinutes: task.estimatedMinutes,
      });
      if (res.error || !res.id) {
        setError(res.error ?? "No se pudo guardar la tarea. Intenta de nuevo.");
        return;
      }
      setSaved(true);
      router.refresh();
    });
  };

  const onDeleteClick = () => {
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
      router.push(projectPath);
    });
  };

  const statusById = new Map(statuses.map((s) => [s.id, s]));

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_340px]">
      {/* Columna principal */}
      <div className="space-y-6">
        <Input
          id="wi-title"
          aria-label="Título de la tarea"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => title.trim() !== task.title && onSave()}
          disabled={!canManage}
          className="border-0 bg-transparent px-0 py-0 text-3xl font-bold tracking-tight focus:shadow-none disabled:opacity-100"
        />

        {/* Campos compactos estilo ClickUp: edición inline + auto-guardado. */}
        <WorkItemFieldsPanel
          projectId={projectId}
          task={{
            id: task.id,
            title: task.title,
            description: task.description,
            statusId: task.statusId,
            priority: task.priority,
            startDate: task.startDate,
            dueDate: task.dueDate,
            estimatedMinutes: task.estimatedMinutes,
            assignees: task.assignees,
          }}
          statuses={statuses}
          orgUsers={orgUsers}
          canManage={canManage}
          canAssign={canAssign}
        />

        <section className="rounded-lg border border-line bg-glass p-6 backdrop-blur-xl">
          <div className="flex items-center justify-between">
            <Label htmlFor="wi-description">Descripción</Label>
            {canManage && description !== (task.description ?? "") && (
              <Button variant="primary" size="sm" onClick={onSave} disabled={isPending}>
                {isPending ? "Guardando…" : "Guardar"}
              </Button>
            )}
          </div>
          <Textarea
            id="wi-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={6}
            disabled={!canManage}
          />
          {saved && !isPending && <span className="mt-1 block text-sm text-green">Guardado ✓</span>}
        </section>

        {task.type === "task" && (
          <section className="rounded-lg border border-line bg-glass p-6 backdrop-blur-xl">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-ink">Subtareas</h2>
              {canManage && (
                <button
                  type="button"
                  onClick={() => setCreatingSubtask(true)}
                  className="text-xs font-semibold text-green hover:underline"
                >
                  + Agregar subtarea
                </button>
              )}
            </div>
            {subtasks.length > 0 ? (
              <div className="mt-3 space-y-1.5">
                {subtasks.map((st) => {
                  const stStatus = st.statusId ? statusById.get(st.statusId) : null;
                  return (
                    <Link
                      key={st.id}
                      href={taskHref(projectPath, st)}
                      className="flex items-center justify-between gap-2 rounded-md border border-line bg-glass px-3 py-2 text-sm transition hover:border-line-strong"
                    >
                      <span className="truncate">{st.title}</span>
                      <div className="flex items-center gap-2">
                        {stStatus && <Badge color={stStatus.color}>{stStatus.label}</Badge>}
                        <PriorityBadge priority={st.priority} />
                      </div>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <p className="mt-2 text-sm text-faint">Sin subtareas.</p>
            )}
          </section>
        )}

        <section className="rounded-lg border border-line bg-glass p-6 backdrop-blur-xl">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-ink">Adjuntos</h2>
            {canManage && (
              <div>
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
          </div>
          {attachments.length > 0 ? (
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {attachments.map((a) => (
                <AttachmentCard
                  key={a.id}
                  attachment={a}
                  onRemove={canManage ? () => removeAttachment(a.id) : undefined}
                />
              ))}
            </div>
          ) : (
            <p className="mt-2 text-sm text-faint">Sin archivos.</p>
          )}
          {attachmentError && <p className="mt-1 text-sm text-danger">{attachmentError}</p>}
        </section>

        {error && <FieldError>{error}</FieldError>}

        {canManage && (
          <div className="flex items-center gap-3">
            <Button
              variant="danger"
              onClick={onDeleteClick}
              disabled={isPending}
              className="ml-auto"
            >
              {confirmingDelete ? "¿Confirmar?" : "Eliminar tarea"}
            </Button>
          </div>
        )}
      </div>

      {/* Panel de comentarios + actividad (ClickUp Parity Fase B, Slice 1). */}
      <WorkItemActivityPanel
        workItemId={task.id}
        currentUserId={currentUserId}
        orgUsers={orgUsers}
        comments={comments}
        activity={activity}
      />

      {task.type === "task" && (
        <WorkItemEditor
          key={creatingSubtask ? "new-subtask-open" : "new-subtask-closed"}
          open={creatingSubtask}
          onClose={() => setCreatingSubtask(false)}
          projectId={projectId}
          statuses={statuses}
          orgUsers={orgUsers}
          canManage={canManage}
          canAssign={canAssign}
          task={null}
          parentId={task.id}
          parentTitle={task.title}
          onSaved={() => {
            setCreatingSubtask(false);
            router.refresh();
          }}
          onDeleted={() => {
            setCreatingSubtask(false);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
