-- Trigger functions fire via table triggers — they never need to be callable
-- through PostgREST RPC. Closes the advisor warning for the two we own.
revoke execute on function public.handle_job_stage_change() from anon, authenticated, public;
revoke execute on function public.log_job_stage_history() from anon, authenticated, public;
