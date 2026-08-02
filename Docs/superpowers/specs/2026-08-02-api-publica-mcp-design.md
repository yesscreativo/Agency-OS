# API pública + servidor MCP — Diseño (v1)

> Estado: diseño aprobado, pendiente de plan de implementación.
> Fecha: 2026-08-02. Autor: Yesid + Claude.

## Objetivo

Dar a Agency OS dos vías de conectividad externa sobre una **única fuente de lógica**:

1. Una **API REST pública** (`/api/v1`) para integraciones y automatización (n8n, terceros, otras apps propias).
2. Un **servidor MCP** para que agentes IA (Claude, ChatGPT, etc.) consulten y operen la agencia.

Ambas comparten núcleo, autenticación y permisos, de modo que **no diverjan**. Hoy no existe ninguna de las dos: el único route handler bajo `apps/web/app/api/` es un proxy saliente a n8n (`apps/web/app/api/webhooks/[event]/route.ts`) y no hay servidor MCP propio. La lógica de negocio ya está separada de la UI en `packages/domain` (lógica pura) y `packages/db` (repositorios), lo que hace factible montar ambos adaptadores sin refactor.

## Decisiones tomadas (contexto del brainstorming)

| Decisión | Elección |
|---|---|
| Propósito | General: agentes IA, integraciones/automatización, terceros, uso interno |
| Alcance v1 | Lectura completa de módulos ya construidos + **escritura acotada** (work items + crear clientes) |
| Arquitectura | Enfoque A: núcleo compartido + adaptadores REST y MCP delgados sobre el mismo core |
| Modelo de API key | **Por organización**, creación/revocación **solo admins**, identidad de servicio con scope `read`/`read_write`, RLS activo |
| Cotizador (márgenes) | **Diferido a V2** — dato sensible, fuera de v1 |

## Arquitectura

Enfoque A — una sola fuente de lógica, dos transportes:

```
packages/domain   (ya existe · lógica pura, testeada)
packages/db       (ya existe · repositorios; funciones (db, orgId, opts))
        ▲
packages/services (NUEVO · operaciones de negocio framework-agnósticas)
   · recibe AuthContext { orgId, scope, apiKeyId } EXPLÍCITO (nunca cookies)
   · valida scope + permisos, delega a domain + db
        ▲                     ▲                          ▲
  Server Actions         REST v1                     MCP server
  (apps/web/lib/*        apps/web/app/api/v1/*        apps/web/app/api/mcp/route.ts
   -actions.ts,          (NUEVO)                      (NUEVO · in-process)
   se dejan intactas)
```

- **`packages/services` (nuevo, delgado):** encapsula cada operación de v1 (`listWorkItems(ctx, filters)`, `createWorkItem(ctx, input)`, etc.) tomando un `AuthContext` explícito y un cliente `Db`. Reutiliza `packages/domain` + `packages/db` tal cual.
- **REST y MCP** son adaptadores finos: resuelven auth por Bearer y llaman a `services` **en proceso** (sin doble hop de red).
- **Justificación de `services` (seguridad, no arquitectura):** centralizar los chequeos de scope/permiso/validación en un solo lugar evita que REST y MCP diverjan (que un adaptador quede con un chequeo más débil que el otro).
- **Server actions existentes se dejan como están** en v1 (no refactor). Migrarlas a `services` es trabajo futuro (ver Fuera de alcance).

## Autenticación y autorización

### Tabla `api_keys` (migración `supabase/migrations/023_api_keys.sql`)

| Columna | Tipo | Nota |
|---|---|---|
| `id` | uuid PK | |
| `organization_id` | uuid FK | org a la que pertenece la key |
| `name` | text | etiqueta legible ("n8n prod", "Claude") |
| `key_prefix` | text (indexado, único) | primeros ~8 chars visibles, para lookup e identificación |
| `key_hash` | text | **SHA-256** del secreto completo |
| `scope` | enum `read` \| `read_write` | permiso de la key |
| `created_by` | uuid | usuario admin que la creó |
| `created_at` | timestamptz | |
| `last_used_at` | timestamptz | auditoría |
| `revoked_at` | timestamptz null | revocación (soft) |

- **RLS:** los miembros de la org solo ven/gestionan las keys de su org. **Crear y revocar exige permiso de admin** (gate a nivel de policy + a nivel de la server action que administra keys).
- **Formato del token:** `aos_<prefix>_<secreto>`. El `<secreto>` es aleatorio de alta entropía (≥ 32 bytes). Se envía como `Authorization: Bearer aos_...`.
- **Almacenamiento:** solo se guarda `key_hash` (SHA-256) + `key_prefix`. El secreto completo **se muestra una sola vez** al crearlo y nunca se persiste ni se loguea.

### Verificación por request (`resolveApiAuth`)

Vive en `packages/services`. Flujo:

1. Extrae el Bearer; si falta o no matchea el formato → 401.
2. **`service_role` se usa EXCLUSIVAMENTE aquí:** busca en `api_keys` por `key_prefix`, compara `SHA-256(secreto)` contra `key_hash` con **comparación en tiempo constante**, verifica `revoked_at IS NULL`.
3. Resuelve `AuthContext { orgId, scope, apiKeyId }` y actualiza `last_used_at`.
4. A partir de aquí, **todo acceso a datos usa un cliente con RLS activo** ligado a la org (JWT corto con los claims de la organización) — **nunca `service_role`**.

### Reglas de seguridad (no negociables)

