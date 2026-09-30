# Vacaciones y Permisos (RRHH) — Diseño

**Fecha:** 2026-09-30
**Estado:** nuevo spec
**Objetivo:** reemplazar por completo el flujo externo actual (formulario HTML estático → webhook n8n → tarea de ClickUp → aprobación de jefe → aprobación de RRHH) por un módulo propio de Agency OS, con aprobación en dos pasos, control de fechas, adjuntos y reporte consolidado mes a mes / año.

## Contexto

El sistema actual (`vacaciones.laburuagency.com`, ver `Flujos N8N/Vacaciones/index.html`) tiene problemas reales encontrados al analizar el código:

- **Lista de "quién reporta a quién" hardcodeada en JavaScript** (`empleadosPorAprobador`, nombres en texto plano sin IDs) — exactamente lo que `areas.manager_user_id` + `people.area_id` (ya construido en Agency OS) resuelve sin mantenimiento manual.
- **Sin autenticación real**: el solicitante se auto-selecciona de una lista y escribe su propio email a mano; nada verifica su identidad.
- **El "aprobador" lo elige el propio solicitante** de un dropdown, sin validación server-side de que sea realmente su jefe.
- **Bug en la regla de bloqueo de fechas**: bloquea los días 25-31 (no 23) y solo del mes en curso — una solicitud hecha hoy para fin de un mes futuro no se bloquea aunque debería.
- Sin RLS, sin trazabilidad propia de aprobaciones — todo el rastro vive en una tarea de ClickUp.

La base de datos para el aprobador (Área + gerente) ya existe a propósito — ver `Docs/superpowers/specs/2026-09-04-areas-cargos-carga-equipo-design.md`, que dejó esto sentado explícitamente para este módulo.

## Funcionalidades

### 1. Solicitar un permiso

Cualquier colaborador autenticado crea una solicitud:
- **Tipo** (7 valores, igual que el form actual): Vacaciones, Home Office, Permiso Personal, Licencia Médica, Licencia Maternidad/Paternidad, Calamidad Doméstica, Otro.
- **Fecha inicio** + **fecha fin** (siempre). **Fecha de retorno** (solo Vacaciones — el primer día hábil que vuelve a trabajar, dato distinto de fecha fin).
- **Adjunto obligatorio** para Licencia Médica y Otro (PDF/imagen/doc, máx. 10 MB — mismo patrón de bucket privado + signed URL que ya usan los adjuntos de tareas).
- **Observaciones** (opcional).
- El **jefe se resuelve automático** de `areas.manager_user_id` vía `people.area_id` del solicitante — sin dropdown manual, sin poder elegir su propio aprobador.

### 2. Aprobación en dos pasos

1. **Jefe** (el `manager_user_id` resuelto al crear la solicitud): aprueba o rechaza (con motivo si rechaza). Ve sus pendientes en `/rrhh/aprobaciones`.
2. Si el jefe aprueba, pasa a **RRHH** (rol nuevo, ve todas las pendientes de RRHH de cualquier área): aprueba o rechaza (con motivo).
3. Notificación in-app (la campana ya existente) en cada paso: al jefe cuando se crea, al solicitante cuando el jefe decide, a RRHH cuando el jefe aprueba, al solicitante cuando RRHH decide.

### 3. Mis solicitudes

Cualquier colaborador ve su propio historial: lista de solicitudes con estado (pendiente jefe / pendiente RRHH / aprobada / rechazada) y un resumen con el conteo por estado (aprobadas / rechazadas / pendientes), desglosado por tipo de permiso.

### 4. Reportes (solo rol RRHH)

Vista filtrable por mes/año/persona/tipo/estado, con los días hábiles tomados por solicitud, más exportación a Excel/CSV del consolidado de un mes/año — para nómina y el tema legal/prestacional. Incluye el mismo resumen de aprobadas/rechazadas por persona que en "Mis solicitudes", filtrable a cualquier colaborador.

## Reglas

- **Bloqueo de fechas (solo Vacaciones)**: si `start_date`, `end_date` o `return_date` cae en el rango día 23–fin de mes de **cualquier mes** (no solo el mes en curso — corrige el bug actual), la solicitud debe crearse antes del día 23 de ese mes. Validado server-side en la acción de crear, no solo en el cliente.
- **Conteo de días hábiles**: para todos los tipos de permiso, excluye sábados, domingos y festivos colombianos (tabla `public_holidays`, sembrada con el año actual + el siguiente — mantenimiento manual anual).
- **Snapshot del jefe**: `manager_user_id` se fija al crear la solicitud. Si el área cambia de gerente después, no se altera retroactivamente quién debía aprobar una solicitud ya existente.
- El jefe solo puede decidir mientras `manager_status = 'pending'`. RRHH solo puede decidir mientras `manager_status = 'approved'` y `hr_status = 'pending'` (no puede adelantarse al jefe).
- Ninguna acción de aprobación es reversible una vez decidida (no hay "deshacer aprobación" en esta fase).
- Solo aplica a colaboradores de la organización — sin acceso externo/sin login, a diferencia del formulario actual.

## Modelo de datos

```sql
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

create table public.public_holidays (
  id uuid primary key default gen_random_uuid(),
  date date not null unique,
  name text not null
);
```

### RLS (intención — el detalle de columnas editables vive en la server action, no en la policy, mismo patrón ya usado en `people`/Áreas)

- `leave_requests` select: el propio solicitante, el `manager_user_id`, o quien tenga el permiso de RRHH.
- `leave_requests` insert: solo como uno mismo (`requester_user_id = auth.uid()`).
- `leave_requests` update: el jefe solo mientras `manager_status = 'pending'` y `manager_user_id = auth.uid()`; RRHH solo con su permiso, mientras `manager_status = 'approved'` y `hr_status = 'pending'`.
- `public_holidays`: select para cualquier miembro de la organización; write requiere el permiso de RRHH (tabla global del sistema, sin `organization_id` — los festivos son iguales para toda Colombia).

### Permisos y rol nuevo

- `leave.request`: crear/ver las propias solicitudes — otorgado ampliamente (cualquier colaborador con el módulo `rrhh` activo).
- `leave.approve_hr`: aprobar en segunda instancia + ver el reporte consolidado de todos. Se crea un rol **RRHH** (vía el editor de roles ya existente) con este permiso, asignable a quien corresponda.
- La aprobación del jefe **no** usa un permiso nuevo — reusa el mismo criterio de "soy el `manager_user_id` de esta área" ya usado en `/mi-area`.

## Vistas

- `/rrhh`: mis solicitudes (historial + resumen aprobadas/rechazadas/pendientes) + botón crear solicitud.
- `/rrhh/aprobaciones`: pendientes para mí — como jefe (de mi área) y/o como RRHH, en una sola bandeja.
- `/rrhh/reportes` (solo rol RRHH): filtros por mes/año/persona/tipo/estado, días hábiles por solicitud, exportar a Excel/CSV.
- Activa el módulo `rrhh` (`is_active: true` en `modules`, ya existe en el registro, hoy apagado).

## Fuera de alcance

- Notificación por email/WhatsApp — solo in-app por ahora.
- Deshacer una aprobación ya decidida.
- Editar una solicitud ya creada (habría que cancelarla y crear una nueva, si hace falta esa función se agrega después).
- Saldo de días de vacaciones disponibles/acumulados por colaborador (cálculo de "cuántos días le quedan") — el reporte muestra lo tomado, no un balance acumulado; si hace falta, es una fase aparte.
- Cualquier integración con el n8n/ClickUp actual — se da de baja por completo, no se mantiene en paralelo.
