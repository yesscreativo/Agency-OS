import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../types/database";

type CookieAdapter = {
  getAll: () => { name: string; value: string }[];
  setAll: (cookies: { name: string; value: string; options: Record<string, unknown> }[]) => void;
};

/** Cliente con sesión del usuario (RLS activo). El adaptador de cookies se inyecta desde
 * `apps/web` (next/headers) para no acoplar este paquete a Next.js. */
export function createSupabaseServerClient(cookies: CookieAdapter) {
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies },
  );
}

/** Cliente con `service_role`: bypassa RLS. Solo para rutas server-side de confianza
 * (magic links por token, webhooks de n8n) — nunca exponer esta key al navegador. */
export function createSupabaseServiceRoleClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
