// Lógica pura de vacaciones/permisos: bloqueo de fechas, conteo de días
// hábiles y la etiqueta de estado combinado (jefe + RRHH). Sin I/O.

export const LEAVE_REQUEST_TYPES = [
  "vacaciones",
  "home_office",
  "permiso_personal",
  "licencia_medica",
  "licencia_maternidad_paternidad",
  "calamidad_domestica",
  "otro",
] as const;

export type LeaveRequestType = (typeof LEAVE_REQUEST_TYPES)[number];

export const LEAVE_REQUEST_TYPE_LABELS: Record<LeaveRequestType, string> = {
  vacaciones: "Vacaciones",
  home_office: "Home Office",
  permiso_personal: "Permiso Personal",
  licencia_medica: "Licencia Médica",
  licencia_maternidad_paternidad: "Licencia Maternidad/Paternidad",
  calamidad_domestica: "Calamidad Doméstica",
  otro: "Otro",
};

function toUTCDate(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

/** "YYYY-MM-23" del mes/año de `iso`. */
function cutoffIsoForMonthOf(iso: string): string {
  return `${iso.slice(0, 7)}-23`;
}

/** true si `targetIso` cae en el tramo 23–fin de mes de SU mes, y `todayIso`
 * ya alcanzó o pasó el día 23 de ESE mes (ya es tarde para pedirlo). Se evalúa
 * por separado para cada fecha de la solicitud (inicio/fin/retorno) — solo
 * aplica a Vacaciones (ver spec). */
export function isVacationDateBlocked(targetIso: string, todayIso: string): boolean {
  const cutoff = cutoffIsoForMonthOf(targetIso);
  if (targetIso < cutoff) return false; // la fecha es antes del 23 de su mes: nunca se bloquea
  return todayIso >= cutoff;
}

/** Días hábiles entre dos fechas ISO, inclusivo, excluyendo sáb/dom y las
 * fechas en `holidayIsos`. */
export function countBusinessDays(startIso: string, endIso: string, holidayIsos: string[]): number {
  const holidays = new Set(holidayIsos);
  const start = toUTCDate(startIso);
  const end = toUTCDate(endIso);
  let count = 0;
  for (let d = new Date(start); d.getTime() <= end.getTime(); d.setUTCDate(d.getUTCDate() + 1)) {
    const dow = d.getUTCDay(); // 0 = domingo, 6 = sábado
    const iso = d.toISOString().slice(0, 10);
    if (dow !== 0 && dow !== 6 && !holidays.has(iso)) count += 1;
  }
  return count;
}

export type LeaveApprovalStatus = "pending" | "approved" | "rejected";

/** Estado combinado legible para el solicitante/reportes. */
export function leaveRequestStatusLabel(
  managerStatus: LeaveApprovalStatus,
  hrStatus: LeaveApprovalStatus,
): string {
  if (managerStatus === "rejected") return "Rechazada (jefe)";
  if (managerStatus === "pending") return "Pendiente jefe";
  // managerStatus === "approved" de acá en adelante
  if (hrStatus === "rejected") return "Rechazada (RRHH)";
  if (hrStatus === "pending") return "Pendiente RRHH";
  return "Aprobada";
}
