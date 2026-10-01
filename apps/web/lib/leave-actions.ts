"use server";

import { revalidatePath } from "next/cache";
import {
  createHoliday,
  createLeaveRequest,
  createNotifications,
  createSupabaseServiceRoleClient,
  decideHr,
  decideManager,
  deleteHoliday,
  getAreaManagerForPerson,
  getLeaveRequest,
  listUsersWithPermission,
  type Db,
  type Enums,
} from "@agency-os/db";
import { isVacationDateBlocked, LEAVE_REQUEST_TYPE_LABELS, type LeaveRequestType } from "@agency-os/domain";
import { getCurrentUser, hasPermission } from "@/lib/auth";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export type ActionResult = { ok: true; error?: never } | { ok?: never; error: string };
export type IdResult = { id: string; error?: never } | { id?: never; error: string };

const ATTACHMENT_BUCKET = "leave-request-files";
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

function safeStorageContentType(mime: string): string {
  const m = mime.toLowerCase();
  if (m === "text/html" || m === "application/xhtml+xml" || m.startsWith("image/svg")) {
    return "application/octet-stream";
  }
  return mime;
}

type RequesterAuth =
  | { organizationId: string; userId: string; personId: string; error?: never }
  | { organizationId?: never; userId?: never; personId?: never; error: string };

async function requireLeaveRequester(): Promise<RequesterAuth> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sesión expirada. Vuelve a iniciar sesión." };
  if (!hasPermission(user, "leave.request")) return { error: "No tienes permiso para solicitar permisos." };
  const organizationId = user.organizationIds[0];
  if (!organizationId) return { error: "Tu usuario no pertenece a ninguna organización." };
  if (!user.personId) return { error: "Tu usuario no tiene un perfil de persona asociado." };
  return { organizationId, userId: user.id, personId: user.personId };
}

/** Crea una solicitud. `formData` en vez de un objeto tipado porque puede
 * traer un archivo adjunto (mismo patrón que `uploadWorkItemAttachment`). */
