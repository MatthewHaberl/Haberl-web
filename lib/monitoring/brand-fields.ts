/**
 * Per-brand connection field definitions for the "Add a monitoring system" form.
 *
 * Single source of truth for THREE things, so the form can be fully self-explanatory:
 *   1. which credential fields each brand's adapter actually consumes,
 *   2. where the installer gets each value (help text),
 *   3. how each entered value maps onto the monitoring_systems row when saving.
 *
 * `target` decides where a field's value goes on save:
 *   'credential' → encrypted credentials JSON (the BrandCredentials key === field.key)
 *   'plant_id'   → monitoring_systems.plant_id column
 *   'device_sn'  → monitoring_systems.device_sn column
 *
 * Field lists are kept in lock-step with the adapters in lib/monitoring/adapters/*.
 * Keep this file client-safe — no secrets — it is imported by a client component.
 */
import type { MonitoringBrand } from './types'

export type FieldTarget = 'credential' | 'plant_id' | 'device_sn'

export interface BrandField {
  key: string
  target: FieldTarget
  label: string
  help: string
  type?: 'text' | 'password'
  required?: boolean
  placeholder?: string
}

/** How hard it is to obtain API access — drives the badge + ordering. */
export type AccessLevel = 'easy' | 'self-serve' | 'application' | 'local-only'

export const ACCESS_LABEL: Record<AccessLevel, string> = {
  easy:         'Easy — self-serve (~2 min)',
  'self-serve': 'Self-serve in the portal',
  application:  'Needs an API application',
  'local-only': 'No cloud API',
}

export interface BrandConnectSchema {
  label: string
  access: AccessLevel
  /** "How to get these credentials" guidance shown above the fields. */
  accessHelp: string
  docsUrl?: string
  /** True for brands with no cloud API (LuxPower / local) — form hides inputs. */
  cloudless?: boolean
  fields: BrandField[]
}

