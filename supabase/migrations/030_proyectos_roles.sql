-- Roles delegados del módulo Proyectos: permiten asignar acceso a Proyectos sin
-- ser Administrador de sistema, siguiendo el mismo patrón que kam.manage (010)
-- para CRM. Ver Docs/superpowers/specs/2026-09-04-proyectos-roles-modulo-design.md.

insert into public.permissions (code, name, description) values
  ('project.manage_access', 'Gestionar accesos de Proyectos', 'Asignar o revocar los roles propios del módulo Proyectos (Proyectos - Admin, Proyectos - Colaborador) sin ser Administrador de sistema.');

insert into public.roles (code, name, module_code) values
  ('proyectos_admin', 'Proyectos - Admin', 'proyectos'),
  ('proyectos_colaborador', 'Proyectos - Colaborador', 'proyectos');

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r, public.permissions p
where r.code = 'proyectos_admin' and p.code in ('project.view', 'project.manage', 'project.assign', 'project.manage_access');

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r, public.permissions p
where r.code = 'proyectos_colaborador' and p.code in ('project.view', 'project.assign');
