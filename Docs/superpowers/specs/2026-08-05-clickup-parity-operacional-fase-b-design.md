# ClickUp Parity Operacional — Fase B — Diseño

**Fecha:** 2026-08-05  
**Estado:** nuevo spec  
**Objetivo:** definir la siguiente fase de Agency OS para acercarse al reemplazo operativo de ClickUp, cubriendo colaboración, actividad y clasificación mínima sobre `work_items`.

## Contexto

Agency OS ya tiene una base clara para `Proyectos / Work Items — Fase A`, donde se establecen:
- proyectos
- tareas
- subtareas
- estados por proyecto
- múltiples asignados
- board/list view
- relación con cliente

Sin embargo, para que el equipo empiece a trabajar realmente dentro de Agency OS como reemplazo de ClickUp, todavía falta una capa operacional crítica: **comentarios, adjuntos, checklists, activity timeline, filtros/búsqueda y metadatos configurables mínimos**.

Este documento aterriza esa siguiente fase.

## Objetivo

Convertir el módulo `work_items` en una superficie utilizable para operación diaria del equipo, agregando capacidades mínimas de colaboración y seguimiento que hoy resuelve ClickUp.

## Funcionalidades

### 1. Comentarios en work items (MVP)

#### Capacidad
- comentar en proyectos, tareas, subtareas y tickets
- responder comentarios (thread simple)
- distinguir comentarios internos de visibles al cliente
- soportar menciones de usuarios
- editar y eliminar con auditoría blanda

#### Alcance funcional
- `comment_type`: `internal | client_visible`
- comentario raíz o reply con `parent_comment_id`
- render de hilo simple en el detalle del work item
- mostrar autor, fecha, editado, reply count
- menciones `@usuario` con resolución interna

#### Reglas
- solo usuarios con acceso al work item pueden leer/escribir comentarios
- comentarios `client_visible` solo aparecen en vistas/portales autorizados
- un reply siempre hereda el `work_item_id` del comentario raíz
- no se borra físicamente por defecto; usar `deleted_at`

### 2. Adjuntos (MVP)

#### Capacidad
- adjuntar archivos a work items
- adjuntar archivos a comentarios
- distinguir archivos internos de visibles al cliente
- usar bucket centralizado de adjuntos

#### Alcance funcional
- upload desde UI
- lista de archivos por work item
- preview básico cuando aplique
- metadata mínima:
  - nombre
  - mime type
  - tamaño
  - autor
  - fecha
  - visibilidad

#### Reglas
- usar bucket `attachments`
- el archivo físico en storage y el registro relacional deben quedar sincronizados
- visibilidad mínima: `internal` / `client_visible`
- attachments deben poder vivir en:
  - work item
  - comentario

### 3. Checklists (MVP)

#### Capacidad
- crear checklist en un work item
- marcar ítems completos/incompletos
- ordenar ítems
- mostrar progreso de checklist

#### Alcance funcional
- múltiples checklists por work item o una checklist simple embebida; la decisión recomendada es **una sola entidad checklist_item** por work item y agrupar visualmente más adelante si hace falta
- campos mínimos:
  - texto
  - `is_completed`
  - `sort_order`
  - `completed_by`
  - `completed_at`

#### Reglas
- checklist no reemplaza subtareas; son dos niveles distintos
- subtarea = unidad de trabajo formal
- checklist item = control ligero / pasos rápidos

### 4. Participantes y watchers (MVP/V2)

#### Capacidad
- distinguir responsables de participantes
- permitir followers/watchers para recibir actividad

#### Alcance funcional
- mantener múltiples asignados de Fase A
- agregar noción de `participant`/`watcher`
- permitir que el creador quede auto-suscrito por defecto

#### Reglas
- no mezclar `assignee` con `watcher`
- watcher puede seguir sin ser responsable ni participante activo
- comments, status changes, checklist completion y uploads pueden disparar actividad/notificaciones a watchers

### 5. Activity timeline (MVP)

#### Capacidad
- registrar eventos clave del work item
- renderizar un historial legible

#### Eventos mínimos
- work item creado
- título/descripcion editados
- estado cambiado
- prioridad cambiada
- asignado/agregado/quitar usuario
- comentario creado
- reply creado
- archivo adjuntado
- checklist item creado/completado

#### Objetivo
No solo auditoría técnica: también lectura operativa para saber “qué pasó aquí” sin abrir mil pantallas.

### 6. Filtros operativos (MVP)

#### Capacidad
Filtrar work items por:
- estado
- prioridad
- tipo
- cliente
- proyecto
- responsable
- participante
- fecha de vencimiento
- atrasados
- con/sin adjuntos
- con/sin comentarios

#### Reglas
- filtros deben funcionar en lista y, cuando aplique, en board
- los filtros guardados pueden quedar para V2; MVP puede empezar con filtros de sesión / URL params

### 7. Búsqueda operativa (MVP)

#### Capacidad
Buscar work items por:
- título
- descripción
- nombre/código visible
- comentario reciente
- cliente/proyecto relacionado

#### Reglas
- la búsqueda debe priorizar uso operativo, no búsqueda full-text universal del sistema aún
- comments y attachments pueden empezar con indexación limitada si simplifica MVP

### 8. Custom fields mínimos para work items (MVP)

#### Capacidad
Permitir que la organización configure campos adicionales sobre work items.

#### Propuesta inicial
Soportar solo estos tipos en MVP:
- text
- number
- date
- select
- multi_select
- boolean

#### Objetivo
Cubrir necesidad real de agencia sin sobreconstruir un builder demasiado complejo.

