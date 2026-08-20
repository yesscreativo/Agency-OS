# Estado actual del proyecto

## Objetivo

Dejar un snapshot legible del estado real de Agency OS para que cualquier persona o agente (Claude, Hermes, GitHub readers) pueda entender rápidamente:

- qué ya existe en código
- qué ya existe en base de datos
- qué está en progreso
- qué sigue pendiente
- cuál es la relación entre documentación, migraciones y UI actual

**Fecha del snapshot:** 2026-08-05  
**Rama observada:** `Feat/work-items`

## Resumen ejecutivo

Agency OS ya dejó de ser solo una especificación. Hoy el repositorio tiene una base funcional real sobre el stack definido:

- **monorepo pnpm + Turbo**
- **Next.js + TypeScript + Tailwind** en `apps/web`
- **Supabase** con migraciones versionadas en `supabase/migrations`
- paquetes internos para:
  - `packages/db`
  - `packages/domain`
  - `packages/ui`
  - `packages/config`

El proyecto ya tiene dos frentes claros en código:

1. **CRM / Cotizaciones** → es el módulo más maduro y estable del sistema.
2. **Proyectos / Work Items** → ya existe una implementación real en progreso, por encima de la Fase A originalmente documentada.

## Estado por capa

## 1. Base de plataforma

### Ya existe
- autenticación y rutas de acceso en `apps/web/app/(auth)`
- middleware y helpers de Supabase
- navegación principal / hub / módulos
- RBAC y matriz de permisos
- módulos activables en plataforma
- bucket de storage y endurecimiento de seguridad

### Evidencia
- `supabase/migrations/001_core.sql`
- `supabase/migrations/003_rls.sql`
- `supabase/migrations/005_security_hardening.sql`
- `supabase/migrations/006_storage.sql`
- `supabase/migrations/009_modules_rbac.sql`
- `apps/web/lib/auth.ts`
- `apps/web/lib/access-actions.ts`
- `apps/web/components/access/access-manager.tsx`

## 2. CRM / Cotizaciones

### Ya implementado
Este es el módulo más avanzado del proyecto hoy.

Incluye evidencia de:
- listado de clientes
- detalle de cliente
- creación y edición de cotizaciones
- dashboard de CRM
- vista kanban
- estados de cotización
- gestión de KAMs
- impresión
- respuestas públicas por token
- flujo para proveedores
- notificaciones relacionadas

### Evidencia en UI
- `apps/web/app/(app)/crm/page.tsx`
- `apps/web/app/(app)/crm/dashboard/page.tsx`
- `apps/web/app/(app)/crm/kanban/page.tsx`
- `apps/web/app/(app)/crm/clientes/page.tsx`
- `apps/web/app/(app)/crm/[id]/page.tsx`
- `apps/web/app/(print)/crm/[id]/imprimir/page.tsx`
- `apps/web/app/(public)/respuesta/[token]/page.tsx`
- `apps/web/app/(public)/proveedor/[token]/page.tsx`

### Evidencia en dominio / datos
- `packages/db/src/repositories/quotes.ts`
- `packages/db/src/repositories/quote-statuses.ts`
- `packages/db/src/repositories/clients.ts`
- `packages/domain/src/quote-calc.ts`
- `packages/domain/src/quote-code.ts`
- `packages/domain/src/quote-stats.ts`

### Evidencia en migraciones
- `supabase/migrations/002_crm.sql`
- `supabase/migrations/012_quote_status_catalog.sql`
- `supabase/migrations/013_crm_role_matrix.sql`
- `supabase/migrations/015_supplier_order_permission.sql`
- `supabase/migrations/016_supplier_order_message.sql`
- `supabase/migrations/017_review_future_custom.sql`

## 3. Notificaciones

### Ya implementado parcialmente
Existe módulo de notificaciones con soporte de datos y UI base.

### Evidencia
- `supabase/migrations/014_notifications.sql`
- `packages/db/src/repositories/notifications.ts`
- `apps/web/lib/notification-actions.ts`
- `apps/web/components/notification-bell.tsx`
- `apps/web/app/(app)/notificaciones/page.tsx`

### Lectura
Actualmente parece resuelto como centro de notificaciones base; todavía no como sistema de colaboración avanzada estilo activity stream completo.

## 4. Proyectos / Work Items

### Estado general
Este frente ya no es solo idea o spec. Hay implementación real en progreso y varias piezas ya aterrizadas en código y DB.

### Ya implementado / muy avanzado
- entidades `work_items`
- estados por proyecto
- board del proyecto
- detalle de work item
- editor de work item
- campos reutilizables del work item
- rutas por cliente/proyecto/tarea
- adjuntos en tareas
- duración estimada
- repositorios específicos de work items
- lógica de dominio para progreso/duración

### Evidencia en migraciones
- `supabase/migrations/018_work_items.sql`
- `supabase/migrations/019_work_item_attachments.sql`
- `supabase/migrations/020_work_item_files_rls_hardening.sql`
- `supabase/migrations/021_work_item_estimated.sql`

