"use client";

// Panel de Comentarios + Actividad de la vista de tarea (reemplaza el placeholder
// del <aside> en work-item-detail.tsx). Comentarios con hilo de 1 nivel, menciones
// @usuario con autocompletado, y un timeline de actividad legible.

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Avatar, Button, Textarea } from "@agency-os/ui";
import { formatRelative, initialsOf } from "@agency-os/domain";
import {
  createComment,
  deleteComment,
  editComment,
} from "@/lib/work-item-comment-actions";
import {
  deleteCommentAttachment,
  uploadCommentAttachment,
  type WorkItemAttachment,
} from "@/lib/project-actions";
import { AttachmentCard, MAX_ATTACHMENT_BYTES, PendingFileCard } from "./work-item-fields";

export interface PanelUser {
  id: string;
  name: string;
  avatarUrl?: string | null;
}

export interface PanelComment {
  id: string;
  parentId: string | null;
  authorId: string;
  authorName: string;
  body: string;
  createdAt: string;
  editedAt: string | null;
  attachments: WorkItemAttachment[];
}

export interface PanelActivity {
  id: string;
  eventType: string;
  actorName: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
}

const PRIORITY_LABEL: Record<string, string> = {
  low: "Baja",
  normal: "Normal",
  high: "Alta",
  urgent: "Urgente",
};

/** Convierte un evento de actividad en una frase legible en español. */
function activityText(a: PanelActivity, usersById: Map<string, string>): string {
  const p = a.payload ?? {};
  switch (a.eventType) {
    case "created":
      return "creó la tarea";
    case "title_edited":
      return "renombró la tarea";
    case "description_edited":
      return "editó la descripción";
    case "status_changed":
      return p.label ? `cambió el estado a "${String(p.label)}"` : "cambió el estado";
    case "priority_changed":
      return `cambió la prioridad a ${PRIORITY_LABEL[String(p.to)] ?? String(p.to)}`;
    case "assignee_added":
      return `asignó a ${usersById.get(String(p.userId)) ?? "alguien"}`;
    case "assignee_removed":
      return `quitó a ${usersById.get(String(p.userId)) ?? "alguien"}`;
    case "comment_created":
      return "comentó";
    case "comment_reply":
      return "respondió un comentario";
    default:
      return a.eventType;
  }
}

/** Editor de comentario con autocompletado de menciones @usuario. Al escribir
 * `@` filtra los usuarios de la organización; al elegir uno inserta su nombre
 * completo (parseMentions en el servidor lo resuelve de vuelta a user_id). */
