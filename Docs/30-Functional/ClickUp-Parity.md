# ClickUp Parity

## Objetivo

Mapear las funcionalidades disponibles hoy en el MCP de ClickUp contra Agency OS para usar este documento como referencia de alcance del reemplazo. Este documento sirve para que Claude, Hermes u otro agente pueda analizar rápidamente:

- qué capacidades de ClickUp ya fueron identificadas
- dónde viven conceptualmente dentro de Agency OS
- qué ya está documentado
- qué sigue faltando por especificar o implementar

**Contexto:** el servidor MCP de ClickUp disponible en Hermes expone 54 herramientas activas. Agency OS no necesita copiar la UI o naming de ClickUp 1:1, pero sí debe cubrir los jobs-to-be-done que hoy resuelve ClickUp para el equipo.

## Funcionalidades

### 1. Work Items / Tareas / Tickets / Proyectos (MVP)

**Funciones de ClickUp relacionadas**
- `clickup_create_task`
- `clickup_get_task`
- `clickup_update_task`
- `clickup_delete_task`
- `clickup_move_task`
- `clickup_merge_tasks`
- `clickup_filter_tasks`
- `clickup_search`

**Mapeo en Agency OS**
- Módulo: `Operación`
- Docs base existentes:
  - `Docs/30-Functional/WorkItems.md`
  - `Docs/30-Functional/Tickets.md`
  - `Docs/30-Functional/Proyectos.md`
  - `Docs/superpowers/specs/2026-07-29-proyectos-workitems-fase-a-design.md`

**Lectura del estado actual**
- Ya existe dirección clara para el core de `work_items` como reemplazo de tasks/tickets/proyectos.
- Ya existe spec de Fase A para proyectos + tareas + subtareas.
- Aún falta una especificación explícita de parity funcional frente a ClickUp en términos de búsqueda global, merge, papelera/borrado, vistas y consistencia entre task/ticket/work item.

**Decisión de producto**
- Agency OS debe consolidar `task`, `ticket`, `subtask` y `project` bajo la entidad canónica `work_item`.
- No se debe propagar nomenclatura `task.*` como entidad técnica separada; usar `work_item` como modelo base.

### 2. Dependencias y relaciones entre work items (V2)

**Funciones de ClickUp relacionadas**
- `clickup_add_task_dependency`
- `clickup_remove_task_dependency`
- `clickup_add_task_link`
- `clickup_remove_task_link`

**Mapeo en Agency OS**
- Módulo: `Operación`
- Docs base existentes:
  - `Docs/30-Functional/WorkItems.md`
  - `Docs/superpowers/specs/2026-07-29-proyectos-workitems-fase-a-design.md`

**Lectura del estado actual**
- `Dependencias` ya aparece mencionada en `WorkItems.md`.
- En la spec de Fase A quedó explícitamente fuera de alcance y enviada a fases posteriores.
- No existe todavía una definición formal para diferenciar:
  - dependencia bloqueante
  - relación informativa
  - relación padre/hijo

**Decisión de producto**
- Agency OS debe soportar dos conceptos separados:
  1. **jerarquía** (`parent_id`) para proyecto/tarea/subtarea
  2. **relaciones laterales** entre work items:
     - dependency (bloqueo)
     - link (relación no bloqueante)

### 3. Comentarios y colaboración (V2)

**Funciones de ClickUp relacionadas**
- `clickup_create_comment`
- `clickup_get_task_comments`
- `clickup_get_threaded_comments`

**Mapeo en Agency OS**
- Módulo: `Operación`
- Docs base existentes:
  - `Docs/30-Functional/WorkItems.md`
  - `Docs/30-Functional/Tickets.md`
  - `Docs/70-Database/Tables.md` (`comments`)

**Lectura del estado actual**
- Comentarios ya están contemplados como capability del work item y ticket.
- Falta definir con detalle:
  - comentarios planos vs threads
  - menciones
  - comentarios internos vs visibles al cliente
  - auditoría de edición

**Decisión de producto**
- Agency OS debe modelar comentarios como entidad propia asociada a `work_items`, con posibilidad de thread y bandera de visibilidad (`internal`, `client_visible`).

