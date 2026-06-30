export type Role = 'customer' | 'field_worker' | 'manager' | 'admin'

/** A single (role × portal-section) access flag — see migration 060. */
export interface RolePermission {
  role: Role
  section: string
  allowed: boolean
  updated_at?: string
}

/** Record-level visibility scope for a user within one section (migration 071). */
export type RecordScope = 'own' | 'all'

/** Per-user override of record visibility for a section; absent ⇒ role default. */
export interface UserSectionVisibility {
  user_id: string
  section: string
  scope: RecordScope
  updated_at?: string
}

/** Generic "also let this user see/act on (section, record)" share (migration 071). */
export interface RecordGrant {
  id: string
  section: string
  record_id: string
  user_id: string        // recipient
  granted_by: string | null
  created_at: string
}

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
  // Store-facing fields (migration 048).
  show_on_store?: boolean
  store_price_rands?: number | null
  model_3d_url?: string | null
  // "To-add" queue placeholder from the design canvas custom quick-add (migration 049).
  pending?: boolean
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
export type JobStage =
  | 'deposit_pending'
  | 'procurement'
  | 'scheduled'
  | 'installation'
  | 'commissioning'
  | 'coc'
  | 'handover'
  | 'follow_up'
  | 'completed'
  | 'on_hold'
  | 'cancelled'
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

/**
 * A customer is the business contact — independent of any login. It can exist
 * with no account at all (a prospect), even with only a phone number, and links
 * to a Supabase auth login via `auth_user_id` once the person registers.
 *
 * Account status is derived, not stored:
 *   auth_user_id == null                  -> 'prospect'
 *   auth_user_id != null, registered_at == null -> 'invited'
 *   registered_at != null                 -> 'registered'
 */
export interface Customer {
  id: string
  full_name: string
  email: string | null
  phone: string | null
  phone_normalized: string | null   // generated: canonical phone for de-dup (migration 053)
  address: string | null
  is_business: boolean
  contact_name: string | null
  source: string
  notes: string | null
  auth_user_id: string | null
  invited_at: string | null
  registered_at: string | null
  created_by: string | null
  created_at: string
  archived_at: string | null   // soft-delete: set = archived/hidden (migration 056)
  archived_by: string | null
  // Manual brought-forward statement balance (migration 081). Signed cents:
  // >0 = they owe us; <0 = in credit. Date is the "as at" display date.
  opening_balance_cents?: number
  opening_balance_date?: string | null
}

export type CustomerAccountStatus = 'prospect' | 'invited' | 'registered'

export function customerAccountStatus(
  c: Pick<Customer, 'auth_user_id' | 'registered_at'>,
): CustomerAccountStatus {
  if (c.registered_at) return 'registered'
  if (c.auth_user_id) return 'invited'
  return 'prospect'
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
  customer?: Customer
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
  stage: JobStage
  on_hold_reason: string | null
  quote_request_id: string | null
  priority: JobPriority
  created_by: string
  created_at: string
  completed_at: string | null
  // EFT deposit reconciliation (migration 024)
  deposit_proof_url: string | null
  deposit_proof_uploaded_at: string | null
  deposit_confirmed_at: string | null
  deposit_confirmed_by: string | null
  // Proof-of-payment decline (migration 054)
  deposit_proof_rejected_at: string | null
  deposit_proof_rejected_by: string | null
  deposit_proof_rejected_reason: string | null
  deposit_proof_rejected_url: string | null
  // joined
  site?: Site
  assignee?: UserProfile
  tasks?: JobTask[]
}

export interface JobStatusHistory {
  id: string
  job_id: string
  stage: JobStage | string
  note: string | null
  customer_visible: boolean
  changed_by: string | null
  created_at: string
  // joined
  changer?: { full_name: string }
}

export interface JobMaterial {
  id: string
  job_id: string
  section: string
  sku: string
  description: string
  qty_planned: number
  qty_loaded: number
  qty_used: number
  qty_returned: number
  unit_cost_cents: number
  unit_sell_cents: number
  sort_order: number
  created_at: string
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

export type ProductDocType =
  | 'datasheet' | 'manual' | 'installation_guide' | 'drawing'
  | '3d_model' | 'wiring_diagram' | 'warranty' | 'certification' | 'other'

export type ProductDocStatus = 'pending_review' | 'published' | 'rejected'

export interface ProductDocument {
  id: string
  product_id: string | null
  brand: string
  product_family: string
  doc_type: ProductDocType
  title: string
  url: string | null
  file_path: string | null
  file_size_kb: number | null
  language: string
  version: string | null
  status: ProductDocStatus
  notes: string | null
  source: string | null
  created_at: string
  updated_at: string
}

export type ProductImageStatus = 'pending_review' | 'published' | 'rejected'

export interface ProductImage {
  id: string
  product_id: string | null
  brand: string
  product_family: string
  url: string
  alt_text: string | null
  source: string | null
  notes: string | null
  status: ProductImageStatus
  sort_order: number
  created_at: string
  updated_at: string
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
  customer_id: string | null   // FK to public.customers (the CRM contact)
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
  storeys_premium_rands: number | null

  // Roof design (added migration 004)
  design_panel_count: number | null
  design_kwp: number | null
  design_segments: Array<{ azimuth: number; pitch: number; panelCount: number }> | null
  design_confirmed_at: string | null

