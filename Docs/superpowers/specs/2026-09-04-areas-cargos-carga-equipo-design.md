# Áreas, Cargos y "Carga del equipo" — Diseño

**Fecha:** 2026-09-04
**Estado:** nuevo spec
**Objetivo:** modelar la estructura organizacional (Áreas con un gerente, Cargos dentro de cada área) para (1) que el gerente de un área administre los cargos y se los asigne a sus colaboradores, y (2) reemplazar "Carga del equipo" (hoy un toggle genérico en `/proyectos/tiempos`) por una vista real por colaborador, visible solo al gerente de esa área y al super admin. Sienta además la base de datos que usará más adelante el módulo de vacaciones de RRHH (quién aprueba las vacaciones de quién).

## Contexto

Hoy no existe ningún concepto de "área" o "cargo" en el sistema — solo Roles/Permisos (control de acceso) y `people`/`users` (identidad). "Tiempos del equipo" (`scope=team` en `/proyectos/tiempos`) es visible a cualquiera con `project.manage`, sin relación con una estructura organizacional real.

Decisiones ya tomadas con Yesid:
- Un Área tiene **un** gerente; todos sus colaboradores reportan a él automáticamente (no hay campo "reporta a" independiente).
- Un Cargo es **solo una etiqueta** (RRHH/organigrama) — no otorga permisos, no se mezcla con el sistema de Roles.
- Solo el **super admin** crea Áreas y designa/cambia su gerente. El gerente, una vez designado, administra **solo** los cargos y colaboradores **de su propia área**.
- Una persona pertenece a **una sola** Área a la vez.
- La gestión de cargos + la asignación a colaboradores + "Carga del equipo" **conviven en una página propia** (`/mi-area`) del gerente — no se mete dentro de `/usuarios`.

## Funcionalidades

### Fase 1 — Modelo de datos + administración (super admin)

#### 1. Áreas (`/usuarios`, solo super admin)
- Crear un Área: nombre + elegir gerente (cualquier usuario de la organización).
- Cambiar el gerente de un Área ya creada.
- Asignar el Área de una persona (dropdown en la fila de usuario en `/usuarios`).
- **No incluye borrar Áreas en esta fase** (implicaría decidir qué pasa con sus cargos y sus colaboradores — se deja para cuando haga falta).

#### 2. Cargos — catálogo (delegado al gerente del área, o super admin)
- Crear/renombrar cargos dentro de un Área. Un cargo siempre pertenece a un Área (no hay cargos "globales").

### Fase 2 — Página `/mi-area` (gerente de esa área + super admin)

#### 1. Cargos de mi área
- Listado + alta + renombrar (mismo catálogo de Fase 1, gestionado aquí).

#### 2. Colaboradores de mi área
- Lista de personas con `area_id` = esta área.
- Asignar/cambiar el cargo de cada colaborador (modal "Asignar cargo", mismo patrón que "Asignar rol" en `/usuarios`).

#### 3. Carga del equipo
- Una card por colaborador del área con:
  - **Tareas abiertas asignadas** (work items tipo tarea/subtarea, no borrados, con estado que no sea "hecho") — conteo simple, sin filtro de fecha.
  - **Tiempo registrado esta semana** (semana calendario actual, lunes a domingo) — reutiliza la infraestructura de time tracking ya existente.
- Reemplaza el propósito de "Tiempos del equipo" (`scope=team` en `/proyectos/tiempos`) para la gente con área — ver "Reglas" sobre qué pasa con esa vista vieja.

## Reglas

- Un cargo no otorga ningún permiso — es puramente informativo.
- El gerente de un área **no puede** crear áreas nuevas, cambiar el gerente de la suya, ni tocar cargos/colaboradores de otra área.
- La guarda de acceso a `/mi-area` y a las acciones de esa página es "sos el `manager_user_id` de esta área" (chequeo de dueño, no un permiso de rol) **o** super admin — igual patrón que "el autor de un comentario puede borrar su adjunto".
- `/usuarios` y `access-actions.ts` no cambian su alcance actual (invitar/eliminar cuentas, roles de sistema) — solo se les agrega la gestión de Áreas y la asignación de Área por persona.
- `scope=team` en `/proyectos/tiempos` **se mantiene tal cual por ahora** (no se borra ni se reescribe en este trabajo) — es una vista más genérica (cualquiera con `project.manage`, sin relación con Áreas) que puede quedar obsoleta más adelante, pero eso es una decisión aparte para no bloquear este spec.

