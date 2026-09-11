-- El checklist de work items se reemplaza por progreso de subtareas (barra +
-- contador en la sección "Subtareas" del detalle de tarea, basado en
-- work_item_statuses.is_done). Se descarta el contenido existente.
drop table public.checklist_items;
