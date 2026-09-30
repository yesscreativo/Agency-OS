"use server";

import { revalidatePath } from "next/cache";
import {
  createShareLink,
  deleteShareLink,
  getShareLinkByProject,
  revokeShareLink,
  type Db,
} from "@agency-os/db";
import { getCurrentUser, hasPermission } from "@/lib/auth";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { resolveProjectLink } from "@/lib/resolve-task-link";

export type ActionResult = { ok: true; error?: never } | { ok?: never; error: string };
export type TokenResult = { token: string | null; error?: never } | { token?: never; error: string };

type ManagerAuth =
  | { organizationId: string; userId: string; error?: never }
  | { organizationId?: never; userId?: never; error: string };

async function requireProjectManager(): Promise<ManagerAuth> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sesión expirada. Vuelve a iniciar sesión." };
  if (!hasPermission(user, "project.manage")) {
    return { error: "No tienes permiso para administrar proyectos." };
  }
  const organizationId = user.organizationIds[0];
  if (!organizationId) return { error: "Tu usuario no pertenece a ninguna organización." };
  return { organizationId, userId: user.id };
}

async function assertProjectInOrg(db: Db, projectId: string, organizationId: string): Promise<boolean> {
  const { data, error } = await db
    .from("work_items")
    .select("organization_id, type")
    .eq("id", projectId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data && data.organization_id === organizationId && data.type === "project");
}

/** Token vigente del proyecto, si ya se generó uno (y no está revocado). */
export async function getShareLinkAction(projectId: string): Promise<TokenResult> {
  const auth = await requireProjectManager();
  if (auth.error !== undefined) return { error: auth.error };

  try {
    const db = await getSupabaseServerClient();
    if (!(await assertProjectInOrg(db, projectId, auth.organizationId))) {
      return { error: "El proyecto no existe o no pertenece a tu organización." };
    }
    const link = await getShareLinkByProject(db, projectId);
    return { token: link && !link.revoked_at ? link.token : null };
  } catch (error) {
    console.error("getShareLinkAction", error);
    return { error: "No se pudo consultar el link." };
  }
}

/** Genera el link público. Si ya existe uno revocado, lo reemplaza por uno
 * nuevo en vez de acumular filas (un proyecto tiene a lo sumo un link vigente
 * por el `unique(project_id)` de la migración). */
export async function generateShareLinkAction(projectId: string): Promise<TokenResult> {
  const auth = await requireProjectManager();
  if (auth.error !== undefined) return { error: auth.error };

  try {
    const db = await getSupabaseServerClient();
    if (!(await assertProjectInOrg(db, projectId, auth.organizationId))) {
      return { error: "El proyecto no existe o no pertenece a tu organización." };
    }

    const existing = await getShareLinkByProject(db, projectId);
    if (existing && !existing.revoked_at) return { token: existing.token };
    if (existing && existing.revoked_at) {
      await deleteShareLink(db, existing.id);
    }

    const created = await createShareLink(db, {
      organizationId: auth.organizationId,
      projectId,
      createdBy: auth.userId,
    });
    const link = await resolveProjectLink(db, projectId);
    if (link) revalidatePath(link);
    return { token: created.token };
  } catch (error) {
    console.error("generateShareLinkAction", error);
    return { error: "No se pudo generar el link. Intenta de nuevo." };
  }
}

export async function revokeShareLinkAction(projectId: string): Promise<ActionResult> {
  const auth = await requireProjectManager();
  if (auth.error !== undefined) return { error: auth.error };

  try {
    const db = await getSupabaseServerClient();
    if (!(await assertProjectInOrg(db, projectId, auth.organizationId))) {
      return { error: "El proyecto no existe o no pertenece a tu organización." };
    }
    const existing = await getShareLinkByProject(db, projectId);
    if (!existing) return { ok: true };
    await revokeShareLink(db, existing.id);
    const link = await resolveProjectLink(db, projectId);
    if (link) revalidatePath(link);
    return { ok: true };
  } catch (error) {
    console.error("revokeShareLinkAction", error);
    return { error: "No se pudo revocar el link. Intenta de nuevo." };
  }
}
