'use client'

import { useDesign } from '../DesignProvider'
import { EnergySection } from './EnergySection'
import { PanelsSection } from './PanelsSection'
import { InverterSection } from './InverterSection'
import { BatterySection } from './BatterySection'
import { DcCombinerSection } from './DcCombinerSection'
import { EarthingSection } from './EarthingSection'
import { AcCombinerSection } from './AcCombinerSection'
import { ExtrasSection } from './ExtrasSection'

// Index-aligned with BUILD_STEPS in ../BuildRail.
const SECTIONS = [
  EnergySection,      // 0 Energy
  PanelsSection,      // 1 Panels
  DcCombinerSection,  // 2 DC combiner
  InverterSection,    // 3 Inverter
  BatterySection,     // 4 Batteries
  AcCombinerSection,  // 5 AC combiner
  EarthingSection,    // 6 Earthing
  ExtrasSection,      // 7 Extras
]

export function ActiveSection() {
  const { activeStep } = useDesign()
  const Section = SECTIONS[activeStep] ?? EnergySection
  return <Section />
}
