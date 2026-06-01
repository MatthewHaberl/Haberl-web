export type Role = 'customer' | 'field_worker' | 'manager' | 'admin'
export type QuoteRequestStatus = 'pending' | 'generated' | 'sent'
export type BrandCategory = 'inverter' | 'battery' | 'panel'

export interface EquipmentBrand {
  id: string
  category: BrandCategory
  name: string
  active: boolean
  sort_order: number
  created_at: string
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
  // Customer
  customer_name: string
  customer_phone: string | null
  customer_email: string | null
  address: string | null
  municipality: string | null
  // Site
  grid_supply: string
  roof_type: string | null
  storeys: string
  // Usage
  usage_mode: string
  monthly_kwh: string | null
  monthly_kwh_jan: string | null; monthly_kwh_feb: string | null
  monthly_kwh_mar: string | null; monthly_kwh_apr: string | null
  monthly_kwh_may: string | null; monthly_kwh_jun: string | null
  monthly_kwh_jul: string | null; monthly_kwh_aug: string | null
  monthly_kwh_sep: string | null; monthly_kwh_oct: string | null
  monthly_kwh_nov: string | null; monthly_kwh_dec: string | null
  // System
  system_type: string
  battery_hours: string
  essential_load: string
  ev_charger: string
  target_offgrid_pct: number | null
  // Equipment
  inverter_brand: string | null
  battery_brand: string | null
  panel_brand: string | null
  equipment_preference: string | null  // legacy
  // Amendment
  is_amendment: boolean
  existing_inverter: string | null
  existing_batteries: string | null
  existing_panels: string | null
  existing_monthly_usage: string | null
  existing_monthly_gen: string | null
  existing_monthly_saving: string | null
  amendment_scope: string | null
  // Photos
  photo_urls: string[]
  notes: string | null
  // Generated
  generated_quote: string | null
  generated_at: string | null
  generated_by: string | null
  created_at: string
  // joined
  submitter?: UserProfile
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
