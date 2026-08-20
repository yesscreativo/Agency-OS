# ClickUp Parity → Agency OS — Diseño de implementación

**Fecha:** 2026-08-05  
**Estado:** nuevo spec  
**Objetivo:** dejar explícito qué funcionalidades del MCP de ClickUp deben existir en Agency OS, cómo se reinterpretan en el producto y qué fases de implementación se recomiendan.

## Contexto

Se revisó el MCP de ClickUp conectado a Hermes. Hoy expone **54 herramientas** que cubren:

- tareas
- comentarios
- adjuntos
- time tracking
- tiempo por estado
- miembros/asignación
- jerarquía workspace/folders/lists
- documentos
- chat
- recordatorios
- búsqueda y filtros
- tags/custom fields
- dependencias y links

Agency OS ya tiene una dirección clara como reemplazo de ClickUp, especialmente en el módulo **Proyectos / Work Items**, pero el repositorio todavía está desbalanceado entre:

1. capacidades ya reconocidas en docs
2. capacidades ya especificadas con detalle
3. capacidades realmente implementadas en código

Por eso este spec no propone copiar ClickUp 1:1, sino definir una **parity funcional orientada al trabajo real del equipo**.

## Hallazgos del análisis

### 1. Lo ya bien encaminado
- `work_items` como entidad central ya está planteada.
- Existe spec aprobada para `Proyectos / Work Items — Fase A`.
- `Tickets`, `Comentarios`, `Adjuntos`, `Time Tracking`, `Dependencias` ya aparecen al menos mencionados en docs funcionales.
- Ya existe decisión de múltiples asignados por work item.

### 2. Lo insuficientemente documentado
- tags
- custom fields aplicados a work items
- merge de tareas
- búsqueda global parity ClickUp
- tiempo por estado
- watchers/seguidores
- relaciones laterales entre work items
- documentos colaborativos
- recordatorios personales/operativos
- chat interno

### 3. Lo que NO conviene copiar literalmente
- `Space > Folder > List` como jerarquía exacta
- `Tasks in Multiple Lists`
- chat como feature prioritaria antes de comentarios y actividad

Agency OS debe reinterpretar estos conceptos según su propio modelo.

## Alcance funcional propuesto

### Fase A — ya existente / en curso
Base operacional:
- proyectos
- tareas
- subtareas
- estados por proyecto
- múltiples asignados
- board/list view
- relación con cliente
- relación opcional con cotización

Referencia:
- `Docs/superpowers/specs/2026-07-29-proyectos-workitems-fase-a-design.md`

### Fase B — ClickUp Parity Operacional (recomendada siguiente)
Debe cubrir:
- comentarios
- comentarios thread
- adjuntos
- checklists
- participantes / watchers
- historial de actividad (timeline)
- filtros operativos
- búsqueda operativa
- custom fields mínimos para work items
- tags básicos
- visibilidad interno/cliente en comentarios y archivos

### Fase C — ClickUp Parity de tiempo y seguimiento
Debe cubrir:
- time entries manuales
- timer en vivo
- billable / non-billable
- horas por usuario / cliente / proyecto / work item
- tiempo por estado
- recordatorios
- alertas operativas

### Fase D — ClickUp Parity avanzada
Debe cubrir:
- dependencias bloqueantes
- links laterales entre work items
- merge de work items
- documentos internos ligados a operación
- automatizaciones y reglas
- chat / colaboración avanzada si sigue siendo necesario

## Mapeo funcional consolidado

### Work Items / Tasks / Tickets / Projects
**ClickUp tools:** create/get/update/delete/move/merge/search/filter task  
**Agency OS:** `work_items` canónico con tipos `project | task | subtask | ticket` (ticket puede ser vista/flujo de un work item)  
**Estado:** parcial; Fase A ya definida

### Comments / Threads
**ClickUp tools:** create_comment, get_task_comments, get_threaded_comments  
**Agency OS:** `comments` + threading + visibilidad  
**Estado:** mención funcional, falta spec de implementación

### Attachments
**ClickUp tools:** attach_task_file, request_attachment_upload  
**Agency OS:** `attachments` + storage + permisos + adjuntos por work item/comentario  
**Estado:** mención funcional, falta spec de implementación

