# "Mis tiempos" por cliente Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** En `/proyectos/tiempos` (scope `mine`), agrupar el tiempo por cliente en cards expandibles (proyecto + entradas al abrir), sin tocar el filtro de fechas libre ni `scope=team`.

**Architecture:** `reportEntries` (repo) gana un embed de proyecto+cliente. Función pura nueva en domain (`groupTimeByClient`, con tests). Componente nuevo `ClientTimeCards` (`"use client"`, único trozo interactivo — expand/collapse en memoria). `TimeReport` bifurca su render por `scope`: `team` no cambia; `mine` pierde el filtro de proyecto y el desglose por colaborador, y usa `ClientTimeCards` en vez de la lista plana. Spec: `Docs/superpowers/specs/2026-09-04-mis-tiempos-por-cliente-design.md`.

**Tech Stack:** Next.js (App Router, server components), Supabase (Postgres), TypeScript, `@agency-os/{db,domain,ui}`, vitest (dominio).

## Global Constraints

- Cuerpo/UI en **español**.
- No se toca el filtro de fechas libre (`from`/`to`) ni ningún comportamiento de `scope=team`.
- Tras cada tarea con código: `pnpm typecheck && pnpm lint` verdes; la de dominio además `pnpm --filter @agency-os/domain test`.
- No correr `pnpm build` con `pnpm dev` activo.
- No commitear hasta que Yesid lo pida explícitamente.

---

## File Structure

- `packages/domain/src/work-item-time.ts` — nueva función `groupTimeByClient`.
- `packages/domain/src/work-item-time.test.ts` — sus tests.
- `packages/db/src/repositories/work-item-time.ts` — `reportEntries` trae proyecto+cliente; `TimeEntryForReport` gana campos.
- `apps/web/components/proyectos/client-time-cards.tsx` — nuevo, cards por cliente expandibles.
- `apps/web/components/proyectos/time-report.tsx` — bifurca por `scope`.
- `apps/web/app/(app)/proyectos/tiempos/page.tsx` — mapea los campos nuevos; no aplica el filtro de proyecto cuando `scope=mine`.

---

## Task 1: Dominio — `groupTimeByClient`

**Files:**
- Modify: `packages/domain/src/work-item-time.ts`
- Modify: `packages/domain/src/work-item-time.test.ts`

**Interfaces:**
- Produces: `ClientTimeProjectGroup { projectId, projectTitle, minutes }`, `ClientTimeGroup { clientId, clientName, minutes, projects: ClientTimeProjectGroup[] }`, `groupTimeByClient<T extends {clientId,clientName,projectId,projectTitle,minutes}>(entries: T[]): ClientTimeGroup[]`.

- [ ] **Step 1: Escribir el test que falla**

Añadir al final de `packages/domain/src/work-item-time.test.ts`:

```ts
import { groupMinutesByUser, groupTimeByClient, sumMinutes } from "./work-item-time";

describe("groupTimeByClient", () => {
  it("agrupa por cliente y por proyecto dentro del cliente, orden desc", () => {
    const out = groupTimeByClient([
      { clientId: "c1", clientName: "Cortex", projectId: "p1", projectTitle: "Web", minutes: 30 },
      { clientId: "c1", clientName: "Cortex", projectId: "p2", projectTitle: "App", minutes: 90 },
      { clientId: "c2", clientName: "Novatel", projectId: "p3", projectTitle: "Ads", minutes: 15 },
      { clientId: "c1", clientName: "Cortex", projectId: "p1", projectTitle: "Web", minutes: 10 },
    ]);
    expect(out).toEqual([
      {
        clientId: "c1",
        clientName: "Cortex",
        minutes: 130,
        projects: [
          { projectId: "p2", projectTitle: "App", minutes: 90 },
          { projectId: "p1", projectTitle: "Web", minutes: 40 },
        ],
      },
      {
        clientId: "c2",
        clientName: "Novatel",
        minutes: 15,
        projects: [{ projectId: "p3", projectTitle: "Ads", minutes: 15 }],
      },
    ]);
  });

  it("es [] sin entradas", () => {
    expect(groupTimeByClient([])).toEqual([]);
  });
});
```

(Actualizar el `import` de arriba del archivo para incluir `groupTimeByClient` junto a `groupMinutesByUser`/`sumMinutes`, en vez de duplicar el import.)

- [ ] **Step 2: Correr y verificar que falla**

Run: `pnpm --filter @agency-os/domain test`
Expected: FAIL ("groupTimeByClient is not exported" o similar).

- [ ] **Step 3: Implementar**

