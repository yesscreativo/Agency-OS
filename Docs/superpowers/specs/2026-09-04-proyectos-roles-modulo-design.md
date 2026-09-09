# Roles delegados del módulo Proyectos — Diseño

**Fecha:** 2026-09-04
**Estado:** nuevo spec
**Objetivo:** permitir que alguien sin ser Administrador de sistema (`is_super`) pueda gestionar el acceso al módulo Proyectos, y dejar sentado el patrón para que los próximos módulos hagan lo mismo.

## Contexto

Hoy, asignar cualquier rol a un usuario (`grantRole`/`revokeRole` en `apps/web/lib/access-actions.ts`, página `/usuarios`) es exclusivo del Administrador de sistema (`is_super`). Es una decisión deliberada: el comentario del propio código explica que un permiso puntual como `users.manage` no debe alcanzar para esto, porque un admin de un módulo (ej. CRM) no debe ganar con eso control global del sistema.

CRM ya resuelve un problema parecido para su propio catálogo (KAM/PM): el rol `crm_admin` tiene el permiso `kam.manage`, que le permite administrar `/crm/kams` sin tocar `/usuarios` ni el sistema de roles global. `/crm/usuarios` incluso redirige a `/crm/kams` — es una página de módulo separada, no una puerta al sistema de accesos general.

Proyectos no tiene ese equivalente: `roles.module_code` (columna que ya existe) no tiene ningún rol con `module_code='proyectos'`, y no existe forma de delegar el acceso al módulo sin pasar por super admin. Los roles generales que hoy tocan `project.*` (`administrador`, `director`) no tienen `module_code` y hoy no están asignados a ningún usuario real.

## Objetivo

1. Crear dos roles nuevos, propios de Proyectos, delegables sin ser super admin.
2. Una página nueva (`/proyectos/usuarios`) donde alguien con el permiso adecuado asigna/revoca esos roles, sin abrir ninguna puerta al resto del sistema de accesos.
3. Documentar el patrón (permiso `<módulo>.manage_access` + roles con `module_code='<módulo>'` + página propia del módulo) en la fuente de verdad de roles, para que el próximo módulo lo replique igual.

## Funcionalidades

### 1. Roles nuevos de Proyectos (MVP)

- **`proyectos_admin`** ("Proyectos - Admin"), `module_code='proyectos'`. Permisos: `project.view`, `project.manage`, `project.assign`, `project.manage_access` (nuevo).
- **`proyectos_colaborador`** ("Proyectos - Colaborador"), `module_code='proyectos'`. Permisos: `project.view`, `project.assign`. Sin `project.manage_access` — no puede tocar accesos de otros.

No se modifican los roles generales existentes (`administrador`, `director`, `colaborador`, etc.); hoy no tienen usuarios asignados y quedan fuera de este cambio.

### 2. Permiso nuevo `project.manage_access`

Habilita gestionar accesos **solo** de Proyectos. Análogo a `kam.manage` en CRM, pero para roles en vez de un catálogo. Lo tiene `proyectos_admin`; el Administrador de sistema siempre pasa cualquier permiso (`hasPermission` ya bypassea con `isSuper`), así que no hace falta asignárselo aparte.

### 3. Página `/proyectos/usuarios`

- Acceso: requiere `hasPermission(user, "project.manage_access")` (super admin o `proyectos_admin`). Sin el permiso, igual que el resto de Proyectos hoy: panel de "no tienes acceso", no redirect.
- Lista los usuarios de la organización con su rol de Proyectos actual (`proyectos_admin`, `proyectos_colaborador` o "Sin acceso a Proyectos").
- Permite asignar uno de los dos roles de Proyectos a un usuario, o revocárselo.
- **No** permite invitar usuarios nuevos ni eliminar cuentas — eso sigue siendo exclusivo de `/usuarios` (super admin). Esta página solo asigna/revoca ROL, sobre usuarios que ya existen en la organización.
- El único rol de Proyectos que un `proyectos_admin` puede asignar es otro rol de Proyectos (`proyectos_admin` o `proyectos_colaborador`) — nunca `administrador` ni roles de otros módulos.

### 4. Server actions (`apps/web/lib/proyectos-access-actions.ts`)

