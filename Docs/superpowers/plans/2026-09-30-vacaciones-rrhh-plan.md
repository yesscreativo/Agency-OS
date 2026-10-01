# Vacaciones y Permisos (RRHH) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar el formulario externo + n8n + ClickUp de vacaciones/permisos por un módulo propio de Agency OS (`rrhh`), con aprobación en dos pasos (jefe automático vía `areas.manager_user_id` → rol RRHH), bloqueo de fechas server-side, adjuntos, y reporte consolidado exportable.

**Architecture:** Una tabla `leave_requests` con dos "semáforos" de estado (`manager_status`/`hr_status`) resueltos por server actions; el jefe se resuelve automático (sin dropdown) desde `areas.manager_user_id` vía `people.area_id` del solicitante. Lógica de fechas (bloqueo + conteo de días hábiles con festivos) como funciones puras testeadas en `@agency-os/domain`. UI en `/rrhh` (mis solicitudes), `/rrhh/aprobaciones` (bandeja jefe+RRHH), `/rrhh/festivos` (CRUD, RRHH), `/rrhh/reportes` (filtros + export CSV, RRHH).

**Tech Stack:** Next.js/TypeScript/Tailwind, Supabase (Postgres/RLS/Storage). Sin dependencias nuevas — CSV se genera a mano (texto plano), sin librería de Excel.

## Global Constraints

- Reutiliza permisos/infraestructura existentes donde se pueda: notificaciones in-app (`createNotifications`), bucket privado + signed URLs (mismo patrón que `work-item-files`), editor de roles ya existente (para crear el rol "RRHH" — **no** se crea el rol por migración, lo crea el usuario con la UI ya construida).
- Bloqueo de fechas: **solo** para `type = 'vacaciones'`, aplica a `start_date`/`end_date`/`return_date`, comparando contra el mes de CADA fecha (no solo el mes en curso — corrige el bug del sistema actual).
- Conteo de días hábiles: excluye sábados, domingos y fechas de `public_holidays` — tabla que arranca **vacía**, la llena el rol RRHH desde `/rrhh/festivos` (no se hardcodean fechas en la migración).
- `manager_user_id` se fija como snapshot al crear la solicitud — nunca se recalcula después.
- Notificaciones solo in-app (sin email/WhatsApp).
- Copy en español; `snake_case` en DB.

---

### Task 1: Migración — esquema completo

**Files:**
- Create: `supabase/migrations/061_leave_requests.sql`

**Interfaces:**
- Produces: tipos `leave_request_type`, `leave_approval_status`; tablas `leave_requests`, `public_holidays`; bucket `leave-request-files`; permisos `leave.request` (otorgado a todos los roles), `leave.approve_hr`; módulo `rrhh` activado.

- [ ] **Step 1: Escribir la migración**

```sql
-- 061_leave_requests.sql
-- Reemplaza el formulario externo (vacaciones.laburuagency.com) + n8n +
-- ClickUp por un módulo propio. Ver Docs/superpowers/specs/2026-09-30-vacaciones-rrhh-design.md.

create type public.leave_request_type as enum (
  'vacaciones',
  'home_office',
  'permiso_personal',
  'licencia_medica',
  'licencia_maternidad_paternidad',
  'calamidad_domestica',
  'otro'
);

create type public.leave_approval_status as enum ('pending', 'approved', 'rejected');

create table public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  requester_user_id uuid not null references public.users(id),
  type public.leave_request_type not null,
  start_date date not null,
  end_date date not null,
  return_date date,
  notes text,
  attachment_path text,
  manager_user_id uuid references public.users(id),
  manager_status public.leave_approval_status not null default 'pending',
  manager_decided_at timestamptz,
  manager_reject_reason text,
  hr_status public.leave_approval_status not null default 'pending',
  hr_decided_at timestamptz,
  hr_reject_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint leave_requests_return_date_needs_vacaciones
    check (type <> 'vacaciones' or return_date is not null),
  constraint leave_requests_attachment_required
    check (type not in ('licencia_medica', 'otro') or attachment_path is not null),
  constraint leave_requests_dates_order check (end_date >= start_date)
);
create index leave_requests_requester_idx on public.leave_requests(requester_user_id);
create index leave_requests_manager_idx on public.leave_requests(manager_user_id);
create index leave_requests_org_idx on public.leave_requests(organization_id);

create table public.public_holidays (
  id uuid primary key default gen_random_uuid(),
  date date not null unique,
  name text not null
);

-- Bucket privado para adjuntos (licencia médica / otro). Mismo patrón que
-- work-item-files (019_work_item_attachments.sql): binario en Storage, la fila
-- de leave_requests guarda solo la ruta; acceso vía signed URL server-side.
insert into storage.buckets (id, name, public, file_size_limit)
values ('leave-request-files', 'leave-request-files', false, 10485760)
on conflict (id) do nothing;

create policy "leave_request_files_select_authenticated" on storage.objects
  for select to authenticated using (bucket_id = 'leave-request-files');
create policy "leave_request_files_insert_authenticated" on storage.objects
  for insert to authenticated with check (bucket_id = 'leave-request-files');

-- RLS ------------------------------------------------------------------
alter table public.leave_requests enable row level security;

create policy leave_requests_select on public.leave_requests
  for select using (
    organization_id in (select public.current_user_organization_ids())
    and (
      requester_user_id = auth.uid()
      or manager_user_id = auth.uid()
      or public.current_user_has_permission('leave.approve_hr')
    )
  );

create policy leave_requests_insert on public.leave_requests
  for insert with check (
    organization_id in (select public.current_user_organization_ids())
    and requester_user_id = auth.uid()
  );

create policy leave_requests_update_manager on public.leave_requests
  for update using (
    organization_id in (select public.current_user_organization_ids())
    and manager_user_id = auth.uid()
    and manager_status = 'pending'
  );

create policy leave_requests_update_hr on public.leave_requests
  for update using (
    organization_id in (select public.current_user_organization_ids())
    and public.current_user_has_permission('leave.approve_hr')
    and manager_status = 'approved'
  );

alter table public.public_holidays enable row level security;

create policy public_holidays_select on public.public_holidays
  for select using (true);
create policy public_holidays_write on public.public_holidays
  for all using (public.current_user_has_permission('leave.approve_hr'));

-- Permisos + módulo ------------------------------------------------------
insert into public.permissions (code, name, description) values
  ('leave.request', 'Solicitar permisos/vacaciones', null),
  ('leave.approve_hr', 'Aprobar en segunda instancia (RRHH) y ver reportes', null)
on conflict (code) do nothing;

-- Cualquier colaborador puede solicitar sus propios permisos, sin importar
-- su rol funcional — se otorga a TODOS los roles existentes.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where p.code = 'leave.request'
on conflict do nothing;

update public.modules set is_active = true where code = 'rrhh';
```

- [ ] **Step 2: Aplicar la migración**

