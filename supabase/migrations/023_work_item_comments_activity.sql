-- ClickUp Parity Fase B — Slice 1: comentarios + activity timeline + menciones.
-- Dos tablas hijas de work_items (mismo patrón que 019_work_item_attachments):
-- cada tabla lleva su propio organization_id y la RLS se resuelve con
-- current_user_organization_ids(); la pertenencia del work_item padre a la org se
-- re-verifica en la server action (assertWorkItemInOrg), no en la policy.

-- work_item_comments -------------------------------------------------------
-- Comentarios con hilo simple (1 nivel: reply a un comentario raíz). Comentar
-- NO requiere project.manage: cualquier miembro de la org que ve el proyecto
-- puede comentar como sí mismo; solo el autor edita/borra lo suyo.
create table public.work_item_comments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  work_item_id uuid not null references public.work_items(id) on delete cascade,
  parent_comment_id uuid references public.work_item_comments(id) on delete cascade,
  author_user_id uuid not null references public.users(id),
  body text not null,
  visibility text not null default 'internal',   -- 'internal' | 'client_visible' (forward-compat; sin UI aún)
  mentioned_user_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  edited_at timestamptz,
  deleted_at timestamptz
);
create index work_item_comments_item_idx
  on public.work_item_comments(work_item_id, created_at)
  where deleted_at is null;

alter table public.work_item_comments enable row level security;

create policy work_item_comments_select on public.work_item_comments
  for select using (organization_id in (select public.current_user_organization_ids()));

create policy work_item_comments_insert on public.work_item_comments
  for insert with check (
    organization_id in (select public.current_user_organization_ids())
    and author_user_id = auth.uid()
  );

create policy work_item_comments_update on public.work_item_comments
  for update using (
    organization_id in (select public.current_user_organization_ids())
    and author_user_id = auth.uid()
  )
  with check (
    organization_id in (select public.current_user_organization_ids())
    and author_user_id = auth.uid()
  );

create policy work_item_comments_delete on public.work_item_comments
  for delete using (
    organization_id in (select public.current_user_organization_ids())
    and author_user_id = auth.uid()
  );

-- work_item_activity -------------------------------------------------------
-- Timeline persistente y append-only: lo escriben las server actions al mutar
-- el work item (crear, editar título/descr., cambiar estado/prioridad, asignar)
-- y al comentar. No es solo auditoría técnica: es lectura operativa.
create table public.work_item_activity (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  work_item_id uuid not null references public.work_items(id) on delete cascade,
  actor_user_id uuid references public.users(id),
  event_type text not null,   -- created|title_edited|description_edited|status_changed|priority_changed|assignee_added|assignee_removed|comment_created|comment_reply
  payload jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index work_item_activity_item_idx
  on public.work_item_activity(work_item_id, created_at desc);

alter table public.work_item_activity enable row level security;

create policy work_item_activity_select on public.work_item_activity
  for select using (organization_id in (select public.current_user_organization_ids()));

-- Append-only: solo insert, y siempre como el propio actor. Sin update/delete.
create policy work_item_activity_insert on public.work_item_activity
  for insert with check (
    organization_id in (select public.current_user_organization_ids())
    and actor_user_id = auth.uid()
  );

-- notifications: destino work item (menciones) ------------------------------
-- 014_notifications solo enlazaba a cotizaciones (quote_id). Para menciones en
-- work items añadimos el FK y una ruta pre-construida (link): la campana enruta
-- por short-id, resolverlo al crear evita reconstruirlo en el cliente.
alter table public.notifications
  add column work_item_id uuid references public.work_items(id) on delete cascade;
alter table public.notifications
  add column link text;
