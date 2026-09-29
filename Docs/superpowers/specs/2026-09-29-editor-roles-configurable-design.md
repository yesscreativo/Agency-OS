# Editor de roles configurable — Diseño

**Fecha:** 2026-09-29
**Estado:** nuevo spec
**Objetivo:** dejar de depender de una migración SQL para crear un rol o ajustar qué puede hacer uno existente — un Administrador de sistema (`is_super`) lo hace desde `/usuarios`.

## Contexto

Hoy el RBAC de Agency OS es completo en modelo (`roles` / `permissions` / `role_permissions` / `user_roles`) pero fijo en implementación: los 13 roles y 19 permisos existentes se crearon y se mantienen a mano en migraciones (`001_core.sql`, `013_crm_role_matrix.sql`, `015_supplier_order_permission.sql`, etc.). `/usuarios` (`AccessManager`) ya deja asignar/revocar un rol existente a un usuario, pero no toca qué permisos tiene ese rol, ni permite crear uno nuevo.

Yesid pidió avanzar en esto como parte de los pendientes de la fase de ClickUp Parity. Revisado el modelo real (`hicbkpwywwhnhiawulmu`):

- `roles`: `id, code, name, description, module_code, is_super, created_at, updated_at`. **Sin `organization_id`** — es un catálogo global (no por organización).
- `permissions`: `id, code, name, description, created_at`. 19 filas, agrupables por el prefijo de `code` antes del primer punto (`quote.*`, `project.*`, `client.*`, `kam.*`, `people.*`, `quote_status.*`, `users.*`).
- `role_permissions`: solo `role_id, permission_id` (join simple, sin metadata).
- **`permissions.name`/`.description` ya son legibles** ("Ver precio cliente", "Enviar cotización", con `description` de contexto donde aplica) — no hace falta tocar el esquema para que el editor sea entendible, solo usar esas columnas en vez del `code` crudo.
- El prefijo de `code` (`quote`, `project`, etc.) **no coincide** con `modules.code` (`crm`, `proyectos`, `rrhh`...) — son dos vocabularios distintos. Se necesita una etiqueta de grupo aparte para el prefijo (ver Funcionalidades).
- **RLS de `roles`/`permissions`/`role_permissions` solo tiene policies de `select`** — no hay `insert`/`update`/`delete` para ningún rol de sesión. Igual que `deleteUser`/`inviteUser` en `access-actions.ts`, todas las escrituras de este editor van con el cliente **service-role**, gateadas en la server action por `requireSuperAdmin()` (ya existe, se reutiliza). **No hace falta ninguna migración de RLS.**
- No hay ningún código de la app que dependa del `code`/`name` de un rol en específico (verificado por grep) — todo el gating es por `permissions.code` vía `hasPermission()`/`current_user_has_permission*`. Renombrar o borrar un rol es seguro en ese sentido.

## Objetivo

1. Un Administrador de sistema puede, desde `/usuarios`, crear un rol nuevo, editar su nombre/módulo/`is_super`, marcar/desmarcar sus permisos, y eliminarlo — sin tocar SQL.
2. Los permisos se presentan agrupados y en español entendible, no como código técnico (`quote.see_costs`) suelto.
3. No se puede dejar un rol en uso "huérfano" por accidente (borrado bloqueado si tiene usuarios asignados) ni el usuario actual puede quitarse a sí mismo su único acceso de superadmin.

## Funcionalidades

### 1. Pestaña "Roles" en `/usuarios`

- `UsuariosPage` (`apps/web/app/(app)/(hub)/usuarios/page.tsx`) pasa de renderizar `AccessManager` + `AreasManager` sueltos a envolverlos en tabs (`UnderlineTabs` de `@agency-os/ui`, ya existe, sin uso real todavía): **"Usuarios"** (lo que ya hay: `AccessManager` + `AreasManager`) y **"Roles"** (nuevo, `RolesManager`). Tabs client-side (`useState`, sin cambiar la URL) — mismo patrón simple que el resto de la página, no hace falta ruteo aparte.
- Gate de acceso a la pestaña "Roles": el mismo `if (!user.isSuper) redirect("/inicio")` que ya protege toda la página — no hace falta un permiso nuevo.