```
mcp__supabase__apply_migration(name: "leave_requests", query: <contenido del archivo>)
```

- [ ] **Step 3: Regenerar tipos TypeScript**

```
mcp__supabase__generate_typescript_types()
```

Sobreescribir `packages/db/src/types/database.ts` con el resultado completo. Confirmar que `Tables<"leave_requests">` y `Tables<"public_holidays">` existen.

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @agency-os/db typecheck`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/061_leave_requests.sql packages/db/src/types/database.ts
git commit -m "feat(rrhh): esquema de vacaciones/permisos (leave_requests, public_holidays)"
```

---

### Task 2: Domain — fechas, días hábiles y estado combinado

**Files:**
- Create: `packages/domain/src/leave.ts`
- Test: `packages/domain/src/leave.test.ts`
- Modify: `packages/domain/src/index.ts` (agregar `export * from "./leave";`)
- Modify: `packages/domain/src/permission-groups.ts` (agregar `leave: "Vacaciones y permisos"` a `GROUP_LABELS`)
- Modify: `packages/domain/src/permission-groups.test.ts` (test del nuevo grupo)

**Interfaces:**
- Produces:
  - `LEAVE_REQUEST_TYPES` (array de 7 valores) + `LeaveRequestType` (tipo union)
  - `LEAVE_REQUEST_TYPE_LABELS: Record<LeaveRequestType, string>`
  - `isVacationDateBlocked(targetIso: string, todayIso: string): boolean`
  - `countBusinessDays(startIso: string, endIso: string, holidayIsos: string[]): number`
  - `type LeaveApprovalStatus = "pending" | "approved" | "rejected"`
  - `leaveRequestStatusLabel(managerStatus: LeaveApprovalStatus, hrStatus: LeaveApprovalStatus): string`

- [ ] **Step 1: Escribir los tests (fallando)**

```typescript
// packages/domain/src/leave.test.ts
import { describe, expect, it } from "vitest";
import {
  countBusinessDays,
  isVacationDateBlocked,
  leaveRequestStatusLabel,
  LEAVE_REQUEST_TYPE_LABELS,
  LEAVE_REQUEST_TYPES,
} from "./leave";

describe("LEAVE_REQUEST_TYPES", () => {
  it("tiene los 7 tipos con etiqueta en español", () => {
    expect(LEAVE_REQUEST_TYPES).toHaveLength(7);
    for (const t of LEAVE_REQUEST_TYPES) {
      expect(LEAVE_REQUEST_TYPE_LABELS[t]).toBeTruthy();
    }
  });
});

describe("isVacationDateBlocked", () => {
  it("bloquea si la fecha cae del 23 a fin de mes y hoy ya pasó el 23 de ESE mes", () => {
    expect(isVacationDateBlocked("2026-11-27", "2026-11-25")).toBe(true);
  });

  it("no bloquea si hoy todavía no llega al 23 del mes de la fecha, aunque sea un mes futuro", () => {
    expect(isVacationDateBlocked("2026-11-27", "2026-10-05")).toBe(false);
  });

  it("no bloquea una fecha antes del día 23 del mes, sin importar hoy", () => {
    expect(isVacationDateBlocked("2026-11-10", "2026-11-25")).toBe(false);
  });

  it("no bloquea si hoy es exactamente el día 23 del mes de la fecha (el límite es inclusive: 23 es el último día permitido para pedir)", () => {
    expect(isVacationDateBlocked("2026-11-27", "2026-11-22")).toBe(false);
    expect(isVacationDateBlocked("2026-11-27", "2026-11-23")).toBe(true);
  });
});

describe("countBusinessDays", () => {
  it("cuenta de lunes a viernes, sin festivos, inclusivo", () => {
    // 2026-11-02 es lunes, 2026-11-06 es viernes: 5 días hábiles.
    expect(countBusinessDays("2026-11-02", "2026-11-06", [])).toBe(5);
  });

  it("excluye sábado y domingo", () => {
    // 2026-11-02 (lun) a 2026-11-08 (dom): 5 hábiles (excluye 7 y 8).
    expect(countBusinessDays("2026-11-02", "2026-11-08", [])).toBe(5);
  });

  it("excluye festivos que caigan en día hábil", () => {
    // 2026-11-02 a 2026-11-06, con el miércoles 4 como festivo: 4 hábiles.
    expect(countBusinessDays("2026-11-02", "2026-11-06", ["2026-11-04"])).toBe(4);
  });

  it("un festivo en fin de semana no resta (ya estaba excluido)", () => {
    // 2026-11-07 es sábado.
    expect(countBusinessDays("2026-11-02", "2026-11-08", ["2026-11-07"])).toBe(5);
  });
});

describe("leaveRequestStatusLabel", () => {
  it("pendiente de jefe", () => {
    expect(leaveRequestStatusLabel("pending", "pending")).toBe("Pendiente jefe");
  });
  it("pendiente de RRHH", () => {
    expect(leaveRequestStatusLabel("approved", "pending")).toBe("Pendiente RRHH");
  });
  it("aprobada", () => {
    expect(leaveRequestStatusLabel("approved", "approved")).toBe("Aprobada");
  });
  it("rechazada por el jefe", () => {
    expect(leaveRequestStatusLabel("rejected", "pending")).toBe("Rechazada (jefe)");
  });
  it("rechazada por RRHH", () => {
    expect(leaveRequestStatusLabel("approved", "rejected")).toBe("Rechazada (RRHH)");
  });
});
```

- [ ] **Step 2: Correr los tests y confirmar que fallan**

Run: `pnpm --filter @agency-os/domain test`
Expected: FAIL — `Cannot find module './leave'`.

- [ ] **Step 3: Implementar**

```typescript
// packages/domain/src/leave.ts
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
```

- [ ] **Step 4: Correr los tests y confirmar que pasan**

Run: `pnpm --filter @agency-os/domain test`
Expected: PASS (todos los `describe` de `leave.test.ts`).

- [ ] **Step 5: Exportar desde el índice + agregar grupo de permisos**

En `packages/domain/src/index.ts`, agregar junto a los demás `export *`:

```typescript
export * from "./leave";
```

En `packages/domain/src/permission-groups.ts`, agregar al mapa `GROUP_LABELS`:

```typescript
  leave: "Vacaciones y permisos",
```

En `packages/domain/src/permission-groups.test.ts`, agregar un caso (buscar el test existente de `groupLabel` y sumar una aserción):

```typescript
  it("agrupa permisos de leave.*", () => {
    expect(groupLabel("leave.approve_hr")).toBe("Vacaciones y permisos");
  });
```

- [ ] **Step 6: Typecheck del paquete**

Run: `pnpm --filter @agency-os/domain build`
Expected: sin errores.

- [ ] **Step 7: Commit**

```bash
git add packages/domain/src/leave.ts packages/domain/src/leave.test.ts packages/domain/src/index.ts packages/domain/src/permission-groups.ts packages/domain/src/permission-groups.test.ts
git commit -m "feat(domain): bloqueo de fechas, días hábiles y estado combinado de vacaciones/permisos"
```

