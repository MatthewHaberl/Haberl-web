/**
 * Lug and Mounting Structure Calculator
 * Calculates required lug specifications based on cable gauge and
 * estimates mounting structure components based on panel count and layout
 */

import type { LugSpec, MountingLayout, MountingStructureItem } from '@/types/sld-components';

/**
 * Parse cable specification string and return lug specifications
 * Rule: 1mm² cross-section = 1 lug of standard size
 * Size determined by industry standards: 4-10mm² → 10mm lugs; 16-25mm² → 10-12mm lugs; 35mm² → 12mm
 *
 * @param cableSpec e.g., "H1Z2Z2 4mm²", "CU 16mm²", "CU 25mm²"
 * @returns LugSpec with count and size
 */
export function getLugSpecs(cableSpec: string): LugSpec {
  // Parse the cross-section from cable spec
  const match = cableSpec.match(/(\d+)\s*(?:mm²|mm2)/);
  if (!match) {
    // Default if parsing fails
    return { count: 4, size: '10mm', material: 'copper' };
  }

  const crossSection = parseInt(match[1], 10);

  // Lug count = cross-section (1mm² = 1 lug)
  const count = crossSection;

  // Lug size by industry standard
  let size = '10mm';
  if (crossSection <= 10) {
    size = '10mm';
  } else if (crossSection <= 25) {
    size = '10mm'; // or 12mm, user choice - default to 10mm
  } else {
    size = '12mm';
  }

  return {
    count,
    size,
    material: 'copper',
    conductorCount: 1, // single conductor by default
  };
}

/**
 * Estimate mounting structure components based on panel count and layout
 * Returns array of components needed: feet, rails, clamps, etc.
 *
 * @param panelCount Total number of panels
 * @param layout Mounting layout (rows, columns, orientation)
 * @param mountType Type of mounting system
 * @returns Array of structure items with quantities
 */
export function estimateMountingStructure(
  panelCount: number,
  layout: MountingLayout,
  mountType: 'rail_system' | 'ground_mount' | 'ballasted' = 'rail_system',
): MountingStructureItem[] {
  const items: MountingStructureItem[] = [];

  if (mountType === 'rail_system') {
    // Rail system: horizontal rails with L-feet at corners and middle

    // L-feet: typically 4 feet for standard roof mounting (one at each corner)
    // For larger systems, add intermediate feet every 1.5m of rail
    const footCount = Math.max(4, Math.ceil((layout.columns * layout.rows) / 7) * 2);
    items.push({
      component: 'L-feet',
      quantity: footCount,
      unit: 'pcs',
      description: `Aluminum L-feet 50-80mm for rail mounting (${footCount}×)`,
    });

    // Rails: estimate based on columns (panels side-by-side in landscape)
    const panelsPerRailLine = layout.columns;
    const railLengthM = panelsPerRailLine * 1.7; // ~1.7m per panel width + spacing
    const railCount = layout.rows;
    items.push({
      component: 'rail_system',
      quantity: railCount,
      unit: 'm',
      description: `Aluminum rail ${railLengthM.toFixed(1)}m × ${railCount} rows`,
    });

    // Clamps: typically 2 per panel (top and bottom of each column)
    // Plus extra for rail connections
    const clampCount = panelCount * 2 + footCount + railCount * 2;
    items.push({
      component: 'clamp',
      quantity: clampCount,
      unit: 'pcs',
      description: `Mid-clamps and end-clamps for rails (${clampCount}×)`,
    });

    // Flashings and seals (per foot)
    items.push({
      component: 'flashing_kit',
      quantity: footCount,
      unit: 'set',
      description: `Roof flashings and seals (1 per foot)`,
    });
  } else if (mountType === 'ground_mount') {
    // Ground mount: concrete footings + stand structure

    // Concrete footings: typically 1 per foot (4 standard)
    const footCount = 4;
    items.push({
      component: 'concrete_footing',
      quantity: footCount,
      unit: 'pcs',
      description: `Concrete footings 400×400×400mm (${footCount}×)`,
    });

    // Steel frame: 4 posts + horizontal/diagonal bracing
    items.push({
      component: 'steel_frame',
      quantity: 1,
      unit: 'set',
      description: `Steel frame assembly for ${panelCount} panels`,
    });

    // Clamps for ground mount structure
    const clampCount = panelCount * 2 + 16; // 2 per panel + structural clamps
    items.push({
      component: 'clamp',
      quantity: clampCount,
      unit: 'pcs',
      description: `Structural clamps (${clampCount}×)`,
    });
  } else if (mountType === 'ballasted') {
    // Ballasted (flat roof or ground): no penetrations

    // Ballast blocks: ~50kg per kW (rough estimate)
    // Assume ~0.3-0.4 kW per panel (standard ~400W panels)
    const systemKwEstimate = (panelCount * 0.4) / 1000;
    const ballastWeightKg = Math.ceil(systemKwEstimate * 50);

    items.push({
      component: 'ballast_block',
      quantity: ballastWeightKg,
      unit: 'kg',
      description: `Concrete ballast blocks (distributed, ${ballastWeightKg}kg total)`,
    });

    // Clamps for panel mounting on ballast frame
    const clampCount = panelCount * 2;
    items.push({
      component: 'clamp',
      quantity: clampCount,
      unit: 'pcs',
      description: `Panel clamps on ballast frame (${clampCount}×)`,
    });
  }

  return items;
}