### 2. Etiquetas de grupo para los permisos

Mapa fijo en código (no en base de datos — son 7 grupos estables, ligados 1:1 al prefijo de `permissions.code`; si aparece un prefijo nuevo sin mapear, se muestra el prefijo capitalizado como fallback, nunca rompe la UI):

| Prefijo | Etiqueta |
|---|---|
| `quote` | Cotizaciones |
| `quote_status` | Estados de cotización |
| `project` | Proyectos |
| `client` | Clientes |
| `kam` | KAM / PM |
| `people` | Personas |
| `users` | Usuarios y roles |

Vive como una función pura en `packages/domain` (ver Dominio) para poder testearla, no en el componente.

### 3. Panel "Roles" (`RolesManager`)

- **Lista de roles** a la izquierda: nombre, badge del módulo (o "Sistema" si `module_code` es null), badge "Super" si `is_super`. Botón **"+ Nuevo rol"** arriba de la lista.
- **Panel de edición** a la derecha, al seleccionar un rol:
  - Nombre (`Input`), Módulo (`Select`: "Sistema" + los códigos de `modules`), `is_super` (checkbox, con texto de advertencia en rojo: "Este rol se salta todos los chequeos de permiso.").
  - Permisos agrupados por la etiqueta de grupo (sección 2), cada uno un checkbox con `permission.name` como label y `permission.description` como texto de ayuda debajo (cuando exista).
  - Botón **"Guardar cambios"**: aplica nombre/módulo/`is_super` (`updateRole`) y el set de permisos marcados (`setRolePermissions`) en una sola acción combinada desde la UI (dos llamadas server-side, una sola confirmación visual).
  - Botón **"Eliminar rol"** (variant danger, con modal de confirmación como el resto de `AccessManager`).
- **Crear rol**: modal con nombre + módulo + `is_super` (sin permisos todavía); al crear, selecciona el rol nuevo en el panel para asignarle permisos de una vez.

### 4. Guardas

- **Borrado bloqueado si está en uso**: `deleteRole` cuenta `user_roles` con ese `role_id`; si hay ≥1, retorna error "Este rol tiene N usuario(s) asignado(s). Quítaselo a todos antes de eliminarlo." (no se auto-revoca).
- **No auto-desbloqueo de superadmin**: si `updateRole` va a poner `is_super = false` en un rol, y el usuario que ejecuta la acción depende de ESE rol para ser `is_super` (es su única fila `user_roles` con un rol `is_super = true`), se rechaza: "No puedes quitarle superadmin al único rol que te da acceso de administrador." Se resuelve contando, para el `role_id` afectado, cuántos de los `user_roles` del usuario actual apuntan a roles `is_super = true` distintos de este.
- Todo gateado por `requireSuperAdmin()` (ya existe en `access-actions.ts`, se importa/reexporta — no se duplica).

## Modelo de datos

**Ninguna migración nueva.** El esquema ya soporta todo (`roles`, `permissions`, `role_permissions` ya tienen las columnas necesarias, y las escrituras van por `service_role`, que no depende de policies de RLS).

## Dominio (`packages/domain`)

- `permission-groups.ts`: `PERMISSION_GROUP_LABELS: Record<string, string>` (la tabla de la sección 2) + `groupLabel(code: string): string` (toma el prefijo antes del primer `.`, resuelve la etiqueta o capitaliza el prefijo como fallback) + `groupPermissions<T extends {code: string}>(permissions: T[]): {label: string; items: T[]}[]` (agrupa y ordena). Funciones puras, con tests — mismo criterio que `checklistProgress` en el spec de checklist.

## Repos (`packages/db/src/repositories/`)

