export type Role = 'customer' | 'field_worker' | 'manager' | 'admin'
export type QuoteRequestStatus = 'pending' | 'generated' | 'sent' | 'accepted' | 'declined'
export type BrandCategory = 'inverter' | 'battery' | 'panel'
export type EquipmentCatalogCategory = 'inverter' | 'battery' | 'panel' | 'other'
export type EquipmentCatalogPhase = 'single' | 'three' | 'any'
export type QuoteTier = 'premium' | 'recommended' | 'budget'
export type QuoteGenerationMethod = 'ai' | 'calculator' | 'manual'

export interface EquipmentBrand {
  id: string
  category: BrandCategory
  brand: string
  active: boolean
  created_at: string
}

export interface EquipmentCatalogItem {
  id: string
  category: EquipmentCatalogCategory
  brand: string
  sku: string
  description: string
  watts_ac: number | null
  watts_dc: number | null
  kwh: number | null
  phase: EquipmentCatalogPhase
  cost_rands: number
  isc_amps: number | null
  voc_volts: number | null
  active: boolean
  sort_order: number
  notes: string | null
  shop_description: string | null
  primary_image_url: string | null
  datasheet_url: string | null
  research_ran_at: string | null
  created_at?: string
  updated_at?: string
}

export type ResearchResourceType =
  | 'description'
  | 'spec_table'
  | 'datasheet'
  | 'photo'
  | 'sld'
  | 'manual'
  | 'compatibility'
  | 'model_3d'

export type ResearchStatus = 'pending' | 'accepted' | 'rejected'

export interface ProductResearch {
  id: string
  catalog_id: string
  resource_type: ResearchResourceType
  title: string
  url: string | null
  content: string | null
  thumbnail_url: string | null
  file_type: string | null
  source_domain: string | null
  confidence: number
  status: ResearchStatus
  accepted_at: string | null
  rejected_at: string | null
  created_at: string
}

export interface QuoteTierConfig {
  id: string
  min_inverter_kw: number
  max_inverter_kw: number
  tier: QuoteTier
  phase: EquipmentCatalogPhase
  inverter_id: string
  battery_id: string
  panel_id: string
  active: boolean
  sort_order: number
  created_at?: string
  updated_at?: string
}
export type JobStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled'
export type OrderStatus = 'pending' | 'paid' | 'processing' | 'shipped' | 'delivered' | 'cancelled'
export type DocumentType = 'coc' | 'sld' | 'warranty' | 'invoice' | 'photo' | 'other'
export type QuoteStatus = 'draft' | 'sent' | 'accepted' | 'declined'
export type SiteStatus = 'active' | 'pending' | 'maintenance' | 'decommissioned'
export type JobPriority = 'low' | 'medium' | 'high' | 'urgent'

export interface UserProfile {
  id: string
  role: Role
  full_name: string
  phone: string | null
  email: string
  avatar_url: string | null
  created_at: string
}

export interface Site {
  id: string
  customer_id: string
  name: string
  address: string
  system_type: string
  system_size_kw: number | null
  install_date: string | null
  warranty_expiry: string | null
  status: SiteStatus
  gps_lat: number | null
  gps_lng: number | null
  created_at: string
  // joined
  customer?: UserProfile
}

export interface Document {
  id: string
  site_id: string
  type: DocumentType
  name: string
  file_url: string
  uploaded_by: string
  created_at: string
}

export interface Job {
  id: string
  site_id: string
  assigned_to: string
  title: string
  description: string | null
  scheduled_date: string | null
  status: JobStatus
  priority: JobPriority
  created_by: string
  created_at: string
  completed_at: string | null
  // joined
  site?: Site
  assignee?: UserProfile
  tasks?: JobTask[]
}

export interface JobTask {
  id: string
  job_id: string
  description: string
  completed: boolean
  completed_at: string | null
  notes: string | null
}

export interface ServiceRecord {
  id: string
  site_id: string
  job_id: string | null
  date: string
  technician_id: string
  work_performed: string
  materials_used: string | null
  notes: string | null
  // joined
  technician?: UserProfile
}

export interface Product {
  id: string
  slug: string
  name: string
  description: string | null
  price: number
  compare_price: number | null
  images: string[]
  category: string | null
  sku: string | null
  stock_qty: number
  active: boolean
  created_at: string
  // Extended shop fields (migration 012)
  external_id: string | null
  weight_kg: number | null
  brand: string | null
  watts_ac: number | null
  watts_dc: number | null
  kwh: number | null
  meta: Record<string, unknown> | null
}