### Dependencies / Links
**ClickUp tools:** add/remove dependency, add/remove link  
**Agency OS:** relación lateral entre work items distinta a jerarquía padre/hijo  
**Estado:** mencionado, fuera de Fase A, falta diseño

### Members / Assignees / Participants
**ClickUp tools:** workspace_members, find_member_by_name, resolve_assignees  
**Agency OS:** usuarios, responsables, participantes, watchers  
**Estado:** parcial, múltiples asignados ya definidos

### Time Tracking / Time in Status
**ClickUp tools:** get/add/start/stop time entry, current timer, task/bulk time in status  
**Agency OS:** `time_entries` + analítica de flujo  
**Estado:** resumido, falta spec fuerte

### Workspace Hierarchy
**ClickUp tools:** workspace_hierarchy, folder/list CRUD  
**Agency OS:** reinterpretación en módulos, agrupadores, vistas y tableros  
**Estado:** no debe copiarse literal

### Documents
**ClickUp tools:** create/list/get/update docs/pages  
**Agency OS:** knowledge docs internos ligados a SOPs, proyectos o clientes  
**Estado:** no especificado como módulo de parity

### Chat
**ClickUp tools:** chat channels/messages/replies/send  
**Agency OS:** probablemente reemplazable con comentarios + activity + notificaciones inicialmente  
**Estado:** no prioritario

### Reminders
**ClickUp tools:** create/update/search reminders  
**Agency OS:** seguimiento individual, inbox, follow-ups y alertas  
**Estado:** no especificado

### Custom Fields / Tags
**ClickUp tools:** get_custom_fields, add/remove tag  
**Agency OS:** custom fields configurables y etiquetas ligeras  
**Estado:** reconocido a nivel módulo, no aterrizado

## Decisiones de producto propuestas

1. **Agency OS reemplaza capacidades, no nomenclatura literal.**
2. **`work_items` sigue siendo la entidad central.** No abrir una entidad técnica separada `tasks` si no hace falta.
3. **Tickets** deben tratarse como una vista o flujo especializado de `work_items`, no como sistema aislado si el modelo base puede soportarlo.
4. **Jerarquía tipo ClickUp** se reinterpreta:
   - Space → módulo / dominio
   - Folder → agrupador funcional opcional
   - List → vista/tablero/colección operativa
5. **Tasks in Multiple Lists** no es requisito MVP.
6. **Comentarios + adjuntos + actividad + filtros** tienen más prioridad que chat.
7. **Time tracking operativo** debe resolverse antes que documentos colaborativos avanzados.

## Recomendación documental inmediata

Este spec debe convivir con:
- `Docs/30-Functional/ClickUp-Parity.md` ← documento funcional nuevo y canónico de parity
- `Docs/30-Functional/WorkItems.md`
- `Docs/30-Functional/Tickets.md`
- `Docs/30-Functional/TimeTracking.md`
- `Docs/superpowers/specs/2026-07-29-proyectos-workitems-fase-a-design.md`

## Próximo spec recomendado

Crear después de este documento un spec dedicado para:

### `ClickUp Parity Operacional — Fase B`
Con diseño detallado de:
- `comments`
- `comment_threads`
- `attachments`
- `checklists`
- `work_item_participants`
- `activity_events`
- `work_item_custom_fields`
- `work_item_tags`
- búsqueda y filtros operativos

## Criterio para futuros análisis del proyecto

Cuando Claude o Hermes revisen el estado de Agency OS, deben usar este orden:
1. `Docs/30-Functional/ClickUp-Parity.md`
2. `Docs/superpowers/specs/2026-07-29-proyectos-workitems-fase-a-design.md`
3. `Docs/30-Functional/WorkItems.md`
4. `Docs/30-Functional/Tickets.md`
5. `Docs/30-Functional/TimeTracking.md`
6. `Docs/70-Database/Tables.md`
7. estado real del código/migraciones

Así el análisis de “dónde vamos” queda anclado a parity funcional real frente a ClickUp, no solo a módulos sueltos.
