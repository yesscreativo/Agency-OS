"use server";

import { revalidatePath } from "next/cache";
import {
  clientContactEmailExists,
  createClientContact,
  createSupabaseServiceRoleClient,
  getClientById,
  setClientContactStatus,
} from "@agency-os/db";
import { isAllowedEmailDomain } from "@agency-os/domain";
import { getCurrentUser, hasPermission } from "@/lib/auth";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export type ActionResult = { ok: true; error?: never } | { ok?: never; error: string };

type ManagerAuth =
  | { organizationId: string; userId: string; error?: never }
  | { organizationId?: never; userId?: never; error: string };

async function requireClientManager(): Promise<ManagerAuth> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sesión expirada. Vuelve a iniciar sesión." };
  if (!hasPermission(user, "client.manage")) {
    return { error: "No tienes permiso para administrar clientes." };
  }
  const organizationId = user.organizationIds[0];
  if (!organizationId) return { error: "Tu usuario no pertenece a ninguna organización." };
  return { organizationId, userId: user.id };
}

/** Invita a un contacto de cliente: crea su cuenta de Supabase Auth +
 * la fila en client_contacts. Mismo mecanismo que invitar colaboradores
 * internos (access-actions.ts), pero con redirectTo propio al portal y
 * validando que el email no sea de uso interno. */
export async function inviteClientContactAction(
  clientId: string,
  fullName: string,
  email: string,
): Promise<ActionResult> {
  const auth = await requireClientManager();
  if (auth.error !== undefined) return { error: auth.error };

  const trimmedName = fullName.trim();
  const trimmedEmail = email.trim().toLowerCase();
  if (!trimmedName || !trimmedEmail) return { error: "Nombre y email son obligatorios." };
  if (isAllowedEmailDomain(trimmedEmail)) {
    return { error: "No se puede invitar un correo @laburuagencia.com como contacto de cliente." };
  }

  try {
    const db = await getSupabaseServerClient();
    const client = await getClientById(db, clientId);
    if (!client || client.organization_id !== auth.organizationId) {
      return { error: "El cliente no existe o no pertenece a tu organización." };
    }
    if (await clientContactEmailExists(db, trimmedEmail)) {
      return { error: `Ya existe un contacto con el correo «${trimmedEmail}».` };
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
    const service = createSupabaseServiceRoleClient();
    const { data, error } = await service.auth.admin.inviteUserByEmail(trimmedEmail, {
      data: { full_name: trimmedName },
      redirectTo: `${siteUrl}/auth/callback?next=/portal/activar`,
    });
    if (error || !data.user) {
      console.error("inviteClientContactAction:auth", error);
      return { error: "No se pudo invitar al contacto. Verifica el correo e intenta de nuevo." };
    }

    await createClientContact(service, {
      client_id: clientId,
      auth_user_id: data.user.id,
      full_name: trimmedName,
      email: trimmedEmail,
      invited_by: auth.userId,
    });

    revalidatePath(`/crm/clientes/${clientId}`);
    return { ok: true };
  } catch (error) {
    console.error("inviteClientContactAction", error);
    return { error: "No se pudo invitar al contacto. Intenta de nuevo." };
  }
}

/** Deshabilita o reactiva el acceso de un contacto (reversible, sin borrar
 * la cuenta). */
export async function setClientContactStatusAction(
  contactId: string,
  status: "active" | "disabled",
): Promise<ActionResult> {
  const auth = await requireClientManager();
  if (auth.error !== undefined) return { error: auth.error };

  try {
    const db = await getSupabaseServerClient();
    await setClientContactStatus(db, contactId, status);
    revalidatePath("/crm/clientes");
    return { ok: true };
  } catch (error) {
    console.error("setClientContactStatusAction", error);
    return { error: "No se pudo actualizar el estado del contacto. Intenta de nuevo." };
  }
}
