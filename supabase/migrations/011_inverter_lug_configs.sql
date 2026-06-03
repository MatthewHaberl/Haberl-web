-- Create inverter_lug_configs table for reusable per-inverter lug specifications
-- Allows users to save lug configurations per inverter model and reuse them across projects
-- Reduces configuration time: once you set up a Sigenergy 6kW inverter correctly,
-- next time you use the same model, lug specs are pre-populated

CREATE TABLE IF NOT EXISTS public.inverter_lug_configs (
  id uuid primary key default uuid_generate_v4(),
  inverter_id uuid not null references public.equipment_catalog(id) on delete cascade,
  inverter_model text not null,
  output_configs jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null references public.user_profiles(id) on delete cascade,
  constraint inverter_lug_configs_unique unique (inverter_id, created_by)
);

COMMENT ON TABLE public.inverter_lug_configs IS
  'Reusable lug configurations per inverter model and user. Enables saving and re-applying connector/lug specs across projects.';

COMMENT ON COLUMN public.inverter_lug_configs.inverter_id IS
  'Foreign key to equipment_catalog inverter item.';

COMMENT ON COLUMN public.inverter_lug_configs.inverter_model IS
  'Human-readable inverter model name (e.g., "Sigenergy 6kW 48V"), denormalized for display.';

COMMENT ON COLUMN public.inverter_lug_configs.output_configs IS
  'JSON schema: { output1: { connectorType: "MC4|Bootlace", lugSize: "10mm|12mm", lugCount: 4, cableSpec: "H1Z2Z2 4mm²" }, output2: { ... }, ... }. Defines connector type, lug specification, and cable type for each inverter output.';

COMMENT ON COLUMN public.inverter_lug_configs.created_by IS
  'User who created this configuration (employee or admin). Allows per-user saved configs.';

CREATE INDEX IF NOT EXISTS inverter_lug_configs_inverter_id_idx
  ON public.inverter_lug_configs (inverter_id, created_by);

CREATE INDEX IF NOT EXISTS inverter_lug_configs_model_idx
  ON public.inverter_lug_configs (inverter_model);

ALTER TABLE public.inverter_lug_configs ENABLE ROW LEVEL SECURITY;

-- Allow users to read their own configs and configs from admins
CREATE POLICY "Users can read their own and admin inverter lug configs"
  ON public.inverter_lug_configs FOR SELECT
  USING (
    auth.uid() IS NOT NULL AND (
      created_by = auth.uid() OR
      public.current_role() = 'admin'
    )
  );

-- Allow users to create their own configs
CREATE POLICY "Users can create inverter lug configs"
  ON public.inverter_lug_configs FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL AND
    created_by = auth.uid()
  );

-- Allow users to update their own configs
CREATE POLICY "Users can update their own inverter lug configs"
  ON public.inverter_lug_configs FOR UPDATE
  USING (
    auth.uid() IS NOT NULL AND created_by = auth.uid()
  )
  WITH CHECK (
    auth.uid() IS NOT NULL AND created_by = auth.uid()
  );

-- Allow users to delete their own configs
CREATE POLICY "Users can delete their own inverter lug configs"
  ON public.inverter_lug_configs FOR DELETE
  USING (
    auth.uid() IS NOT NULL AND created_by = auth.uid()
  );

-- Admin can manage all configs
CREATE POLICY "Admin can manage all inverter lug configs"
  ON public.inverter_lug_configs FOR ALL
  USING (public.current_role() = 'admin')
  WITH CHECK (public.current_role() = 'admin');

-- Auto-update the updated_at timestamp on modify
CREATE OR REPLACE FUNCTION public.set_inverter_lug_configs_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  new.updated_at = now();
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS trg_inverter_lug_configs_updated_at ON public.inverter_lug_configs;
CREATE TRIGGER trg_inverter_lug_configs_updated_at
  BEFORE UPDATE ON public.inverter_lug_configs
  FOR EACH ROW
  EXECUTE FUNCTION public.set_inverter_lug_configs_updated_at();