### 4. Adjuntos y archivos (V2)

**Funciones de ClickUp relacionadas**
- `clickup_attach_task_file`
- `clickup_request_attachment_upload`

**Mapeo en Agency OS**
- Módulo: `Operación`
- Docs base existentes:
  - `Docs/30-Functional/WorkItems.md`
  - `Docs/30-Functional/Tickets.md`
  - `Docs/70-Database/Tables.md` (`attachments`)
  - `Docs/80-API/Storage.md`

**Lectura del estado actual**
- Adjuntos/archivos ya están reconocidos en docs, pero no aterrizados como flujo completo.
- Falta definir storage, permisos, tamaño, preview, versionado y vínculo con comentarios.

**Decisión de producto**
- Agency OS debe soportar adjuntos a nivel work item y comentario, con storage centralizado y permisos por organización/proyecto.

### 5. Multi-lista y movimiento de trabajo (V2)

**Funciones de ClickUp relacionadas**
- `clickup_add_task_to_list`
- `clickup_remove_task_from_list`
- `clickup_move_task`

**Mapeo en Agency OS**
- Módulo: `Operación`
- Docs base existentes:
  - `Docs/30-Functional/WorkItems.md`
  - `Docs/50-Design/Navigation.md`

**Lectura del estado actual**
- El modelo actual de Agency OS está más orientado a `project_id + status_id` que a “task in multiple lists”.
- No existe todavía una decisión documental sobre si Agency OS debe replicar la multi-pertenencia de ClickUp.

**Decisión de producto**
- Para MVP, Agency OS **no necesita** copiar “Tasks in Multiple Lists”.
- El reemplazo funcional preferido debe ser:
  - work item con un proyecto dueño
  - vistas filtradas por estado, tipo, cliente, responsable, prioridad
  - relaciones/linking para cross-reference

### 6. Tags y campos personalizados (MVP + V2)

**Funciones de ClickUp relacionadas**
- `clickup_add_tag_to_task`
- `clickup_remove_tag_from_task`
- `clickup_get_custom_fields`

**Mapeo en Agency OS**
- Módulo: `Configuración`
- Docs base existentes:
  - `Docs/10-Product/Modules.md`
  - `Docs/70-Database/Tables.md`
  - `Docs/80-API/Integrations.md`

**Lectura del estado actual**
- `Campos personalizados` ya aparecen en módulos, pero sin diseño de producto ni modelo de datos detallado para work items.
- Tags como concepto no están explicitados.

**Decisión de producto**
- Agency OS debe soportar:
  - etiquetas ligeras (tags) para clasificación rápida
  - custom fields configurables por organización/módulo/tipo de work item
- Prioridad:
  - **MVP:** custom fields mínimos para work items y tickets
  - **V2:** tags + taxonomías configurables

### 7. Asignaciones, miembros y participantes (MVP)

**Funciones de ClickUp relacionadas**
- `clickup_get_workspace_members`
- `clickup_find_member_by_name`
- `clickup_resolve_assignees`

**Mapeo en Agency OS**
- Módulos: `Core` + `Operación`
- Docs base existentes:
  - `Docs/30-Functional/Core.md`
  - `Docs/30-Functional/WorkItems.md`
  - `Docs/superpowers/specs/2026-07-29-proyectos-workitems-fase-a-design.md`

**Lectura del estado actual**
- Ya está decidido que los work items soportan múltiples asignados.
- `Participantes` aparece en Work Items.
- Falta definición más detallada sobre watchers/followers/owner/reporter.

**Decisión de producto**
- Roles funcionales mínimos en work items:
  - creador
  - responsable(s)
  - participante(s)
  - seguidor(es) / watcher(s) (V2)

### 8. Time Tracking y tiempo por estado (MVP + V2)

**Funciones de ClickUp relacionadas**
- `clickup_get_time_entries`
- `clickup_get_current_time_entry`
- `clickup_add_time_entry`
- `clickup_start_time_tracking`
- `clickup_stop_time_tracking`
- `clickup_get_task_time_in_status`
- `clickup_get_bulk_tasks_time_in_status`

