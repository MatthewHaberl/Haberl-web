-- Add roof design columns to quote_requests
-- Stores the confirmed panel layout from the Google Solar API design tool

ALTER TABLE quote_requests
  ADD COLUMN IF NOT EXISTS design_panel_count  integer,
  ADD COLUMN IF NOT EXISTS design_kwp          numeric(6,3),
  ADD COLUMN IF NOT EXISTS design_segments     jsonb,
  ADD COLUMN IF NOT EXISTS design_confirmed_at timestamptz;

COMMENT ON COLUMN quote_requests.design_panel_count  IS 'Number of panels confirmed via roof design tool';
COMMENT ON COLUMN quote_requests.design_kwp          IS 'Total system capacity in kWp from roof design';
COMMENT ON COLUMN quote_requests.design_segments     IS 'Roof segment summary: [{azimuth, pitch, panelCount}]';
COMMENT ON COLUMN quote_requests.design_confirmed_at IS 'When technician confirmed the roof design';
