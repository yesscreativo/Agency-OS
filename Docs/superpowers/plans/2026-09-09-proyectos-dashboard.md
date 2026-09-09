# Dashboard de /proyectos — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans para ejecutar este plan tarea por tarea, con revisión manual de Yesid entre tareas (no subagent-driven-development). Los pasos usan checkbox (`- [ ]`) para trackear.

**Goal:** convertir la raíz `/proyectos` en un dashboard (saludo + agenda semanal ordenada por prioridad/duración + sidebar de tareas sin fecha + bloque de atención) sin tocar la lista de proyectos existente.

**Architecture:** una función de dominio pura ordena tareas por heurística (sin IA), una función de repo nueva trae "mis tareas" agrupadas en vencidas/semana/sin-fecha, y un componente cliente nuevo (`ProjectsDashboard`) se monta arriba de `ProjectsList` en la misma página. La única escritura (asignar fecha desde el sidebar) reusa la action `saveWorkItem` ya existente.

**Tech Stack:** Next.js 14 App Router (Server Components + Server Actions), Supabase Postgres, TypeScript, Vitest (dominio), Tailwind (`@agency-os/ui`).

## Global Constraints

- No hay migración de base de datos en este plan — todo se arma con tablas/columnas existentes.
- Cero tests de repositorio en este monorepo (no existen `*.test.ts` en `packages/db`); solo `packages/domain` tiene Vitest. No introducir el patrón nuevo acá.
- Sin IA/OpenAI — la heurística de orden es determinista (decisión de Yesid, 2026-09-09, ver spec).
- Agenda semanal: **lunes a viernes**, siempre la semana actual del server (sin navegación a otras semanas en esta v0).
- El date-picker del sidebar "Sin fecha" reusa `saveWorkItem` (requiere `project.manage`) — no se crea una server action nueva ni se relaja el control de acceso existente.
- Spec de referencia: `Docs/superpowers/specs/2026-09-09-proyectos-dashboard-design.md`.

---

### Task 1: Dominio — `addDays`

**Files:**
- Modify: `packages/domain/src/format.ts`
- Modify: `packages/domain/src/format.test.ts`

**Interfaces:**
- Produces: `addDays(date: string, days: number): string` — la usan Task 3 (repo) y Task 4 (página, para calcular `weekEnd`, `today` y `tomorrow` sin sesgo de timezone).

- [ ] **Step 1: Escribir los tests que fallan**

En `packages/domain/src/format.test.ts`, agregar al final del archivo (después del último `describe`):

```ts
describe("addDays", () => {
  it("suma días dentro del mismo mes", () => {
    expect(addDays("2026-09-08", 1)).toBe("2026-09-09");
  });

  it("cruza el fin de mes", () => {
    expect(addDays("2026-09-29", 4)).toBe("2026-10-03");
  });

  it("cruza el fin de año", () => {
    expect(addDays("2026-12-30", 4)).toBe("2027-01-03");
  });
});
```

Y agregar `addDays` al import de `vitest`/funciones del archivo (línea con `import { ... } from "./format";` si el test importa así, o el import correspondiente ya existente — el archivo importa las funciones bajo prueba directamente de `./format`, agregar `addDays` a esa lista).

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `pnpm --filter @agency-os/domain test -- format`
Expected: FAIL — `addDays` no existe todavía.

- [ ] **Step 3: Implementar `addDays`**

En `packages/domain/src/format.ts`, ubicar el final de `currentWeekRange`:

```ts
export function currentWeekRange(today: Date = new Date()): { from: string; to: string } {
  const day = today.getDay(); // 0=domingo..6=sábado
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate() + diffToMonday);
  const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
  return { from: formatLocalDate(monday), to: formatLocalDate(sunday) };
}
```

Agregar justo después:

```ts

/** Suma (o resta con `days` negativo) días a una fecha LOCAL "YYYY-MM-DD",
 * sin sesgo de timezone (reusa `dateParts`/`formatLocalDate`, igual que
 * `currentWeekRange`). */
export function addDays(date: string, days: number): string {
  const { y, m, d } = dateParts(date);
  return formatLocalDate(new Date(y, m - 1, d + days));
}
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `pnpm --filter @agency-os/domain test -- format`
Expected: PASS, incluidos los 3 tests nuevos de `addDays`.

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @agency-os/domain typecheck`
Expected: sin errores.

- [ ] **Step 6: Commit**

```bash
git add packages/domain/src/format.ts packages/domain/src/format.test.ts
git commit -m "feat(domain): addDays"
```

**Revisar (máx. 5 puntos):**
1. Los 3 tests nuevos de `addDays` pasan (incluye cruce de mes y de año).
2. `pnpm --filter @agency-os/domain test` completo sigue en verde (no rompió nada existente).
3. `addDays` no muta el string de entrada ni depende de `new Date()` sin fecha inyectada.

---

### Task 2: Dominio — `rankAgendaTasks`

**Files:**
- Create: `packages/domain/src/agenda.ts`
- Create: `packages/domain/src/agenda.test.ts`
- Modify: `packages/domain/src/index.ts`

**Interfaces:**
- Consumes: `WORK_ITEM_PRIORITIES`, `WorkItemPriority` de `./work-item`.
- Produces: `rankAgendaTasks<T extends { priority: WorkItemPriority; estimatedMinutes: number | null }>(tasks: T[]): T[]` — la usa Task 4 (página) para ordenar cada columna de la agenda y las tareas vencidas.

