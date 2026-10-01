import "server-only";
import { cache } from "react";
import { getClientContactByAuthUserId } from "@agency-os/db";
import { getSupabaseServerClient } from "./supabase-server";

export interface CurrentClientContact {
  id: string;
  clientId: string;
  clientName: string;
  fullName: string;
  email: string;
  status: "invited" | "active" | "disabled";
}

// cache(): dedup por request, mismo motivo que getCurrentUser en auth.ts.
export const getCurrentClientContact = cache(async (): Promise<CurrentClientContact | null> => {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const contact = await getClientContactByAuthUserId(supabase, user.id);
  if (!contact) return null;

  return {
    id: contact.id,
    clientId: contact.client_id,
    clientName: contact.client?.name ?? "",
    fullName: contact.full_name,
    email: contact.email,
    status: contact.status,
  };
});