export async function createLeaveRequestAction(formData: FormData): Promise<IdResult> {
  const auth = await requireLeaveRequester();
  if (auth.error !== undefined) return { error: auth.error };

  const type = String(formData.get("type") ?? "") as LeaveRequestType;
  if (!LEAVE_REQUEST_TYPE_LABELS[type]) return { error: "Tipo de permiso inválido." };

  const startDate = String(formData.get("start_date") ?? "");
  const endDate = String(formData.get("end_date") ?? "");
  const returnDate = formData.get("return_date") ? String(formData.get("return_date")) : null;
  const notes = formData.get("notes") ? String(formData.get("notes")) : null;

  if (!startDate || !endDate) return { error: "Fecha de inicio y fin son obligatorias." };
  if (endDate < startDate) return { error: "La fecha de fin no puede ser anterior al inicio." };
  if (type === "vacaciones" && !returnDate) return { error: "La fecha de retorno es obligatoria para Vacaciones." };

  const needsAttachment = type === "licencia_medica" || type === "otro";
  const file = formData.get("attachment");
  if (needsAttachment && (!(file instanceof File) || file.size === 0)) {
    return { error: "Este tipo de permiso requiere adjuntar un documento." };
  }
  if (file instanceof File && file.size > MAX_ATTACHMENT_BYTES) {
    return { error: "El archivo supera el límite de 10 MB." };
  }

  // Bloqueo de fechas — solo Vacaciones, server-side (el form ya lo valida en
  // el cliente, pero la regla real vive acá).
  if (type === "vacaciones") {
    const today = new Date().toISOString().slice(0, 10);
    const dates = [startDate, endDate, returnDate].filter((d): d is string => Boolean(d));
    if (dates.some((d) => isVacationDateBlocked(d, today))) {
      return {
        error: "Para fechas del 23 a fin de mes, la solicitud debe crearse antes del día 23 de ese mes.",
      };
    }
  }

  try {
    const db = await getSupabaseServerClient();
    const managerUserId = await getAreaManagerForPerson(db, auth.personId);

    let attachmentPath: string | null = null;
    if (file instanceof File && file.size > 0) {
      const safeName = file.name.replace(/[^\w.\-]+/g, "_");
      // Orden org/usuario a propósito: coincide con la policy RLS del bucket
      // (062_leave_request_files_rls_fix.sql), que valida split_part(name,'/',1)
      // = org propia y split_part(name,'/',2) = auth.uid() propio.
      const path = `${auth.organizationId}/${auth.userId}/${crypto.randomUUID()}-${safeName}`;
      const { error: uploadError } = await db.storage.from(ATTACHMENT_BUCKET).upload(path, file, {
        contentType: file.type ? safeStorageContentType(file.type) : "application/octet-stream",
        upsert: false,
      });
      if (uploadError) {
        console.error("createLeaveRequestAction:storage", uploadError);
        return { error: "No se pudo subir el archivo." };
      }
      attachmentPath = path;
    }

    const row = await createLeaveRequest(db, {
      organization_id: auth.organizationId,
      requester_user_id: auth.userId,
      type,
      start_date: startDate,
      end_date: endDate,
      return_date: returnDate,
      notes,
      attachment_path: attachmentPath,
      manager_user_id: managerUserId,
    });

    // Notificar al jefe (si se resolvió). Best-effort, con service_role porque
    // la RLS de notifications no permite insertar filas de otros usuarios.
    if (managerUserId) {
      try {
        const service = createSupabaseServiceRoleClient();
        await createNotifications(service, [
          {
            organization_id: auth.organizationId,
            user_id: managerUserId,
            type: "leave_request",
            title: `Nueva solicitud de ${LEAVE_REQUEST_TYPE_LABELS[type]}`,
            body: null,
            link: "/rrhh/aprobaciones",
          },
        ]);
      } catch (error) {
        console.error("createLeaveRequestAction:notify", error);
      }
    }

    revalidatePath("/rrhh");
    return { id: row.id };
  } catch (error) {
    console.error("createLeaveRequestAction", error);
    return { error: "No se pudo crear la solicitud. Intenta de nuevo." };
  }
}

async function notifyRequester(
  db: Db,
  args: { orgId: string; requesterUserId: string; title: string },
): Promise<void> {
  try {
    const service = createSupabaseServiceRoleClient();
    await createNotifications(service, [
      {
        organization_id: args.orgId,
        user_id: args.requesterUserId,
        type: "leave_request",
        title: args.title,
        body: null,
        link: "/rrhh",
      },
    ]);
  } catch (error) {
    console.error("notifyRequester", error);
  }
}

/** Decisión del jefe (paso 1). Ownership check (igual que /mi-area): ser el
 * `manager_user_id` de la solicitud — sin permiso nuevo. */
export async function decideManagerAction(
  id: string,
  status: Extract<Enums<"leave_approval_status">, "approved" | "rejected">,
  reason?: string,
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sesión expirada. Vuelve a iniciar sesión." };
  const organizationId = user.organizationIds[0];
  if (!organizationId) return { error: "Tu usuario no pertenece a ninguna organización." };

  try {
    const db = await getSupabaseServerClient();
    const request = await getLeaveRequest(db, id);
    if (!request || request.organization_id !== organizationId) {
      return { error: "La solicitud no existe o no pertenece a tu organización." };
    }
    if (request.manager_user_id !== user.id) return { error: "No sos el jefe de esta solicitud." };
    if (request.manager_status !== "pending") return { error: "Esta solicitud ya fue decidida." };

    await decideManager(db, id, { status, reason });
    await notifyRequester(db, {
      orgId: organizationId,
      requesterUserId: request.requester_user_id,
      title: status === "approved" ? "Tu jefe aprobó tu solicitud — pasó a RRHH" : "Tu jefe rechazó tu solicitud",
    });

    if (status === "approved") {
      const hrUserIds = await listUsersWithPermission(db, organizationId, "leave.approve_hr");
      if (hrUserIds.length > 0) {
        try {
          const service = createSupabaseServiceRoleClient();
          await createNotifications(
            service,
            hrUserIds.map((uid) => ({
              organization_id: organizationId,
              user_id: uid,
              type: "leave_request",
              title: `Solicitud aprobada por el jefe, pendiente RRHH`,
              body: null,
              link: "/rrhh/aprobaciones",
            })),
          );
        } catch (error) {
          console.error("decideManagerAction:notifyHr", error);
        }
      }
    }

    revalidatePath("/rrhh/aprobaciones");
    return { ok: true };
  } catch (error) {
    console.error("decideManagerAction", error);
    return { error: "No se pudo registrar la decisión. Intenta de nuevo." };
  }
}