- `grantProjectRole(userId: string, roleId: string): Promise<AccessActionResult>`
- `revokeProjectRole(userRoleId: string): Promise<AccessActionResult>`
- `listAssignableProjectRoles(): Promise<{ id: string; code: string; name: string }[]>` — solo roles con `module_code='proyectos'`.

Reutilizan `grantUserRole`/`revokeUserRole`/`listOrgUsers` de `@agency-os/db` (sin repos nuevos). Guarda de permiso: `hasPermission(user, "project.manage_access")`. **Defensa en profundidad:** antes de otorgar, la action vuelve a consultar el rol objetivo en servidor y rechaza si `module_code !== 'proyectos'` — así ni un bug de UI ni una llamada manual a la action pueden usarla para tocar el rol Administrador o roles de otro módulo.

### 5. Entrada en el sidebar de Proyectos

Un link nuevo ("Accesos" o similar) en `projects-sidebar.tsx`, visible solo si `hasPermission(user, "project.manage_access")`.

## Reglas

- `project.manage_access` NUNCA se comprueba junto con `users.manage` ni reemplaza la guarda de `/usuarios` — son puertas completamente separadas.
- Las server actions de esta página nunca tocan `auth.users` (no invitan, no eliminan cuentas) — solo `user_roles`, y solo para roles `module_code='proyectos'`.
- `/usuarios` y `access-actions.ts` quedan sin cambios.
- El patrón (permiso `<módulo>.manage_access` + roles `module_code='<módulo>'` + página propia del módulo, sin tocar `/usuarios`) se documenta en `Docs/10-Product/Roles-Permissions.md` (fuente de verdad de roles) para que el próximo módulo lo copie.

## Fuera de alcance

- Sección de "datos del equipo" / reportes para `proyectos_admin` (mencionada por el usuario como algo que ese rol debería ver más adelante) — no existe todavía en ningún módulo; queda para un spec futuro.
- Un mecanismo genérico multi-módulo (tabla `module_role_admins` o similar) — se evalúa si un segundo módulo lo necesita; por ahora el patrón se replica manualmente módulo por módulo (documentado en Roles-Permissions.md).
- Editor de roles/permisos (crear roles nuevos o cambiar qué permisos trae cada uno desde la UI) — el catálogo de roles de Proyectos es fijo (los dos de arriba); ampliarlo requiere una migración, igual que hoy.
- Invitar usuarios nuevos o eliminar cuentas desde Proyectos — sigue en `/usuarios`.

## Modelo de datos (migración de datos, sin tablas nuevas)

```sql
insert into public.permissions (code, name, description) values
  ('project.manage_access', 'Gestionar accesos de Proyectos', 'Asignar o revocar los roles propios del módulo Proyectos (proyectos_admin, proyectos_colaborador) sin ser Administrador de sistema.');

insert into public.roles (code, name, module_code) values
  ('proyectos_admin', 'Proyectos - Admin', 'proyectos'),
  ('proyectos_colaborador', 'Proyectos - Colaborador', 'proyectos');

-- proyectos_admin: project.view + project.manage + project.assign + project.manage_access
-- proyectos_colaborador: project.view + project.assign
```

## API / acciones

- `grantProjectRole(userId, roleId)` — valida `project.manage_access`, valida `module_code='proyectos'` del rol, llama `grantUserRole`.
- `revokeProjectRole(userRoleId)` — valida `project.manage_access`, valida que el `user_role` a revocar apunte a un rol `module_code='proyectos'`, llama `revokeUserRole`.
- `listAssignableProjectRoles()` — roles con `module_code='proyectos'`.

## Dependencias

- `Docs/10-Product/Roles-Permissions.md` (fuente de verdad de roles — se actualiza como parte de este trabajo).
- `apps/web/lib/access-actions.ts` (patrón de referencia, sin modificar).
- `supabase/migrations/010_kam_permission_and_provisioning.sql` (precedente `kam.manage`/`crm_admin`).

## Resultado esperado

Alguien con el rol "Proyectos - Admin" puede dar/quitar acceso a Proyectos a otros usuarios de su organización sin depender de un super admin, sin que eso le abra ninguna puerta al resto del sistema. El patrón queda documentado para repetirse en el próximo módulo que lo necesite.
