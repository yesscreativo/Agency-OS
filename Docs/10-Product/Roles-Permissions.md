# Roles y Permisos

## Roles
- Administrador
- Director
- RRHH
- KAM
- PM
- Líder
- Colaborador
- Cliente

## Roles de módulo (delegados)
Los roles con `module_code` dan acceso a un módulo específico y pueden asignarse
sin ser Administrador de sistema, a través de una página propia del módulo (no
`/usuarios`). Roles actuales:
- **CRM:** Administrador CRM (`crm_admin`), Creador (`crm_creator`), Visualizador (`crm_viewer`) — el rol en sí lo asigna el super admin desde `/usuarios`; `crm_admin` administra el catálogo de KAM/PM en `/crm/kams` vía el permiso `kam.manage`.
- **Proyectos:** Proyectos - Admin (`proyectos_admin`: `project.view`+`project.manage`+`project.assign`+`project.manage_access`) y Proyectos - Colaborador (`proyectos_colaborador`: `project.view`+`project.manage`+`project.assign`) — un `proyectos_admin` (o el super admin) asigna/revoca estos dos roles desde `/proyectos/usuarios`, vía el permiso `project.manage_access`. Hoy ambos roles pueden modificar tareas y proyectos por igual (no existe un permiso más angosto solo para "editar tareas"); la única diferencia es que Colaborador no puede delegar accesos. Pendiente: un editor de roles configurable (a definir) reemplazará este catálogo fijo.

### Patrón para delegar accesos de un módulo nuevo
1. Crear el/los rol(es) del módulo con `module_code = '<modulo>'`.
2. Crear un permiso `<modulo>.manage_access` y dárselo al rol que debe poder delegar.
3. Una página propia del módulo (ej. `/<modulo>/usuarios`) con sus propias server actions, gateadas por `hasPermission(user, "<modulo>.manage_access")`.
4. La action SIEMPRE revalida en servidor que el rol objetivo tenga `module_code = '<modulo>'` antes de asignar/revocar — nunca confiar solo en la UI.
5. `/usuarios` y `access-actions.ts` (invitar, eliminar cuentas, roles de sistema) no se tocan — siguen exclusivos del Administrador de sistema.

## Modelo
Los permisos controlan las acciones.
Los roles agrupan permisos.
Un usuario puede tener múltiples roles y permisos directos.
