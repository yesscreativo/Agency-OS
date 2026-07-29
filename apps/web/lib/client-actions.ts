"use server";

import { revalidatePath } from "next/cache";
import {
  clientCodeExists,
  createClient as createClientRepo,
  softDeleteClient,
  updateClient,
} from "@agency-os/db";
import { getCurrentUser, hasPermission } from "@/lib/auth";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export interface ClientInput {
  id?: string;
  name: string;
  company: string;
  code: string;
  nit: string;
  responsible: string;
  email: string;
  phone: string;
}

export type ClientSaveResult = { id: string; error?: never } | { id?: never; error: string };
export type ClientActionResult = { ok: true; error?: never } | { ok?: never; error: string };

type ManagerAuth =
  | { organizationId: string; error?: never }
  | { organizationId?: never; error: string };

async function requireClientManager(): Promise<ManagerAuth> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sesión expirada. Vuelve a iniciar sesión." };
  if (!hasPermission(user, "client.manage")) {
    return { error: "No tienes permiso para administrar clientes." };
  }
  const organizationId = user.organizationIds[0];
  if (!organizationId) return { error: "Tu usuario no pertenece a ninguna organización." };
  return { organizationId };
}

/** Crea o actualiza un cliente. El código se normaliza a mayúsculas y se valida
 * único (case-insensitive) dentro de la organización. */
export async function saveClient(input: ClientInput): Promise<ClientSaveResult> {
  const auth = await requireClientManager();
  if (auth.error !== undefined) return { error: auth.error };

  const name = input.name.trim();
  if (!name) return { error: "Escribe el nombre del cliente." };
  const code = input.code.trim().toUpperCase();
  if (!code) return { error: "El código del cliente es obligatorio." };

  try {
    const db = await getSupabaseServerClient();
    if (await clientCodeExists(db, auth.organizationId, code, input.id)) {
      return { error: `Ya existe un cliente con el código «${code}».` };
    }

    const values = {
      name,
      company: input.company.trim() || null,
      code,
      nit: input.nit.trim() || null,
      responsible: input.responsible.trim() || null,
      // `clients.email` es NOT NULL en la BD: se guarda cadena vacía si no hay email.
      email: input.email.trim(),
      phone: input.phone.trim() || null,
    };

    let id: string;
    if (input.id) {
      const row = await updateClient(db, input.id, auth.organizationId, values);
      id = row.id;
    } else {
      const row = await createClientRepo(db, {
        ...values,
        organization_id: auth.organizationId,
      });
      id = row.id;
    }

    revalidatePath("/crm/clientes");
    revalidatePath(`/crm/clientes/${id}`);
    return { id };
  } catch (error) {
    console.error("saveClient", error);
    return { error: "No se pudo guardar el cliente. Intenta de nuevo." };
  }
}

/** Baja lógica del cliente (soft-delete). Las cotizaciones existentes lo siguen
 * mostrando; solo desaparece de listas y del selector de nueva cotización. */
export async function deleteClient(id: string): Promise<ClientActionResult> {
  const auth = await requireClientManager();
  if (auth.error !== undefined) return { error: auth.error };

  try {
    const db = await getSupabaseServerClient();
    await softDeleteClient(db, id, auth.organizationId);
    revalidatePath("/crm/clientes");
    return { ok: true };
  } catch (error) {
    console.error("deleteClient", error);
    return { error: "No se pudo eliminar el cliente. Intenta de nuevo." };
  }
}