## Modelo de datos

Migración nueva (tablas + 2 columnas en `people`):

```sql
create table public.areas (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  manager_user_id uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.job_titles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  area_id uuid not null references public.areas(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.people add column area_id uuid references public.areas(id);
alter table public.people add column job_title_id uuid references public.job_titles(id);
```

### RLS

- `areas`: `select` para cualquier miembro de la organización; `insert`/`update` solo `current_user_is_super()` (mismo helper que ya existe desde 011).
- `job_titles`: `select` para cualquier miembro de la organización; `insert`/`update` para `current_user_is_super()` **o** `exists (select 1 from areas a where a.id = job_titles.area_id and a.manager_user_id = auth.uid())`. Ninguna de las dos tablas referencia `people`/`users` en su política más allá de `manager_user_id`/`auth.uid()` — sin riesgo de la recursión que ya se corrigió esta sesión en `people`.
- `people`: nueva policy de `update` (además de las que ya existen) que permite al gerente de un área tocar filas de `people` cuyo `area_id` sea el de su área — `exists (select 1 from public.areas a where a.id = people.area_id and a.manager_user_id = auth.uid())`. La server action de "asignar cargo" solo manda `job_title_id` en el `update` (nunca otras columnas) — la restricción de qué campo se puede tocar vive en la action, no en la policy (RLS de Postgres no filtra por columna). Asignar el **Área** de una persona (distinto de su cargo) sigue siendo solo de super admin, vía server action con `service_role` (mismo patrón que `inviteUser`/`deleteUser` en `access-actions.ts`).

## Repos nuevos

- `packages/db/src/repositories/areas.ts`: `listAreas(db, orgId)`, `createArea(db, {orgId, name, managerUserId})`, `updateAreaManager(db, id, managerUserId)`, `listAreasManagedBy(db, userId)`, `listPeopleInArea(db, areaId)` (persona + cargo actual).
- `packages/db/src/repositories/job-titles.ts`: `listJobTitles(db, areaId)`, `createJobTitle(db, {orgId, areaId, name})`, `renameJobTitle(db, id, name)`.
- `packages/db/src/repositories/people.ts` (ampliar): `assignPersonArea(db, personId, areaId)` (usa `service_role`, llamado solo desde la action de super admin), `assignPersonJobTitle(db, personId, jobTitleId)` (cliente normal, se apoya en la RLS nueva).
- `packages/db/src/repositories/work-items.ts` (ampliar): `countOpenTasksByAssignee(db, {orgId, userIds}): Record<string, number>`.
- `packages/db/src/repositories/work-item-time.ts` (ampliar): `sumMinutesByUsersInRange(db, {orgId, userIds, from, to}): Record<string, number>`.
- `packages/domain`: helper puro `currentWeekRange(today: Date): { from: string; to: string }` (lunes a domingo), con tests.

## Vistas

- `/usuarios`: sección "Áreas" (crear + cambiar gerente) + columna/selector de Área por fila de usuario.
- `/mi-area`: cargos de mi área, colaboradores + asignar cargo, cards de "Carga del equipo".

## Fuera de alcance

- Borrar Áreas o Cargos.
- Módulo de vacaciones de RRHH (esto solo deja la base lista).
- Tocar o rediseñar `scope=team` de `/proyectos/tiempos`.
- Que un cargo otorgue permisos.
- Que una persona pertenezca a más de un Área.

## Resultado esperado

Un super admin crea el Área "Diseño" y designa a Laura como su gerente. Laura entra a `/mi-area`, crea los cargos "Diseñador Senior" y "Diseñador Jr", se los asigna a su equipo, y ve cuántas tareas abiertas y cuánto tiempo lleva cada quien esta semana — sin necesitar acceso a `/usuarios` ni a `project.manage`.
