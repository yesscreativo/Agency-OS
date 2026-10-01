-- 063_fix_leave_requests_manager_update_check.sql
-- leave_requests_update_manager (061) no tenía WITH CHECK explícito, así que
-- Postgres reutiliza el USING ("manager_status = 'pending'") como check de la
-- fila YA actualizada. Como decideManagerAction cambia manager_status a
-- approved/rejected, la fila resultante siempre violaba ese check implícito
-- y el UPDATE fallaba (bug reportado en QA: "Aprobar como jefe no deja").
drop policy if exists leave_requests_update_manager on public.leave_requests;

create policy leave_requests_update_manager on public.leave_requests
  for update using (
    organization_id in (select public.current_user_organization_ids())
    and manager_user_id = auth.uid()
    and manager_status = 'pending'
  )
  with check (
    organization_id in (select public.current_user_organization_ids())
    and manager_user_id = auth.uid()
  );
