"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Avatar, AvatarGroup, Badge, Button, Chip } from "@agency-os/ui";
import { formatDate, type WorkItemPriority } from "@agency-os/domain";
import { moveWorkItem } from "@/lib/project-actions";
import { WorkItemEditor } from "./work-item-editor";

export interface BoardStatus {
  id: string;
  label: string;
  color: string;
  isDone: boolean;
}

export interface BoardAssignee {
  id: string;
  name: string;
}

export interface BoardTask {
  id: string;
  parentId: string | null;
  type: "task" | "subtask";
  title: string;
  description: string | null;
  statusId: string | null;
  priority: WorkItemPriority;
  startDate: string | null;
  dueDate: string | null;
  assignees: BoardAssignee[];
}

export interface BoardOrgUser {
  id: string;
  name: string;
}

const PRIORITY_BADGE: Record<WorkItemPriority, { label: string; tone: "success" | "info" | "danger" | "neutral"; variant?: "soft" | "solid" }> = {
  low: { label: "Baja", tone: "neutral" },
  normal: { label: "Normal", tone: "info" },
  high: { label: "Alta", tone: "danger" },
  urgent: { label: "Urgente", tone: "danger", variant: "solid" },
};

/** Iniciales (hasta 2 letras) a partir de un nombre completo, para `Avatar`. */
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0];
  if (!first) return "—";
  if (parts.length === 1) return first.slice(0, 2).toUpperCase();
  const last = parts[parts.length - 1] ?? first;
  return (first.charAt(0) + last.charAt(0)).toUpperCase();
}

function AssigneeAvatars({ assignees }: { assignees: BoardAssignee[] }) {
  if (assignees.length === 0) return null;
  const shown = assignees.slice(0, 3);
  const rest = assignees.length - shown.length;
  return (
    <AvatarGroup more={rest > 0 ? rest : undefined}>
      {shown.map((a) => (
        <Avatar key={a.id} initials={initialsOf(a.name)} size="xs" title={a.name} />
      ))}
    </AvatarGroup>
  );
}

/** Estado del modal de edición/creación (`WorkItemEditor` se remonta con `key`
 * al cambiar de objetivo, así que el propio componente no necesita sincronizar
 * su estado interno con props que cambian). */
type EditorTarget =
  | { mode: "create"; statusId: string | null }
  | { mode: "create-subtask"; parentId: string; parentTitle: string }
  | { mode: "edit"; taskId: string };