export const BRAND_CONNECT: Record<MonitoringBrand, BrandConnectSchema> = {
  victron: {
    label: 'Victron',
    access: 'easy',
    accessHelp:
      'Easiest to connect. In the VRM portal (vrm.victronenergy.com) open your profile → Preferences → Integrations → Access tokens and create a personal Access Token. The Installation ID is the number in the site URL (…/installation/XXXXXX/…).',
    docsUrl: 'https://vrm-api-docs.victronenergy.com/',
    fields: [
      { key: 'access_token', target: 'credential', label: 'VRM access token', type: 'password', required: true, help: 'Personal Access Token from VRM → Preferences → Integrations → Access tokens.' },
      { key: 'plant_id', target: 'plant_id', label: 'VRM installation ID', required: true, placeholder: 'e.g. 123456', help: 'The number in the VRM site URL when viewing the installation.' },
    ],
  },

  sunsynk: {
    label: 'Sunsynk',
    access: 'application',
    accessHelp:
      'Sunsynk reports through the Solarman cloud. You need a Solarman Business API account — request an App ID + App Secret from Solarman (developer@solarmanpv.com or via your distributor; approval can take a few days). The email + password are the login for the Solarman / Sunsynk Connect app this plant sits under. The Station ID is shown in the app under the plant settings.',
    docsUrl: 'https://doc.solarmanpv.com',
    fields: [
      { key: 'app_id', target: 'credential', label: 'Solarman App ID', required: true, help: 'Issued when your Solarman Business API account is approved.' },
      { key: 'app_secret', target: 'credential', label: 'Solarman App Secret', type: 'password', required: true, help: 'Issued together with the App ID — keep it secret.' },
      { key: 'username', target: 'credential', label: 'Account email', required: true, help: 'Login email for the Solarman / Sunsynk Connect app that owns this plant.' },
      { key: 'password', target: 'credential', label: 'Account password', type: 'password', required: true, help: 'Password for that same app login.' },
      { key: 'plant_id', target: 'plant_id', label: 'Station ID', required: true, placeholder: 'e.g. 1234567', help: 'Numeric plant/station ID in the app (Plant → Settings).' },
    ],
  },

  deye: {
    label: 'Deye',
    access: 'application',
    accessHelp:
      'Deye reports through the Solarman cloud (same as Sunsynk). You need a Solarman Business API account — request an App ID + App Secret from Solarman (developer@solarmanpv.com or via your distributor). The email + password are the Solarman app login for this plant; the Station ID is in the plant settings.',
    docsUrl: 'https://doc.solarmanpv.com',
    fields: [
      { key: 'app_id', target: 'credential', label: 'Solarman App ID', required: true, help: 'Issued when your Solarman Business API account is approved.' },
      { key: 'app_secret', target: 'credential', label: 'Solarman App Secret', type: 'password', required: true, help: 'Issued together with the App ID — keep it secret.' },
      { key: 'username', target: 'credential', label: 'Account email', required: true, help: 'Login email for the Solarman app that owns this plant.' },
      { key: 'password', target: 'credential', label: 'Account password', type: 'password', required: true, help: 'Password for that same app login.' },
      { key: 'plant_id', target: 'plant_id', label: 'Station ID', required: true, placeholder: 'e.g. 1234567', help: 'Numeric plant/station ID in the app (Plant → Settings).' },
    ],
  },

  sigenergy: {
    label: 'Sigenergy',
    access: 'self-serve',
    accessHelp:
      'Register on the SigenCloud developer portal (developer.sigencloud.com) using the account that owns the plant. The Plant ID is shown on the plant overview in the SigenCloud app.',
    docsUrl: 'https://developer.sigencloud.com',
    fields: [
      { key: 'username', target: 'credential', label: 'SigenCloud username', required: true, help: 'The account login that owns this plant.' },
      { key: 'password', target: 'credential', label: 'SigenCloud password', type: 'password', required: true, help: 'Password for that account.' },
      { key: 'plant_id', target: 'plant_id', label: 'Plant ID', required: true, help: 'Plant ID from the SigenCloud plant overview.' },
    ],
  },

  foxess: {
    label: 'FoxESS',
    access: 'self-serve',
    accessHelp:
      'Log into foxesscloud.com, open your profile → API Management and generate an API Key. The inverter serial number (SN) is on the FoxESS app device list and on the unit label.',
    docsUrl: 'https://www.foxesscloud.com/public/i18n/en/OpenApiDocument.html',
    fields: [
      { key: 'api_key', target: 'credential', label: 'FoxESS API key', type: 'password', required: true, help: 'From your FoxESS Cloud profile → API Management.' },
      { key: 'device_sn', target: 'device_sn', label: 'Inverter serial (SN)', required: true, help: 'Device serial number from the FoxESS app / inverter label.' },
    ],
  },

  growatt: {
    label: 'Growatt',
    access: 'self-serve',
    accessHelp:
      'In the Growatt web portal (server.growatt.com) open Settings → Account Management → API Key and generate a token (recommended). The Plant ID is in the plant settings / plant list URL. A username + password will also work as a fallback if you can\'t get a token.',
    fields: [
      { key: 'api_token', target: 'credential', label: 'API token (recommended)', type: 'password', required: false, help: 'Growatt API key from Settings → Account Management → API Key.' },
      { key: 'username', target: 'credential', label: 'Username (fallback)', required: false, help: 'Only needed if you have no API token.' },
      { key: 'password', target: 'credential', label: 'Password (fallback)', type: 'password', required: false, help: 'Only needed if you have no API token.' },
      { key: 'plant_id', target: 'plant_id', label: 'Plant ID', required: true, help: 'Plant ID from the Growatt portal.' },
    ],
  },

  solax: {
    label: 'SolaX',
    access: 'self-serve',
    accessHelp:
      'In SolaxCloud (solaxcloud.com) go to Service → API to get your TokenID. The inverter serial / registration number (SN) is on the dongle and in the app.',
    docsUrl: 'https://www.solaxcloud.com',
    fields: [
      { key: 'token_id', target: 'credential', label: 'SolaxCloud TokenID', type: 'password', required: true, help: 'From SolaxCloud → Service → API.' },
      { key: 'device_sn', target: 'device_sn', label: 'Inverter serial (SN)', required: true, help: 'Registration/serial number of the inverter or dongle.' },
    ],
  },

  solis: {
    label: 'Solis',
    access: 'self-serve',
    accessHelp:
      'In SolisCloud (soliscloud.com) go to Service → API Management and Activate it — you\'ll receive a KeyID and Key Secret. The Station ID is on the plant overview.',
    docsUrl: 'https://oss.soliscloud.com',
    fields: [
      { key: 'key_id', target: 'credential', label: 'SolisCloud KeyID', required: true, help: 'From SolisCloud → Service → API Management.' },
      { key: 'key_secret', target: 'credential', label: 'SolisCloud Key Secret', type: 'password', required: true, help: 'Issued with the KeyID — keep it secret.' },
      { key: 'plant_id', target: 'plant_id', label: 'Station ID', required: true, help: 'Station ID from the SolisCloud plant overview.' },
    ],
  },

  goodwe: {
    label: 'GoodWe',
    access: 'application',
    accessHelp:
      'GoodWe (SEMS Portal) requires a supplier / API agreement — email service@goodwe.com to request API access for your installer account, then use that SEMS login. The Power-station ID is the long ID in the SEMS plant URL.',
    fields: [
      { key: 'account', target: 'credential', label: 'SEMS account (email)', required: true, help: 'Your SEMS Portal login.' },
      { key: 'password', target: 'credential', label: 'SEMS password', type: 'password', required: true, help: 'Password for that SEMS account.' },
      { key: 'plant_id', target: 'plant_id', label: 'Power-station ID', required: true, help: 'The station ID from the SEMS plant URL.' },
    ],
  },

  huawei: {
    label: 'Huawei FusionSolar',
    access: 'application',
    accessHelp:
      'Huawei FusionSolar uses a "Northbound" API account. In the FusionSolar portal go to System → Company Management → Northbound Management and create a Northbound user (your installer admin enables this). Tip: create one Northbound account per plant — Huawei rate-limits hard. The Plant/Station code is on the plant list.',
    docsUrl: 'https://support.huawei.com/enterprise/en/doc/EDOC1100440661',
    fields: [
      { key: 'northbound_username', target: 'credential', label: 'Northbound username', required: true, help: 'The Northbound API user created in FusionSolar.' },
      { key: 'northbound_password', target: 'credential', label: 'Northbound password', type: 'password', required: true, help: 'The Northbound user password (FusionSolar "systemCode").' },
      { key: 'plant_id', target: 'plant_id', label: 'Plant / station code', required: true, help: 'Station code from the FusionSolar plant list.' },
    ],
  },

  luxpower: {
    label: 'LuxPower',
    access: 'local-only',
    cloudless: true,
    accessHelp:
      'LuxPower has no public cloud API. To monitor a LuxPower site you install a small local collector (Raspberry Pi / mini-PC on RS485) that pushes readings to the platform. It can\'t be connected from this screen — talk to me about setting one up.',
    fields: [],
  },

  local: {
    label: 'Local collector',
    access: 'local-only',
    cloudless: true,
    accessHelp:
      'A "local" system is fed by an on-site collector device that pushes readings directly to the platform. There is nothing to enter here yet — it is provisioned with the collector.',
    fields: [],
  },
}

/** Display order for the brand picker: easiest access first. */
export const BRAND_ORDER: MonitoringBrand[] = [
  'victron', 'sigenergy', 'foxess', 'solax', 'solis', 'growatt',
  'sunsynk', 'deye', 'goodwe', 'huawei', 'luxpower', 'local',
]
