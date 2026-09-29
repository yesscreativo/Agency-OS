"use server";

import { revalidatePath } from "next/cache";
import {
  createProjectFolder,
  deleteProjectFolder,
  getProjectFolderOrg,
  reorderProjectFolders,
  setProjectFolder,
  updateProjectFolder,
} from "@agency-os/db";
import { getCurrentUser, hasPermission } from "@/lib/auth";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { clientHref } from "@/lib/project-paths";

export type ActionResult = { ok: true; error?: never } | { ok?: never; error: string };
export type IdResult = { id: string; error?: never } | { id?: never; error: string };

type ManagerAuth =
  | { organizationId: string; userId: string; error?: never }
  | { organizationId?: never; userId?: never; error: string };

// Mismo guard que ya existe (privado) en project-actions.ts — se duplica aquí
// a propósito, siguiendo el patrón ya establecido en el proyecto de que estos
// archivos de acciones no comparten guards triviales entre sí (ver
// access-actions.ts/mi-area-actions.ts/proyectos-access-actions.ts).
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

/** Confirma que el cliente pertenece a la organización y devuelve su `name`
 * (hace falta para `clientHref` al revalidar la ruta del cliente). */
async function assertClientInOrg(
  db: Awaited<ReturnType<typeof getSupabaseServerClient>>,
  clientId: string,
  organizationId: string,
): Promise<{ name: string } | null> {
  const { data, error } = await db
    .from("clients")
    .select("organization_id, name")
    .eq("id", clientId)
    .maybeSingle();
  if (error) throw error;
  if (!data || data.organization_id !== organizationId) return null;
  return { name: data.name };
}

export interface ProjectFolderInput {
  name: string;
  color: string;
}

export async function createProjectFolderAction(
  clientId: string,
  input: ProjectFolderInput,
): Promise<IdResult> {
  const auth = await requireProjectManager();
  if (auth.error !== undefined) return { error: auth.error };
  if (!input.name.trim()) return { error: "El nombre de la carpeta es obligatorio." };

  try {
    const db = await getSupabaseServerClient();
    const client = await assertClientInOrg(db, clientId, auth.organizationId);
    if (!client) return { error: "El cliente no existe o no pertenece a tu organización." };

    const folder = await createProjectFolder(db, {
      organizationId: auth.organizationId,
      clientId,
      name: input.name,
      color: input.color,
      createdBy: auth.userId,
    });
    revalidatePath(clientHref({ id: clientId, name: client.name }));
    return { id: folder.id };
  } catch (error) {
    console.error("createProjectFolderAction", error);
    return { error: "No se pudo crear la carpeta. Intenta de nuevo." };
  }
}

export async function updateProjectFolderAction(
  folderId: string,
  input: ProjectFolderInput,
): Promise<ActionResult> {
  const auth = await requireProjectManager();
  if (auth.error !== undefined) return { error: auth.error };
  if (!input.name.trim()) return { error: "El nombre de la carpeta es obligatorio." };

  try {
    const db = await getSupabaseServerClient();
    const folder = await getProjectFolderOrg(db, folderId);
    if (!folder || folder.organizationId !== auth.organizationId) {
      return { error: "La carpeta no existe o no pertenece a tu organización." };
    }
    const client = await assertClientInOrg(db, folder.clientId, auth.organizationId);
    if (!client) return { error: "El cliente no existe o no pertenece a tu organización." };

    await updateProjectFolder(db, folderId, input);
    revalidatePath(clientHref({ id: folder.clientId, name: client.name }));
    return { ok: true };
  } catch (error) {
    console.error("updateProjectFolderAction", error);
    return { error: "No se pudo actualizar la carpeta. Intenta de nuevo." };
  }
}

export async function deleteProjectFolderAction(folderId: string): Promise<ActionResult> {
  const auth = await requireProjectManager();
  if (auth.error !== undefined) return { error: auth.error };

  try {
    const db = await getSupabaseServerClient();
    const folder = await getProjectFolderOrg(db, folderId);
    if (!folder || folder.organizationId !== auth.organizationId) {
      return { error: "La carpeta no existe o no pertenece a tu organización." };
    }
    const client = await assertClientInOrg(db, folder.clientId, auth.organizationId);

    await deleteProjectFolder(db, folderId);
    if (client) revalidatePath(clientHref({ id: folder.clientId, name: client.name }));
    return { ok: true };
  } catch (error) {
    console.error("deleteProjectFolderAction", error);
    return { error: "No se pudo eliminar la carpeta. Intenta de nuevo." };
  }
}

/** `orderedIds` debe ser la lista completa de carpetas del cliente, en el
 * nuevo orden — mismo contrato que `reorderProjectStatuses`. */
export async function reorderProjectFoldersAction(
  clientId: string,
  orderedIds: string[],
): Promise<ActionResult> {
  const auth = await requireProjectManager();
  if (auth.error !== undefined) return { error: auth.error };
  if (orderedIds.length === 0) return { ok: true };

  try {
    const db = await getSupabaseServerClient();
    const client = await assertClientInOrg(db, clientId, auth.organizationId);
    if (!client) return { error: "El cliente no existe o no pertenece a tu organización." };

    // Defensa en profundidad: todas las carpetas deben ser de este cliente/organización.
    const { data, error } = await db
      .from("project_folders")
      .select("id, organization_id, client_id")
      .in("id", orderedIds);
    if (error) throw error;
    const rows = data ?? [];
    if (
      rows.length !== orderedIds.length ||
      rows.some((r) => r.organization_id !== auth.organizationId || r.client_id !== clientId)
    ) {
      return { error: "Las carpetas no pertenecen a este cliente." };
    }

    await reorderProjectFolders(db, orderedIds);
    revalidatePath(clientHref({ id: clientId, name: client.name }));
    return { ok: true };
  } catch (error) {
    console.error("reorderProjectFoldersAction", error);
    return { error: "No se pudo reordenar. Intenta de nuevo." };
  }
}

/** `folderId: null` mueve el proyecto a "Sin carpeta". */
export async function setProjectFolderAction(
  projectId: string,
  folderId: string | null,
): Promise<ActionResult> {
  const auth = await requireProjectManager();
  if (auth.error !== undefined) return { error: auth.error };

  try {
    const db = await getSupabaseServerClient();

    const { data: project, error: projectError } = await db
      .from("work_items")
      .select("organization_id, client:clients(id, name)")
      .eq("id", projectId)
      .eq("type", "project")
      .maybeSingle();
    if (projectError) throw projectError;
    if (!project || project.organization_id !== auth.organizationId) {
      return { error: "El proyecto no existe o no pertenece a tu organización." };
    }

    if (folderId) {
      const folder = await getProjectFolderOrg(db, folderId);
      if (!folder || folder.organizationId !== auth.organizationId) {
        return { error: "La carpeta no existe o no pertenece a tu organización." };
      }
    }

    await setProjectFolder(db, projectId, folderId);
    const client = project.client as unknown as { id: string; name: string } | null;
    if (client) revalidatePath(clientHref(client));
    return { ok: true };
  } catch (error) {
    console.error("setProjectFolderAction", error);
    return { error: "No se pudo mover el proyecto. Intenta de nuevo." };
  }
}