- [ ] **Step 1: Escribir el test que falla**

Crear `packages/domain/src/agenda.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { rankAgendaTasks } from "./agenda";

describe("rankAgendaTasks", () => {
  it("lista vacía", () => {
    expect(rankAgendaTasks([])).toEqual([]);
  });

  it("ordena por prioridad, urgente primero", () => {
    const tasks = [
      { id: "a", priority: "low" as const, estimatedMinutes: null },
      { id: "b", priority: "urgent" as const, estimatedMinutes: null },
      { id: "c", priority: "normal" as const, estimatedMinutes: null },
    ];
    expect(rankAgendaTasks(tasks).map((t) => t.id)).toEqual(["b", "c", "a"]);
  });

  it("con la misma prioridad, ordena por duración estimada ascendente", () => {
    const tasks = [
      { id: "a", priority: "high" as const, estimatedMinutes: 120 },
      { id: "b", priority: "high" as const, estimatedMinutes: 30 },
      { id: "c", priority: "high" as const, estimatedMinutes: 60 },
    ];
    expect(rankAgendaTasks(tasks).map((t) => t.id)).toEqual(["b", "c", "a"]);
  });

  it("sin estimado va al final de su grupo de prioridad", () => {
    const tasks = [
      { id: "a", priority: "high" as const, estimatedMinutes: null },
      { id: "b", priority: "high" as const, estimatedMinutes: 30 },
    ];
    expect(rankAgendaTasks(tasks).map((t) => t.id)).toEqual(["b", "a"]);
  });

  it("no muta el array original", () => {
    const tasks = [
      { id: "a", priority: "low" as const, estimatedMinutes: null },
      { id: "b", priority: "urgent" as const, estimatedMinutes: null },
    ];
    const original = [...tasks];
    rankAgendaTasks(tasks);
    expect(tasks).toEqual(original);
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `pnpm --filter @agency-os/domain test -- agenda`
Expected: FAIL con "Cannot find module './agenda'".

- [ ] **Step 3: Implementación**

Crear `packages/domain/src/agenda.ts`:

```ts
import { WORK_ITEM_PRIORITIES, type WorkItemPriority } from "./work-item";

export interface RankableTask {
  priority: WorkItemPriority;
  estimatedMinutes: number | null;
}

/** Orden de la agenda semanal: 1) prioridad (urgente primero), 2) duración
 * estimada ascendente (las cortas primero, para generar impulso); sin
 * estimado va al final de su grupo de prioridad. Determinista, sin IA.
 * Devuelve una copia — no muta `tasks`. */
export function rankAgendaTasks<T extends RankableTask>(tasks: T[]): T[] {
  return [...tasks].sort((a, b) => {
    const priorityDiff =
      WORK_ITEM_PRIORITIES.indexOf(b.priority) - WORK_ITEM_PRIORITIES.indexOf(a.priority);
    if (priorityDiff !== 0) return priorityDiff;
    if (a.estimatedMinutes === null && b.estimatedMinutes === null) return 0;
    if (a.estimatedMinutes === null) return 1;
    if (b.estimatedMinutes === null) return -1;
    return a.estimatedMinutes - b.estimatedMinutes;
  });
}
```

- [ ] **Step 4: Exportar desde el índice del paquete**

En `packages/domain/src/index.ts`, agregar como primera línea (orden alfabético):

```ts
export * from "./agenda";
```

- [ ] **Step 5: Correr el test y verificar que pasa**

Run: `pnpm --filter @agency-os/domain test -- agenda`
Expected: PASS, 5/5 tests.

- [ ] **Step 6: Typecheck**

Run: `pnpm --filter @agency-os/domain typecheck`
Expected: sin errores.

- [ ] **Step 7: Commit**

```bash
git add packages/domain/src/agenda.ts packages/domain/src/agenda.test.ts packages/domain/src/index.ts
git commit -m "feat(domain): rankAgendaTasks"
```

**Revisar (máx. 5 puntos):**
1. Los 5 tests nuevos pasan.
2. El orden "urgente > alta > normal > baja" coincide con lo pactado en el spec.
3. Con misma prioridad, la tarea más corta queda primero (revisar el test 3 si tenés dudas del criterio).

---

### Task 3: DB — `listMyAgenda`

**Files:**
- Modify: `packages/db/src/repositories/work-items.ts`

**Interfaces:**
- Consumes: `Db` de `./shared`; `Enums`, `Tables` de `../types/database` (ya importados en el archivo).
- Produces (los usa Task 4, la página):
  - `AgendaTask` — tipo de una tarea de agenda con todo lo necesario para mostrarla Y para reenviarla a `saveWorkItem` al asignarle fecha.
  - `MyAgenda` — `{ todayCount, tomorrowCount, overdue, byDate, undated }`.
  - `listMyAgenda(db, { organizationId, userId, today, tomorrow, weekStart, weekEnd }): Promise<MyAgenda>`.

- [ ] **Step 1: Agregar los tipos y la función al final de `work-items.ts`**

Al final de `packages/db/src/repositories/work-items.ts` (después de `setAssignees`), agregar:

```ts

