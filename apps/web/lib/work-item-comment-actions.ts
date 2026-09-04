"use server";

import { revalidatePath } from "next/cache";
import {
  createNotifications,
  createSupabaseServiceRoleClient,
  getComment,
  insertComment,
  listOrgUsers,
  recordActivity,
  softDeleteComment,
  updateCommentBody,
  type CommentWithAuthor,
  type Db,
} from "@agency-os/db";
import { parseMentions, validateComment } from "@agency-os/domain";
import { getCurrentUser, hasPermission, type CurrentUser } from "@/lib/auth";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { projectHref, taskHref } from "@/lib/project-paths";

export type CommentResult =
  | { comment: CommentWithAuthor; error?: never }
  | { comment?: never; error: string };
export type ActionResult = { ok: true; error?: never } | { ok?: never; error: string };

type ViewerAuth =
  | { user: CurrentUser; organizationId: string; error?: never }
  | { user?: never; organizationId?: never; error: string };

/** Comentar/leer requiere solo `project.view`: cualquier miembro con acceso al
 * proyecto participa (no hace falta `project.manage`). */
async function requireProjectViewer(): Promise<ViewerAuth> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sesión expirada. Vuelve a iniciar sesión." };
  if (!hasPermission(user, "project.view")) {
    return { error: "No tienes permiso para ver proyectos." };
  }
  const organizationId = user.organizationIds[0];
  if (!organizationId) return { error: "Tu usuario no pertenece a ninguna organización." };
  return { user, organizationId };
}

/** Confirma que el work item existe y es de la organización. Devuelve datos
 * mínimos para revalidar y para construir el link de las menciones. */
