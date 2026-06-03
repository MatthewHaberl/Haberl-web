/**
 * Circuit Layer Manager
 * Manages visibility of different electrical circuit layers in the SLD diagram
 * Allows users to focus on specific aspects (e.g., earthing only, live circuits only)
 */

import type { DiagramLayerState } from '@/types/sld-components';

/** Color coding for each circuit layer */
export const CIRCUIT_LAYER_COLORS: Record<string, string> = {
  live: '#ef4444', // red
  neutral: '#3b82f6', // blue
  earth: '#65a30d', // lime/green
  communication: '#f97316', // orange
};

/** Human-readable labels for each circuit layer */
export const CIRCUIT_LAYER_LABELS: Record<string, string> = {
  live: 'Live (L)',
  neutral: 'Neutral (N)',
  earth: 'Earth (E)',
  communication: 'Communication',
};

/**
 * Get the display color for a circuit layer
 * @param layer 'live' | 'neutral' | 'earth' | 'communication'
 * @returns Hex color code
 */
export function getCircuitLayerColor(layer: string): string {
  return CIRCUIT_LAYER_COLORS[layer] || '#808080';
}

/**
 * Get the human-readable label for a circuit layer
 * @param layer 'live' | 'neutral' | 'earth' | 'communication'
 * @returns Display label
 */
export function getLayerLabel(layer: string): string {
  return CIRCUIT_LAYER_LABELS[layer] || layer;
}

/**
 * Check if a specific layer is currently visible
 * @param state Current layer visibility state
 * @param layer 'live' | 'neutral' | 'earth' | 'communication'
 * @returns true if layer should be visible
 */
export function isLayerVisible(state: DiagramLayerState | undefined, layer: string): boolean {
  if (!state) {
    // Default: all layers visible
    return true;
  }

  const key = layer as keyof DiagramLayerState;
  return state[key] ?? true;
}

/**
 * Toggle visibility of a specific layer
 * @param state Current layer visibility state
 * @param layer 'live' | 'neutral' | 'earth' | 'communication'
 * @returns New state with layer toggled
 */
export function toggleLayerVisibility(
  state: DiagramLayerState | undefined,
  layer: string,
): DiagramLayerState {
  const current = state || {
    live: true,
    neutral: true,
    earth: true,
    communication: true,
  };

  return {
    ...current,
    [layer]: !current[layer as keyof DiagramLayerState],
  };
}

/**
 * Set all layers to visible
 * @returns State with all layers visible
 */
export function showAllLayers(): DiagramLayerState {
  return {
    live: true,
    neutral: true,
    earth: true,
    communication: true,
  };
}

/**
 * Hide all layers except one (useful for focusing)
 * @param focusLayer Which layer to show
 * @returns State with only specified layer visible
 */
export function focusOnLayer(focusLayer: string): DiagramLayerState {
  const state: DiagramLayerState = {
    live: false,
    neutral: false,
    earth: false,
    communication: false,
  };
  state[focusLayer as keyof DiagramLayerState] = true;
  return state;
}

/**
 * Get layers that are currently visible
 * @param state Current layer visibility state
 * @returns Array of visible layer names
 */
export function getVisibleLayers(state: DiagramLayerState | undefined): string[] {
  const layers = ['live', 'neutral', 'earth', 'communication'];
  if (!state) {
    return layers; // All visible by default
  }

  return layers.filter((layer) => isLayerVisible(state, layer));
}

/**
 * Get layers that are currently hidden
 * @param state Current layer visibility state
 * @returns Array of hidden layer names
 */
export function getHiddenLayers(state: DiagramLayerState | undefined): string[] {
  const all = ['live', 'neutral', 'earth', 'communication'];
  const visible = getVisibleLayers(state);
  return all.filter((layer) => !visible.includes(layer));
}

/**
 * Check if all layers are visible
 * @param state Current layer visibility state
 * @returns true if all layers are visible
 */
export function allLayersVisible(state: DiagramLayerState | undefined): boolean {
  return getHiddenLayers(state).length === 0;
}

/**
 * Load layer visibility from localStorage
 * @returns Saved state, or default if not found
 */
export function loadLayerVisibilityFromStorage(): DiagramLayerState {
  if (typeof window === 'undefined') {
    return showAllLayers();
  }

  const saved = localStorage.getItem('sld-layer-visibility');
  if (saved) {
    try {
      return JSON.parse(saved);
    } catch {
      return showAllLayers();
    }
  }

  return showAllLayers();
}

/**
 * Save layer visibility to localStorage
 * @param state Layer visibility state to persist
 */
export function saveLayerVisibilityToStorage(state: DiagramLayerState): void {
  if (typeof window === 'undefined') {
    return;
  }

  localStorage.setItem('sld-layer-visibility', JSON.stringify(state));
}

/**
 * Clear saved layer visibility (reset to defaults)
 */
export function clearLayerVisibilityStorage(): void {
  if (typeof window === 'undefined') {
    return;
  }

  localStorage.removeItem('sld-layer-visibility');
}
