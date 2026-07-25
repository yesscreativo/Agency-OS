"use server";

import { revalidatePath } from "next/cache";
import { markAllRead, markRead } from "@agency-os/db";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseServerClient } from "@/lib/supabase-server";

/** Marca como leídas las notificaciones indicadas (la RLS garantiza que solo
 * afecte a las del propio usuario). */
export async function markNotificationsRead(ids: string[]): Promise<void> {
  const user = await getCurrentUser();
  if (!user || ids.length === 0) return;
  const db = await getSupabaseServerClient();
  await markRead(db, ids);
  revalidatePath("/notificaciones");
}

export async function markAllNotificationsRead(): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;
  const db = await getSupabaseServerClient();
  await markAllRead(db, user.id);
  revalidatePath("/notificaciones");
}