/** Decisión de RRHH (paso 2). Requiere el permiso `leave.approve_hr`. */
export async function decideHrAction(
  id: string,
  status: Extract<Enums<"leave_approval_status">, "approved" | "rejected">,
  reason?: string,
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sesión expirada. Vuelve a iniciar sesión." };
  if (!hasPermission(user, "leave.approve_hr")) return { error: "No tienes permiso para aprobar como RRHH." };
  const organizationId = user.organizationIds[0];
  if (!organizationId) return { error: "Tu usuario no pertenece a ninguna organización." };

  try {
    const db = await getSupabaseServerClient();
    const request = await getLeaveRequest(db, id);
    if (!request || request.organization_id !== organizationId) {
      return { error: "La solicitud no existe o no pertenece a tu organización." };
    }
    if (request.manager_status !== "approved") return { error: "Todavía no la aprueba el jefe." };
    if (request.hr_status !== "pending") return { error: "Esta solicitud ya fue decidida por RRHH." };

    await decideHr(db, id, { status, reason });
    await notifyRequester(db, {
      orgId: organizationId,
      requesterUserId: request.requester_user_id,
      title: status === "approved" ? "RRHH aprobó tu solicitud" : "RRHH rechazó tu solicitud",
    });

    revalidatePath("/rrhh/aprobaciones");
    return { ok: true };
  } catch (error) {
    console.error("decideHrAction", error);
    return { error: "No se pudo registrar la decisión. Intenta de nuevo." };
  }
}

async function requireHr(): Promise<RequesterAuth> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sesión expirada. Vuelve a iniciar sesión." };
  if (!hasPermission(user, "leave.approve_hr")) return { error: "No tienes permiso de RRHH." };
  const organizationId = user.organizationIds[0];
  if (!organizationId) return { error: "Tu usuario no pertenece a ninguna organización." };
  return { organizationId, userId: user.id, personId: user.personId ?? "" };
}

export async function createHolidayAction(date: string, name: string): Promise<ActionResult> {
  const auth = await requireHr();
  if (auth.error !== undefined) return { error: auth.error };
  if (!date || !name.trim()) return { error: "Fecha y nombre son obligatorios." };

  try {
    const db = await getSupabaseServerClient();
    await createHoliday(db, { date, name: name.trim() });
    revalidatePath("/rrhh/festivos");
    return { ok: true };
  } catch (error) {
    console.error("createHolidayAction", error);
    return { error: "No se pudo crear el festivo. Intenta de nuevo." };
  }
}

export async function deleteHolidayAction(id: string): Promise<ActionResult> {
  const auth = await requireHr();
  if (auth.error !== undefined) return { error: auth.error };

  try {
    const db = await getSupabaseServerClient();
    await deleteHoliday(db, id);
    revalidatePath("/rrhh/festivos");
    return { ok: true };
  } catch (error) {
    console.error("deleteHolidayAction", error);
    return { error: "No se pudo borrar el festivo. Intenta de nuevo." };
  }
}