---

### Task 3: Repositorios

**Files:**
- Create: `packages/db/src/repositories/leave-requests.ts`
- Create: `packages/db/src/repositories/public-holidays.ts`
- Modify: `packages/db/src/repositories/areas.ts`
- Modify: `packages/db/src/repositories/permissions.ts`
- Modify: `packages/db/src/index.ts`

**Interfaces:**
- Produces:
  - `getAreaManagerForPerson(db: Db, personId: string): Promise<string | null>` (en `areas.ts`)
  - `listUsersWithPermission(db: Db, orgId: string, code: string): Promise<string[]>` (en `permissions.ts`)
  - `type LeaveRequestRow`, `type LeaveRequestWithRequester`
  - `createLeaveRequest(db, values): Promise<LeaveRequestRow>`
  - `getLeaveRequest(db, id): Promise<LeaveRequestRow | null>`
  - `listMyLeaveRequests(db, requesterUserId): Promise<LeaveRequestRow[]>`
  - `listPendingForManager(db, managerUserId): Promise<LeaveRequestWithRequester[]>`
  - `listPendingForHr(db, orgId): Promise<LeaveRequestWithRequester[]>`
  - `decideManager(db, id, {status, reason}): Promise<void>`
  - `decideHr(db, id, {status, reason}): Promise<void>`
  - `listForReport(db, orgId, filters): Promise<LeaveRequestWithRequester[]>`
  - `type HolidayRow`, `listHolidays(db): Promise<HolidayRow[]>`, `createHoliday(db, {date, name}): Promise<HolidayRow>`, `deleteHoliday(db, id): Promise<void>`

- [ ] **Step 1: Extender `areas.ts`**

Agregar al final del archivo:

```typescript
/** Jefe (manager_user_id del área) de una persona, vía people.area_id. null
 * si la persona no tiene área asignada o el área no tiene gerente. Para
 * resolver el aprobador automático de una solicitud de vacaciones/permiso. */
export async function getAreaManagerForPerson(db: Db, personId: string): Promise<string | null> {
  const { data, error } = await db
    .from("people")
    .select("area:areas(manager_user_id)")
    .eq("id", personId)
    .maybeSingle()
    .returns<{ area: { manager_user_id: string | null } | null } | null>();
  if (error) throw error;
  return data?.area?.manager_user_id ?? null;
}
```

- [ ] **Step 2: Extender `permissions.ts`**

Agregar al final del archivo:

```typescript
/** user_id de todos los que tienen `code` en alguno de sus roles, dentro de
 * `orgId`. 3 queries chicas en vez de un embed anidado (más simple y
 * confiable que filtrar por columna de una tabla 2 niveles más abajo en
 * PostgREST). Para notificaciones "a todo el rol X" (ej. RRHH). */
export async function listUsersWithPermission(db: Db, orgId: string, code: string): Promise<string[]> {
  const { data: perm, error: permError } = await db
    .from("permissions")
    .select("id")
    .eq("code", code)
    .maybeSingle();
  if (permError) throw permError;
  if (!perm) return [];

  const { data: rolePerms, error: rpError } = await db
    .from("role_permissions")
    .select("role_id")
    .eq("permission_id", perm.id);
  if (rpError) throw rpError;
  const roleIds = (rolePerms ?? []).map((r) => r.role_id);
  if (roleIds.length === 0) return [];

  const { data: userRoles, error: urError } = await db
    .from("user_roles")
    .select("user_id")
    .eq("organization_id", orgId)
    .in("role_id", roleIds);
  if (urError) throw urError;
  return Array.from(new Set((userRoles ?? []).map((r) => r.user_id)));
}
```

- [ ] **Step 3: Repo de festivos**

```typescript
// packages/db/src/repositories/public-holidays.ts
import type { Tables } from "../types/database";
import type { Db } from "./shared";

export type HolidayRow = Tables<"public_holidays">;

export async function listHolidays(db: Db): Promise<HolidayRow[]> {
  const { data, error } = await db.from("public_holidays").select("*").order("date");
  if (error) throw error;
  return data ?? [];
}

export async function createHoliday(db: Db, values: { date: string; name: string }): Promise<HolidayRow> {
  const { data, error } = await db.from("public_holidays").insert(values).select("*").single();
  if (error) throw error;
  return data;
}

export async function deleteHoliday(db: Db, id: string): Promise<void> {
  const { error } = await db.from("public_holidays").delete().eq("id", id);
  if (error) throw error;
}
```

- [ ] **Step 4: Repo de solicitudes**