**Mapeo en Agency OS**
- Módulos: `Operación` + `Inteligencia`
- Docs base existentes:
  - `Docs/30-Functional/TimeTracking.md`
  - `Docs/30-Functional/WorkItems.md`
  - `Docs/65-Operations/KPIs.md`
  - `Docs/70-Database/Tables.md` (`time_entries`)

**Lectura del estado actual**
- Time tracking ya está contemplado, pero muy resumido.
- No existe una spec completa para timer en vivo, carga manual, billable/non-billable, ni analítica de tiempo por estado.

**Decisión de producto**
- Agency OS debe cubrir dos capas:
  1. **time entries** (registro real de horas)
  2. **time in status** (analítica operacional para cuellos de botella)
- Prioridad:
  - **MVP:** carga manual + agregados por work item/usuario/cliente
  - **V2:** timer en vivo + tiempo por estado + alertas operativas

### 9. Estructura del workspace: spaces / folders / lists (MVP reinterpretado)

**Funciones de ClickUp relacionadas**
- `clickup_get_workspace_hierarchy`
- `clickup_get_folder`
- `clickup_get_list`
- `clickup_create_folder`
- `clickup_update_folder`
- `clickup_create_list`
- `clickup_create_list_in_folder`
- `clickup_update_list`

**Mapeo en Agency OS**
- Módulos: `Core`, `Comercial`, `Operación`, `Configuración`
- Docs base existentes:
  - `Docs/10-Product/Modules.md`
  - `Docs/50-Design/Navigation.md`
  - `Docs/30-Functional/Workflow.md`

**Lectura del estado actual**
- Agency OS no está diseñado como clon literal de la jerarquía `Space > Folder > List`.
- El equivalente conceptual parece ser:
  - organización / tenant
  - módulos
  - proyectos / vistas / filtros / tableros

**Decisión de producto**
- Agency OS **no debe copiar literalmente** spaces/folders/lists.
- Debe reinterpretarlos así:
  - `Space` → módulo o dominio operativo
  - `Folder` → agrupador funcional opcional (cliente, área, unidad, portfolio)
  - `List` → vista operacional configurable o tablero dentro de proyecto/módulo

### 10. Documentos y conocimiento (V2)

**Funciones de ClickUp relacionadas**
- `clickup_create_document`
- `clickup_create_document_page`
- `clickup_list_document_pages`
- `clickup_get_document_pages`
- `clickup_update_document_page`

**Mapeo en Agency OS**
- Módulos: `Operación`, `Inteligencia`, `Configuración`
- Docs base existentes:
  - `Docs/75-AI/Knowledge.md`
  - `Docs/75-AI/Agents.md`
  - `Docs/65-Operations/SOP.md`

**Lectura del estado actual**
- No aparece un módulo de documentos colaborativos tipo ClickUp Docs claramente definido como feature de producto.
- Sí existe necesidad evidente de knowledge base, SOPs y soporte IA.

**Decisión de producto**
- Agency OS debe tener un sistema de documentos/knowledge, pero probablemente no en MVP si el foco es reemplazar operación primero.
- Prioridad sugerida:
  - **V2:** documentos internos ligados a clientes, proyectos y SOPs
  - **V3:** páginas colaborativas más ricas

### 11. Chat (V2/V3)

**Funciones de ClickUp relacionadas**
- `clickup_get_chat_channels`
- `clickup_get_chat_channel_messages`
- `clickup_get_chat_message_replies`
- `clickup_send_chat_message`

**Mapeo en Agency OS**
- Módulos: `Operación`, `Notificaciones`, `IA`
- Docs base existentes:
  - `Docs/30-Functional/Notificaciones.md`
  - `Docs/80-API/Realtime.md`
  - `Docs/80-API/Webhooks.md`

**Lectura del estado actual**
- No hay evidencia documental de un módulo de chat interno como feature prioritaria.
- Para una agencia, probablemente el job-to-be-done principal se resuelve mejor con comentarios, menciones y notificaciones antes que con chat full.