/**
 * Calculate earthing structure components based on earth point count and method
 *
 * @param panelCount Total panels (used to suggest earth point distribution)
 * @param earthPointCount Number of earth points (or null for auto-suggestion)
 * @returns Earth point count (suggested or confirmed)
 */
export function calculateOptimalEarthPoints(
  panelCount: number,
  earthPointCount?: number,
): number {
  // If user provided a count, use it
  if (earthPointCount !== undefined) {
    return earthPointCount;
  }

  // Auto-suggest: ~1 earth point per 2 panels
  // 7 panels → 4 points; 8-9 panels → 4 points; 10-11 panels → 5 points
  return Math.ceil(panelCount / 2);
}

/**
 * Calculate earthing components needed
 *
 * @param earthPointCount Number of earth points to install
 * @returns Array of earthing structure items
 */
export function estimateEarthingStructure(earthPointCount: number): MountingStructureItem[] {
  const items: MountingStructureItem[] = [];

  // Earth rods: 1.5m Grade A M16 per point
  items.push({
    component: 'earth_rod',
    quantity: earthPointCount,
    unit: 'pcs',
    description: `Earth rods 1.5m Grade A M16 (${earthPointCount}×)`,
  });

  // Driving tips (one per rod)
  items.push({
    component: 'driving_tip',
    quantity: earthPointCount,
    unit: 'pcs',
    description: `Earth rod driving tips (${earthPointCount}×)`,
  });

  // Couplings (one per rod except last)
  const couplingCount = Math.max(0, earthPointCount - 1);
  if (couplingCount > 0) {
    items.push({
      component: 'coupling',
      quantity: couplingCount,
      unit: 'pcs',
      description: `Earth rod couplings (${couplingCount}×)`,
    });
  }

  // Clamps for bonding
  items.push({
    component: 'clamp',
    quantity: earthPointCount,
    unit: 'pcs',
    description: `Earth bonding clamps (${earthPointCount}×)`,
  });

  // Earthmulti compound (soil improver)
  items.push({
    component: 'earthmulti',
    quantity: earthPointCount * 25,
    unit: 'kg',
    description: `Earthmulti soil improver (${earthPointCount * 25}kg, 25kg per spike)`,
  });

  // Bare copper earth wire: 5m per earth point
  items.push({
    component: 'earth_wire',
    quantity: earthPointCount * 5,
    unit: 'm',
    description: `Bare copper earth wire 10mm² (${earthPointCount * 5}m total)`,
  });

  return items;
}

/**
 * Build complete lug BOM line items from cable specification
 *
 * @param cableSpec e.g., "CU 16mm²"
 * @param circuitType 'dc' | 'ac' | 'battery'
 * @param outputCount Number of outputs/cables (for multi-core cables)
 * @param connectorType Optional: 'MC4', 'bootlace', etc.
 * @returns Array of BOM line items
 */
export function calculateLugsForOutput(
  cableSpec: string,
  circuitType: 'dc' | 'ac' | 'battery' = 'dc',
  outputCount: number = 1,
  connectorType?: string,
): Array<{ description: string; quantity: number; unit: string }> {
  const lugSpecs = getLugSpecs(cableSpec);
  const items: Array<{ description: string; quantity: number; unit: string }> = [];

  // Main lugs based on cable gauge
  const lugQty = lugSpecs.count * outputCount;
  items.push({
    description: `${lugSpecs.count}×${lugSpecs.size} Copper Lugs (${lugSpecs.material}, per output)`,
    quantity: lugQty,
    unit: 'pcs',
  });

  // Connector if specified
  if (connectorType === 'MC4') {
    items.push({
      description: `MC4 Connector Pair`,
      quantity: outputCount,
      unit: 'pcs',
    });
  } else if (connectorType === 'bootlace') {
    // Bootlaces typically come in sets
    items.push({
      description: `Bootlace Ferrule Set (${lugQty} total per output)`,
      quantity: outputCount,
      unit: 'set',
    });
  }

  return items;
}

/**
 * Memoized cache for lug specifications to avoid recalculation
 */
const lugSpecCache = new Map<string, LugSpec>();

export function getLugSpecsCached(cableSpec: string): LugSpec {
  if (!lugSpecCache.has(cableSpec)) {
    lugSpecCache.set(cableSpec, getLugSpecs(cableSpec));
  }
  return lugSpecCache.get(cableSpec)!;
}

/**
 * Clear lug spec cache (useful for testing)
 */
export function clearLugCache(): void {
  lugSpecCache.clear();
}
