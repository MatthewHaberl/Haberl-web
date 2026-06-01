-- ============================================================
-- Performance indexes for common query patterns
-- ============================================================

-- sites queried by customer
create index if not exists idx_sites_customer_id on public.sites(customer_id);

-- orders queried by customer
create index if not exists idx_orders_customer_id on public.orders(customer_id);

-- order items fetched by order
create index if not exists idx_order_items_order_id on public.order_items(order_id);

-- jobs queried by assigned worker and filtered by status
create index if not exists idx_jobs_assigned_to on public.jobs(assigned_to);
create index if not exists idx_jobs_status on public.jobs(status);

-- job tasks fetched by job
create index if not exists idx_job_tasks_job_id on public.job_tasks(job_id);

-- documents fetched by site
create index if not exists idx_documents_site_id on public.documents(site_id);

-- service records fetched by site
create index if not exists idx_service_records_site_id on public.service_records(site_id);

-- quotes queried by customer
create index if not exists idx_quotes_customer_id on public.quotes(customer_id);
