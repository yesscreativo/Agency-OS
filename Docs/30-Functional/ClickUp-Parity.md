# ClickUp Parity

## Objetivo

Mapear qué necesita Agency OS para reemplazar a ClickUp **para este equipo específico** (no para ClickUp en general) — usando dos fuentes de verdad: el código real ya implementado, y una auditoría del workspace real de ClickUp de Laburu (no el catálogo teórico de features del MCP). Este documento reemplaza la versión anterior (2026-07-29, puramente teórica/pre-código) — casi todo lo que ahí se marcaba "V2 sin implementar" ya está construido, y algunos gaps que se daban por sentados resultaron ser falsos al verificar uso real.

## Funcionalidades

### 1. Ya implementado y verificado en código (2026-09-29)

Todo esto existe hoy en `work_items` y tablas relacionadas, no es "spec" ni "V2 pendiente":

- **Jerarquía**: `work_items` (tipo `project`/`task`/`subtask`, `parent_id`, `project_id` dueño). Un proyecto pertenece a un cliente (`client_id` obligatorio en `type=project`).
- **Carpetas por cliente** (`project_folders`, 2026-09-29): agrupa proyectos de un mismo cliente en carpetas con nombre y color, arrastrando entre ellas — confirmado por la auditoría que replica el patrón real que usan en ClickUp (ver sección 2).
- **Estados por proyecto** (`work_item_statuses`): columnas de tablero configurables (label/color/orden/`is_done`) por proyecto, con drag&drop de tareas y de las columnas mismas.
- **Comentarios** (`work_item_comments`): threads (`parent_comment_id`), menciones.
- **Adjuntos** (`work_item_attachments`): a nivel work item o de un comentario.
- **Actividad** (`work_item_activity`): timeline de eventos por work item.
- **Asignados múltiples** (`work_item_assignees`).
- **Time tracking completo**: `work_item_time_entries` + `work_item_active_timers` (timer en vivo), vista "Mis tiempos" (maestro-detalle por cliente).
- **Checklist simple** (`checklist_items`): una lista plana de pasos por work item (no checklists nombrados/múltiples).
- **RBAC**: roles/permisos delegados por módulo, editor de roles configurable (crear rol, marcar permisos, sin migración).
- **Notificaciones**: in-app, polling (no realtime), por asignación/mención/vencimiento.

### 2. Auditoría de uso real de ClickUp (2026-09-29)

Se investigó el workspace real (66 spaces = clientes) vía MCP, no la lista de herramientas disponibles. Hallazgos con evidencia concreta:

- **Jerarquía real**: Cliente (space) → Área/Carpeta (folder) → Lista → Tareas. Patrón de plantilla casi idéntico en todos los clientes: "Área Contenidos / Área Estrategia / Área Innovación / BTL y Logística / Cuentas". **Confirma** que `project_folders` (Cliente→Carpeta→Proyecto) es el mapeo correcto, y que "Lista" = "Proyecto" en Agency OS (ya lo tiene sus tareas y su contador).
- **Time tracking**: uso pesado real (156h30 en un mes de un solo usuario, agregado visible por tarea). Ya cubierto.
- **Watchers/seguidores**: **gap real confirmado con datos** — una tarea con 3 asignados tenía 6 watchers; otra con 1 asignado tenía 3. Es gente que sigue una tarea sin ser responsable (típico de un PM/cuentas). Agency OS solo tiene `assignees`, no un concepto de "seguir sin asignar".
- **Custom fields**: NO es un motor configurable por proyecto — es **un único set fijo de 5 campos compartido en todo el workspace** (`Size`, `🐱 ESTATUS COPY` con ~10 sub-estados de flujo de copy, `CUENTA` multi-select de 19 clientes usado como tag cruzado, `🫥 COPY` = asignado de copywriting, `TRÁFICO COPY` = fecha). Es un flujo de contenido/copy específico, no un sistema genérico.
- **Dependencias/links entre tareas**: **falso gap**. Se verificaron tareas reales dentro de listas literalmente llamadas "GANTT GENERAL PROYECTOS": `dependencies: []`, `linked_tasks_count: 0`, sin fechas. Esas listas "GANTT" son en realidad checklists de proceso de entrega estandarizado (Kick Off → Requerimientos → Diseño → Desarrollo → QA → Entrega), no cronogramas reales.
- **Reminders**: 0 uso confirmado.
- **Tags**: uso vestigial (4/34 tareas muestreadas), y redundante con el campo `CUENTA`.
- **Docs (ClickUp Docs)**: sin evidencia de uso vía API — el equipo pega links de Figma/Slides/Drive directo en la descripción de la tarea en vez de usar Docs.
- **Chat**: incipiente (4 canales, todos de los últimos ~2-3 meses, naming inconsistente) — no consolidado todavía.
- **Subtareas**: uso real confirmado (relación parent/child real en tareas muestreadas). Ya cubierto.
- **Adjuntos**: uso pesado en tareas de diseño/desarrollo (una sola tarea con 36 adjuntos). Ya cubierto.

### 3. Gap real, priorizado

