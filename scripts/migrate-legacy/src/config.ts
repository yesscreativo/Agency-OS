import { fileURLToPath } from "node:url";
import path from "node:path";
import dotenv from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@agency-os/db";

// Carga el .env del propio paquete, sin depender del cwd desde el que se invoque.
const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, "../.env") });

export interface Cli {
  /** Nombres (o prefijos) de cliente a migrar. Vacío = TODOS (migración final). */
  onlyClients: string[];
  dryRun: boolean;
  rollback: boolean;
}

export function parseCli(argv: string[]): Cli {
  const args = argv.slice(2);
  const get = (flag: string) => {
    const hit = args.find((a) => a === flag || a.startsWith(`${flag}=`));
    if (!hit) return undefined;
    const eq = hit.indexOf("=");
    return eq === -1 ? "" : hit.slice(eq + 1);
  };
  const onlyRaw = get("--only-clients");
  return {
    onlyClients: (onlyRaw ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    dryRun: args.includes("--dry-run"),
    rollback: args.includes("--rollback"),
  };
}

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Falta la variable de entorno ${name} (ver .env.example).`);
  return v;
}

/** Cliente del origen legacy. Sin tipar contra Database (su esquema difiere). Solo lectura. */
export function makeLegacyClient(): SupabaseClient {
  return createClient(required("LEGACY_SUPABASE_URL"), required("LEGACY_SERVICE_ROLE_KEY"), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** Cliente del destino agency-os, tipado con Database. Escribe con service-role (bypassa RLS). */
export function makeAgencyClient(): SupabaseClient<Database> {
  return createClient<Database>(required("AGENCY_SUPABASE_URL"), required("AGENCY_SERVICE_ROLE_KEY"), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function targetOrgId(): string {
  return required("TARGET_ORG_ID");
}
