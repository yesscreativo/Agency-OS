import { NextResponse } from "next/server";
import { listForReport, listHolidays } from "@agency-os/db";
import { countBusinessDays, LEAVE_REQUEST_TYPE_LABELS, leaveRequestStatusLabel, type LeaveRequestType } from "@agency-os/domain";
import { getCurrentUser, hasPermission } from "@/lib/auth";
import { getSupabaseServerClient } from "@/lib/supabase-server";

/** Escapa un valor para una celda CSV: neutraliza inyección de fórmulas
 * (Excel/Sheets ejecutan una celda que empieza con =, +, -, @ o tab/CR como
 * fórmula — el nombre del colaborador o las observaciones son texto libre que
 * alguien podría setear así a propósito) anteponiendo un apóstrofe, y entre
 * comillas dobles si tiene coma, comilla o salto de línea. Sin librería — el
 * archivo es simple y no vale la pena una dependencia nueva para esto. */
function csvCell(value: string): string {
  let v = value ?? "";
  if (/^[=+\-@\t\r]/.test(v)) v = `'${v}`;
  if (/[",\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sesión expirada." }, { status: 401 });
  if (!hasPermission(user, "leave.approve_hr")) {
    return NextResponse.json({ error: "No tienes permiso de RRHH." }, { status: 403 });
  }
  const organizationId = user.organizationIds[0];
  if (!organizationId) return NextResponse.json({ error: "Sin organización." }, { status: 400 });

  const { searchParams } = new URL(request.url);
  const currentYear = new Date().getFullYear();
  const year = Number(searchParams.get("year")) || currentYear;
  const month = searchParams.get("month") ? Number(searchParams.get("month")) : undefined;
  const type = (searchParams.get("type") || undefined) as LeaveRequestType | undefined;

  const db = await getSupabaseServerClient();
  const [rows, holidays] = await Promise.all([
    listForReport(db, organizationId, { year, month, type }),
    listHolidays(db),
  ]);
  const holidayIsos = holidays.map((h) => h.date);

  const header = ["Colaborador", "Tipo", "Inicio", "Fin", "Días hábiles", "Estado"];
  const lines = [header.map(csvCell).join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.requester?.full_name ?? "—",
        LEAVE_REQUEST_TYPE_LABELS[r.type],
        r.start_date,
        r.end_date,
        String(countBusinessDays(r.start_date, r.end_date, holidayIsos)),
        leaveRequestStatusLabel(r.manager_status, r.hr_status),
      ]
        .map(csvCell)
        .join(","),
    );
  }
  const csv = "﻿" + lines.join("\r\n"); // BOM: Excel abre UTF-8 con tildes correctamente

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="vacaciones-${year}${month ? `-${month}` : ""}.csv"`,
    },
  });
}
