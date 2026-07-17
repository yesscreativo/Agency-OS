import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../types/database";

/** Cliente tipado que aceptan todos los repositorios: se inyecta el de sesión
 * (RLS activo) o el de service_role según el contexto — el repo no decide. */
export type Db = SupabaseClient<Database>;

export interface Page<T> {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
}