- `permissions.ts` (nuevo): `listPermissions(db)` — todas, ordenadas por `code`.
- `roles.ts` (extiende el existente):
  - `listAllRoles(db)` — todos los roles sin el filtro de `listAssignableRoles` (incluye los "huérfanos" module_code null + is_super false, que hoy son invisibles para el editor pero deben poder arreglarse ahí).
  - `getRolePermissionIds(db, roleId)` — ids de permisos actuales de un rol.
  - `createRole(db, { name, moduleCode, isSuper })`.
  - `updateRole(db, roleId, { name, moduleCode, isSuper })`.
  - `deleteRole(db, roleId)`.
  - `countUsersWithRole(db, roleId)`.
  - `setRolePermissions(db, roleId, permissionIds)` — replace simple (delete all + insert) del set de `role_permissions` de ese rol, todo con el cliente `service_role` que pasa el caller.

## Server actions (`apps/web/lib/roles-actions.ts`, nuevo archivo)

- `createRoleAction(input)`
- `updateRoleAction(roleId, input)` — incluye el guard de auto-desbloqueo de superadmin.
- `deleteRoleAction(roleId)` — incluye el guard de borrado en uso.
- `setRolePermissionsAction(roleId, permissionIds)`

Todas reusan `requireSuperAdmin()` (se mueve de `access-actions.ts` a un helper compartido, p.ej. `apps/web/lib/access-guard.ts`, para no duplicarlo ni crear un import circular entre los dos archivos de acciones) y usan `createSupabaseServiceRoleClient()` para las escrituras. `revalidatePath("/usuarios")` al final de cada una, igual que el resto de acciones de esa página.

## UI

- `apps/web/components/access/roles-manager.tsx` (nuevo, client component), recibe roles + permisos + mapa rol→permisos actuales + `modules` + `currentUserId` + `currentUserRoleIds` (para el guard de auto-desbloqueo, calculado en el cliente antes de mostrar el checkbox de `is_super` como deshabilitado con tooltip explicativo — el server action lo re-valida igual, la UI solo evita el intento).
- Mismo kit visual que `AccessManager`: `Table`/lista simple, `Modal`, `Button`, `Input`, `Select`, `Badge`.
- Grupos de permisos colapsables (mismo patrón de secciones colapsables ya usado en `checklist-panel.tsx`/`project-board.tsx` para grupos de ítems) — evita una pantalla larga con 19 checkboxes sueltos.

## Fuera de alcance

- Editar o crear **permisos** nuevos (el catálogo de 19 permisos sigue siendo fijo por migración — este editor solo compone roles a partir de los permisos que ya existen).
- Roles por organización (el modelo es global hoy; si existiera una 2ª organización con necesidades distintas, es una extensión aparte).
- Historial/auditoría de quién cambió qué permiso a qué rol y cuándo (Audit Engine general del proyecto, todavía no implementado — ver `Docs/40-Technical/Security.md`).
- Vista de matriz completa (roles × permisos como spreadsheet) — se descartó en el diseño a favor de maestro-detalle (ver conversación previa).

## Dependencias

- `apps/web/components/access/access-manager.tsx` y `apps/web/lib/access-actions.ts` — patrón de referencia (modales, `requireSuperAdmin`, kit visual).
- `packages/ui/src/tabs.tsx` (`UnderlineTabs`) — sin uso real todavía, primer consumidor.
- `apps/web/components/proyectos/checklist-panel.tsx` — referencia de secciones colapsables.
- `Docs/40-Technical/Security.md` — el bypass `is_super` documentado ahí es el mismo que este editor puede tocar; cualquier cambio de comportamiento de `is_super` debe reflejarse también en ese doc.

## Resultado esperado

Yesid (o cualquier futuro Administrador de sistema) crea y ajusta roles desde `/usuarios` sin pedir una migración SQL, viendo los permisos en español entendible y agrupados, con protecciones para no borrar un rol en uso ni quitarse a sí mismo el acceso de superadmin por error.
