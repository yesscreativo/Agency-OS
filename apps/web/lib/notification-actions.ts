"use server";

import { revalidatePath } from "next/cache";
import { countUnread, listNotifications, markAllRead, markRead } from "@agency-os/db";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export interface NotificationState {
  items: {
    id: string;
    title: string;
    body: string | null;
    quoteId: string | null;
    workItemId: string | null;
    link: string | null;
    readAt: string | null;
    createdAt: string;
  }[];
  unread: number;
}

/** Estado actual de notificaciones del usuario (últimas + no leídas). Lo consume
 * el polling de la campana para avisar en vivo (sonido + notificación del sistema)
 * mientras la app está abierta, sin push. */
export async function fetchNotificationState(): Promise<NotificationState | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  const db = await getSupabaseServerClient();
  const [rows, unread] = await Promise.all([
    listNotifications(db, user.id, { limit: 8 }),
    countUnread(db, user.id),
  ]);
  return {
    items: rows.map((n) => ({
      id: n.id,
      title: n.title,
      body: n.body,
      quoteId: n.quote_id,
      workItemId: n.work_item_id,
      link: n.link,
      readAt: n.read_at,
      createdAt: n.created_at,
    })),
    unread,
  };
}

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
