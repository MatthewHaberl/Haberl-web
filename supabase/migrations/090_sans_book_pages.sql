-- Split-view "read it in the book" support for the SANS library.
--
-- sans_clauses gains the clause's physical location in the licensed Ed 3.2 PDF:
--   doc_page — 1-based page index in the PDF (printed page + 4)
--   doc_y0/doc_y1 — the clause's vertical band on that page, as fractions of
--   page height, so the UI can highlight the region on the rendered page image.
--
-- Page images live in a PRIVATE storage bucket 'sans-pages' readable by admin
-- only (verbatim SABS content — same copyright posture as sans_clause_bodies).

alter table public.sans_clauses
  add column doc_page int,
  add column doc_y0 real,
  add column doc_y1 real;

insert into storage.buckets (id, name, public)
values ('sans-pages', 'sans-pages', false)
on conflict (id) do nothing;

create policy "sans_pages_admin_select" on storage.objects
  for select using (bucket_id = 'sans-pages' and public.current_role() = 'admin');

create policy "sans_pages_admin_insert" on storage.objects
  for insert with check (bucket_id = 'sans-pages' and public.current_role() = 'admin');
