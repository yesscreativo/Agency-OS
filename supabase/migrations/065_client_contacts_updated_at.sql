-- Mantiene updated_at consistente al deshabilitar, reactivar o activar un
-- contacto. La tabla 064 creó la columna, pero no conectó el trigger común.

create trigger trg_client_contacts_updated_at
before update on public.client_contacts
for each row execute function public.set_updated_at();
