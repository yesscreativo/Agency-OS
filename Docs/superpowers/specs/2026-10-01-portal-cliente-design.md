# Portal Cliente (login) — Diseño

**Fecha:** 2026-10-01
**Estado:** nuevo spec
**Objetivo:** construir la base de identidad y acceso para que contactos de un cliente (varias personas por cliente, cada una con su propia cuenta) inicien sesión en un área propia de Agency OS, aislada por completo del RBAC interno de Laburu. No incluye ninguna funcionalidad visible todavía — es la infraestructura que van a usar **Tickets** (primera funcionalidad encima de esta base) y, más adelante, **Parrillas**.

## Contexto

Surgió al analizar el requerimiento de Parrillas (calendario de contenido mensual para redes, hoy un archivo de Slides que se comparte tal cual con el cliente): compartir contenido para que el cliente apruebe o comente pieza por pieza requiere que el cliente tenga una sesión identificada, no un link anónimo como el que ya usan cotizaciones. Parrillas todavía no tiene spec propio — queda para después de esta base. Al mismo tiempo, el módulo de Tickets (planeado, sin construir) también necesita que el cliente entre con su cuenta — y como los dos dependen de lo mismo, se decidió construirlo una sola vez, aparte, antes de ambos.

Hoy `clients` (CRM) es solo una fila con un email/responsable de contacto — no existe ningún concepto de "usuario de cliente" ni login para ellos. El sistema interno (`users`/`people`/`user_roles`/`roles`) está diseñado exclusivamente para colaboradores de Laburu, con RLS que asume `organization_id` = la propia agencia.

Hallazgo clave que valida separar esto del sistema interno sin riesgo: ya existe un trigger (`handle_new_auth_user`, `010_kam_permission_and_provisioning.sql`) que auto-provisiona `people`/`users` al crearse una cuenta de Supabase Auth, pero **solo si el email es `@laburuagencia.com`**. Para cualquier otro dominio (todos los contactos de cliente) el trigger no hace nada — invitar a un contacto de cliente nunca crea una fila interna fantasma.

## Funcionalidades

### 1. Invitar contacto de cliente (lado Laburu)

Desde la ficha de cliente ya existente (`/crm/clientes/[id]`), nueva pestaña **"Portal"**:
- Lista de contactos del cliente: nombre, email, estado (Invitado / Activo / Deshabilitado).
- **"+ Invitar contacto"**: nombre + email → crea la cuenta de Supabase Auth (`auth.admin.inviteUserByEmail`, mismo mecanismo ya usado para invitar colaboradores internos) + una fila en `client_contacts` con `status = 'invited'`. Supabase envía el email con el link de activación.
- **Deshabilitar**: pone `status = 'disabled'` — corta el acceso sin borrar la cuenta (reversible). Borrar el contacto por completo no es parte de v1.
- Requiere el permiso `client.manage` que ya gestiona clientes — sin permiso nuevo.

### 2. Activación y login (lado cliente)

- `/portal/activar`: el contacto llega acá desde el link de invitación de Supabase, define su contraseña. Al confirmar, un server action actualiza su propia fila (`status = 'active'`, `activated_at = now()`).
- `/portal/login`: email + contraseña, independiente de `/login` (el de colaboradores internos).
- `/portal/recuperar`: reset de contraseña, reutiliza el flujo estándar de Supabase Auth.
- Si una sesión resuelve a un usuario interno (existe en `users`) en vez de `client_contacts`, `/portal/login` lo rechaza con un mensaje claro: "Esta cuenta es de uso interno — ingresa por /login". Mismo chequeo a la inversa en `(app)`: una sesión que resuelve a `client_contacts` es redirigida a `/portal`, nunca ve el shell interno.

### 3. Shell del portal (v1, vacío)

Tras loguear, una página mínima ("Hola, {nombre} — {cliente}") sin contenido funcional todavía. Sirve para probar el acceso de punta a punta antes de que Tickets (siguiente spec) agregue contenido real ahí.

## Reglas

- Un email de Supabase Auth es **o** colaborador interno **o** contacto de cliente — nunca ambos. Invitar un contacto valida que el email no sea `@laburuagencia.com` ni pertenezca ya a un `people`/`users` interno (error claro si choca); el trigger existente además garantiza que un email externo nunca crea una fila interna fantasma, aunque alguien invitara mal.
- Un contacto pertenece a **un solo cliente** (v1). Si una misma persona necesitara ver dos clientes, es un caso no soportado todavía — se resuelve si aparece en la práctica.
- Nadie se autoregistra: toda cuenta de cliente nace de una invitación explícita desde `/crm/clientes/[id]`.
- Deshabilitar es la única baja de acceso en v1 (reversible); no hay borrado de cuenta.
- El shell y las rutas de `/portal` no comparten layout, nav ni componentes de `(app)` — son un árbol de rutas aparte, aunque vivan en el mismo despliegue de Next.js (sin subdominio propio por ahora).

## Modelo de datos

```sql
create type public.client_contact_status as enum ('invited', 'active', 'disabled');

create table public.client_contacts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null unique,
  status public.client_contact_status not null default 'invited',
  invited_by uuid references public.users(id),
  invited_at timestamptz not null default now(),
  activated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index client_contacts_client_idx on public.client_contacts(client_id);
```

### RLS

- `client_contacts` select/insert/update/delete para Laburu: cualquiera con `client.manage` sobre clientes de su organización.
- `client_contacts` select para el propio contacto: `auth_user_id = auth.uid()` (puede ver, no editar, su propia fila — la activación pasa por un server action que usa el cliente service-role para marcar `status = 'active'`, no por un update directo vía RLS del propio contacto).
- Función helper, análoga a `current_user_organization_ids()`:

```sql
create or replace function public.current_client_contact_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select client_id from public.client_contacts
  where auth_user_id = auth.uid() and status = 'active';
$$;
```

Devuelve `null` si el contacto está deshabilitado o no existe — así cualquier policy futura de Tickets/Parrillas que filtre por `client_id = public.current_client_contact_id()` deja de dar acceso automáticamente al deshabilitar un contacto, sin lógica adicional.

## Rutas

- `/portal/login`, `/portal/activar`, `/portal/recuperar` — públicas (sin sesión).
- `/portal` — shell autenticado, vacío en v1.
- `/crm/clientes/[id]` — nueva pestaña "Portal" (gestión de contactos, lado Laburu).

## Fuera de alcance

- Cualquier contenido real dentro de `/portal` (Tickets, Parrillas) — specs aparte, construidos encima de esta base.
- Un contacto con acceso a más de un cliente.
- Autoregistro o login social (Google, etc.) del lado del cliente.
- Notificaciones in-app para el cliente (la campana actual es solo interna).
- Borrado definitivo de un contacto (solo deshabilitar).
- Subdominio propio para el portal (`portal.laburuagencia.com`) — vive en el mismo dominio, bajo `/portal`.