function CommentComposer({
  users,
  initialBody = "",
  placeholder = "Escribe un comentario… usa @ para mencionar",
  submitLabel = "Comentar",
  autoFocus = false,
  allowFiles = true,
  onSubmit,
  onCancel,
}: {
  users: PanelUser[];
  initialBody?: string;
  placeholder?: string;
  submitLabel?: string;
  autoFocus?: boolean;
  /** Habilita adjuntar archivos (drag & drop / botón). Desactivado al editar. */
  allowFiles?: boolean;
  onSubmit: (body: string, files: File[]) => void;
  onCancel?: () => void;
}) {
  const [body, setBody] = useState(initialBody);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addFiles = (list: FileList | null) => {
    if (!list || list.length === 0) return;
    setFileError(null);
    const picked = Array.from(list);
    const tooBig = picked.find((f) => f.size > MAX_ATTACHMENT_BYTES);
    if (tooBig) {
      setFileError(`"${tooBig.name}" supera el límite de 10 MB.`);
      return;
    }
    setFiles((prev) => [...prev, ...picked]);
  };

  // Detecta un token @... pegado al cursor para abrir el autocompletado.
  const syncMention = (value: string, caret: number) => {
    const before = value.slice(0, caret);
    const m = before.match(/@([\p{L}\p{N}._-]*)$/u);
    if (m) {
      setMentionOpen(true);
      setMentionQuery((m[1] ?? "").toLowerCase());
    } else {
      setMentionOpen(false);
      setMentionQuery("");
    }
  };

  const onChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setBody(e.target.value);
    syncMention(e.target.value, e.target.selectionStart ?? e.target.value.length);
  };

  const pickMention = (name: string) => {
    const el = ref.current;
    const caret = el?.selectionStart ?? body.length;
    const before = body.slice(0, caret).replace(/@([\p{L}\p{N}._-]*)$/u, `@${name} `);
    const after = body.slice(caret);
    const next = before + after;
    setBody(next);
    setMentionOpen(false);
    setMentionQuery("");
    requestAnimationFrame(() => {
      el?.focus();
      const pos = before.length;
      el?.setSelectionRange(pos, pos);
    });
  };

  const matches = mentionOpen
    ? users.filter((u) => mentionQuery === "" || u.name.toLowerCase().includes(mentionQuery)).slice(0, 6)
    : [];

  const canSubmit = body.trim().length > 0 || files.length > 0;

  const submit = () => {
    if (!canSubmit) return;
    onSubmit(body.trim(), files);
    setBody("");
    setFiles([]);
    setFileError(null);
  };

  return (
    <div
      className={`relative rounded-md ${dragOver ? "ring-2 ring-green" : ""}`}
      onDragOver={
        allowFiles
          ? (e) => {
              e.preventDefault();
              setDragOver(true);
            }
          : undefined
      }
      onDragLeave={allowFiles ? () => setDragOver(false) : undefined}
      onDrop={
        allowFiles
          ? (e) => {
              e.preventDefault();
              setDragOver(false);
              addFiles(e.dataTransfer.files);
            }
          : undefined
      }
    >
      <Textarea
        ref={ref}
        value={body}
        onChange={onChange}
        placeholder={placeholder}
        rows={3}
        autoFocus={autoFocus}
      />
      {mentionOpen && matches.length > 0 && (
        <div className="absolute z-10 mt-1 max-h-44 w-56 overflow-y-auto rounded-md border border-line bg-glass-strong backdrop-blur-xl shadow-overlay">
          {matches.map((u) => (
            <button
              key={u.id}
              type="button"
              onClick={() => pickMention(u.name)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-ink transition hover:bg-surface-2"
            >
              <Avatar initials={initialsOf(u.name)} src={u.avatarUrl} size="xs" />
              {u.name}
            </button>
          ))}
        </div>
      )}
      {files.length > 0 && (
        <div className="mt-2 grid grid-cols-3 gap-2">
          {files.map((f, i) => (
            <PendingFileCard
              key={`${f.name}-${i}`}
              file={f}
              onRemove={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
            />
          ))}
        </div>
      )}
      {fileError && <p className="mt-1 text-sm text-danger">{fileError}</p>}
      <div className="mt-2 flex items-center gap-2">
        <Button variant="primary" size="sm" disabled={!canSubmit} onClick={submit}>
          {submitLabel}
        </Button>
        {allowFiles && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                addFiles(e.target.files);
                if (fileInputRef.current) fileInputRef.current.value = "";
              }}
            />
            <Button
              variant="ghost"
              size="sm"
              type="button"
              onClick={() => fileInputRef.current?.click()}
            >
              Adjuntar
            </Button>
          </>
        )}
        {onCancel && (
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Cancelar
          </Button>
        )}
      </div>
    </div>
  );
}