async function loadWorkItemForComment(
  db: Db,
  workItemId: string,
  organizationId: string,
): Promise<{ id: string; title: string; projectId: string } | null> {
  const { data, error } = await db
    .from("work_items")
    .select("id, title, project_id, organization_id")
    .eq("id", workItemId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  if (!data || data.organization_id !== organizationId) return null;
  return { id: data.id, title: data.title, projectId: data.project_id };
}

/** Ruta canónica de la tarea (con slugs+código corto) para enlazar la
 * notificación de mención. Resuelve proyecto → cliente. Best-effort: si algo
 * falta devuelve null y la campana cae a /notificaciones. */
async function resolveTaskLink(db: Db, projectId: string, task: { id: string; title: string }) {
  const { data: project } = await db
    .from("work_items")
    .select("id, title, client_id")
    .eq("id", projectId)
    .maybeSingle();
  if (!project) return null;
  let client: { id: string; name: string } | null = null;
  if (project.client_id) {
    const { data: c } = await db
      .from("clients")
      .select("id, name")
      .eq("id", project.client_id)
      .maybeSingle();
    if (c) client = { id: c.id, name: c.name };
  }
  const base = projectHref(client, { id: project.id, title: project.title });
  return taskHref(base, task);
}

export interface CreateCommentInput {
  workItemId: string;
  body: string;
  parentCommentId?: string | null;
}

/** Crea un comentario (raíz o reply), registra actividad y notifica menciones. */
export async function createComment(input: CreateCommentInput): Promise<CommentResult> {
  const auth = await requireProjectViewer();
  if (auth.error !== undefined) return { error: auth.error };

  const body = input.body.trim();
  const validation = validateComment(body);
  if (!validation.valid) return { error: validation.error ?? "Comentario inválido." };

  try {
    const db = await getSupabaseServerClient();
    const workItem = await loadWorkItemForComment(db, input.workItemId, auth.organizationId);
    if (!workItem) return { error: "La tarea no existe o no pertenece a tu organización." };

    // Reply: el padre debe existir y ser del mismo work item (thread de 1 nivel).
    if (input.parentCommentId) {
      const parent = await getComment(db, input.parentCommentId);
      if (!parent || parent.work_item_id !== input.workItemId) {
        return { error: "El comentario al que respondes no existe." };
      }
    }

    // Resolver menciones @usuario contra los usuarios de la organización.
    let mentionedIds: string[] = [];
    let orgUsers: { id: string; fullName: string }[] = [];
    if (body.includes("@")) {
      orgUsers = await listOrgUsers(db, auth.organizationId);
      mentionedIds = parseMentions(
        body,
        orgUsers.map((u) => ({ id: u.id, name: u.fullName })),
      );
    }

    const comment = await insertComment(db, {
      organization_id: auth.organizationId,
      work_item_id: input.workItemId,
      parent_comment_id: input.parentCommentId ?? null,
      author_user_id: auth.user.id,
      body,
      mentioned_user_ids: mentionedIds,
    });

    // Actividad (secundaria: no bloquea).
    try {
      await recordActivity(db, {
        orgId: auth.organizationId,
        workItemId: input.workItemId,
        actorUserId: auth.user.id,
        eventType: input.parentCommentId ? "comment_reply" : "comment_created",
        payload: { commentId: comment.id },
      });
    } catch (error) {
      console.error("recordActivity:comment", error);
    }

    // Notificar a los mencionados (menos al propio autor) con service_role,
    // porque la RLS de notifications no permite insertar filas de otros usuarios.
    const targets = mentionedIds.filter((uid) => uid !== auth.user.id);
    if (targets.length > 0) {
      try {
        const link = await resolveTaskLink(db, workItem.projectId, {
          id: workItem.id,
          title: workItem.title,
        });
        const excerpt = body.length > 140 ? `${body.slice(0, 140)}…` : body;
        const service = createSupabaseServiceRoleClient();
        await createNotifications(
          service,
          targets.map((uid) => ({
            organization_id: auth.organizationId,
            user_id: uid,
            type: "mention",
            title: `${auth.user.fullName} te mencionó en "${workItem.title}"`,
            body: excerpt,
            work_item_id: workItem.id,
            link,
          })),
        );
      } catch (error) {
        console.error("createComment:notifyMentions", error);
      }
    }

    revalidatePath("/proyectos");
    revalidatePath(`/proyectos/${workItem.projectId}`);
    return { comment };
  } catch (error) {
    console.error("createComment", error);
    return { error: "No se pudo publicar el comentario. Intenta de nuevo." };
  }
}

export interface EditCommentInput {
  id: string;
  body: string;
}

/** Edita el cuerpo de un comentario propio (auditoría blanda: sella edited_at). */
export async function editComment(input: EditCommentInput): Promise<ActionResult> {
  const auth = await requireProjectViewer();
  if (auth.error !== undefined) return { error: auth.error };

  const body = input.body.trim();
  const validation = validateComment(body);
  if (!validation.valid) return { error: validation.error ?? "Comentario inválido." };

  try {
    const db = await getSupabaseServerClient();
    const comment = await getComment(db, input.id);
    if (!comment || comment.organization_id !== auth.organizationId) {
      return { error: "El comentario no existe o no pertenece a tu organización." };
    }
    if (comment.author_user_id !== auth.user.id) {
      return { error: "Solo puedes editar tus propios comentarios." };
    }

    await updateCommentBody(db, input.id, body);
    revalidatePath("/proyectos");
    return { ok: true };
  } catch (error) {
    console.error("editComment", error);
    return { error: "No se pudo editar el comentario. Intenta de nuevo." };
  }
}

/** Borra (soft-delete) un comentario propio. */
export async function deleteComment(id: string): Promise<ActionResult> {
  const auth = await requireProjectViewer();
  if (auth.error !== undefined) return { error: auth.error };

  try {
    const db = await getSupabaseServerClient();
    const comment = await getComment(db, id);
    if (!comment || comment.organization_id !== auth.organizationId) {
      return { error: "El comentario no existe o no pertenece a tu organización." };
    }
    if (comment.author_user_id !== auth.user.id) {
      return { error: "Solo puedes eliminar tus propios comentarios." };
    }

    await softDeleteComment(db, id);
    revalidatePath("/proyectos");
    return { ok: true };
  } catch (error) {
    console.error("deleteComment", error);
    return { error: "No se pudo eliminar el comentario. Intenta de nuevo." };
  }
}