export function ProjectBoard({
  projectId,
  statuses,
  tasks,
  orgUsers,
  canManage,
  canAssign,
}: {
  projectId: string;
  statuses: BoardStatus[];
  tasks: BoardTask[];
  orgUsers: BoardOrgUser[];
  canManage: boolean;
  canAssign: boolean;
}) {
  const router = useRouter();
  const [view, setView] = useState<"board" | "list">("board");
  const [editor, setEditor] = useState<EditorTarget | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Overlay optimista *transitorio*: solo contiene entradas para tareas con un
  // drag en curso (o recién confirmado, hasta que `tasks` refleje el cambio).
  // Para cualquier otra tarea, `grouped` usa directamente `t.statusId` (prop
  // fresca), así que un cambio de estado hecho desde el editor (que solo
  // dispara `router.refresh()`) se refleja de inmediato sin overlay que lo tape.
  const [statusById, setStatusById] = useState<Record<string, string | null>>({});
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<string | null>(null);
  const savingRef = useRef<Set<string>>(new Set());

  const tasksById = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);

  // Una vez que `tasks` (prop fresca, tras `router.refresh()`) confirma el
  // nuevo estado de una tarea con override, soltamos el override: ya no hace
  // falta y así no queda una sombra permanente tapando futuras ediciones de
  // esa misma tarea (el bug original).
  useEffect(() => {
    setStatusById((prev) => {
      if (Object.keys(prev).length === 0) return prev;
      let changed = false;
      const next = { ...prev };
      for (const id of Object.keys(next)) {
        const fresh = tasksById.get(id);
        if (!fresh || fresh.statusId === next[id]) {
          delete next[id];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [tasksById]);

  const topTasks = useMemo(() => tasks.filter((t) => t.type === "task"), [tasks]);
  const childrenByParent = useMemo(() => {
    const map = new Map<string, BoardTask[]>();
    for (const t of tasks) {
      if (t.type !== "subtask" || !t.parentId) continue;
      const list = map.get(t.parentId);
      if (list) list.push(t);
      else map.set(t.parentId, [t]);
    }
    return map;
  }, [tasks]);

  const grouped = useMemo(() => {
    const byCol: Record<string, BoardTask[]> = {};
    for (const s of statuses) byCol[s.id] = [];
    for (const t of topTasks) {
      const st = statusById[t.id] ?? t.statusId;
      if (st && byCol[st]) byCol[st].push(t);
    }
    return byCol;
  }, [statuses, topTasks, statusById]);

  const move = async (taskId: string, from: string | null, to: string) => {
    if (from === to || !canManage || savingRef.current.has(taskId)) return;
    savingRef.current.add(taskId);
    setError(null);
    setStatusById((s) => ({ ...s, [taskId]: to })); // optimista
    const res = await moveWorkItem(taskId, to);
    savingRef.current.delete(taskId);
    if (res.error) {
      // Rollback: quitamos el override en vez de fijarlo a `from` — la prop
      // `tasks` ya refleja `from` (nunca cambió), así que no hace falta
      // conservar una sombra permanente para esta tarea.
      setStatusById((s) => {
        const next = { ...s };
        delete next[taskId];
        return next;
      });
      setError(res.error);
    } else {
      // El override queda activo hasta que `tasks` (tras este refresh) confirme
      // `to`; lo soltamos entonces desde el efecto de arriba, sin dejar una
      // sombra permanente que tape futuros cambios de estado (p.ej. desde el editor).
      router.refresh();
    }
  };

  const closeEditor = () => setEditor(null);
  const onSaved = () => {
    router.refresh();
    setEditor(null);
  };
  const onDeleted = () => {
    router.refresh();
    setEditor(null);
  };

  const editingTask = editor?.mode === "edit" ? (tasksById.get(editor.taskId) ?? null) : null;
  const editorSubtasks =
    editingTask && editingTask.type === "task" ? (childrenByParent.get(editingTask.id) ?? []) : [];

  const editorKey =
    editor === null
      ? "closed"
      : editor.mode === "create"
        ? `create:${editor.statusId ?? ""}`
        : editor.mode === "create-subtask"
          ? `create-subtask:${editor.parentId}`
          : `edit:${editor.taskId}`;

  return (
    <div>
      {error && (
        <div className="mb-3 rounded-md border border-danger/40 bg-glass px-4 py-2 text-sm text-danger backdrop-blur-xl">
          {error}
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          <Chip active={view === "board"} onClick={() => setView("board")}>
            Tablero
          </Chip>
          <Chip active={view === "list"} onClick={() => setView("list")}>
            Lista
          </Chip>
        </div>
        {canManage && (
          <Button
            variant="primary"
            size="sm"
            onClick={() => setEditor({ mode: "create", statusId: statuses[0]?.id ?? null })}
          >
            + Nueva tarea
          </Button>
        )}
      </div>

      {view === "board" ? (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {statuses.map((col) => {
            const colTasks = grouped[col.id] ?? [];
            return (
              <div
                key={col.id}
                onDragOver={(e) => {
                  if (!canManage || !dragId) return;
                  e.preventDefault();
                  setOverCol(col.id);
                }}
                onDragLeave={() => setOverCol((c) => (c === col.id ? null : c))}
                onDrop={() => {
                  if (!canManage || !dragId) return;
                  const from = statusById[dragId] ?? tasksById.get(dragId)?.statusId ?? null;
                  setOverCol(null);
                  void move(dragId, from, col.id);
                  setDragId(null);
                }}
                className={`flex w-[300px] shrink-0 flex-col rounded-lg border bg-glass p-3 backdrop-blur-xl transition ${
                  overCol === col.id ? "border-green" : "border-line"
                }`}
              >
                <div className="mb-3 flex items-center justify-between gap-2 px-1">
                  <Badge color={col.color}>{col.label}</Badge>
                  <span className="font-mono text-xs font-bold text-muted">{colTasks.length}</span>
                </div>

                <div className="flex max-h-[calc(100vh-360px)] min-h-[80px] flex-col gap-2 overflow-y-auto pr-1">
                  {colTasks.map((t) => {
                    const priority = PRIORITY_BADGE[t.priority];
                    const subCount = childrenByParent.get(t.id)?.length ?? 0;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        draggable={canManage}
                        onDragStart={() => setDragId(t.id)}
                        onDragEnd={() => {
                          setDragId(null);
                          setOverCol(null);
                        }}
                        onClick={() => setEditor({ mode: "edit", taskId: t.id })}
                        className={`rounded-md border border-line bg-glass-strong p-3 text-left backdrop-blur-xl transition hover:border-line-strong ${
                          canManage ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"
                        } ${dragId === t.id ? "opacity-50" : ""}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-sm font-semibold text-ink">{t.title}</span>
                          <Badge tone={priority.tone} variant={priority.variant}>
                            {priority.label}
                          </Badge>
                        </div>
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 text-[12px] text-muted">
                            {t.dueDate && <span>{formatDate(t.dueDate)}</span>}
                            {subCount > 0 && (
                              <span className="rounded-pill border border-line-strong px-2 py-0.5 text-[11px]">
                                {subCount} subtarea{subCount === 1 ? "" : "s"}
                              </span>
                            )}
                          </div>
                          <AssigneeAvatars assignees={t.assignees} />
                        </div>
                      </button>
                    );
                  })}
                  {colTasks.length === 0 && (
                    <div className="rounded-md border border-dashed border-line px-3 py-6 text-center text-[12px] text-faint">
                      Sin tareas
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <ListView
          statuses={statuses}
          topTasks={topTasks}
          childrenByParent={childrenByParent}
          onOpen={(id) => setEditor({ mode: "edit", taskId: id })}
        />
      )}

      <WorkItemEditor
        key={editorKey}
        open={editor !== null}
        onClose={closeEditor}
        projectId={projectId}
        statuses={statuses}
        orgUsers={orgUsers}
        canManage={canManage}
        canAssign={canAssign}
        task={editingTask}
        parentId={editor?.mode === "create-subtask" ? editor.parentId : null}
        parentTitle={editor?.mode === "create-subtask" ? editor.parentTitle : null}
        defaultStatusId={editor?.mode === "create" ? editor.statusId : null}
        subtasks={editorSubtasks}
        onSaved={onSaved}
        onDeleted={onDeleted}
        onOpenSubtask={(id) => setEditor({ mode: "edit", taskId: id })}
        onAddSubtask={
          editingTask
            ? () =>
                setEditor({
                  mode: "create-subtask",
                  parentId: editingTask.id,
                  parentTitle: editingTask.title,
                })
            : undefined
        }
      />
    </div>
  );
}

function ListView({
  statuses,
  topTasks,
  childrenByParent,
  onOpen,
}: {
  statuses: BoardStatus[];
  topTasks: BoardTask[];
  childrenByParent: Map<string, BoardTask[]>;
  onOpen: (id: string) => void;
}) {
  const statusById = useMemo(() => new Map(statuses.map((s) => [s.id, s])), [statuses]);

  if (topTasks.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-line bg-glass px-8 py-16 text-center backdrop-blur-xl">
        <div className="text-lg font-semibold">Todavía no hay tareas</div>
        <p className="max-w-[44ch] text-sm text-muted">
          Crea la primera tarea para empezar a organizar este proyecto.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-line bg-glass backdrop-blur-xl">
      {topTasks.map((t) => {
        const status = t.statusId ? statusById.get(t.statusId) : null;
        const priority = PRIORITY_BADGE[t.priority];
        const children = childrenByParent.get(t.id) ?? [];
        return (
          <div key={t.id} className="border-b border-line last:border-b-0">
            <button
              type="button"
              onClick={() => onOpen(t.id)}
              className="flex w-full flex-wrap items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-surface-2"
            >
              <span className="font-semibold text-ink">{t.title}</span>
              <div className="flex items-center gap-3">
                {status && <Badge color={status.color}>{status.label}</Badge>}
                <Badge tone={priority.tone} variant={priority.variant}>
                  {priority.label}
                </Badge>
                {t.dueDate && <span className="text-[12px] text-muted">{formatDate(t.dueDate)}</span>}
                <AssigneeAvatars assignees={t.assignees} />
              </div>
            </button>
            {children.map((c) => {
              const cStatus = c.statusId ? statusById.get(c.statusId) : null;
              const cPriority = PRIORITY_BADGE[c.priority];
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => onOpen(c.id)}
                  className="flex w-full flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-2 pl-10 text-left text-sm transition hover:bg-surface-2"
                >
                  <span className="text-muted">↳ {c.title}</span>
                  <div className="flex items-center gap-3">
                    {cStatus && <Badge color={cStatus.color}>{cStatus.label}</Badge>}
                    <Badge tone={cPriority.tone} variant={cPriority.variant}>
                      {cPriority.label}
                    </Badge>
                    {c.dueDate && <span className="text-[12px] text-muted">{formatDate(c.dueDate)}</span>}
                    <AssigneeAvatars assignees={c.assignees} />
                  </div>
                </button>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