export interface AgendaTask {
  id: string;
  projectId: string;
  title: string;
  /** No se muestra en la tarjeta; se reenvía a `saveWorkItem` al asignar fecha
   * desde el sidebar "Sin fecha" (mismo patrón que work-item-fields-panel.tsx:
   * la action reescribe el estado completo del work item). */
  description: string | null;
  statusId: string | null;
  startDate: string | null;
  priority: Enums<"work_item_priority">;
  dueDate: string | null;
  estimatedMinutes: number | null;
  projectTitle: string;
  clientId: string | null;
  clientName: string | null;
}

export interface MyAgenda {
  /** Tareas con due_date = hoy (independiente de si hoy cae en el rango
   * lunes-viernes de `byDate` — así el saludo funciona aunque hoy sea findesemana). */
  todayCount: number;
  tomorrowCount: number;
  /** due_date < today, todavía abiertas. */
  overdue: AgendaTask[];
  /** due_date entre today y weekEnd (inclusive), agrupadas por fecha "YYYY-MM-DD". */
  byDate: Record<string, AgendaTask[]>;
  /** due_date null. */
  undated: AgendaTask[];
}

type AgendaWorkItemRow = {
  id: string;
  title: string;
  description: string | null;
  status_id: string | null;
  start_date: string | null;
  priority: Enums<"work_item_priority">;
  due_date: string | null;
  estimated_minutes: number | null;
  project_id: string;
  status: { is_done: boolean } | null;
  assignees: { user_id: string }[];
};

const AGENDA_SELECT =
  "id, title, description, status_id, start_date, priority, due_date, estimated_minutes, project_id, status:work_item_statuses!work_items_status_fk(is_done), assignees:work_item_assignees(user_id)";

/** "Mis tareas" para el dashboard de /proyectos: abiertas (no "hecho", no
 * borradas), asignadas al usuario, sin importar el proyecto/cliente. Escanea
 * los work items abiertos de la org paginado y filtra en memoria — mismo
 * patrón ya usado en `countOpenTasksByAssignee` (PostgREST no permite filtrar
 * por "algún assignee = X" sin un !inner join más complejo; este monorepo ya
 * acepta el trade-off de escanear y filtrar para este tipo de consulta). */