**Decisión de producto**
- Chat interno nativo no es requisito MVP.
- Reemplazo inicial suficiente:
  - comentarios por work item
  - activity feed
  - notificaciones
  - integraciones externas (WhatsApp/Email/Google Workspace) más adelante

### 12. Recordatorios y seguimiento personal (V2)

**Funciones de ClickUp relacionadas**
- `clickup_create_reminder`
- `clickup_update_reminder`
- `clickup_search_reminders`

**Mapeo en Agency OS**
- Módulos: `Operación`, `Core`, `Notificaciones`
- Docs base existentes:
  - `Docs/30-Functional/Notificaciones.md`
  - `Docs/65-Operations/Operational-Playbooks.md`

**Lectura del estado actual**
- No existe un submódulo explícito de recordatorios personales.

**Decisión de producto**
- Agency OS debería cubrir esto como parte de:
  - inbox personal
  - tareas pendientes
  - follow-ups
  - alertas automatizadas
- No hace falta copiar literalmente el reminder personal de ClickUp, pero sí resolver el seguimiento individual.

## Reglas

### Reglas de mapeo
- Agency OS reemplaza capacidades, no necesariamente nomenclatura o estructura visual de ClickUp.
- Cuando ClickUp tenga una feature que choque con el modelo canónico de Agency OS, prevalece el modelo de Agency OS.
- Toda nueva implementación debe referirse a `work_items` como entidad central, no a `tasks` como entidad técnica aparte.
- Cada capability debe etiquetarse por fase: `(MVP)`, `(V2)`, `(V3)`.

### Priorización sugerida de parity

#### MVP
- Work items / proyectos / tareas / subtareas
- Estados por proyecto
- Múltiples asignados
- Comentarios básicos
- Adjuntos básicos
- Custom fields mínimos
- Time entries manuales
- Filtros estructurados
- Búsqueda operativa básica

#### V2
- Dependencias
- Threads de comentarios
- Visibilidad cliente/interno
- Time tracking en vivo
- Tiempo por estado
- Tags
- Recordatorios
- Documentos internos

#### V3
- Chat interno
- Multi-vistas más sofisticadas
- Documentos colaborativos avanzados
- Automatizaciones parity completa con ClickUp

## KPIs

- % de capacidades críticas de ClickUp cubiertas por Agency OS
- % de trabajo operativo del equipo que puede migrarse sin depender de ClickUp
- tiempo medio por estado de work item
- adopción de time tracking
- % de work items con responsable, fecha y estado válido
- % de tickets/clientes operados completamente dentro de Agency OS

## Flujo

### Flujo de análisis continuo del proyecto
1. Leer este documento primero para entender parity ClickUp → Agency OS.
2. Contrastar con:
   - `Docs/superpowers/specs/2026-07-29-proyectos-workitems-fase-a-design.md`
   - `Docs/30-Functional/WorkItems.md`
   - `Docs/30-Functional/Tickets.md`
   - `Docs/30-Functional/TimeTracking.md`
3. Identificar si una capability está:
   - documentada
   - especificada para implementación
   - implementada en código
   - pendiente
4. Actualizar roadmap/backlog según fase y dependencia real.

## Estado de cobertura documental actual

### Ya mapeado parcialmente
- Work Items
- Tickets
- Time Tracking
- Dependencias (solo mención)
- Comentarios (solo mención)
- Adjuntos (solo mención)
- Participantes (solo mención)
- Estados por proyecto

### No mapeado de forma suficiente
- tags
- custom fields aplicados a work items
- merge de tasks
- búsqueda global parity ClickUp
- recordatorios
- documentos colaborativos
- chat interno
- tiempo por estado
- linking lateral entre work items

## Recomendación de implementación

El siguiente spec de implementación debe enfocarse en una **Fase B de ClickUp Parity Operacional** con este alcance:
- comentarios
- adjuntos
- checklists
- participantes/watchers
- activity timeline
- búsqueda/filtros operativos
- custom fields mínimos

Luego una **Fase C**:
- time tracking completo
- tiempo por estado
- recordatorios
- notificaciones

Y una **Fase D**:
- dependencias avanzadas
- linking lateral
- documentos
- chat / colaboración avanzada
