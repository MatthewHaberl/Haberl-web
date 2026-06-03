-- Add SLD diagram component configuration storage to quote_requests
-- Stores detailed component specs: strings, combiner, inverter, cables, and layer visibility state
-- Used by the enhanced diagram editor to persist user configurations bidirectionally with quotes
-- All columns are JSONB and nullable for backward compatibility with existing quotes

ALTER TABLE public.quote_requests
  ADD COLUMN IF NOT EXISTS components_config jsonb,
  ADD COLUMN IF NOT EXISTS cable_details jsonb,
  ADD COLUMN IF NOT EXISTS diagram_state jsonb;

COMMENT ON COLUMN public.quote_requests.components_config IS
  'Detailed component configurations from SLD diagram: strings[], combiner, inverter, cables[]. Schema: { strings: [{ id, layout, mountingType, mountingLayout, earthingType, earthingLayout, connectorType, connectorQty }], combiner: { plastic, metal, requiresEarth, earthingSource }, inverter: { ioLayout, flexibleIO, outputConfigs[] }, cables: [{ id, sourceNode, targetNode, spec, circuitLayer, waypoints[], routeType, lugs, connectorType }] }';

COMMENT ON COLUMN public.quote_requests.cable_details IS
  'Extended cable and lug specification data. Schema: { cables: [{ id, spec, cableType, crossSection, conductors: {"+": bool, "−": bool, "L1": bool, "L2": bool, "L3": bool, "N": bool, "E": bool}, segments: [{ id, routeType, lengthM }], waypoints: [{x, y}], lugs: { count, size, conductorCount } }] }';

COMMENT ON COLUMN public.quote_requests.diagram_state IS
  'User interface state for SLD diagram: layer visibility, last edited timestamp. Schema: { layerVisibility: { live: bool, neutral: bool, earth: bool, communication: bool }, lastEditedAt: timestamp, editedBy: uuid }';
