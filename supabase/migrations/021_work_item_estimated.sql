-- Proyectos / Work Items — duración estimada por tarea.
-- Se guarda en MINUTOS (nullable = sin estimación). La UI la ingresa/renderiza en
-- horas y minutos (ej. "1h 30m"); ver formatDuration/parseDuration en @agency-os/domain.
-- Primera señal de "carga laboral" para las futuras recomendaciones de IA
-- (Docs/75-AI/Recommendations.md: balanceo de carga / responsable ideal).

alter table public.work_items
  add column estimated_minutes integer;