1. **Watchers/seguidores** (prioridad alta) — construir `work_item_watchers` (tabla simple: quién sigue qué work item sin estar asignado) + incluirlos en las notificaciones de actividad. Bajo costo, uso confirmado con datos reales.
2. **Sub-estatus de contenido/copy** (prioridad media-alta) — un campo select opcional en `work_items` (ej. `content_sub_status`) con las ~10 opciones reales vistas (enviado a diseño, pendiente cliente, tráfico copy, por aprobar, ajustes...). **No** construir un motor genérico de custom fields configurables — el uso real es un set fijo y pequeño, acotado al flujo de contenidos.
3. **Vista Gantt/timeline por proyecto** (prioridad alta — **decisión de producto de Yesid, 2026-09-29**) — el uso INTERNO real de ClickUp no tiene Gantt real (ver sección 4), pero el motivo de construirlo en Agency OS es otro: **mostrarle al cliente el flujo completo del proyecto** (visibilidad externa/comercial), no reemplazar un hábito interno. Sin spec todavía — definir con qué datos de `work_items` alcanza (fechas de tareas/subtareas, ¿hace falta algo de dependencia mínima solo para que el orden se vea coherente, sin construir un motor de dependencias bloqueantes completo?) antes de implementar.

### 4. Falso gap para el uso INTERNO del equipo — no confundir con la sección 3

Verificado con datos reales que el equipo NO usa estas features en su día a día — pero **el Gantt de la sección 3 es una excepción**: se construye igual, por una razón de producto distinta (cara al cliente), no por replicar este uso interno:

- Dependencias/relaciones bloqueantes entre work items (uso interno).
- Recordatorios personales tipo ClickUp reminders.
- Tags como taxonomía rica (el campo `CUENTA`/cliente ya cumple ese rol).
- Documentos colaborativos tipo ClickUp Docs (adjuntos + descripción con links externos ya resuelve el job-to-be-done real).
- Motor de custom fields configurable por proyecto/organización (el uso real es un set fijo, no una taxonomía por cliente).
- Chat interno como prioridad (uso incipiente, no crítico todavía — reevaluar si crece).
- Checklists nombrados/múltiples por tarea (en las tareas muestreadas, `checklists_count` fue 0 — sin evidencia de uso pesado hoy).

### 5. Checklist de paridad 100% con ClickUp (referencia general, no priorizado)

Lista de features de ClickUp que existen en el catálogo del MCP pero no se auditaron a fondo por uso real (ni se descartaron ni se priorizaron) — queda para consulta si en algún momento se quiere evaluar paridad más completa, no solo lo que usa hoy este equipo:

- Merge de tareas (`clickup_merge_tasks`).
- Tareas en múltiples listas (`clickup_add_task_to_list`/`clickup_remove_task_from_list`) — Agency OS usa el modelo "un proyecto dueño" a propósito, no se planea replicar.
- Búsqueda global tipo `clickup_search` (hoy Agency OS tiene filtros estructurados por cliente/proyecto/estado, no un buscador global de texto libre entre todo el workspace).
- Automatizaciones (ClickUp Automations) — no auditado, sin evidencia de uso revisada.
- Vistas múltiples (Calendar, Mind Map, Whiteboard) más allá de Board/List — no auditado.
- Plantillas de proyecto/lista reutilizables — el patrón de carpetas repetido por cliente (sección 2) sugiere que SÍ podría haber valor en plantillas, pero no se profundizó.
- Metas/Goals de ClickUp — no auditado.
- Permisos granulares por espacio/carpeta/lista (ClickUp permite compartir a nivel muy fino) — Agency OS resuelve esto con RBAC por módulo/rol, modelo distinto a propósito.

## Reglas

- Agency OS reemplaza **jobs-to-be-done confirmados con uso real**, no el catálogo completo de features de ClickUp.
- Antes de marcar algo como "gap a construir", verificar uso real (workspace de ClickUp o comportamiento actual del equipo) — no asumir por el catálogo de herramientas del MCP.
- Toda nueva implementación se refiere a `work_items` como entidad central.
- Cada capability se etiqueta por fase: `(MVP)`, `(V2)`, `(V3)`.

## Recomendación de implementación

**A construir** (orden sugerido, ver [[pendientes-proyectos-2026-09-04]] en memoria de sesión para el orden de trabajo real acordado con Yesid — vacaciones RRHH y "recursos" van primero, esto queda después):
1. Watchers/seguidores — gap real de uso interno.
2. Sub-estatus de contenido/copy — gap real de uso interno.
3. Vista Gantt/timeline por proyecto — **no** es gap de uso interno, es requisito nuevo de producto (mostrarle al cliente el flujo del proyecto). Necesita spec propia antes de implementar.

**Diferido indefinidamente** (falso gap de uso interno, sin evidencia real): dependencias entre tareas, reminders, tags ricos, Docs colaborativos, motor de custom fields genérico.

**Reevaluar más adelante si crece el uso real**: chat interno, checklists nombrados múltiples.

**Sin auditar, solo listado para referencia** (ver sección "Checklist de paridad 100%"): merge de tareas, multi-lista, búsqueda global, automatizaciones, vistas adicionales, plantillas, goals, permisos granulares.

## KPIs

- % de trabajo operativo del equipo que puede migrarse sin depender de ClickUp.
- Adopción de time tracking (ya alta en ClickUp — mantener el estándar en Agency OS).
- % de work items con responsable, fecha y estado válido.
- % de clientes operados completamente dentro de Agency OS (hoy: 100% del modelo de datos ya soporta esto; falta migración de datos históricos si se decide traerlos).
