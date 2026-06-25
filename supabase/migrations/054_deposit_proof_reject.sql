-- 054_deposit_proof_reject.sql
-- Decline an uploaded proof of payment.
--
-- A manager opens a POP that is wrong (amount mismatch, missing/incorrect
-- reference, unreadable file, or funds not yet reflected) and bounces it back
-- to the customer for a fresh upload. The reject route clears the live proof
-- pointer (deposit_proof_url / deposit_proof_uploaded_at) so the customer's
-- quote page reverts to the upload prompt and the job drops off the "deposits
-- to confirm" daily briefing; the declined file path is retained here as
-- evidence, alongside who declined it, when, and why.

alter table public.jobs
  add column if not exists deposit_proof_rejected_at timestamptz,
  add column if not exists deposit_proof_rejected_by uuid references public.user_profiles(id),
  add column if not exists deposit_proof_rejected_reason text,
  add column if not exists deposit_proof_rejected_url text;
