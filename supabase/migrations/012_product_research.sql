-- Product research: stores AI-fetched datasheets, photos, SLDs, manuals, etc.
-- linked to equipment_catalog items for admin review and approval.
-- Admin clicks "Research" on a catalog item → Anthropic web-search agent finds resources
-- → items land here as 'pending' → admin accepts/rejects each one.

create table if not exists public.product_research (
  id uuid primary key default uuid_generate_v4(),
  catalog_id uuid not null references public.equipment_catalog(id) on delete cascade,
  resource_type text not null check (resource_type in (
    'description', 'datasheet', 'photo', 'sld', 'model_3d', 'manual', 'compatibility', 'spec_table'
  )),
  title text not null,
  url text,
  content text,
  thumbnail_url text,
  file_type text,
  source_domain text,
  confidence smallint not null default 80 check (confidence between 0 and 100),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  accepted_at timestamptz,
  rejected_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists product_research_catalog_status_idx
  on public.product_research (catalog_id, status, resource_type);

alter table public.product_research enable row level security;

create policy "Authenticated users can read product research"
  on public.product_research for select
  using (auth.uid() is not null);

create policy "Admin can manage product research"
  on public.product_research for all
  using (public.current_role() = 'admin')
  with check (public.current_role() = 'admin');

-- Extend equipment_catalog with shop-facing fields populated from accepted research
alter table public.equipment_catalog
  add column if not exists shop_description text,
  add column if not exists primary_image_url text,
  add column if not exists datasheet_url text,
  add column if not exists research_ran_at timestamptz;