export interface CartItem {
  product_id: string
  slug: string
  name: string
  sku: string | null
  category: string | null
  brand: string | null
  quantity: number
  unit_price: number   // cents
  image_url: string | null
}

export interface ShippingZone {
  id: string
  name: string
  description: string | null
  base_fee_cents: number
  per_kg_rate_cents: number
  max_weight_kg: number | null
  active: boolean
}

export interface PriceList {
  id: string
  name: string
  description: string | null
  markup_percent: number
  discount_percent: number
  active: boolean
  created_at: string
}

export interface DiscountCode {
  id: string
  code: string
  discount_type: 'percentage' | 'fixed_amount'
  discount_value: number
  description: string | null
  max_uses: number | null
  uses_count: number
  min_order_amount_cents: number | null
  active: boolean
  valid_from: string | null
  valid_until: string | null
  created_at: string
}

export interface ProductRelationship {
  id: string
  product_id: string
  related_product_id: string
  relationship_type: 'lugs_for_inverter' | 'cable_for_inverter' | 'breaker_for_inverter' | 'earthing_for_system' | 'mounting_for_panel' | 'other'
  reason: string | null
  active: boolean
  priority: number
  // joined
  related_product?: Product
}

export interface Order {
  id: string
  customer_id: string
  status: OrderStatus
  subtotal: number
  tax: number
  total: number
  payfast_payment_id: string | null
  created_at: string
  // joined
  items?: OrderItem[]
  customer?: UserProfile
}

export interface OrderItem {
  id: string
  order_id: string
  product_id: string
  quantity: number
  unit_price: number
  total_price: number
  // joined
  product?: Product
}

export interface QuoteItem {
  product_id: string
  name: string
  quantity: number
  unit_price: number
}

export interface Quote {
  id: string
  customer_id: string
  site_id: string | null
  items: QuoteItem[]
  subtotal: number
  tax: number
  total: number
  status: QuoteStatus
  valid_until: string | null
  notes: string | null
  created_at: string
}

export interface QuoteRequest {
  id: string
  submitted_by: string
  status: QuoteRequestStatus
  created_at: string

  // Customer info
  site_number: number
  customer_name: string
  customer_phone: string | null
  customer_email: string | null
  address: string | null
  municipality: string

  // Site info
  grid_supply: string
  roof_type: string | null
  storeys: string | null

  // Usage
  usage_mode: 'monthly' | 'advanced'
  monthly_kwh: string | null
  monthly_kwh_jan: string | null
  monthly_kwh_feb: string | null
  monthly_kwh_mar: string | null
  monthly_kwh_apr: string | null
  monthly_kwh_may: string | null
  monthly_kwh_jun: string | null
  monthly_kwh_jul: string | null
  monthly_kwh_aug: string | null
  monthly_kwh_sep: string | null
  monthly_kwh_oct: string | null
  monthly_kwh_nov: string | null
  monthly_kwh_dec: string | null

  // System design
  system_type: string
  battery_hours: string
  essential_load: string | null
  ev_charger: string
  target_offgrid_pct: number | null

  // Equipment preferences
  inverter_brand: string | null
  battery_brand: string | null
  panel_brand: string | null

  // Amendment fields
  is_amendment: boolean
  existing_inverter: string | null
  existing_batteries: string | null
  existing_panels: string | null
  existing_monthly_usage: string | null
  existing_monthly_gen: string | null
  existing_monthly_saving: string | null
  amendment_scope: string | null

  // Site photos & notes
  photo_urls: string[]
  notes: string | null

  // v1 quote generation
  generated_quote: string | null
  generated_at: string | null

  // v2 quote generation (added migration 003)
  quote_html: string | null
  quote_number: string | null
  quote_version: 'simplified' | 'detailed'
  generation_method: QuoteGenerationMethod
  deposit_items: string[]
  deposit_amount: number | null  // cents
  total_amount: number | null    // cents
  selected_inverter_id: string | null
  selected_battery_id: string | null
  selected_panel_id: string | null
  selected_battery_qty: number | null
  selected_panel_qty: number | null
  cable_route_m: number | null
  storeys_premium_rands: number | null

  // Roof design (added migration 004)
  design_panel_count: number | null
  design_kwp: number | null
  design_segments: Array<{ azimuth: number; pitch: number; panelCount: number }> | null
  design_confirmed_at: string | null

  // Joined
  submitter?: { full_name: string }
}

// Metrics computed from DB (manager dashboard)
export interface CompanyMetrics {
  revenue_this_month: number
  revenue_last_month: number
  jobs_completed_this_month: number
  jobs_in_progress: number
  active_customers: number
  active_sites: number
  open_quotes: number
}