Añadir a `packages/domain/src/work-item-time.ts`:

```ts
export interface ClientTimeProjectGroup {
  projectId: string;
  projectTitle: string;
  minutes: number;
}

export interface ClientTimeGroup {
  clientId: string;
  clientName: string;
  minutes: number;
  projects: ClientTimeProjectGroup[];
}

/** Agrupa minutos por cliente y, dentro de cada cliente, por proyecto. Ambos
 * niveles ordenados de mayor a menor minutos. */
export function groupTimeByClient<
  T extends {
    clientId: string;
    clientName: string;
    projectId: string;
    projectTitle: string;
    minutes: number;
  },
>(entries: T[]): ClientTimeGroup[] {
  const clients = new Map<
    string,
    { clientName: string; minutes: number; projects: Map<string, { projectTitle: string; minutes: number }> }
  >();
  for (const e of entries) {
    let c = clients.get(e.clientId);
    if (!c) {
      c = { clientName: e.clientName, minutes: 0, projects: new Map() };
      clients.set(e.clientId, c);
    }
    c.minutes += e.minutes;
    let p = c.projects.get(e.projectId);
    if (!p) {
      p = { projectTitle: e.projectTitle, minutes: 0 };
      c.projects.set(e.projectId, p);
    }
    p.minutes += e.minutes;
  }
  return [...clients.entries()]
    .map(([clientId, c]) => ({
      clientId,
      clientName: c.clientName,
      minutes: c.minutes,
      projects: [...c.projects.entries()]
        .map(([projectId, p]) => ({ projectId, projectTitle: p.projectTitle, minutes: p.minutes }))
        .sort((a, b) => b.minutes - a.minutes),
    }))
    .sort((a, b) => b.minutes - a.minutes);
}
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `pnpm --filter @agency-os/domain test`
Expected: PASS.

- [ ] **Step 5: Commit**

(Solo cuando Yesid lo pida — dejar el cambio en el working tree.)

## Task 2: Repo — `reportEntries` trae proyecto + cliente

**Files:**
- Modify: `packages/db/src/repositories/work-item-time.ts`

**Interfaces:**
- Produces: `TimeEntryForReport` gana `projectId: string; projectTitle: string; clientId: string; clientName: string`.

- [ ] **Step 1: Implementar**

Reemplazar el bloque de `SELECT_WITH_USER_AND_TASK` / `ReportSelectRow` / `TimeEntryForReport` / `toReportEntry`:

```ts
const SELECT_WITH_USER_AND_TASK =
  "*, user:users!work_item_time_entries_user_id_fkey(id, person:people(full_name, avatar_url)), task:work_items!work_item_time_entries_work_item_id_fkey(id, title), project:work_items!work_item_time_entries_project_id_fkey(id, title, client:clients(id, name))";

type ReportSelectRow = SelectRow & {
  task: { id: string; title: string } | null;
  project: { id: string; title: string; client: { id: string; name: string } | null } | null;
};

export type TimeEntryForReport = TimeEntryWithUser & {
  taskTitle: string;
  projectId: string;
  projectTitle: string;
  clientId: string;
  clientName: string;
};

function toReportEntry(row: ReportSelectRow): TimeEntryForReport {
  return {
    ...toEntry(row),
    taskTitle: row.task?.title ?? "—",
    projectId: row.project?.id ?? row.project_id,
    projectTitle: row.project?.title ?? "—",
    clientId: row.project?.client?.id ?? "sin-cliente",
    clientName: row.project?.client?.name ?? "Sin cliente",
  };
}
```

`reportEntries` (la función, debajo) no cambia — sigue usando `SELECT_WITH_USER_AND_TASK`/`ReportSelectRow`/`toReportEntry` por nombre.

- [ ] **Step 2: Verificar el embed de FK contra REST**

MCP `execute_sql`: `select constraint_name from information_schema.table_constraints where table_name = 'work_item_time_entries' and constraint_type = 'FOREIGN KEY';`
Expected: incluye `work_item_time_entries_project_id_fkey` (ya verificado en la sesión de Fase 3 — confirmar que sigue igual).

- [ ] **Step 3: Typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: verdes. (`@agency-os/web` fallará hasta que la Task 5 actualice `page.tsx` para mapear los campos nuevos — si el error apunta ahí, es esperado hasta cerrar esa tarea; seguir con Task 3/4 antes de verificar web en verde.)

- [ ] **Step 4: Commit**

(Solo cuando Yesid lo pida.)

## Task 3: UI — `ClientTimeCards`

**Files:**
- Create: `apps/web/components/proyectos/client-time-cards.tsx`

**Interfaces:**
- Consumes: `groupTimeByClient`, `formatDuration` de `@agency-os/domain`.
- Produces: `interface ClientCardEntry { id, clientId, clientName, projectId, projectTitle, taskTitle, minutes, spentOn, note }`; `<ClientTimeCards entries={ClientCardEntry[]} />`.

- [ ] **Step 1: Implementar**

```tsx
"use client";