```typescript
// packages/db/src/repositories/leave-requests.ts
import type { Enums, Tables, TablesInsert } from "../types/database";
import type { Db } from "./shared";

export type LeaveRequestRow = Tables<"leave_requests">;

export interface RequesterInfo {
  id: string;
  full_name: string;
}

export type LeaveRequestWithRequester = LeaveRequestRow & { requester: RequesterInfo | null };

const WITH_REQUESTER_SELECT =
  "*, requester:users!leave_requests_requester_user_id_fkey(id, person:people(full_name))";

type WithRequesterDbRow = LeaveRequestRow & {
  requester: { id: string; person: { full_name: string } | null } | null;
};

function toWithRequester(row: WithRequesterDbRow): LeaveRequestWithRequester {
  return {
    ...row,
    requester: row.requester ? { id: row.requester.id, full_name: row.requester.person?.full_name ?? "—" } : null,
  };
}

export async function createLeaveRequest(
  db: Db,
  values: TablesInsert<"leave_requests">,
): Promise<LeaveRequestRow> {
  const { data, error } = await db.from("leave_requests").insert(values).select("*").single();
  if (error) throw error;
  return data;
}

export async function getLeaveRequest(db: Db, id: string): Promise<LeaveRequestRow | null> {
  const { data, error } = await db.from("leave_requests").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function listMyLeaveRequests(db: Db, requesterUserId: string): Promise<LeaveRequestRow[]> {
  const { data, error } = await db
    .from("leave_requests")
    .select("*")
    .eq("requester_user_id", requesterUserId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/** Pendientes de decisión del jefe (bandeja de aprobación, paso 1). */
export async function listPendingForManager(db: Db, managerUserId: string): Promise<LeaveRequestWithRequester[]> {
  const { data, error } = await db
    .from("leave_requests")
    .select(WITH_REQUESTER_SELECT)
    .eq("manager_user_id", managerUserId)
    .eq("manager_status", "pending")
    .order("created_at", { ascending: true })
    .returns<WithRequesterDbRow[]>();
  if (error) throw error;
  return (data ?? []).map(toWithRequester);
}

/** Pendientes de decisión de RRHH (paso 2, ya aprobadas por el jefe). */
export async function listPendingForHr(db: Db, orgId: string): Promise<LeaveRequestWithRequester[]> {
  const { data, error } = await db
    .from("leave_requests")
    .select(WITH_REQUESTER_SELECT)
    .eq("organization_id", orgId)
    .eq("manager_status", "approved")
    .eq("hr_status", "pending")
    .order("created_at", { ascending: true })
    .returns<WithRequesterDbRow[]>();
  if (error) throw error;
  return (data ?? []).map(toWithRequester);
}

export async function decideManager(
  db: Db,
  id: string,
  decision: { status: Enums<"leave_approval_status">; reason?: string | null },
): Promise<void> {
  const { error } = await db
    .from("leave_requests")
    .update({
      manager_status: decision.status,
      manager_decided_at: new Date().toISOString(),
      manager_reject_reason: decision.reason ?? null,
    })
    .eq("id", id);
  if (error) throw error;
}

export async function decideHr(
  db: Db,
  id: string,
  decision: { status: Enums<"leave_approval_status">; reason?: string | null },
): Promise<void> {
  const { error } = await db
    .from("leave_requests")
    .update({
      hr_status: decision.status,
      hr_decided_at: new Date().toISOString(),
      hr_reject_reason: decision.reason ?? null,
    })
    .eq("id", id);
  if (error) throw error;
}

export interface LeaveReportFilters {
  year: number;
  month?: number; // 1-12
  personUserId?: string;
  type?: Enums<"leave_request_type">;
}

/** Solicitudes para el reporte/export de RRHH, filtradas por año (obligatorio)
 * y opcionalmente mes/persona/tipo. Filtra por `start_date` dentro del
 * año/mes pedido. */
export async function listForReport(
  db: Db,
  orgId: string,
  filters: LeaveReportFilters,
): Promise<LeaveRequestWithRequester[]> {
  const monthStr = filters.month ? String(filters.month).padStart(2, "0") : null;
  const rangeStart = monthStr ? `${filters.year}-${monthStr}-01` : `${filters.year}-01-01`;
  const rangeEnd = monthStr ? `${filters.year}-${monthStr}-31` : `${filters.year}-12-31`;

  let query = db
    .from("leave_requests")
    .select(WITH_REQUESTER_SELECT)
    .eq("organization_id", orgId)
    .gte("start_date", rangeStart)
    .lte("start_date", rangeEnd)
    .order("start_date");

  if (filters.personUserId) query = query.eq("requester_user_id", filters.personUserId);
  if (filters.type) query = query.eq("type", filters.type);

  const { data, error } = await query.returns<WithRequesterDbRow[]>();
  if (error) throw error;
  return (data ?? []).map(toWithRequester);
}
```

Nota sobre el nombre del FK en `WITH_REQUESTER_SELECT`: confirmar el nombre real (`leave_requests_requester_user_id_fkey`) en `packages/db/src/types/database.ts` tras regenerar tipos en la Task 1 — Postgres nombra los FK como `<tabla>_<columna>_fkey` por default (mismo patrón ya verificado en `work_item_dependencies` esta sesión), así que debería ser exactamente ese nombre; si el ambiguity error de PostgREST aparece (dos FKs a `users` en la misma tabla — `requester_user_id` y `manager_user_id` ambos referencian `users`), el nombre explícito ya lo resuelve.

- [ ] **Step 5: Exportar todo desde el índice**

En `packages/db/src/index.ts`, agregar:

```typescript
export * from "./repositories/leave-requests";
export * from "./repositories/public-holidays";
```

- [ ] **Step 6: Typecheck**

Run: `pnpm --filter @agency-os/db typecheck`
Expected: sin errores.

- [ ] **Step 7: Commit**

```bash
git add packages/db/src/repositories/leave-requests.ts packages/db/src/repositories/public-holidays.ts packages/db/src/repositories/areas.ts packages/db/src/repositories/permissions.ts packages/db/src/index.ts
git commit -m "feat(db): repos de solicitudes de permiso, festivos y resolución de jefe/permiso"
```

---

### Task 4: Server actions

**Files:**
- Create: `apps/web/lib/leave-actions.ts`

**Interfaces:**
- Consumes: repos de Task 3; `isVacationDateBlocked`/`countBusinessDays` de `@agency-os/domain`; `getCurrentUser`/`hasPermission` de `@/lib/auth`; patrón de subida de archivo ya usado en `project-actions.ts` (`uploadWorkItemAttachment`).
- Produces:
  - `createLeaveRequestAction(formData: FormData): Promise<IdResult>`
  - `decideManagerAction(id: string, status: "approved" | "rejected", reason?: string): Promise<ActionResult>`
  - `decideHrAction(id: string, status: "approved" | "rejected", reason?: string): Promise<ActionResult>`
  - `createHolidayAction(date: string, name: string): Promise<ActionResult>`
  - `deleteHolidayAction(id: string): Promise<ActionResult>`

- [ ] **Step 1: Escribir el archivo completo**

```typescript
// apps/web/lib/leave-actions.ts
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
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter web typecheck`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/leave-actions.ts
git commit -m "feat(rrhh): server actions de solicitudes, aprobación en 2 pasos y festivos"
```

---

### Task 5: UI — activar módulo, nav y "Mis solicitudes"

**Files:**
- Modify: `apps/web/app/(app)/(hub)/inicio/page.tsx` (agregar `rrhh: "/rrhh"` a `MODULE_HREFS`)
- Create: `apps/web/app/(app)/rrhh/layout.tsx`
- Create: `apps/web/components/rrhh/leave-request-form.tsx`
- Create: `apps/web/components/rrhh/my-requests-list.tsx`
- Create: `apps/web/app/(app)/rrhh/page.tsx`

**Interfaces:**
- Consumes: `createLeaveRequestAction` (Task 4); `listMyLeaveRequests` (Task 3); `LEAVE_REQUEST_TYPES`/`LEAVE_REQUEST_TYPE_LABELS`/`leaveRequestStatusLabel` (Task 2).
- Produces: `MyRequestRow` (tipo usado por `my-requests-list.tsx` y la página).

- [ ] **Step 1: Activar el módulo en la landing**

En `apps/web/app/(app)/(hub)/inicio/page.tsx`:

```typescript
const MODULE_HREFS: Record<string, string> = {
  crm: "/crm",
  proyectos: "/proyectos",
  rrhh: "/rrhh",
};
```

- [ ] **Step 2: Layout del módulo**

```typescript
// apps/web/app/(app)/rrhh/layout.tsx
import { redirect } from "next/navigation";
import { canAccessModule, getCurrentUser, hasPermission } from "@/lib/auth";
import { MainNav } from "@/components/main-nav";

const RRHH_NAV_ITEMS: { href: string; label: string; permission?: string }[] = [
  { href: "/rrhh", label: "Mis solicitudes" },
  { href: "/rrhh/aprobaciones", label: "Aprobaciones" },
  { href: "/rrhh/reportes", label: "Reportes", permission: "leave.approve_hr" },
  { href: "/rrhh/festivos", label: "Festivos", permission: "leave.approve_hr" },
];

