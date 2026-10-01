import type { Enums, Tables } from "../types/database";
import type { Db } from "./shared";

export type ClientContactRow = Tables<"client_contacts">;
export type ClientContactStatus = Enums<"client_contact_status">;
export type ClientContactWithClientName = ClientContactRow & { client: { name: string } | null };

export async function clientContactEmailExists(db: Db, email: string): Promise<boolean> {
  const { data, error } = await db
    .from("client_contacts")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  if (error) throw error;
  return data !== null;
}

export async function listClientContactsForClient(db: Db, clientId: string): Promise<ClientContactRow[]> {
  const { data, error } = await db
    .from("client_contacts")
    .select("*")
    .eq("client_id", clientId)
    .order("created_at");
  if (error) throw error;
  return data ?? [];
}

export async function createClientContact(
  db: Db,
  values: { client_id: string; auth_user_id: string; full_name: string; email: string; invited_by: string },
): Promise<ClientContactRow> {
  const { data, error } = await db.from("client_contacts").insert(values).select("*").single();
  if (error) throw error;
  return data;
}

/** Para resolver la sesión del portal: el contacto + nombre de su cliente. */
export async function getClientContactByAuthUserId(
  db: Db,
  authUserId: string,
): Promise<ClientContactWithClientName | null> {
  const { data, error } = await db
    .from("client_contacts")
    .select("*, client:clients(name)")
    .eq("auth_user_id", authUserId)
    .maybeSingle<ClientContactWithClientName>();
  if (error) throw error;
  return data;
}

export async function activateClientContact(db: Db, id: string): Promise<void> {
  const { error } = await db
    .from("client_contacts")
    .update({ status: "active", activated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function setClientContactStatus(db: Db, id: string, status: ClientContactStatus): Promise<void> {
  const { error } = await db.from("client_contacts").update({ status }).eq("id", id);
  if (error) throw error;
}