/** Una fila de comentario (raíz o reply) con acciones de autor. */
function CommentRow({
  comment,
  currentUserId,
  users,
  onReply,
  busy,
}: {
  comment: PanelComment;
  currentUserId: string;
  users: PanelUser[];
  onReply?: () => void;
  busy: boolean;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const isMine = comment.authorId === currentUserId;

  const doEdit = (body: string) => {
    startTransition(async () => {
      const res = await editComment({ id: comment.id, body });
      setEditing(false);
      if (!res.error) router.refresh();
    });
  };

  const doDelete = () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    startTransition(async () => {
      const res = await deleteComment(comment.id);
      if (!res.error) router.refresh();
    });
  };

  const removeAttachment = (id: string) => {
    startTransition(async () => {
      const res = await deleteCommentAttachment(id);
      if (!res.error) router.refresh();
    });
  };

  const authorAvatar = users.find((u) => u.id === comment.authorId)?.avatarUrl ?? null;

  return (
    <div className="flex gap-2.5">
      <Avatar
        initials={initialsOf(comment.authorName)}
        src={authorAvatar}
        size="sm"
        tone="neutral"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-sm">
          <span className="font-semibold text-ink">{comment.authorName}</span>
          <span className="text-xs text-faint">{formatRelative(comment.createdAt)}</span>
          {comment.editedAt && <span className="text-xs text-faint">(editado)</span>}
        </div>
        {editing ? (
          <div className="mt-1">
            <CommentComposer
              users={users}
              initialBody={comment.body}
              submitLabel="Guardar"
              autoFocus
              allowFiles={false}
              onSubmit={doEdit}
              onCancel={() => setEditing(false)}
            />
          </div>
        ) : (
          <>
            {comment.body && (
              <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-ink">{comment.body}</p>
            )}
            {comment.attachments.length > 0 && (
              <div className="mt-2 grid grid-cols-3 gap-2">
                {comment.attachments.map((a) => (
                  <AttachmentCard
                    key={a.id}
                    attachment={a}
                    onRemove={isMine ? () => removeAttachment(a.id) : undefined}
                  />
                ))}
              </div>
            )}
          </>
        )}
        {!editing && (
          <div className="mt-1 flex items-center gap-3 text-xs text-muted">
            {onReply && (
              <button type="button" onClick={onReply} className="transition hover:text-ink" disabled={busy}>
                Responder
              </button>
            )}
            {isMine && (
              <>
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="transition hover:text-ink"
                  disabled={busy}
                >
                  Editar
                </button>
                <button
                  type="button"
                  onClick={doDelete}
                  className="transition hover:text-danger"
                  disabled={busy}
                >
                  {confirmDelete ? "¿Confirmar?" : "Eliminar"}
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function WorkItemActivityPanel({
  workItemId,
  currentUserId,
  orgUsers,
  comments,
  activity,
}: {
  workItemId: string;
  currentUserId: string;
  orgUsers: PanelUser[];
  comments: PanelComment[];
  activity: PanelActivity[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"comments" | "activity">("comments");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const usersById = new Map(orgUsers.map((u) => [u.id, u.name]));

  const roots = comments.filter((c) => c.parentId === null);
  const repliesByParent = new Map<string, PanelComment[]>();
  for (const c of comments) {
    if (c.parentId) {
      const list = repliesByParent.get(c.parentId) ?? [];
      list.push(c);
      repliesByParent.set(c.parentId, list);
    }
  }

  const submitComment = (body: string, files: File[], parentCommentId: string | null) => {
    setError(null);
    startTransition(async () => {
      const res = await createComment({ workItemId, body, parentCommentId });
      if (res.error || !res.comment) {
        setError(res.error ?? "No se pudo publicar el comentario.");
        return;
      }
      const commentId = res.comment.id;
      // Sube los adjuntos ya asociados al comentario recién creado.
      for (const file of files) {
        const fd = new FormData();
        fd.append("file", file);
        const up = await uploadCommentAttachment(commentId, fd);
        if (up.error) {
          setError(up.error);
          break;
        }
      }
      setReplyTo(null);
      router.refresh();
    });
  };

  return (
    <aside className="rounded-lg border border-line bg-glass p-6 backdrop-blur-xl">
      <div className="mb-4 flex gap-1 rounded-pill border border-line bg-glass p-1 text-sm backdrop-blur-xl">
        <button
          type="button"
          onClick={() => setTab("comments")}
          className={`flex-1 rounded-pill px-3 py-1.5 font-semibold transition ${
            tab === "comments" ? "bg-glass-strong text-ink shadow-overlay" : "text-muted hover:text-ink"
          }`}
        >
          Comentarios {comments.length > 0 && `(${comments.length})`}
        </button>
        <button
          type="button"
          onClick={() => setTab("activity")}
          className={`flex-1 rounded-pill px-3 py-1.5 font-semibold transition ${
            tab === "activity" ? "bg-glass-strong text-ink shadow-overlay" : "text-muted hover:text-ink"
          }`}
        >
          Actividad
        </button>
      </div>

      {tab === "comments" ? (
        <div className="space-y-4">
          <CommentComposer users={orgUsers} onSubmit={(b, files) => submitComment(b, files, null)} />
          {error && <p className="text-sm text-danger">{error}</p>}

          {roots.length === 0 ? (
            <p className="text-sm text-faint">Aún no hay comentarios.</p>
          ) : (
            <div className="space-y-5">
              {roots.map((root) => (
                <div key={root.id} className="space-y-3">
                  <CommentRow
                    comment={root}
                    currentUserId={currentUserId}
                    users={orgUsers}
                    busy={isPending}
                    onReply={() => setReplyTo(replyTo === root.id ? null : root.id)}
                  />
                  {(repliesByParent.get(root.id) ?? []).map((reply) => (
                    <div key={reply.id} className="ml-8">
                      <CommentRow
                        comment={reply}
                        currentUserId={currentUserId}
                        users={orgUsers}
                        busy={isPending}
                      />
                    </div>
                  ))}
                  {replyTo === root.id && (
                    <div className="ml-8">
                      <CommentComposer
                        users={orgUsers}
                        placeholder="Responder…"
                        submitLabel="Responder"
                        autoFocus
                        onSubmit={(b, files) => submitComment(b, files, root.id)}
                        onCancel={() => setReplyTo(null)}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div>
          {activity.length === 0 ? (
            <p className="text-sm text-faint">Sin actividad registrada.</p>
          ) : (
            <ul className="space-y-3">
              {activity.map((a) => (
                <li key={a.id} className="flex gap-2.5 text-sm">
                  <Avatar initials={initialsOf(a.actorName ?? "?")} size="xs" tone="neutral" />
                  <div className="min-w-0">
                    <span className="text-ink">
                      <span className="font-semibold">{a.actorName ?? "Alguien"}</span>{" "}
                      {activityText(a, usersById)}
                    </span>
                    <span className="ml-1 text-xs text-faint">{formatRelative(a.createdAt)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </aside>
  );
}