#### Reglas
- los custom fields deben poder restringirse por tipo de work item
- no todos los módulos deben heredar esto desde el día 1
- MVP puede limitarse a `project`, `task`, `ticket`

### 9. Tags básicos (V2 temprana o MVP extendido)

#### Capacidad
Etiquetas simples para clasificar y filtrar.

#### Reglas
- no reemplazan custom fields
- sirven para clasificación ligera y transversal
- una organización administra sus tags

## Modelo de datos propuesto

### Tablas nuevas o ampliadas

#### `comments`
Campos sugeridos:
- `id`
- `organization_id`
- `work_item_id`
- `parent_comment_id` nullable
- `author_user_id`
- `body`
- `visibility` (`internal|client_visible`)
- `mentions_json` o tabla secundaria si se quiere mayor normalización
- `created_at`
- `updated_at`
- `deleted_at`

#### `attachments`
Campos sugeridos:
- `id`
- `organization_id`
- `work_item_id` nullable
- `comment_id` nullable
- `uploaded_by`
- `storage_bucket`
- `storage_path`
- `file_name`
- `mime_type`
- `file_size`
- `visibility`
- `created_at`
- `deleted_at`

#### `checklist_items`
Campos sugeridos:
- `id`
- `organization_id`
- `work_item_id`
- `label`
- `sort_order`
- `is_completed`
- `completed_by`
- `completed_at`
- `created_by`
- `created_at`
- `updated_at`
- `deleted_at`

#### `work_item_watchers`
Campos sugeridos:
- `work_item_id`
- `user_id`
- `organization_id`
- `created_at`

#### `activity_events`
Campos sugeridos:
- `id`
- `organization_id`
- `work_item_id`
- `actor_user_id`
- `event_type`
- `payload_json`
- `created_at`

#### `custom_field_definitions`
- scope mínimo por organización
- optional target: `work_item_type`
- `field_key`
- `label`
- `field_type`
- `config_json`
- `is_required`
- `sort_order`
- timestamps

#### `custom_field_values`
- `definition_id`
- `work_item_id`
- `value_json`
- timestamps

#### `tags`
- `id`
- `organization_id`
- `label`
- `color`
- timestamps

#### `work_item_tags`
- `work_item_id`
- `tag_id`
- `organization_id`

## Vistas

### `/proyectos/[id]`
Agregar al detalle del proyecto:
- panel lateral o drawer de detalle del work item
- pestañas o bloques:
  - actividad
  - comentarios
  - checklist
  - archivos
  - campos

### Vista detalle de work item
Debe mostrar:
- título
- descripción
- estado
- prioridad
- responsables
- participantes/watchers
- fechas
- custom fields
- checklist
- comentarios
- actividad
- archivos

### Filtros
En lista/board:
- barra superior con filtros rápidos
- chips activos
- limpiar filtros

## API / acciones

### Recomendación
Mantener patrón del CRM y Fase A:
- acciones de servidor para writes
- repos en `packages/db`
- helpers puros en `packages/domain`
- eventos de actividad generados en la capa de aplicación/acción

### Acciones mínimas
- create_comment
- reply_comment
- update_comment
- delete_comment
- upload_attachment
- delete_attachment
- create_checklist_item
- toggle_checklist_item
- reorder_checklist_items
- add_watcher
- remove_watcher
- create_custom_field_definition
- update_custom_field_value
- add_tag_to_work_item
- remove_tag_from_work_item
- search_work_items
- filter_work_items

## Reglas

### Reglas de diseño
- todo sigue colgando de `work_items`
- no crear sistemas paralelos para tickets si el modelo base lo cubre
- comentarios, adjuntos y actividad deben ser primero-class citizens del work item
- visibilidad `internal/client_visible` debe diseñarse desde el modelo, no como parche de UI

### Reglas de prioridad
- comentarios, adjuntos, checklist y activity timeline tienen prioridad sobre chat
- filtros y búsqueda tienen prioridad sobre automatizaciones complejas
- custom fields mínimos tienen prioridad sobre builder full no-code sofisticado

### Reglas de implementación
- todas las tablas con `organization_id` + RLS
- soft delete donde aplique
- eventos de actividad deben ser persistentes, no solo derivados en frontend
- activity timeline no debe depender exclusivamente de logs del sistema

## Fases sugeridas dentro de Fase B

### B1
- comments
- attachments
- checklist_items
- activity_events básicos

### B2
- watchers
- filtros operativos
- búsqueda operativa
- visibilidad cliente/interno

### B3
- custom fields mínimos
- tags básicos
- mejoras de UX del detalle del work item

## KPIs

- % de work items con conversación registrada dentro de Agency OS
- % de work items con archivos centralizados en el sistema
- % de work items con responsable y metadatos completos
- tiempo promedio para entender el estado de un work item desde su timeline
- reducción del uso externo de ClickUp para comentarios/seguimiento

## Dependencias

Este spec depende de:
- `Docs/30-Functional/ClickUp-Parity.md`
- `Docs/superpowers/specs/2026-07-29-proyectos-workitems-fase-a-design.md`
- `Docs/30-Functional/WorkItems.md`
- `Docs/30-Functional/Tickets.md`
- `Docs/30-Functional/Notificaciones.md`
- `Docs/80-API/Storage.md`
- `Docs/70-Database/Tables.md`

## Resultado esperado

Al finalizar esta fase, Agency OS debe poder cubrir el día a día operativo base del equipo en torno a work items sin depender de ClickUp para:
- comentar
- adjuntar archivos
- marcar checks
- ver actividad
- filtrar trabajo
- buscar trabajo
- clasificar trabajo con metadatos mínimos

Ese es el punto donde el reemplazo deja de ser solo estructural y empieza a ser realmente utilizable.