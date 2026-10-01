import "server-only";
import type { Db } from "@agency-os/db";

const ATTACHMENT_BUCKET = "leave-request-files";
const UUID_PREFIX_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/i;

/** `<org>/<user>/<uuid>-<nombre>` → `<nombre>` (ver createLeaveRequestAction). */
export function filenameFromAttachmentPath(path: string): string {
  const basename = path.split("/").pop() ?? path;
  return basename.replace(UUID_PREFIX_RE, "");
}

/** Firma en lote las rutas de adjuntos de `leave-request-files` que aparecen
 * en un listado (pendientes, historial del jefe, reporte de RRHH…). */
export async function signLeaveAttachments(db: Db, paths: (string | null)[]): Promise<Map<string, string>> {
  const uniquePaths = [...new Set(paths.filter((p): p is string => Boolean(p)))];
  const urls = new Map<string, string>();
  if (uniquePaths.length === 0) return urls;
  const { data } = await db.storage.from(ATTACHMENT_BUCKET).createSignedUrls(uniquePaths, 60 * 10);
  for (const item of data ?? []) {
    if (item.path && item.signedUrl) urls.set(item.path, item.signedUrl);
  }
  return urls;
}
