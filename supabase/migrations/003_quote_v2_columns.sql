-- ============================================================
-- Migration 003: Add v2 quote columns to existing quote_requests
-- Date: 2026-06-01
-- Context: quote_requests was created in 001_init.sql with v1 schema.
--          These columns support the simplified HTML quote redesign.
-- ============================================================

ALTER TABLE public.quote_requests
  ADD COLUMN IF NOT EXISTS deposit_items    text[]  DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS quote_number     text,
  ADD COLUMN IF NOT EXISTS quote_version    text    DEFAULT 'simplified',
  ADD COLUMN IF NOT EXISTS deposit_amount   integer,   -- cents
  ADD COLUMN IF NOT EXISTS total_amount     integer,   -- cents
  ADD COLUMN IF NOT EXISTS quote_html       text;      -- rendered HTML for customer-facing quote