// Cards por cliente en "Mis tiempos": agrupa con groupTimeByClient y expande
// inline (sin navegar) el desglose por proyecto + las entradas de ese cliente.

import { useState } from "react";
import { formatDuration, groupTimeByClient } from "@agency-os/domain";

export interface ClientCardEntry {
  id: string;
  clientId: string;
  clientName: string;
  projectId: string;
  projectTitle: string;
  taskTitle: string;
  minutes: number;
  spentOn: string;
  note: string | null;
}

function formatDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("es", { day: "numeric", month: "short", year: "numeric" });
}

export function ClientTimeCards({ entries }: { entries: ClientCardEntry[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const groups = groupTimeByClient(entries);

  const entriesByClient = new Map<string, ClientCardEntry[]>();
  for (const e of entries) {
    const list = entriesByClient.get(e.clientId) ?? [];
    list.push(e);
    entriesByClient.set(e.clientId, list);
  }

  const toggle = (clientId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(clientId)) next.delete(clientId);
      else next.add(clientId);
      return next;
    });
  };

  if (groups.length === 0) {
    return (
      <p className="mt-4 rounded-lg border border-line bg-glass px-8 py-16 text-center text-sm text-muted backdrop-blur-xl">
        No hay tiempo registrado en este rango.
      </p>
    );
  }

  return (
    <div className="mt-4 space-y-2">
      {groups.map((g) => {
        const isOpen = expanded.has(g.clientId);
        const clientEntries = (entriesByClient.get(g.clientId) ?? [])
          .slice()
          .sort((a, b) => (a.spentOn < b.spentOn ? 1 : -1));
        return (
          <div
            key={g.clientId}
            className="overflow-hidden rounded-lg border border-line bg-glass backdrop-blur-xl transition hover:border-line-strong"
          >
            <button
              type="button"
              onClick={() => toggle(g.clientId)}
              aria-expanded={isOpen}
              className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left transition hover:bg-surface-2"
            >
              <span className="font-semibold text-ink">{g.clientName}</span>
              <span className="font-semibold tabular-nums text-ink">{formatDuration(g.minutes)}</span>
            </button>
            {isOpen && (
              <div className="border-t border-line px-5 py-4">
                <div className="flex flex-wrap gap-2">
                  {g.projects.map((p) => (
                    <div
                      key={p.projectId}
                      className="flex items-center gap-2 rounded-pill border border-line bg-glass px-3 py-1.5 text-sm"
                    >
                      <span className="text-muted">{p.projectTitle}</span>
                      <span className="font-semibold tabular-nums text-ink">{formatDuration(p.minutes)}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-3 space-y-1.5">
                  {clientEntries.map((e) => (
                    <div
                      key={e.id}
                      className="flex flex-wrap items-center gap-3 rounded-md border border-line bg-glass px-3 py-2 text-sm"
                    >
                      <span className="w-24 shrink-0 text-muted">{formatDay(e.spentOn)}</span>
                      <span className="min-w-0 flex-1 truncate text-ink">{e.taskTitle}</span>
                      {g.projects.length > 1 && (
                        <span className="shrink-0 text-xs text-muted">{e.projectTitle}</span>
                      )}
                      <span className="shrink-0 font-semibold tabular-nums text-ink">
                        {formatDuration(e.minutes)}
                      </span>
                      {e.note && (
                        <span className="w-full truncate text-xs text-muted sm:w-auto sm:flex-1">{e.note}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: verdes (este archivo es autosuficiente).

- [ ] **Step 3: Commit**

(Solo cuando Yesid lo pida.)

## Task 4: UI — `TimeReport` bifurca por scope

**Files:**
- Modify: `apps/web/components/proyectos/time-report.tsx`

**Interfaces:**
- Consumes: `ClientTimeCards` (Task 3).
- Produces: `TimeReportEntry` gana `projectId`, `projectTitle`, `clientId`, `clientName`.

- [ ] **Step 1: Reemplazar el archivo completo**

```tsx
// Panel "Mis tiempos" / "Tiempos del equipo" (ClickUp Parity Fase C). Server
// component puro: los filtros son un <form method="get"> (sin JS), el toggle de
// scope son enlaces con query param. `mine` agrupa por cliente (ClientTimeCards,
// único trozo interactivo); `team` mantiene la lista plana + desglose por
// colaborador sin cambios.

import { Avatar, Button, Input, Label, Select } from "@agency-os/ui";
import { formatDuration, groupMinutesByUser, initialsOf } from "@agency-os/domain";
import { ClientTimeCards } from "./client-time-cards";

export interface TimeReportEntry {
  id: string;
  userId: string;
  userName: string;
  userAvatarUrl: string | null;
  taskTitle: string;
  projectId: string;
  projectTitle: string;
  clientId: string;
  clientName: string;
  minutes: number;
  spentOn: string;
  note: string | null;
}

export interface TimeReportProject {
  id: string;
  title: string;
}

interface TimeReportProps {
  scope: "mine" | "team";
  canManage: boolean;
  entries: TimeReportEntry[];
  projects: TimeReportProject[];
  filters: { project: string; from: string; to: string };
}

function formatDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("es", { day: "numeric", month: "short", year: "numeric" });
}

export function TimeReport({ scope, canManage, entries, projects, filters }: TimeReportProps) {
  const totalMinutes = entries.reduce((n, e) => n + e.minutes, 0);
  const byUser = groupMinutesByUser(entries.map((e) => ({ userId: e.userId, minutes: e.minutes })));
  const infoByUser = new Map(entries.map((e) => [e.userId, { name: e.userName, avatarUrl: e.userAvatarUrl }]));
  const hasFilters = Boolean(filters.project || filters.from || filters.to);
  const clearHref = scope === "team" ? "/proyectos/tiempos?scope=team" : "/proyectos/tiempos";

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            {scope === "team" ? "Tiempos del equipo" : "Mis tiempos"}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {scope === "team"
              ? "Tiempo registrado en tareas de Proyectos."
              : "Tiempo que has registrado, por cliente."}
          </p>
        </div>
        {canManage && (
          <div className="flex gap-2">
            <a
              href="/proyectos/tiempos"
              className={`rounded-pill border px-3.5 py-2 text-sm font-semibold transition ${
                scope === "mine"
                  ? "border-green bg-green text-green-ink"
                  : "border-line-strong text-muted hover:text-ink"
              }`}
            >
              Mis tiempos
            </a>
            <a
              href="/proyectos/tiempos?scope=team"
              className={`rounded-pill border px-3.5 py-2 text-sm font-semibold transition ${
                scope === "team"
                  ? "border-green bg-green text-green-ink"
                  : "border-line-strong text-muted hover:text-ink"
              }`}
            >
              Tiempos del equipo
            </a>
          </div>
        )}
      </div>

      <form method="get" className="mt-6 flex flex-wrap items-end gap-3">
        {scope === "team" && <input type="hidden" name="scope" value="team" />}
        {scope === "team" && (
          <div>
            <Label htmlFor="tr-project">Proyecto</Label>
            <Select id="tr-project" name="project" defaultValue={filters.project} className="w-56">
              <option value="">Todos</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </Select>
          </div>
        )}
        <div>
          <Label htmlFor="tr-from">Desde</Label>
          <Input id="tr-from" type="date" name="from" defaultValue={filters.from} className="w-40" />
        </div>
        <div>
          <Label htmlFor="tr-to">Hasta</Label>
          <Input id="tr-to" type="date" name="to" defaultValue={filters.to} className="w-40" />
        </div>
        <Button type="submit" size="sm">
          Filtrar
        </Button>
        {hasFilters && (
          <a href={clearHref} className="text-sm text-muted transition hover:text-ink">
            Limpiar filtros
          </a>
        )}
      </form>

      <div className="mt-6 rounded-lg border border-line bg-glass p-6 backdrop-blur-xl">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted">Total</span>
          <span className="text-lg font-semibold tabular-nums text-ink">
            {totalMinutes > 0 ? formatDuration(totalMinutes) : "0m"}
          </span>
        </div>
        {scope === "team" && byUser.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {byUser.map((u) => {
              const info = infoByUser.get(u.userId);
              return (
                <div
                  key={u.userId}
                  className="flex items-center gap-2 rounded-pill border border-line bg-glass px-3 py-1.5 text-sm"
                >
                  <Avatar initials={initialsOf(info?.name ?? "—")} src={info?.avatarUrl ?? null} size="xs" />
                  <span className="text-muted">{info?.name ?? "—"}</span>
                  <span className="font-semibold tabular-nums text-ink">{formatDuration(u.minutes)}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {scope === "mine" ? (
        <ClientTimeCards entries={entries} />
      ) : (
        <div className="mt-4 space-y-1.5">
          {entries.length === 0 ? (
            <p className="rounded-lg border border-line bg-glass px-8 py-16 text-center text-sm text-muted backdrop-blur-xl">
              No hay tiempo registrado en este rango.
            </p>
          ) : (
            entries.map((e) => (
              <div
                key={e.id}
                className="flex flex-wrap items-center gap-3 rounded-md border border-line bg-glass px-4 py-3 text-sm backdrop-blur-xl"
              >
                <Avatar initials={initialsOf(e.userName)} src={e.userAvatarUrl} size="xs" />
                <span className="w-24 shrink-0 text-muted">{formatDay(e.spentOn)}</span>
                <span className="min-w-0 flex-1 truncate text-ink">{e.taskTitle}</span>
                <span className="text-muted">{e.userName}</span>
                <span className="shrink-0 font-semibold tabular-nums text-ink">{formatDuration(e.minutes)}</span>
                {e.note && (
                  <span className="w-full truncate pl-9 text-xs text-muted sm:w-auto sm:flex-1 sm:pl-0">
                    {e.note}
                  </span>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: puede seguir en rojo hasta cerrar Task 5 (la page todavía no manda `projectId`/`projectTitle`/`clientId`/`clientName`).

- [ ] **Step 3: Commit**

(Solo cuando Yesid lo pida.)

## Task 5: Page — mapear campos nuevos y no filtrar por proyecto en `mine`

**Files:**
- Modify: `apps/web/app/(app)/proyectos/tiempos/page.tsx`

- [ ] **Step 1: Actualizar la llamada a `reportEntries` y el mapeo**

```tsx
const [entryRows, projects] = await Promise.all([
  reportEntries(db, {
    organizationId,
    userId: scope === "mine" ? user.id : undefined,
    projectId: scope === "team" ? searchParams.project || undefined : undefined,
    from: searchParams.from || undefined,
    to: searchParams.to || undefined,
  }),
  listProjects(db, organizationId),
]);

const entries = entryRows.map((e) => ({
  id: e.id,
  userId: e.user_id,
  userName: e.user?.full_name ?? "—",
  userAvatarUrl: e.user?.avatar_url ?? null,
  taskTitle: e.taskTitle,
  projectId: e.projectId,
  projectTitle: e.projectTitle,
  clientId: e.clientId,
  clientName: e.clientName,
  minutes: e.minutes,
  spentOn: e.spent_on,
  note: e.note,
}));
```

El resto del archivo (el `<TimeReport ... />` de retorno) no cambia.

- [ ] **Step 2: Typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: verdes (ya con Task 2-4 cerradas).

- [ ] **Step 3: Commit**

(Solo cuando Yesid lo pida.)

## Task 6: Checkpoint de verificación (Yesid)

- [ ] En "Mis tiempos": las cards de cliente muestran el total correcto (suma manual de un par de entradas conocidas). Expandir una card muestra el desglose por proyecto y las entradas de ese cliente. El filtro de fechas (`from`/`to`) sigue funcionando igual que antes. No aparece el dropdown de "Proyecto" en `mine`.
- [ ] En "Tiempos del equipo" (con una cuenta `project.manage`/`proyectos_admin`): todo igual que antes — filtro de proyecto, lista plana, desglose por colaborador. Nada cambió ahí.
- [ ] Claro + oscuro.

---

## Self-Review (autor del plan)

- **Cobertura de la spec:** cards por cliente (Task 3/4) ✓, desglose por proyecto + entradas al expandir (Task 3) ✓, filtro de fechas libre intacto (Task 4, sin tocar los `Input` de from/to) ✓, sin dropdown de proyecto en `mine` (Task 4) ✓, sin desglose por colaborador en `mine` (Task 4) ✓, `scope=team` sin cambios de comportamiento (Task 4, rama `else`) ✓, bucket "Sin cliente" defensivo (Task 2, fallback en `toReportEntry`) ✓.
- **Consistencia de tipos:** `ClientCardEntry` (Task 3) es un subconjunto de `TimeReportEntry` (Task 4) — la asignación estructural funciona sin remapeo. `TimeEntryForReport` (Task 2) se mapea 1:1 en `page.tsx` (Task 5) con los mismos nombres de campo salvo snake→camel ya usados en el resto del archivo.
- **Placeholders:** ninguno — todo el código de cada tarea es el archivo final completo.
