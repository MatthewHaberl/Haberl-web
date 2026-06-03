/**
 * Communication Edge Configuration Manager
 * Handles protocol matching, validation, and override logic for device communications
 * Allows connecting devices with compatible or incompatible protocols (with override)
 */

import type { Node } from '@xyflow/react';
import type { CommunicationEdgeConfig } from '@/types/sld-components';

/** Validation result for a communication edge */
export interface CommunicationValidation {
  valid: boolean;
  compatible: boolean;
  sourceProtocol?: string[];
  targetProtocol?: string[];
  reason?: string;
  canOverride: boolean;
  overrideReason?: string;
}

/**
 * Extract communication protocols from a device node
 * Protocols are stored in equipment_catalog notes or node.data.protocols
 *
 * @param node SLD diagram node
 * @returns Array of protocol names (e.g., ["Modbus", "CAN"])
 */
export function getDeviceProtocol(node: Node): string[] {
  // Try to get protocols from node data
  if ((node.data as any)?.protocols) {
    const protocols = (node.data as any).protocols;
    return Array.isArray(protocols) ? protocols : [protocols];
  }

  // Try to parse from equipment catalog notes (JSON format)
  if ((node.data as any)?.notes) {
    try {
      const notes = (node.data as any).notes;
      if (typeof notes === 'string') {
        const parsed = JSON.parse(notes);
        if (parsed.protocols) {
          return Array.isArray(parsed.protocols) ? parsed.protocols : [parsed.protocols];
        }
      }
    } catch {
      // Notes is not JSON, skip
    }
  }

  // Default: no specific protocol (assume compatible)
  return [];
}

/**
 * Check if two devices have compatible communication protocols
 *
 * @param sourceProtocols Protocols supported by source device
 * @param targetProtocols Protocols supported by target device
 * @returns true if at least one protocol is shared
 */
export function isProtocolCompatible(
  sourceProtocols: string[],
  targetProtocols: string[],
): boolean {
  // If either device has no protocol specified, assume compatible
  if (sourceProtocols.length === 0 || targetProtocols.length === 0) {
    return true;
  }

  // Check for intersection
  return sourceProtocols.some((p) => targetProtocols.includes(p));
}

/**
 * Find common protocols between two devices
 *
 * @param sourceProtocols Protocols from source
 * @param targetProtocols Protocols from target
 * @returns Array of common protocols
 */
export function getCommonProtocols(
  sourceProtocols: string[],
  targetProtocols: string[],
): string[] {
  if (sourceProtocols.length === 0 || targetProtocols.length === 0) {
    return [];
  }

  return sourceProtocols.filter((p) => targetProtocols.includes(p));
}

/**
 * Validate a communication edge between two devices
 *
 * @param sourceNode Source device node
 * @param targetNode Target device node
 * @returns Validation result with compatibility info and override option
 */
export function validateCommunicationEdge(
  sourceNode: Node,
  targetNode: Node,
): CommunicationValidation {
  const sourceProtocol = getDeviceProtocol(sourceNode);
  const targetProtocol = getDeviceProtocol(targetNode);
  const compatible = isProtocolCompatible(sourceProtocol, targetProtocol);

  if (compatible || sourceProtocol.length === 0 || targetProtocol.length === 0) {
    // Either compatible or no protocol specified
    return {
      valid: true,
      compatible: true,
      sourceProtocol,
      targetProtocol,
      canOverride: false,
    };
  }

  // Incompatible protocols
  return {
    valid: false,
    compatible: false,
    sourceProtocol,
    targetProtocol,
    reason: `Protocol mismatch: ${sourceNode.data?.label || sourceNode.id} has ${sourceProtocol.join(', ')}, but ${targetNode.data?.label || targetNode.id} has ${targetProtocol.join(', ')}`,
    canOverride: true,
    overrideReason: 'Custom integration may require special configuration or adapters',
  };
}

/**
 * Get recommended communication connection types between two device types
 *
 * @param sourceType Type of source device (e.g., 'inverter', 'battery', 'grid')
 * @param targetType Type of target device (e.g., 'battery', 'meter', 'generator')
 * @returns Array of recommended protocol options
 */