export async function listMyAgenda(
  db: Db,
  opts: {
    organizationId: string;
    userId: string;
    today: string;
    tomorrow: string;
    weekStart: string;
    weekEnd: string;
  },
): Promise<MyAgenda> {
  const mine: AgendaWorkItemRow[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await db
      .from("work_items")
      .select(AGENDA_SELECT)
      .eq("organization_id", opts.organizationId)
      .in("type", ["task", "subtask"])
      .is("deleted_at", null)
      .range(from, from + pageSize - 1)
      .returns<AgendaWorkItemRow[]>();
    if (error) throw error;
    for (const row of data ?? []) {
      if (row.status?.is_done) continue;
      if (!row.assignees.some((a) => a.user_id === opts.userId)) continue;
      mine.push(row);
    }
    if (!data || data.length < pageSize) break;
  }

  // Resuelve título de proyecto + cliente para las tareas encontradas.
  // `work_items.project_id` es una columna plana sin FK (ver comentario de
  // `ProjectRow` más arriba), así que no se puede embeber — se resuelve aparte.
  const projectIds = Array.from(new Set(mine.map((r) => r.project_id)));
  const projectInfo = new Map<string, { title: string; clientId: string | null; clientName: string | null }>();
  if (projectIds.length > 0) {
    const { data: projects, error: projError } = await db
      .from("work_items")
      .select("id, title, client:clients(id, name)")
      .eq("type", "project")
      .in("id", projectIds)
      .returns<{ id: string; title: string; client: { id: string; name: string } | null }[]>();
    if (projError) throw projError;
    for (const p of projects ?? []) {
      projectInfo.set(p.id, {
        title: p.title,
        clientId: p.client?.id ?? null,
        clientName: p.client?.name ?? null,
      });
    }
  }

  const toAgendaTask = (row: AgendaWorkItemRow): AgendaTask => {
    const info = projectInfo.get(row.project_id);
    return {
      id: row.id,
      projectId: row.project_id,
      title: row.title,
      description: row.description,
      statusId: row.status_id,
      startDate: row.start_date,
      priority: row.priority,
      dueDate: row.due_date,
      estimatedMinutes: row.estimated_minutes,
      projectTitle: info?.title ?? "—",
      clientId: info?.clientId ?? null,
      clientName: info?.clientName ?? null,
    };
  };

  let todayCount = 0;
  let tomorrowCount = 0;
  const overdue: AgendaTask[] = [];
  const byDate: Record<string, AgendaTask[]> = {};
  const undated: AgendaTask[] = [];

  for (const row of mine) {
    if (row.due_date === opts.today) todayCount += 1;
    if (row.due_date === opts.tomorrow) tomorrowCount += 1;

    if (row.due_date && row.due_date < opts.today) {
      overdue.push(toAgendaTask(row));
    } else if (row.due_date && row.due_date >= opts.today && row.due_date <= opts.weekEnd) {
      (byDate[row.due_date] ??= []).push(toAgendaTask(row));
    } else if (!row.due_date) {
      undated.push(toAgendaTask(row));
    }
    // else: due_date > weekEnd — fuera de la semana visible, no se muestra en esta v0.
  }

  return { todayCount, tomorrowCount, overdue, byDate, undated };
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @agency-os/db typecheck`
Expected: sin errores.

- [ ] **Step 3: Verificación manual contra Supabase**

Correr `mcp__supabase__execute_sql` (proyecto `hicbkpwywwhnhiawulmu`) con una query de lectura simple para confirmar que no hay más de una FK ambigua entre `work_item_assignees` y `work_items` (el embed `assignees:work_item_assignees(user_id)` no lleva `!fk_name` a propósito, a diferencia de `status`):

```sql
select conname, conrelid::regclass, confrelid::regclass
from pg_constraint
where conrelid = 'public.work_item_assignees'::regclass and contype = 'f';
```

Expected: una sola fila con `confrelid = work_items` (o `user_id -> users`, que es la otra FK de esa tabla) — confirma que el embed no es ambiguo, igual que en `countOpenTasksByAssignee`.

- [ ] **Step 4: Commit**

```bash
git add packages/db/src/repositories/work-items.ts
git commit -m "feat(db): listMyAgenda para el dashboard de Proyectos"
```

**Revisar (máx. 5 puntos):**
1. Typecheck de `packages/db` en verde.
2. La query de `pg_constraint` no muestra ambigüedad de FK en `work_item_assignees`.
3. `AgendaTask` trae todos los campos que hacen falta para reenviar a `saveWorkItem` (`projectId`, `description`, `statusId`, `startDate`) además de los que se muestran en pantalla.
4. Ninguna tarea "hecha" (`status.is_done = true`) debería colarse en `overdue`/`byDate`/`undated` — si querés, probalo con `mcp__supabase__execute_sql` contra un work item de prueba marcado como hecho.

---

### Task 4: UI — `ProjectsDashboard` (saludo + agenda semanal)

**Files:**
- Create: `apps/web/components/proyectos/projects-dashboard.tsx`
- Modify: `apps/web/app/(app)/proyectos/page.tsx`

**Interfaces:**
- Consumes: `listMyAgenda`, `AgendaTask` (Task 3, vía `@agency-os/db`); `rankAgendaTasks`, `addDays`, `currentWeekRange` (Tasks 1-2, vía `@agency-os/domain`); `projectHref`, `taskHref` de `@/lib/project-paths`; `PriorityBadge` de `./work-item-fields`.
- Produces: componente `ProjectsDashboard`, tipos `AgendaTaskView`/`AgendaDay` (Task 5 le agrega props, Task 6 también — no son definitivos todavía pero sus campos actuales no cambian).

- [ ] **Step 1: Crear el componente**

Crear `apps/web/components/proyectos/projects-dashboard.tsx`:

```tsx
"use client";

// Dashboard de la raíz /proyectos: saludo + agenda semanal (lunes-viernes)
// ordenada por prioridad/duración estimada (heurística sin IA, ver
// packages/domain/src/agenda.ts). Vive arriba de <ProjectsList>, misma página.

import { Badge } from "@agency-os/ui";
import { formatDuration, type WorkItemPriority } from "@agency-os/domain";
import { PriorityBadge } from "./work-item-fields";

export interface AgendaTaskView {
  id: string;
  projectId: string;
  title: string;
  description: string | null;
  statusId: string | null;
  startDate: string | null;
  priority: WorkItemPriority;
  dueDate: string | null;
  estimatedMinutes: number | null;
  projectTitle: string;
  clientName: string | null;
  href: string;
}

export interface AgendaDay {
  date: string;
  label: string;
  tasks: AgendaTaskView[];
}

function AgendaCard({ task, overdue }: { task: AgendaTaskView; overdue?: boolean }) {
  return (
    <a
      href={task.href}
      className="block rounded-md border border-line bg-surface-2 p-2.5 text-sm transition hover:border-line-strong"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate font-medium text-ink">{task.title}</span>
        {overdue && <Badge tone="danger">Retrasada</Badge>}
      </div>
      <div className="mt-1 truncate text-xs text-muted">
        {task.clientName ?? "—"} · {task.projectTitle}
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        <PriorityBadge priority={task.priority} />
        {task.estimatedMinutes !== null && (
          <span className="font-mono text-[11px] text-muted">
            {formatDuration(task.estimatedMinutes)}
          </span>
        )}
      </div>
    </a>
  );
}

export function ProjectsDashboard({
  greeting,
  userName,
  today,
  todayCount,
  tomorrowCount,
  days,
  overdueTasks,
}: {
  greeting: string;
  userName: string;
  today: string;
  todayCount: number;
  tomorrowCount: number;
  days: AgendaDay[];
  overdueTasks: AgendaTaskView[];
}) {
  return (
    <div className="mb-8">
      <h1 className="text-2xl font-bold tracking-tight text-ink">
        {greeting}, {userName}
      </h1>
      <p className="mt-1 text-sm text-muted">
        {todayCount} para hoy · {tomorrowCount} vencen mañana
      </p>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-5">
        {days.map((day) => {
          const isToday = day.date === today;
          const tasks = isToday ? [...overdueTasks, ...day.tasks] : day.tasks;
          return (
            <div key={day.date} className="rounded-lg border border-line bg-glass p-3 backdrop-blur-xl">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-faint">
                {day.label}
              </div>
              <div className="mt-2 space-y-2">
                {tasks.length === 0 ? (
                  <p className="text-xs text-faint">Sin tareas.</p>
                ) : (
                  tasks.map((t) => (
                    <AgendaCard key={t.id} task={t} overdue={isToday && overdueTasks.includes(t)} />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wiring en `page.tsx`**

En `apps/web/app/(app)/proyectos/page.tsx`, reemplazar los imports del inicio:

```ts
import { redirect } from "next/navigation";
import { projectProgress } from "@agency-os/domain";
import { listClients, listProjects, type ProjectRow } from "@agency-os/db";
import { canAccessModule, getCurrentUser, hasPermission } from "@/lib/auth";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { ProjectsList, type ClientOption, type ProjectListRow } from "@/components/proyectos/projects-list";
import { NoAccessPanel } from "@/components/no-access-panel";
```

por:

```ts
import { redirect } from "next/navigation";
import { addDays, currentWeekRange, projectProgress, rankAgendaTasks } from "@agency-os/domain";
import { listClients, listMyAgenda, listProjects, type AgendaTask, type ProjectRow } from "@agency-os/db";
import { canAccessModule, getCurrentUser, hasPermission } from "@/lib/auth";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { projectHref, taskHref } from "@/lib/project-paths";
import { ProjectsList, type ClientOption, type ProjectListRow } from "@/components/proyectos/projects-list";
import { ProjectsDashboard, type AgendaDay, type AgendaTaskView } from "@/components/proyectos/projects-dashboard";
import { NoAccessPanel } from "@/components/no-access-panel";
```

Agregar, después de la función `progressOf` existente:

```ts

const DAY_LABELS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"];

function greetingWord(hour: number): string {
  if (hour < 12) return "Buenos días";
  if (hour < 19) return "Buenas tardes";
  return "Buenas noches";
}

function toAgendaTaskView(t: AgendaTask): AgendaTaskView {
  const client = t.clientId ? { id: t.clientId, name: t.clientName ?? "" } : null;
  const projectBase = projectHref(client, { id: t.projectId, title: t.projectTitle });
  return {
    id: t.id,
    projectId: t.projectId,
    title: t.title,
    description: t.description,
    statusId: t.statusId,
    startDate: t.startDate,
    priority: t.priority,
    dueDate: t.dueDate,
    estimatedMinutes: t.estimatedMinutes,
    projectTitle: t.projectTitle,
    clientName: t.clientName,
    href: taskHref(projectBase, { id: t.id, title: t.title }),
  };
}
```

Ubicar dentro de `ProjectsPage`, justo después de `const db = await getSupabaseServerClient();`:

```ts
  const organizationId = user.organizationIds[0];
  const db = await getSupabaseServerClient();
```

y agregar debajo (antes de `const [projects, clientsPage] = ...`):

```ts

  const now = new Date();
  const { from: weekStart } = currentWeekRange(now);
  const weekEnd = addDays(weekStart, 4);
  const dayOfWeek = now.getDay();
  const offsetFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const todayStr = addDays(weekStart, offsetFromMonday);
  const tomorrowStr = addDays(todayStr, 1);

  const agenda = organizationId
    ? await listMyAgenda(db, {
        organizationId,
        userId: user.id,
        today: todayStr,
        tomorrow: tomorrowStr,
        weekStart,
        weekEnd,
      })
    : await Promise.resolve<{
        todayCount: number;
        tomorrowCount: number;
        overdue: AgendaTask[];
        byDate: Record<string, AgendaTask[]>;
        undated: AgendaTask[];
      }>({ todayCount: 0, tomorrowCount: 0, overdue: [], byDate: {}, undated: [] });

  const days: AgendaDay[] = DAY_LABELS.map((label, i) => {
    const date = addDays(weekStart, i);
    return { date, label, tasks: rankAgendaTasks((agenda.byDate[date] ?? []).map(toAgendaTaskView)) };
  });
  const overdueTasks = rankAgendaTasks(agenda.overdue.map(toAgendaTaskView));
```

Y en el JSX de retorno, ubicar:

```tsx
  return (
    <ProjectsList
      rows={rows}
      q={searchParams.q ?? ""}
      clients={clients}
      canManage={hasPermission(user, "project.manage")}
    />
  );
```

Reemplazar por:

```tsx
  return (
    <>
      <ProjectsDashboard
        greeting={greetingWord(now.getHours())}
        userName={user.fullName.split(" ")[0] ?? user.fullName}
        today={todayStr}
        todayCount={agenda.todayCount}
        tomorrowCount={agenda.tomorrowCount}
        days={days}
        overdueTasks={overdueTasks}
      />
      <ProjectsList
        rows={rows}
        q={searchParams.q ?? ""}
        clients={clients}
        canManage={hasPermission(user, "project.manage")}
      />
    </>
  );
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @agency-os/web typecheck`
Expected: sin errores.

- [ ] **Step 4: Lint**

Run: `pnpm --filter @agency-os/web lint`
Expected: sin errores nuevos.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/proyectos/projects-dashboard.tsx "apps/web/app/(app)/proyectos/page.tsx"
git commit -m "feat(proyectos): dashboard con saludo y agenda semanal"
```

**Revisar (máx. 5 puntos) — en el navegador:**
1. Entrar a `/proyectos`: aparece el saludo con tu nombre y los conteos de hoy/mañana arriba de la lista de proyectos (que sigue igual que antes).
2. Las 5 columnas Lun-Vie muestran tus tareas asignadas en el día que vencen, con cliente/proyecto, prioridad y duración estimada si la tiene.
3. Si tenés una tarea vencida abierta, aparece marcada "Retrasada" al principio de la columna de hoy.
4. Click en una tarjeta te lleva al detalle de esa tarea.
5. Con dos tareas del mismo día pero distinta prioridad, la de mayor prioridad aparece primero.

---

### Task 5: UI — sidebar "Sin fecha" con asignación inline

**Files:**
- Modify: `apps/web/components/proyectos/projects-dashboard.tsx`
- Modify: `apps/web/app/(app)/proyectos/page.tsx`

**Interfaces:**
- Consumes: `saveWorkItem` de `@/lib/project-actions`; `agenda.undated` (Task 3).
- Produces: `ProjectsDashboard` gana las props `undatedTasks: AgendaTaskView[]` y `canEdit: boolean`.

- [ ] **Step 1: Agregar el sub-componente y las props nuevas**

En `apps/web/components/proyectos/projects-dashboard.tsx`, agregar a los imports del inicio:

```ts
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge, Input } from "@agency-os/ui";
import { formatDuration, type WorkItemPriority } from "@agency-os/domain";
import { saveWorkItem } from "@/lib/project-actions";
import { PriorityBadge } from "./work-item-fields";
```

(reemplaza el bloque de imports existente; nota que `Input` se agrega a la lista de `@agency-os/ui` y se suman `useState`/`useTransition`/`useRouter`/`saveWorkItem`).

Agregar, después de la función `AgendaCard` existente:

```ts

function UndatedRow({ task, onSaved }: { task: AgendaTaskView; onSaved: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const onChangeDate = (dueDate: string) => {
    if (!dueDate) return;
    setError(null);
    startTransition(async () => {
      const res = await saveWorkItem({
        id: task.id,
        projectId: task.projectId,
        title: task.title,
        description: task.description,
        statusId: task.statusId,
        priority: task.priority,
        startDate: task.startDate,
        dueDate,
        estimatedMinutes: task.estimatedMinutes,
      });
      if (res.error) setError(res.error);
      else onSaved();
    });
  };

  return (
    <div className="rounded-md border border-line bg-surface-2 p-2.5 text-sm">
      <a href={task.href} className="block truncate font-medium text-ink hover:underline">
        {task.title}
      </a>
      <div className="mt-1 truncate text-xs text-muted">
        {task.clientName ?? "—"} · {task.projectTitle}
      </div>
      <div className="mt-1.5">
        <Input
          type="date"
          disabled={isPending}
          onChange={(e) => onChangeDate(e.target.value)}
          aria-label={`Asignar fecha a "${task.title}"`}
        />
      </div>
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Extender `ProjectsDashboard` con el sidebar**

Ubicar la firma de `ProjectsDashboard`:

```tsx
export function ProjectsDashboard({
  greeting,
  userName,
  today,
  todayCount,
  tomorrowCount,
  days,
  overdueTasks,
}: {
  greeting: string;
  userName: string;
  today: string;
  todayCount: number;
  tomorrowCount: number;
  days: AgendaDay[];
  overdueTasks: AgendaTaskView[];
}) {
```

Reemplazar por:

```tsx
export function ProjectsDashboard({
  greeting,
  userName,
  today,
  todayCount,
  tomorrowCount,
  days,
  overdueTasks,
  undatedTasks,
  canEdit,
}: {
  greeting: string;
  userName: string;
  today: string;
  todayCount: number;
  tomorrowCount: number;
  days: AgendaDay[];
  overdueTasks: AgendaTaskView[];
  undatedTasks: AgendaTaskView[];
  canEdit: boolean;
}) {
  const router = useRouter();
```

Ubicar el `return` (el `<div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-5">...</div>` que arma la grilla) y envolverlo junto con el sidebar nuevo:

```tsx
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-5">
        {days.map((day) => {
          const isToday = day.date === today;
          const tasks = isToday ? [...overdueTasks, ...day.tasks] : day.tasks;
          return (
            <div key={day.date} className="rounded-lg border border-line bg-glass p-3 backdrop-blur-xl">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-faint">
                {day.label}
              </div>
              <div className="mt-2 space-y-2">
                {tasks.length === 0 ? (
                  <p className="text-xs text-faint">Sin tareas.</p>
                ) : (
                  tasks.map((t) => (
                    <AgendaCard key={t.id} task={t} overdue={isToday && overdueTasks.includes(t)} />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
```

Reemplazar por:

```tsx
      <div className="mt-4 flex flex-col gap-4 lg:flex-row">
        <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-5">
          {days.map((day) => {
            const isToday = day.date === today;
            const tasks = isToday ? [...overdueTasks, ...day.tasks] : day.tasks;
            return (
              <div key={day.date} className="rounded-lg border border-line bg-glass p-3 backdrop-blur-xl">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-faint">
                  {day.label}
                </div>
                <div className="mt-2 space-y-2">
                  {tasks.length === 0 ? (
                    <p className="text-xs text-faint">Sin tareas.</p>
                  ) : (
                    tasks.map((t) => (
                      <AgendaCard key={t.id} task={t} overdue={isToday && overdueTasks.includes(t)} />
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {canEdit && (
          <div className="rounded-lg border border-line bg-glass p-3 backdrop-blur-xl lg:w-[260px]">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-faint">
              Sin fecha · {undatedTasks.length}
            </div>
            <div className="mt-2 space-y-2">
              {undatedTasks.length === 0 ? (
                <p className="text-xs text-faint">Todo tiene fecha.</p>
              ) : (
                undatedTasks.map((t) => (
                  <UndatedRow key={t.id} task={t} onSaved={() => router.refresh()} />
                ))
              )}
            </div>
          </div>
        )}
      </div>
```

- [ ] **Step 3: Pasar las props nuevas desde `page.tsx`**

En `apps/web/app/(app)/proyectos/page.tsx`, ubicar el bloque agregado en la Task 4:

```ts
  const overdueTasks = rankAgendaTasks(agenda.overdue.map(toAgendaTaskView));
```

Agregar debajo:

```ts
  const undatedTasks = agenda.undated.map(toAgendaTaskView);
```

Y en el JSX, ubicar:

```tsx
      <ProjectsDashboard
        greeting={greetingWord(now.getHours())}
        userName={user.fullName.split(" ")[0] ?? user.fullName}
        today={todayStr}
        todayCount={agenda.todayCount}
        tomorrowCount={agenda.tomorrowCount}
        days={days}
        overdueTasks={overdueTasks}
      />
```

Reemplazar por:

```tsx
      <ProjectsDashboard
        greeting={greetingWord(now.getHours())}
        userName={user.fullName.split(" ")[0] ?? user.fullName}
        today={todayStr}
        todayCount={agenda.todayCount}
        tomorrowCount={agenda.tomorrowCount}
        days={days}
        overdueTasks={overdueTasks}
        undatedTasks={undatedTasks}
        canEdit={hasPermission(user, "project.manage")}
      />
```

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @agency-os/web typecheck`
Expected: sin errores.

- [ ] **Step 5: Lint**

Run: `pnpm --filter @agency-os/web lint`
Expected: sin errores nuevos.

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/proyectos/projects-dashboard.tsx "apps/web/app/(app)/proyectos/page.tsx"
git commit -m "feat(proyectos): sidebar de tareas sin fecha en el dashboard"
```

**Revisar (máx. 5 puntos) — en el navegador:**
1. Si tenés alguna tarea asignada sin fecha, aparece en el sidebar "Sin fecha" a la derecha de la agenda.
2. Elegir una fecha en el date-picker de una fila la guarda (sin botón aparte) y la tarea desaparece del sidebar.
3. Tras el guardado, la tarea aparece en la columna correspondiente de la agenda (puede requerir recargar si no se ve al instante).
4. Con una cuenta que NO tiene `project.manage`, el sidebar completo no se muestra.
5. Si el guardado falla (probá con la red desconectada, por ejemplo), se ve un mensaje de error en rojo bajo esa fila.

---

### Task 6: UI — bloque "Atención"

**Files:**
- Modify: `apps/web/components/proyectos/projects-dashboard.tsx`
- Modify: `apps/web/app/(app)/proyectos/page.tsx`

**Interfaces:**
- Consumes: `listAreasManagedBy`, `listPeopleInArea`, `countOpenTasksByAssignee` de `@agency-os/db` (ya existen, sin cambios).
- Produces: `ProjectsDashboard` gana la prop `teamLoad: { overloadedCount: number; totalCount: number } | null`.

- [ ] **Step 1: Agregar el bloque "Atención" al componente**

En `apps/web/components/proyectos/projects-dashboard.tsx`, ubicar la firma de `ProjectsDashboard` (la de la Task 5):

```tsx
export function ProjectsDashboard({
  greeting,
  userName,
  today,
  todayCount,
  tomorrowCount,
  days,
  overdueTasks,
  undatedTasks,
  canEdit,
}: {
  greeting: string;
  userName: string;
  today: string;
  todayCount: number;
  tomorrowCount: number;
  days: AgendaDay[];
  overdueTasks: AgendaTaskView[];
  undatedTasks: AgendaTaskView[];
  canEdit: boolean;
}) {
```

Reemplazar por:

```tsx
export interface TeamLoadSummary {
  overloadedCount: number;
  totalCount: number;
}

export function ProjectsDashboard({
  greeting,
  userName,
  today,
  todayCount,
  tomorrowCount,
  days,
  overdueTasks,
  undatedTasks,
  canEdit,
  teamLoad,
}: {
  greeting: string;
  userName: string;
  today: string;
  todayCount: number;
  tomorrowCount: number;
  days: AgendaDay[];
  overdueTasks: AgendaTaskView[];
  undatedTasks: AgendaTaskView[];
  canEdit: boolean;
  teamLoad: TeamLoadSummary | null;
}) {
```

Ubicar el cierre del `<div className="mt-4 flex flex-col gap-4 lg:flex-row">...</div>` (el que contiene la grilla + el sidebar, agregado en la Task 5) y agregar justo después, antes del `</div>` final que cierra el componente:

```tsx
      </div>

      <div className="mt-4 rounded-lg border border-line bg-glass p-4 backdrop-blur-xl">
        <h2 className="font-semibold text-ink">Atención</h2>
        <p className="mt-1 text-sm text-muted">
          {overdueTasks.length === 0
            ? "Sin tareas vencidas."
            : `${overdueTasks.length} tarea${overdueTasks.length === 1 ? "" : "s"} vencida${overdueTasks.length === 1 ? "" : "s"}.`}
        </p>
        {teamLoad && (
          <p className="mt-1 text-sm text-muted">
            {teamLoad.overloadedCount === 0
              ? "Tu equipo está al día."
              : `${teamLoad.overloadedCount} persona${teamLoad.overloadedCount === 1 ? "" : "s"} con más de 5 tareas abiertas.`}{" "}
            <a href="/mi-area" className="text-ink underline hover:no-underline">
              Ver Mi área
            </a>
          </p>
        )}
      </div>
    </div>
  );
}
```

(el `</div>\n    </div>\n  );\n}` final reemplaza el cierre que tenía el componente antes).

- [ ] **Step 2: Calcular `teamLoad` en `page.tsx`**

En `apps/web/app/(app)/proyectos/page.tsx`, agregar al import de `@agency-os/db`:

```ts
import { listAreasManagedBy, listClients, listMyAgenda, listPeopleInArea, listProjects, countOpenTasksByAssignee, type AgendaTask, type ProjectRow } from "@agency-os/db";
```

Ubicar (agregado en la Task 5):

```ts
  const undatedTasks = agenda.undated.map(toAgendaTaskView);
```

Agregar debajo:

```ts

  const managedAreas = organizationId ? await listAreasManagedBy(db, user.id) : [];
  let teamLoad: { overloadedCount: number; totalCount: number } | null = null;
  if (managedAreas.length > 0) {
    const peopleByArea = await Promise.all(managedAreas.map((a) => listPeopleInArea(db, a.id)));
    const userIds = Array.from(
      new Set(peopleByArea.flat().map((p) => p.userId).filter((id): id is string => Boolean(id))),
    );
    const counts = await countOpenTasksByAssignee(db, { organizationId: organizationId!, userIds });
    const overloadedCount = userIds.filter((id) => (counts[id] ?? 0) > 5).length;
    teamLoad = { overloadedCount, totalCount: userIds.length };
  }
```

Y en el JSX, agregar la prop `teamLoad` al `<ProjectsDashboard>`:

```tsx
        undatedTasks={undatedTasks}
        canEdit={hasPermission(user, "project.manage")}
        teamLoad={teamLoad}
      />
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @agency-os/web typecheck`
Expected: sin errores.

- [ ] **Step 4: Lint**

Run: `pnpm --filter @agency-os/web lint`
Expected: sin errores nuevos.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/proyectos/projects-dashboard.tsx "apps/web/app/(app)/proyectos/page.tsx"
git commit -m "feat(proyectos): bloque de atención (vencidas + carga del equipo) en el dashboard"
```

**Revisar (máx. 5 puntos) — en el navegador:**
1. El bloque "Atención" aparece debajo de la agenda, con el conteo real de tus tareas vencidas.
2. Si administrás un área (probar con tu cuenta si aplica), ves la línea de carga del equipo con el link a "Mi área".
3. El número de "más de 5 tareas abiertas" coincide con lo que ves manualmente en `/mi-area` para esa misma área.
4. Con una cuenta que no administra ningún área, esa segunda línea no aparece (solo el conteo de vencidas).
5. El link "Ver Mi área" navega correctamente a `/mi-area`.

---

### Task 7: Verificación final

**Files:** ninguno (solo comandos).

- [ ] **Step 1: Typecheck de todo el monorepo**

Run: `pnpm turbo run typecheck`
Expected: todos los paquetes en verde.

- [ ] **Step 2: Lint de todo el monorepo**

Run: `pnpm turbo run lint`
Expected: sin errores.

- [ ] **Step 3: Tests de dominio**

Run: `pnpm --filter @agency-os/domain test`
Expected: todos los tests verdes, incluidos los nuevos de `addDays` y `rankAgendaTasks`.

- [ ] **Step 4: Checklist manual final para Yesid**

Con al menos dos cuentas de prueba si es posible (una con `project.manage`, otra sin), en el navegador:
1. `/proyectos` muestra el dashboard completo (saludo, agenda, sidebar si aplica, atención) arriba de la lista de proyectos de siempre.
2. Crear o editar una tarea de prueba con vencimiento hoy/mañana/esta semana y confirmar que aparece en la columna correcta tras recargar.
3. Marcar esa tarea como "hecha" (cambiar su estado a uno con `is_done`) y confirmar que desaparece del dashboard.
4. Repetir el flujo completo del sidebar "Sin fecha" (Task 5) y del bloque "Atención" (Task 6) de punta a punta.
5. Confirmar que la lista de proyectos de abajo sigue funcionando igual que antes (filtro, alta de proyecto, etc.) — no debería haber cambiado.

- [ ] **Step 5: Reportar a Yesid**

No commitear nada de este Task (son solo verificaciones). Avisar que el checklist manual queda pendiente de que Yesid lo corra, y preguntar si quiere abrir PR o seguir sumando trabajo a la rama antes de eso.
