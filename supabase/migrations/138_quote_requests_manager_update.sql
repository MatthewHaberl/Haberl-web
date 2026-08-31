-- Managers can change a quote, not just read it.
--
-- Every quote API route already accepts ['manager','admin'] — generate, send,
-- credits, RFQs, supplier quotes — but the only UPDATE policy on quote_requests
-- was admin-only. The builder saves the design, the scope, the status and the
-- send settings straight from the browser client, so a manager's saves were
-- being dropped by RLS with no error and no rows: the write simply vanished.
--
-- One policy covering both roles replaces the admin-only one; WITH CHECK mirrors
-- USING so a manager cannot edit a row into a state they could not have read.

drop policy if exists "Admin can update quote requests" on quote_requests;

create policy "Managers can update quote requests"
  on quote_requests for update
  using ("current_role"() = any (array['manager'::user_role, 'admin'::user_role]))
  with check ("current_role"() = any (array['manager'::user_role, 'admin'::user_role]));