### Evidencia en repos / dominio
- `packages/db/src/repositories/work-items.ts`
- `packages/db/src/repositories/work-item-statuses.ts`
- `packages/db/src/repositories/work-item-attachments.ts`
- `packages/domain/src/work-item.ts`
- `packages/domain/src/work-item-duration.ts`

### Evidencia en UI
- `apps/web/app/(app)/proyectos/page.tsx`
- `apps/web/app/(app)/proyectos/[cliente]/page.tsx`
- `apps/web/app/(app)/proyectos/[cliente]/[proyecto]/page.tsx`
- `apps/web/app/(app)/proyectos/[cliente]/[proyecto]/tareas/[tarea]/page.tsx`
- `apps/web/components/proyectos/project-board.tsx`
- `apps/web/components/proyectos/project-status-manager.tsx`
- `apps/web/components/proyectos/projects-list.tsx`
- `apps/web/components/proyectos/work-item-detail.tsx`
- `apps/web/components/proyectos/work-item-editor.tsx`
- `apps/web/components/proyectos/work-item-fields.tsx`

### Lectura
El módulo de Proyectos ya está entrando en una fase donde el gap principal no es “crear el work item”, sino llevarlo a parity operativa con ClickUp en colaboración, actividad y seguimiento.

## 5. Trabajo en progreso detectado en la rama actual

Al momento del snapshot, el repositorio tiene cambios no committeados / nuevos archivos ligados a este frente:

### Documentación nueva
- `Docs/30-Functional/ClickUp-Parity.md`
- `Docs/superpowers/specs/2026-08-05-clickup-parity-agency-os-design.md`
- `Docs/superpowers/specs/2026-08-05-clickup-parity-operacional-fase-b-design.md`

### Desarrollo en progreso
- cambios en pantallas de `proyectos`
- cambios en `work-items.ts`
- nueva migración `022_client_logos.sql`
- componentes nuevos:
  - `apps/web/components/proyectos/client-logo.tsx`
  - `apps/web/components/proyectos/projects-sidebar.tsx`
- acción nueva:
  - `apps/web/lib/client-logo-actions.ts`

### Lectura
La rama actual sigue expandiendo el módulo de Proyectos y mejorando la experiencia por cliente/proyecto, al tiempo que abre frente visual/operativo con logos de cliente.

## 6. Lo que ya está documentado pero todavía no se ve completo en código

### Parcialmente aterrizado
- tickets como flujo especializado
- time tracking completo
- comentarios en work items
- timeline de actividad
- checklists
- watchers / participants extendidos
- custom fields en work items
- tags
- recordatorios
- tiempo por estado
- documentos internos operativos

### Documentación clave ya creada
- `Docs/30-Functional/WorkItems.md`
- `Docs/30-Functional/Tickets.md`
- `Docs/30-Functional/TimeTracking.md`
- `Docs/30-Functional/ClickUp-Parity.md`
- `Docs/superpowers/specs/2026-07-29-proyectos-workitems-fase-a-design.md`
- `Docs/superpowers/specs/2026-08-05-clickup-parity-operacional-fase-b-design.md`

## 7. Qué falta para considerar Agency OS como reemplazo operativo real de ClickUp

### Prioridad alta
- comentarios y threads sobre work items
- adjuntos ligados también a comentarios
- checklists
- activity timeline persistente
- filtros operativos sólidos
- búsqueda operativa
- custom fields mínimos

### Prioridad media
- time tracking más completo
- tiempo por estado
- watchers / seguimiento personal
- recordatorios
- tags

### Prioridad posterior
- dependencias avanzadas
- linking lateral entre work items
- documentos internos colaborativos
- chat interno

## 8. Roadmap interpretado desde el estado real

### Ya superado respecto a la fase de pura documentación
- stack decidido
- arquitectura monorepo real
- CRM real
- auth real
- permisos reales
- notificaciones base
- work items base reales

### Fase actual más realista
La fase real del proyecto ya no es solo “UX + Desarrollo” en abstracto, sino:

**CRM consolidado + Work Items base implementados + transición a parity operacional con ClickUp**

## 9. Recomendación para lectura por agentes

Cuando Claude/Hermes tenga que analizar “dónde va el proyecto”, debe leer en este orden:

1. `Docs/99-Project/Current-Status.md`
2. `Docs/30-Functional/ClickUp-Parity.md`
3. `Docs/superpowers/specs/2026-07-29-proyectos-workitems-fase-a-design.md`
4. `Docs/superpowers/specs/2026-08-05-clickup-parity-operacional-fase-b-design.md`
5. `Docs/99-Project/Backlog.md`
6. estado real de `apps/web`, `packages/db`, `packages/domain`, `supabase/migrations`

## 10. Resumen corto

Hoy Agency OS ya tiene:
- plataforma base
- auth y RBAC
- CRM / cotizaciones funcional
- notificaciones base
- módulo de Proyectos / Work Items ya implementado en una primera capa real

El siguiente salto estratégico no es inventar más módulos, sino cerrar la **parity operacional** del trabajo diario del equipo para sacar dependencia real de ClickUp.