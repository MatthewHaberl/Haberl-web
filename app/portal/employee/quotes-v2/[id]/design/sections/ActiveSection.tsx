'use client'

import { useDesign } from '../DesignProvider'
import { EnergySection } from './EnergySection'
import { PanelsSection } from './PanelsSection'
import { InverterSection } from './InverterSection'
import { BatterySection } from './BatterySection'
import { DcCombinerSection } from './DcCombinerSection'
import { EarthingSection } from './EarthingSection'
import { AcCombinerSection } from './AcCombinerSection'
import { MonitoringSection } from './MonitoringSection'
import { DataSection } from './DataSection'
import { ExtrasSection } from './ExtrasSection'
import { SavingsSection } from './SavingsSection'

// Index-aligned with BUILD_STEPS in ../BuildRail.
const SECTIONS = [
  EnergySection,      // 0 Energy
  PanelsSection,      // 1 Panels
  DcCombinerSection,  // 2 DC combiner
  InverterSection,    // 3 Inverter
  BatterySection,     // 4 Batteries
  AcCombinerSection,  // 5 AC combiner
  MonitoringSection,  // 6 Monitoring
  EarthingSection,    // 7 Earthing
  DataSection,        // 8 Data
  ExtrasSection,      // 9 Extras
  SavingsSection,     // 10 Savings & Performance
]

export function ActiveSection() {
  const { activeStep } = useDesign()
  const Section = SECTIONS[activeStep] ?? EnergySection
  return <Section />
}