  // Design lock (migration 028)
  design_locked_at: string | null
  design_locked_by: string | null
  bom_snapshot: unknown | null

  // Energy-first design canvas — single source of truth (migration 039)
  system_design: unknown | null

  // Public share + online acceptance (migration 024)
  share_token: string
  expiry_date: string | null
  sent_at: string | null
  viewed_at: string | null
  accepted_at: string | null
  declined_at: string | null
  decline_reason: string | null
  acceptance_name: string | null
  acceptance_ip: string | null
  reminder_count: number
  last_reminder_at: string | null

  // Joined
  submitter?: { full_name: string }
}

export type CableRouteType = 'dc_string' | 'ac_run' | 'battery' | 'earth'

export interface CableRoute {
  id: string
  quote_request_id: string
  route_type: CableRouteType
  label: string | null
  points: Array<{ lat: number; lng: number }>
  measured_m: number
  vertical_m: number
  slack_pct: number
  final_m: number
  sort_order: number
  created_at: string
}

export interface SupplierContact {
  id: string
  supplier_id: string
  name: string | null
  email: string | null
  phone: string | null
  role: string | null
  cc_on_po: boolean
  sort_order: number
  created_at: string
}

export interface Supplier {
  id: string
  name: string
  contact_person: string | null
  email: string | null
  phone: string | null
  notes: string | null
  active: boolean
  created_at: string
  // loaded separately from supplier_contacts
  contacts?: SupplierContact[]
}

export type PurchaseOrderStatus = 'draft' | 'sent' | 'partial' | 'received' | 'cancelled'

export interface PurchaseOrder {
  id: string
  po_number: string
  job_id: string | null
  supplier_id: string | null
  status: PurchaseOrderStatus
  expected_date: string | null
  sent_at: string | null
  notes: string | null
  created_by: string | null
  created_at: string
  // joined
  supplier?: Supplier | null
  job?: { id: string; title: string } | null
  lines?: PurchaseOrderLine[]
}

export interface PurchaseOrderLine {
  id: string
  po_id: string
  job_material_id: string | null
  sku: string
  description: string
  qty_ordered: number
  qty_received: number
  unit_cost_cents: number
  sort_order: number
}

export type LeadStatus = 'new' | 'contacted' | 'converted' | 'discarded'

export interface Lead {
  id: string
  name: string
  phone: string
  phone_normalized: string | null   // generated: canonical phone (migration 053)
  suburb: string | null
  note: string | null
  status: LeadStatus
  quote_request_id: string | null
  customer_id: string | null   // FK to public.customers once converted
  not_duplicate_customer_id: string | null   // customer staff confirmed is NOT this lead — suppresses the phone match (migration 079)
  source: string
  owner_id: string | null      // capturer / assignee; null = unassigned pool (migration 071)
  referrer_email: string | null // staff email captured at intake, resolved → owner_id
  created_at: string
  contacted_at: string | null
}

export type TicketCategory = 'issue' | 'idea' | 'question'
export type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed'

/** In-portal "report an issue" submission (migration 060). */
export interface PortalTicket {
  id: string
  created_at: string
  message: string
  category: TicketCategory
  status: TicketStatus
  page_url: string | null
  user_agent: string | null
  reported_by: string | null
  reporter_name: string | null
  reporter_email: string | null
  reporter_role: string | null
  resolved_at: string | null
  resolved_by: string | null
  admin_note: string | null
}

export interface CompanySettings {
  id: boolean
  company_name: string
  contact_email: string | null
  contact_phone: string | null
  banking: {
    bank?: string
    account_name?: string
    account_number?: string
    branch_code?: string
    account_type?: string
  }
  quote_expiry_days: number
  // Per-company design-canvas circuit colour overrides (jsonb). Partial: only the
  // layers/fields the user changed are stored; missing/null falls back to the brand
  // defaults in lib/solar/canvas-theme.ts (CIRCUIT_THEME). Shape mirrors
  // CanvasColorOverrides there — Partial<Record<CircuitLayer, Partial<CircuitStyle>>>.
  canvas_colors?: Record<string, { label?: string; stroke?: string; fill?: string; striped?: boolean; stripe?: string }> | null
  updated_at: string
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

export type PlanItemStatus = 'pending' | 'in_progress' | 'done'
export type PlanItemPriority = 'urgent' | 'highest' | 'high' | 'medium' | 'low'
// The operator's own status for a plan item, set from the dashboard. Kept separate
// from `status` (which is owned by the vault and overwritten on every sync).
export type PlanItemUserStatus = 'todo' | 'doing' | 'done' | 'parked'

// Operating-plan items synced on-demand from the claude-obsidian vault (recommendations.md).
// Allowlisted Haberl sections only — never BMG / trading / personal data. See scripts/sync-plan.mjs.
export interface PlanItem {
  id: string
  code: string
  track: string
  title: string
  priority: PlanItemPriority
  priority_rank: number
  status: PlanItemStatus
  source_session: string | null
  is_published: boolean
  synced_at: string
  created_at: string
  updated_at: string
  // Operator response round-trip (preserved across vault re-syncs). See migration 033.
  response: string | null
  user_status: PlanItemUserStatus | null
  responded_at: string | null
  response_handled: boolean
}
