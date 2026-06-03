/**
 * SLD Diagram Component Configuration Types
 * Defines all the detailed component specifications stored in the diagram and synced to quotes
 */

/** Mounting layout configuration for solar arrays */
export interface MountingLayout {
  rows: number;
  columns: number;
  orientation: 'portrait' | 'landscape';
}

/** Earthing configuration for strings and combiners */
export interface EarthingConfig {
  type: 'none' | 'metal_rod' | 'rail_system' | 'concrete_foundation';
  method: 'integrated' | 'external_spike' | 'rail_system' | 'distributed';
  railDistribution?: 'single_point' | 'distributed_to_feet';
  earthPointCount?: number;
}

/** Mounting structure estimate breakdown */
export interface MountingStructureItem {
  component: string; // e.g., "L-feet", "rail", "clamp", "ballast"
  quantity: number;
  unit: string; // e.g., "pcs", "m", "kg"
  description?: string;
  cost?: number; // cents
}

/** Connector configuration for strings and outputs */
export interface ConnectorConfig {
  type: 'MC4' | 'bootlace' | 'other';
  quantity: number;
  rating?: string; // e.g., "125A", "63A"
  installedCount?: number; // actual installed, may differ from required
}

/** Solar string configuration */
export interface StringConfig {
  id: string; // node ID in diagram
  connectorType: 'MC4' | 'bootlace' | 'other';
  connectorQty: number;
  layout: MountingLayout;
  mountingType: 'rail_system' | 'ground_mount' | 'ballasted' | 'other';
  earthingRequired: boolean;
  earthingType: EarthingConfig['type'];
  earthingMethod: EarthingConfig['method'];
  earthPointCount?: number; // for rail systems: suggested or manual count
}

/** DC Combiner box configuration */
export interface CombinerConfig {
  plastic: boolean;
  metal: boolean;
  requiresEarth: boolean;
  earthingSource: 'integrated' | 'external_spike' | 'rail_system';
  incomingConnectors?: Array<{
    stringId: string;
    connectorType: string;
    quantity: number;
  }>;
}

/** Lug specification (determined by cable gauge) */
export interface LugSpec {
  count: number; // number of lugs (1mm² = 1 lug)
  size: string; // e.g., "10mm", "12mm"
  material?: 'copper' | 'aluminum';
  conductorCount?: number; // for multi-conductor cables
}

/** Output connector configuration for inverter */
export interface OutputConnectorConfig {
  outputId: string;
  connectorType: 'MC4' | 'bootlace' | 'other';
  cableSpec: string; // e.g., "CU 10mm²"
  lugs: LugSpec;
  earthConductor: 'combined' | 'separate';
  separateEarthGauge?: string; // if separate, e.g., "10mm²"
}

/** Inverter I/O configuration */
export interface InverterConfig {
  ioLayout: 'traditional' | 'advanced'; // traditional = all inputs top; advanced = left/bottom/right
  inputCount: number;
  outputCount: number;
  flexibleIO: boolean; // some outputs can be inputs
  outputConfigs: OutputConnectorConfig[];
  pvInputType?: 'MC4' | 'bootlace' | 'other';
  pvInputQty?: number;
}

/** Communication edge configuration (Modbus, CAN, etc.) */
export interface CommunicationEdgeConfig {
  id: string; // edge ID
  sourceDevice: string; // node ID
  targetDevice: string; // node ID
  sourceProtocol?: string[]; // e.g., ["Modbus", "CAN"]
  targetProtocol?: string[]; // e.g., ["Modbus"]
  compatible: boolean;
  overrideProtocolMismatch: boolean;
}

/** Cable segment routing detail */
export interface CableSegment {
  id: string;
  routeType: string; // e.g., "in_conduit_surface", "in_wall", "under_floor", "aerial"
  lengthM: number;
  safetyDistance?: number; // mm clearance from other cables
}

/** Cable edge configuration with extended detail */
export interface CableEdgeConfig {
  id: string;
  sourceNode: string;
  targetNode: string;
  spec: string; // e.g., "H1Z2Z2 4mm²"
  cableType?: string; // e.g., "H1Z2Z2", "CU"
  crossSection?: string; // e.g., "4mm²"
  circuitLayer: 'live' | 'neutral' | 'earth' | 'communication';
  conductors?: Record<string, boolean>; // {"+": true, "−": true, "L1": true, "N": true, "E": true}
  segments?: CableSegment[];
  waypoints?: Array<{ x: number; y: number }>; // for bendable cable routing
  routingType?: 'smoothstep' | 'bezier' | 'straight';
  lugs?: LugSpec;
  connectorType?: string;
}

/** Saved inverter lug configuration (stored in DB and reused) */
export interface InverterLugConfig {
  id: string;
  inverterId: string;
  inverterModel: string;
  outputConfigs: Record<string, OutputConnectorConfig>;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

/** Layer visibility state for diagram */
export interface DiagramLayerState {
  live: boolean;
  neutral: boolean;
  earth: boolean;
  communication: boolean;
}

/** Complete diagram state (UI + data) */
export interface DiagramState {
  layerVisibility: DiagramLayerState;
  lastEditedAt?: string;
  editedBy?: string;
  selectedNodeId?: string;
  selectedEdgeId?: string;
}

/** Complete component configuration structure stored in quote_json */
export interface ComponentsConfigData {
  strings: StringConfig[];
  combiner?: CombinerConfig;
  inverter?: InverterConfig;
  cables: CableEdgeConfig[];
  communications?: CommunicationEdgeConfig[];
}

/** Extended cable details stored separately */
export interface CableDetailsData {
  cables: CableEdgeConfig[];
}
