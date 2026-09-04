-- Proyectos - Colaborador puede modificar tareas (editar campos, crear/borrar
-- proyectos y gestionar estados, ya que hoy no existe un permiso más angosto
-- solo para "editar tareas" — ver Docs/superpowers/specs/2026-09-04-proyectos-roles-modulo-design.md).
-- Sigue sin project.manage_access: no puede delegar accesos de Proyectos a otros.
-- Pendiente: un editor de roles configurable (brainstorm aparte) reemplazará
-- este catálogo fijo de dos roles.

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r, public.permissions p
where r.code = 'proyectos_colaborador' and p.code = 'project.manage'
on conflict do nothing;