1. **`service_role` solo para el lookup de `api_keys`.** Toda lectura/escritura de negocio va por cliente **RLS-enforced**. RLS es el backstop aunque la app tenga un bug de filtrado por `organization_id` (previene fuga cross-org).
2. **Bearer-only, cookie-NUNCA.** `/api/v1/*` y `/api/mcp` **rechazan** autenticación por sesión/cookie y no la leen en absoluto (anti-CSRF / confused deputy).
3. **Gate de admin** para crear/revocar keys (cierra la escalación de privilegios: un usuario de bajo privilegio no puede auto-otorgarse una key de acceso amplio).
4. **Atribución y auditoría:** toda escritura registra el `api_key_id` en `created_by`/`updated_by` (o campo equivalente) y en un log de escrituras.
5. **Hashing:** SHA-256 + compare constante. **No** bcrypt/argon2 (son para secretos de baja entropía; el token es aleatorio de alta entropía).
6. **Transporte:** solo HTTPS. El token nunca se loguea.

## Superficie REST v1 (`/api/v1`)

Prefijo versionado en la ruta. Envelope de respuesta consistente `{ data, error, meta }`. Paginación por `limit` + `cursor`. Errores con `{ error: { code, message } }` y HTTP status correcto: 401 (sin/ mala key), 403 (scope insuficiente), 404, 422 (validación).

**Lectura (scope `read`):**
- `GET /api/v1/work-items` — filtros: `project`, `client`, `status`, `assignee`, paginado
- `GET /api/v1/work-items/:id`
- `GET /api/v1/projects`
- `GET /api/v1/projects/:id`
- `GET /api/v1/clients`
- `GET /api/v1/clients/:id`
- `GET /api/v1/work-item-statuses`

**Escritura (scope `read_write`):**
- `POST /api/v1/work-items` — crear tarea
- `PATCH /api/v1/work-items/:id` — actualizar campos **incluido el cambio de estado** (no hay endpoint `/status` dedicado)
- `POST /api/v1/clients` — crear cliente

## Servidor MCP (v1)

- **Transporte:** MCP remoto **Streamable HTTP** montado como route handler en `apps/web/app/api/mcp/route.ts` usando `@modelcontextprotocol/sdk`. Co-hospedado con la web app (mismo deploy) → reduce superficie vs. un servidor separado expuesto.
- **Auth:** misma **API key Bearer**. **Cada request se autentica**; no hay sesión MCP anónima; cada sesión queda ligada a la key. El **scope se valida en el servidor por cada tool** (no solo se anuncia). Key `read` invocando un tool de escritura → error de permiso.
- **Tools (envuelven `packages/services`, mismos permisos que REST):**
  - Lectura: `list_work_items`, `get_work_item`, `list_projects`, `get_project`, `list_clients`, `get_client`, `list_work_item_statuses`
  - Escritura (scope `read_write`): `create_work_item`, `update_work_item` (incluye cambio de estado), `create_client`
- Cada tool declara su `inputSchema` (Zod/JSON Schema) y devuelve datos estructurados.

## Gestión de keys en la UI

Pantalla mínima en ajustes de la organización (solo admins): crear key (mostrar el secreto una sola vez), listar keys existentes (nombre, prefix, scope, `last_used_at`, estado), revocar. Alcance de UI deliberadamente mínimo en v1.

## Testing

- **`packages/services`:** unit de cada operación con `AuthContext` mockeado + `Db` de prueba (patrón vitest ya usado en el repo).
- **Auth:** hashing/verificación de keys, revocación, scope insuficiente, formato de token inválido.
- **Aislamiento multi-tenant (crítico):** test explícito de que una key de la org A **no** puede leer ni escribir datos de la org B (verifica el backstop RLS).
- **REST + MCP:** integración de handlers — happy path + 401/403/404/422; verificación de que cookies no autentican estas rutas.

## Fuera de alcance de v1 (YAGNI)

- **Cotizaciones y órdenes a proveedores** (lectura y escritura) → **V2**. Los márgenes/precios son el dato más sensible; su exposición se decide con cuidado aparte (posible scope dedicado `quotes:read`).
- **OAuth para MCP** → V2 (v1 usa API key Bearer). Se evalúa si terceros lo requieren.
- **Rate limiting como control de seguridad.** Con keys de alta entropía la fuerza bruta/enumeración no es viable; un rate limit sería anti-DoS, no anti-brute-force. Si se agrega, es un límite global básico, no una pieza central de v1.
- **Refactor de las server actions existentes** para consumir `packages/services`.
- **Webhooks salientes nuevos** (ya existe el canal n8n en `apps/web/lib/webhooks.ts`).

## Documentación a actualizar

`Docs/80-API/*` hoy son stubs aspiracionales que no reflejan el código (p. ej. `Endpoints.md` lista rutas no implementadas; `Edge-Functions.md`/`Realtime.md`/`Storage.md` describen cosas inexistentes; los eventos de `Webhooks.md` no coinciden con los realmente emitidos). Aterrizarlos con el contrato real de v1 y añadir un documento de MCP. Reconciliar nombres de endpoints/eventos con lo implementado.

## Riesgos y notas de autocrítica

- La versión inicial del diseño usaba `service_role` para datos y una key de org sin principal — dos huecos (fuga cross-org y escalación de privilegios). Este diseño los corrige con **RLS obligatorio para datos** + **gate de admin** + **atribución por key**. Estas tres reglas son la diferencia entre "seguro" y "conveniente".
- Co-hospedar MCP y REST en la Next app simplifica el deploy y reduce superficie, pero exige que ambas familias de rutas queden **excluidas del middleware de sesión** y no dependan de cookies.