export function getRecommendedProtocols(sourceType: string, targetType: string): string[] {
  const connections: Record<string, Record<string, string[]>> = {
    inverter: {
      battery: ['Modbus RTU', 'CAN'],
      meter: ['Modbus RTU', 'RS485'],
      generator: ['Digital I/O', 'Modbus RTU'],
      monitor: ['WiFi', 'Ethernet', 'Modbus TCP'],
    },
    battery: {
      inverter: ['Modbus RTU', 'CAN'],
      monitor: ['WiFi', 'Modbus RTU'],
    },
    grid: {
      meter: ['Modbus RTU', 'DLMS/COSEM'],
      inverter: ['Modbus RTU', 'Ethernet'],
    },
  };

  return connections[sourceType]?.[targetType] ?? [];
}

/**
 * Human-readable description of a communication edge
 *
 * @param config Communication edge configuration
 * @param sourceNode Source device node
 * @param targetNode Target device node
 * @returns Display string for the edge
 */
export function getEdgeLabel(
  config: CommunicationEdgeConfig,
  sourceNode: Node | undefined,
  targetNode: Node | undefined,
): string {
  const sourceLabel = sourceNode?.data?.label || sourceNode?.id || 'Source';
  const targetLabel = targetNode?.data?.label || targetNode?.id || 'Target';

  if (!config.sourceProtocol || !config.targetProtocol) {
    return `${sourceLabel} ↔ ${targetLabel}`;
  }

  const commonProtocols = getCommonProtocols(config.sourceProtocol, config.targetProtocol);
  if (commonProtocols.length > 0) {
    return `${sourceLabel} ↔ ${targetLabel} (${commonProtocols.join(', ')})`;
  }

  if (config.overrideProtocolMismatch) {
    return `${sourceLabel} ↔ ${targetLabel} (Override: ${config.sourceProtocol.join('/')} → ${config.targetProtocol.join('/')})`;
  }

  return `${sourceLabel} ↔ ${targetLabel} (Incompatible)`;
}

/**
 * Predefined common device protocols
 * Can be used to seed equipment_catalog.notes when creating devices
 */
export const DEVICE_PROTOCOLS: Record<string, string[]> = {
  'inverter_modbus': ['Modbus RTU', 'Modbus TCP'],
  'inverter_can': ['CAN'],
  'battery_modbus': ['Modbus RTU'],
  'battery_can': ['CAN'],
  'meter_modbus': ['Modbus RTU', 'DLMS/COSEM'],
  'generator_dio': ['Digital I/O'],
  'generator_modbus': ['Modbus RTU'],
  'monitor_wifi': ['WiFi'],
  'monitor_ethernet': ['Ethernet'],
  'monitor_modbus': ['Modbus TCP'],
};

/**
 * Parse device type from node type
 *
 * @param nodeType SLD node type (e.g., 'inverter', 'battery', 'grid')
 * @returns Device type
 */
export function getDeviceTypeFromNodeType(nodeType: string): string {
  const typeMap: Record<string, string> = {
    inverter: 'inverter',
    battery: 'battery',
    grid: 'grid',
    dbBoard: 'distribution_board',
    combiner: 'dc_combiner',
    meter: 'meter',
    generator: 'generator',
  };

  return typeMap[nodeType] ?? nodeType;
}

/**
 * Check if an edge is a communication edge (vs. power/data cable)
 *
 * @param edgeData Edge data containing circuitLayer
 * @returns true if this is a communication edge
 */
export function isCommunicationEdge(edgeData: any): boolean {
  return edgeData?.circuitLayer === 'communication';
}

/**
 * Format protocol list as human-readable string
 *
 * @param protocols Array of protocol names
 * @returns Formatted string (e.g., "Modbus RTU, CAN")
 */
export function formatProtocolList(protocols: string[]): string {
  if (protocols.length === 0) {
    return 'None specified';
  }

  if (protocols.length === 1) {
    return protocols[0];
  }

  return `${protocols.slice(0, -1).join(', ')} or ${protocols[protocols.length - 1]}`;
}