export default async function RrhhLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canAccessModule(user, "rrhh")) redirect("/inicio");

  const visibleItems = RRHH_NAV_ITEMS.filter(
    (item) => !item.permission || hasPermission(user, item.permission),
  );

  return (
    <div>
      <MainNav items={visibleItems} />
      <div className="mt-6">{children}</div>
    </div>
  );
}
```

- [ ] **Step 3: Formulario de solicitud**

```typescript
// apps/web/components/rrhh/leave-request-form.tsx
"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, FieldError, Input, Label, Modal, Select, Textarea } from "@agency-os/ui";
import { LEAVE_REQUEST_TYPES, LEAVE_REQUEST_TYPE_LABELS, type LeaveRequestType } from "@agency-os/domain";
import { createLeaveRequestAction } from "@/lib/leave-actions";

const NEEDS_RETURN_DATE: LeaveRequestType = "vacaciones";
const NEEDS_ATTACHMENT: LeaveRequestType[] = ["licencia_medica", "otro"];

export function LeaveRequestForm({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [type, setType] = useState<LeaveRequestType | "">("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [returnDate, setReturnDate] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isVacaciones = type === NEEDS_RETURN_DATE;
  const needsAttachment = type !== "" && NEEDS_ATTACHMENT.includes(type);

  const reset = () => {
    setType("");
    setStartDate("");
    setEndDate("");
    setReturnDate("");
    setNotes("");
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const submit = () => {
    setError(null);
    if (!type) return setError("Selecciona el tipo de permiso.");
    if (!startDate || !endDate) return setError("Fecha de inicio y fin son obligatorias.");
    if (endDate < startDate) return setError("La fecha de fin no puede ser anterior al inicio.");
    if (isVacaciones && !returnDate) return setError("La fecha de retorno es obligatoria para Vacaciones.");
    const file = fileInputRef.current?.files?.[0];
    if (needsAttachment && !file) return setError("Este tipo de permiso requiere adjuntar un documento.");

    const fd = new FormData();
    fd.append("type", type);
    fd.append("start_date", startDate);
    fd.append("end_date", endDate);
    if (returnDate) fd.append("return_date", returnDate);
    if (notes.trim()) fd.append("notes", notes.trim());
    if (file) fd.append("attachment", file);

    startTransition(async () => {
      const result = await createLeaveRequestAction(fd);
      if (result.error) return setError(result.error);
      reset();
      onClose();
      router.refresh();
    });
  };

  return (
    <Modal open={open} onClose={onClose} title="Nueva solicitud" size="sm">
      <div className="space-y-4">
        {error && <FieldError>{error}</FieldError>}

        <div>
          <Label htmlFor="leave-type">Tipo de Permiso</Label>
          <Select
            id="leave-type"
            value={type}
            onChange={(e) => setType(e.target.value as LeaveRequestType)}
          >
            <option value="">Selecciona una opción</option>
            {LEAVE_REQUEST_TYPES.map((t) => (
              <option key={t} value={t}>
                {LEAVE_REQUEST_TYPE_LABELS[t]}
              </option>
            ))}
          </Select>
        </div>

        <div className="flex gap-3">
          <div className="flex-1">
            <Label htmlFor="leave-start">Fecha inicio</Label>
            <Input id="leave-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div className="flex-1">
            <Label htmlFor="leave-end">Fecha fin</Label>
            <Input id="leave-end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
        </div>

        {isVacaciones && (
          <div>
            <Label htmlFor="leave-return">Fecha de retorno</Label>
            <Input id="leave-return" type="date" value={returnDate} onChange={(e) => setReturnDate(e.target.value)} />
          </div>
        )}

        {needsAttachment && (
          <div>
            <Label htmlFor="leave-attachment">Documento soporte</Label>
            <input
              ref={fileInputRef}
              id="leave-attachment"
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx"
              className="w-full text-sm text-muted"
            />
          </div>
        )}

        <div>
          <Label htmlFor="leave-notes">Observaciones (opcional)</Label>
          <Textarea id="leave-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={submit} disabled={pending}>
            Enviar solicitud
          </Button>
        </div>
      </div>
    </Modal>
  );
}
```

- [ ] **Step 4: Lista + resumen de "Mis solicitudes"**

```typescript
// apps/web/components/rrhh/my-requests-list.tsx
"use client";

import { useState } from "react";
import { Badge, Button } from "@agency-os/ui";
import { LEAVE_REQUEST_TYPE_LABELS, leaveRequestStatusLabel, type LeaveApprovalStatus } from "@agency-os/domain";
import { LeaveRequestForm } from "./leave-request-form";

export interface MyRequestRow {
  id: string;
  type: keyof typeof LEAVE_REQUEST_TYPE_LABELS;
  startDate: string;
  endDate: string;
  managerStatus: LeaveApprovalStatus;
  hrStatus: LeaveApprovalStatus;
  managerRejectReason: string | null;
  hrRejectReason: string | null;
}

function statusTone(managerStatus: LeaveApprovalStatus, hrStatus: LeaveApprovalStatus) {
  if (managerStatus === "rejected" || hrStatus === "rejected") return "danger" as const;
  if (managerStatus === "approved" && hrStatus === "approved") return "success" as const;
  return "warn" as const;
}

export function MyRequestsList({ requests }: { requests: MyRequestRow[] }) {
  const [creating, setCreating] = useState(false);

  const approved = requests.filter((r) => r.managerStatus === "approved" && r.hrStatus === "approved").length;
  const rejected = requests.filter((r) => r.managerStatus === "rejected" || r.hrStatus === "rejected").length;
  const pending = requests.length - approved - rejected;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex gap-4 text-sm">
          <span className="text-ink">
            <strong>{approved}</strong> aprobadas
          </span>
          <span className="text-danger">
            <strong>{rejected}</strong> rechazadas
          </span>
          <span className="text-muted">
            <strong>{pending}</strong> pendientes
          </span>
        </div>
        <Button variant="primary" size="sm" onClick={() => setCreating(true)}>
          + Nueva solicitud
        </Button>
      </div>

      {requests.length === 0 ? (
        <p className="text-sm text-faint">Todavía no tienes solicitudes.</p>
      ) : (
        <div className="space-y-2">
          {requests.map((r) => (
            <div key={r.id} className="rounded-lg border border-line bg-glass p-4 backdrop-blur-xl">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-ink">{LEAVE_REQUEST_TYPE_LABELS[r.type]}</span>
                <Badge tone={statusTone(r.managerStatus, r.hrStatus)}>
                  {leaveRequestStatusLabel(r.managerStatus, r.hrStatus)}
                </Badge>
              </div>
              <p className="mt-1 text-sm text-muted">
                {r.startDate} · {r.endDate}
              </p>
              {r.managerRejectReason && (
                <p className="mt-1 text-xs text-danger">Motivo (jefe): {r.managerRejectReason}</p>
              )}
              {r.hrRejectReason && <p className="mt-1 text-xs text-danger">Motivo (RRHH): {r.hrRejectReason}</p>}
            </div>
          ))}
        </div>
      )}

      <LeaveRequestForm open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}
```

- [ ] **Step 5: Página `/rrhh`**

```typescript
// apps/web/app/(app)/rrhh/page.tsx
import { redirect } from "next/navigation";
import { listMyLeaveRequests } from "@agency-os/db";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { MyRequestsList, type MyRequestRow } from "@/components/rrhh/my-requests-list";

export const dynamic = "force-dynamic";

export default async function MyLeaveRequestsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const db = await getSupabaseServerClient();
  const rows = await listMyLeaveRequests(db, user.id);

  const requests: MyRequestRow[] = rows.map((r) => ({
    id: r.id,
    type: r.type,
    startDate: r.start_date,
    endDate: r.end_date,
    managerStatus: r.manager_status,
    hrStatus: r.hr_status,
    managerRejectReason: r.manager_reject_reason,
    hrRejectReason: r.hr_reject_reason,
  }));

  return (
    <div>
      <h1 className="mb-6 text-3xl font-bold tracking-tight">Mis solicitudes</h1>
      <MyRequestsList requests={requests} />
    </div>
  );
}
```

- [ ] **Step 6: Typecheck**

Run: `pnpm --filter web typecheck`
Expected: sin errores.

- [ ] **Step 7: Commit**

```bash
git add "apps/web/app/(app)/(hub)/inicio/page.tsx" apps/web/app/\(app\)/rrhh/layout.tsx apps/web/app/\(app\)/rrhh/page.tsx apps/web/components/rrhh/leave-request-form.tsx apps/web/components/rrhh/my-requests-list.tsx
git commit -m "feat(rrhh): activa el módulo, nav y pantalla de Mis solicitudes"
```

---

### Task 6: UI — Aprobaciones (bandeja jefe + RRHH)

**Files:**
- Create: `apps/web/components/rrhh/approval-queue.tsx`
- Create: `apps/web/app/(app)/rrhh/aprobaciones/page.tsx`

**Interfaces:**
- Consumes: `decideManagerAction`/`decideHrAction` (Task 4); `listPendingForManager`/`listPendingForHr` (Task 3).

- [ ] **Step 1: Componente de bandeja**

```typescript
// apps/web/components/rrhh/approval-queue.tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Textarea } from "@agency-os/ui";
import { LEAVE_REQUEST_TYPE_LABELS, type LeaveRequestType } from "@agency-os/domain";

export interface PendingRequestRow {
  id: string;
  type: LeaveRequestType;
  startDate: string;
  endDate: string;
  requesterName: string;
  notes: string | null;
}

function QueueSection({
  title,
  items,
  onDecide,
  pendingId,
}: {
  title: string;
  items: PendingRequestRow[];
  onDecide: (id: string, status: "approved" | "rejected", reason?: string) => void;
  pendingId: string | null;
}) {
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  if (items.length === 0) return null;

  return (
    <section className="mb-6">
      <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-muted">{title}</h2>
      <div className="space-y-2">
        {items.map((r) => (
          <div key={r.id} className="rounded-lg border border-line bg-glass p-4 backdrop-blur-xl">
            <div className="flex items-center justify-between gap-2">
              <div>
                <span className="font-semibold text-ink">{r.requesterName}</span>
                <Badge tone="neutral" className="ml-2">
                  {LEAVE_REQUEST_TYPE_LABELS[r.type]}
                </Badge>
              </div>
              <span className="text-sm text-muted">
                {r.startDate} · {r.endDate}
              </span>
            </div>
            {r.notes && <p className="mt-1 text-sm text-muted">{r.notes}</p>}

            {rejectingId === r.id ? (
              <div className="mt-3 flex flex-col gap-2">
                <Textarea
                  autoFocus
                  placeholder="Motivo del rechazo…"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={2}
                />
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setRejectingId(null)}>
                    Cancelar
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    disabled={pendingId === r.id}
                    onClick={() => {
                      onDecide(r.id, "rejected", reason);
                      setRejectingId(null);
                      setReason("");
                    }}
                  >
                    Confirmar rechazo
                  </Button>
                </div>
              </div>
            ) : (
              <div className="mt-3 flex justify-end gap-2">
                <Button variant="ghost" size="sm" disabled={pendingId === r.id} onClick={() => setRejectingId(r.id)}>
                  Rechazar
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  disabled={pendingId === r.id}
                  onClick={() => onDecide(r.id, "approved")}
                >
                  Aprobar
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

export function ApprovalQueue({
  asManager,
  asHr,
  onDecideManager,
  onDecideHr,
}: {
  asManager: PendingRequestRow[];
  asHr: PendingRequestRow[];
  onDecideManager: (id: string, status: "approved" | "rejected", reason?: string) => Promise<{ error?: string }>;
  onDecideHr: (id: string, status: "approved" | "rejected", reason?: string) => Promise<{ error?: string }>;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const decide = (
    id: string,
    status: "approved" | "rejected",
    reason: string | undefined,
    action: (id: string, status: "approved" | "rejected", reason?: string) => Promise<{ error?: string }>,
  ) => {
    setError(null);
    setPendingId(id);
    startTransition(async () => {
      const result = await action(id, status, reason);
      setPendingId(null);
      if (result.error) return setError(result.error);
      router.refresh();
    });
  };

  if (asManager.length === 0 && asHr.length === 0) {
    return <p className="text-sm text-faint">No tienes solicitudes pendientes de aprobar.</p>;
  }

  return (
    <div>
      {error && (
        <div className="mb-3 rounded-md border border-danger/40 bg-glass px-4 py-2 text-sm text-danger backdrop-blur-xl">
          {error}
        </div>
      )}
      <QueueSection
        title="Como jefe directo"
        items={asManager}
        pendingId={pendingId}
        onDecide={(id, status, reason) => decide(id, status, reason, onDecideManager)}
      />
      <QueueSection
        title="Como RRHH"
        items={asHr}
        pendingId={pendingId}
        onDecide={(id, status, reason) => decide(id, status, reason, onDecideHr)}
      />
    </div>
  );
}
```

- [ ] **Step 2: Página de aprobaciones**

```typescript
// apps/web/app/(app)/rrhh/aprobaciones/page.tsx
import { redirect } from "next/navigation";
import { listPendingForHr, listPendingForManager } from "@agency-os/db";
import { getCurrentUser, hasPermission } from "@/lib/auth";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { decideHrAction, decideManagerAction } from "@/lib/leave-actions";
import { ApprovalQueue, type PendingRequestRow } from "@/components/rrhh/approval-queue";

export const dynamic = "force-dynamic";

function toRow(r: {
  id: string;
  type: PendingRequestRow["type"];
  start_date: string;
  end_date: string;
  notes: string | null;
  requester: { full_name: string } | null;
}): PendingRequestRow {
  return {
    id: r.id,
    type: r.type,
    startDate: r.start_date,
    endDate: r.end_date,
    requesterName: r.requester?.full_name ?? "—",
    notes: r.notes,
  };
}

export default async function LeaveApprovalsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const organizationId = user.organizationIds[0];

  const db = await getSupabaseServerClient();
  const isHr = hasPermission(user, "leave.approve_hr");

  const [managerRows, hrRows] = await Promise.all([
    listPendingForManager(db, user.id),
    isHr && organizationId ? listPendingForHr(db, organizationId) : Promise.resolve([]),
  ]);

  return (
    <div>
      <h1 className="mb-6 text-3xl font-bold tracking-tight">Aprobaciones</h1>
      <ApprovalQueue
        asManager={managerRows.map(toRow)}
        asHr={hrRows.map(toRow)}
        onDecideManager={decideManagerAction}
        onDecideHr={decideHrAction}
      />
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter web typecheck`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/rrhh/approval-queue.tsx "apps/web/app/(app)/rrhh/aprobaciones/page.tsx"
git commit -m "feat(rrhh): bandeja de aprobaciones (jefe + RRHH)"
```

---

### Task 7: UI — Festivos (CRUD, RRHH)

**Files:**
- Create: `apps/web/components/rrhh/holidays-manager.tsx`
- Create: `apps/web/app/(app)/rrhh/festivos/page.tsx`

**Interfaces:**
- Consumes: `createHolidayAction`/`deleteHolidayAction` (Task 4); `listHolidays` (Task 3).

- [ ] **Step 1: Componente**

```typescript
// apps/web/components/rrhh/holidays-manager.tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Input } from "@agency-os/ui";
import { createHolidayAction, deleteHolidayAction } from "@/lib/leave-actions";

export interface HolidayRow {
  id: string;
  date: string;
  name: string;
}

export function HolidaysManager({ holidays }: { holidays: HolidayRow[] }) {
  const router = useRouter();
  const [date, setDate] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const add = () => {
    setError(null);
    startTransition(async () => {
      const result = await createHolidayAction(date, name);
      if (result.error) return setError(result.error);
      setDate("");
      setName("");
      router.refresh();
    });
  };

  const remove = (id: string) => {
    setError(null);
    startTransition(async () => {
      const result = await deleteHolidayAction(id);
      if (result.error) return setError(result.error);
      router.refresh();
    });
  };

  return (
    <div>
      <p className="mb-4 text-sm text-muted">
        Festivos colombianos usados para calcular días hábiles (excluye sábados, domingos y estas fechas).
      </p>
      {error && <p className="mb-3 text-sm text-danger">{error}</p>}

      <div className="mb-6 flex items-end gap-2">
        <div>
          <label className="mb-1 block text-xs text-muted">Fecha</label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="flex-1">
          <label className="mb-1 block text-xs text-muted">Nombre</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="ej. Día de la Independencia" />
        </div>
        <Button variant="primary" onClick={add} disabled={pending}>
          Agregar
        </Button>
      </div>

      <div className="space-y-1">
        {holidays.map((h) => (
          <div
            key={h.id}
            className="flex items-center justify-between rounded-md border border-line bg-glass px-3 py-2 backdrop-blur-xl"
          >
            <span className="text-sm text-ink">
              {h.date} — {h.name}
            </span>
            <Button variant="ghost" size="sm" disabled={pending} onClick={() => remove(h.id)}>
              Quitar
            </Button>
          </div>
        ))}
        {holidays.length === 0 && <p className="text-sm text-faint">Sin festivos cargados todavía.</p>}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Página**

```typescript
// apps/web/app/(app)/rrhh/festivos/page.tsx
import { redirect } from "next/navigation";
import { listHolidays } from "@agency-os/db";
import { getCurrentUser, hasPermission } from "@/lib/auth";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { NoAccessPanel } from "@/components/no-access-panel";
import { HolidaysManager } from "@/components/rrhh/holidays-manager";

export const dynamic = "force-dynamic";

export default async function HolidaysPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!hasPermission(user, "leave.approve_hr")) {
    return (
      <NoAccessPanel
        title="No tienes acceso a Festivos"
        message="Esta sección es solo para el rol RRHH."
      />
    );
  }

  const db = await getSupabaseServerClient();
  const rows = await listHolidays(db);

  return (
    <div>
      <h1 className="mb-6 text-3xl font-bold tracking-tight">Festivos</h1>
      <HolidaysManager holidays={rows.map((h) => ({ id: h.id, date: h.date, name: h.name }))} />
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter web typecheck`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/rrhh/holidays-manager.tsx "apps/web/app/(app)/rrhh/festivos/page.tsx"
git commit -m "feat(rrhh): CRUD de festivos para el cálculo de días hábiles"
```

---

### Task 8: UI + export — Reportes

**Files:**
- Create: `apps/web/components/rrhh/report-filters.tsx`
- Create: `apps/web/app/(app)/rrhh/reportes/page.tsx`
- Create: `apps/web/app/(app)/rrhh/reportes/export/route.ts`

**Interfaces:**
- Consumes: `listForReport`/`listHolidays` (Task 3); `countBusinessDays`/`leaveRequestStatusLabel` (Task 2).

- [ ] **Step 1: Filtros (client, sincroniza con la URL vía searchParams)**

```typescript
// apps/web/components/rrhh/report-filters.tsx
"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Button, Select } from "@agency-os/ui";
import { LEAVE_REQUEST_TYPES, LEAVE_REQUEST_TYPE_LABELS } from "@agency-os/domain";

const MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

export function ReportFilters({ currentYear }: { currentYear: number }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const year = searchParams.get("year") ?? String(currentYear);
  const month = searchParams.get("month") ?? "";
  const type = searchParams.get("type") ?? "";

  const setParam = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.push(`/rrhh/reportes?${params.toString()}`);
  };

  const exportHref = `/rrhh/reportes/export?${searchParams.toString()}`;

  return (
    <div className="mb-6 flex flex-wrap items-end gap-3">
      <div>
        <label className="mb-1 block text-xs text-muted">Año</label>
        <Select value={year} onChange={(e) => setParam("year", e.target.value)}>
          {[currentYear - 1, currentYear, currentYear + 1].map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <label className="mb-1 block text-xs text-muted">Mes</label>
        <Select value={month} onChange={(e) => setParam("month", e.target.value)}>
          <option value="">Todos</option>
          {MONTHS.map((m, i) => (
            <option key={m} value={i + 1}>
              {m}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <label className="mb-1 block text-xs text-muted">Tipo</label>
        <Select value={type} onChange={(e) => setParam("type", e.target.value)}>
          <option value="">Todos</option>
          {LEAVE_REQUEST_TYPES.map((t) => (
            <option key={t} value={t}>
              {LEAVE_REQUEST_TYPE_LABELS[t]}
            </option>
          ))}
        </Select>
      </div>
      <Button variant="ghost" size="sm" onClick={() => window.open(exportHref, "_blank")}>
        Exportar CSV
      </Button>
    </div>
  );
}
```

- [ ] **Step 2: Página de reportes**

```typescript
// apps/web/app/(app)/rrhh/reportes/page.tsx
import { redirect } from "next/navigation";
import { listForReport, listHolidays } from "@agency-os/db";
import { countBusinessDays, LEAVE_REQUEST_TYPE_LABELS, leaveRequestStatusLabel, type LeaveRequestType } from "@agency-os/domain";
import { getCurrentUser, hasPermission } from "@/lib/auth";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { NoAccessPanel } from "@/components/no-access-panel";
import { ReportFilters } from "@/components/rrhh/report-filters";

export const dynamic = "force-dynamic";

export default async function LeaveReportsPage({
  searchParams,
}: {
  searchParams: { year?: string; month?: string; type?: string };
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!hasPermission(user, "leave.approve_hr")) {
    return <NoAccessPanel title="No tienes acceso a Reportes" message="Esta sección es solo para el rol RRHH." />;
  }
  const organizationId = user.organizationIds[0];
  if (!organizationId) redirect("/inicio");

  const currentYear = new Date().getFullYear();
  const year = Number(searchParams.year) || currentYear;
  const month = searchParams.month ? Number(searchParams.month) : undefined;
  const type = (searchParams.type || undefined) as LeaveRequestType | undefined;

  const db = await getSupabaseServerClient();
  const [rows, holidays] = await Promise.all([
    listForReport(db, organizationId, { year, month, type }),
    listHolidays(db),
  ]);
  const holidayIsos = holidays.map((h) => h.date);

  return (
    <div>
      <h1 className="mb-6 text-3xl font-bold tracking-tight">Reportes</h1>
      <ReportFilters currentYear={currentYear} />

      <div className="overflow-x-auto rounded-lg border border-line bg-glass backdrop-blur-xl">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-muted">
              <th className="px-4 py-2">Colaborador</th>
              <th className="px-4 py-2">Tipo</th>
              <th className="px-4 py-2">Inicio</th>
              <th className="px-4 py-2">Fin</th>
              <th className="px-4 py-2">Días hábiles</th>
              <th className="px-4 py-2">Estado</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-line last:border-0">
                <td className="px-4 py-2">{r.requester?.full_name ?? "—"}</td>
                <td className="px-4 py-2">{LEAVE_REQUEST_TYPE_LABELS[r.type]}</td>
                <td className="px-4 py-2">{r.start_date}</td>
                <td className="px-4 py-2">{r.end_date}</td>
                <td className="px-4 py-2">{countBusinessDays(r.start_date, r.end_date, holidayIsos)}</td>
                <td className="px-4 py-2">{leaveRequestStatusLabel(r.manager_status, r.hr_status)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-faint">
                  Sin solicitudes en este rango.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Route handler de export CSV**

```typescript
// apps/web/app/(app)/rrhh/reportes/export/route.ts
import { NextResponse } from "next/server";
import { listForReport, listHolidays } from "@agency-os/db";
import { countBusinessDays, LEAVE_REQUEST_TYPE_LABELS, leaveRequestStatusLabel, type LeaveRequestType } from "@agency-os/domain";
import { getCurrentUser, hasPermission } from "@/lib/auth";
import { getSupabaseServerClient } from "@/lib/supabase-server";

/** Escapa un valor para una celda CSV (comillas dobles si tiene coma, comilla
 * o salto de línea). Sin librería — el archivo es simple y no vale la pena
 * una dependencia nueva para esto. */
function csvCell(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
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
```

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter web typecheck`
Expected: sin errores.

- [ ] **Step 5: Build**

Run: `pnpm --filter web build`
Expected: build exitoso (solo si no hay un `pnpm dev` corriendo en paralelo — confirmar con el usuario antes).

- [ ] **Step 6: Verificación manual (Yesid en el navegador)**

1. Crear una solicitud de Vacaciones con fechas normales → debería quedar "Pendiente jefe", notificar al jefe real (resuelto de `areas.manager_user_id`).
2. Intentar crear una de Vacaciones con fecha en el tramo 23-fin de mes, hoy ya pasado el 23 de ese mes → debe rechazarla con el mensaje de bloqueo.
3. Crear una de Licencia Médica sin adjuntar archivo → debe pedirlo.
4. Como el jefe, aprobar la solicitud → pasa a "Pendiente RRHH", notifica a quien tenga el rol RRHH.
5. Crear el rol "RRHH" desde el editor de roles ya existente (`/usuarios` → Roles), asignarlo a un usuario de prueba, marcar el permiso `leave.approve_hr`.
6. Con ese usuario, aprobar en `/rrhh/aprobaciones` → pasa a "Aprobada", notifica al solicitante.
7. Cargar un par de festivos en `/rrhh/festivos` y confirmar que el conteo de días hábiles en `/rrhh/reportes` los descuenta.
8. Exportar CSV y abrirlo en Excel — confirmar que las tildes se ven bien (por el BOM).

- [ ] **Step 7: Commit**

```bash
git add apps/web/components/rrhh/report-filters.tsx "apps/web/app/(app)/rrhh/reportes/page.tsx" "apps/web/app/(app)/rrhh/reportes/export/route.ts"
git commit -m "feat(rrhh): reporte consolidado con filtros y export CSV"
```

---

## Spec Coverage Check

- Reemplazo total del formulario externo (spec, alcance) → Task 5 (form + mis solicitudes).
- Jefe automático vía `areas.manager_user_id` (spec §1) → Task 3 (`getAreaManagerForPerson`), Task 4 (`createLeaveRequestAction`).
- Aprobación en dos pasos + rol RRHH (spec §2) → Task 1 (permiso), Task 4 (acciones), Task 6 (UI). El rol en sí lo crea el usuario con el editor ya existente — no se crea por migración, a propósito.
- Mis solicitudes + resumen aprobadas/rechazadas (spec §3, y el pedido explícito de Yesid de sumar el conteo) → Task 5.
- Reportes + export CSV (spec §4) → Task 8.
- Bloqueo de fechas corregido (cualquier mes, no solo el actual, solo Vacaciones) → Task 2 (`isVacationDateBlocked`) + Task 4 (validación server-side).
- Días hábiles con festivos (tabla vacía, la llena RRHH) → Task 2 (`countBusinessDays`), Task 7 (CRUD festivos).
- Adjuntos obligatorios por tipo → Task 1 (check constraint) + Task 4 (validación) + Task 5 (UI condicional).
- Snapshot del jefe al crear → Task 4 (se resuelve y guarda una sola vez, `createLeaveRequestAction`).

Fuera de este plan a propósito (según el spec): email/WhatsApp, deshacer aprobaciones, editar una solicitud ya creada, saldo de días acumulados, cualquier integración con n8n/ClickUp.
