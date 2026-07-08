export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface User {
  id: string;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  full_name: string;
  role: UserRole;
  phone: string;
  avatar: string | null;
  is_field_staff: boolean;
  is_active: boolean;
  date_joined: string;
}

export type UserRole =
  | "super_admin"
  | "ops_manager"
  | "supervisor"
  | "technician"
  | "finance"
  | "warehouse"
  | "client_viewer";

export interface Device {
  id: string;
  asset_code: string;
  serial_number: string;
  mobile_id: string;
  mac_address: string;
  imei: string;
  device_model: string;
  device_model_name: string;
  brand_name: string | null;
  screen_type: string | null;
  screen_size: string | null;
  specifications: Record<string, unknown>;
  firmware_version: string;
  hardware_revision: string;
  status: DeviceStatus;
  image: string | null;
  images: DeviceImage[];
  purchase_date: string | null;
  purchase_price: string | null;
  supplier: string | null;
  supplier_name: string | null;
  invoice_reference: string;
  batch_number: string;
  current_site: string | null;
  site_name: string | null;
  assigned_client: string | null;
  client_name: string | null;
  assigned_technician: string | null;
  technician_name: string | null;
  installation_date: string | null;
  installed_by: string | null;
  installed_by_name: string | null;
  display_name: string;
  asset_type: string | null;
  asset_type_name: string | null;
  length_cm: string | null;
  width_cm: string | null;
  diagonal_inches: string | null;
  warranty_status: "none" | "active" | "expired";
  active_warranty: ActiveWarranty | null;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface ActiveWarranty {
  id: string;
  warranty_type: string;
  status: string;
  start_date: string;
  end_date: string;
  supplier: string | null;
  supplier_name: string | null;
  is_expired: boolean;
}

export interface DeviceImage {
  id: string;
  device: string;
  image: string;
  caption: string;
  is_primary: boolean;
  sort_order: number;
  created_at: string;
}

export type DeviceStatus =
  | "procured"
  | "in_stock"
  | "assigned"
  | "installed"
  | "active"
  | "under_maintenance"
  | "decommissioned"
  | "lost_stolen"
  | "rma"
  | "in_transit";

export interface Site {
  id: string;
  name: string;
  address: string;
  city: string;
  state_province: string;
  country: string;
  latitude: number | null;
  longitude: number | null;
  contact_person: string;
  contact_phone: string;
  contact_email: string;
  client: string | null;
  client_name: string | null;
  is_active: boolean;
  device_count: number;
  contacts?: SiteContact[];
  created_at: string;
}

export interface SiteContact {
  id: string;
  site: string;
  name: string;
  designation: string;
  phone: string;
  email: string;
  is_primary: boolean;
  notes: string;
  created_at: string;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  location: string;
  image: string | null;
  client: string | null;
  client_name: string | null;
  site: string | null;
  site_name: string | null;
  status: string;
  status_display: string;
  progress: number;
  start_date: string | null;
  target_date: string | null;
  completed_date: string | null;
  manager: string | null;
  manager_name: string | null;
  budget: string | null;
  bottleneck_count: number;
  created_at: string;
  updated_at: string;
}

export interface Alert {
  id: string;
  title: string;
  message: string;
  severity: string;
  category: string;
  device: string | null;
  device_code: string | null;
  site: string | null;
  site_name: string | null;
  is_read: boolean;
  is_dismissed: boolean;
  created_at: string;
}

export interface Document {
  id: string;
  title: string;
  doc_type: string;
  file: string;
  file_size: number;
  description: string;
  device: string | null;
  device_code: string | null;
  site: string | null;
  site_name: string | null;
  project: string | null;
  project_name: string | null;
  uploaded_by: string | null;
  uploaded_by_name: string | null;
  created_at: string;
}

export interface Notification {
  id: string;
  recipient: string;
  notification_type: string;
  title: string;
  message: string;
  alert: string | null;
  data: Record<string, unknown>;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
}

export interface ChatRoom {
  id: string;
  name: string;
  room_type: "direct" | "group";
  participants: string[];
  participant_names: string[];
  last_message: ChatMessage | null;
  unread_count: number;
  is_active: boolean;
  created_at: string;
}

export interface ChatMessage {
  id: string;
  room: string;
  sender: string;
  sender_name: string;
  sender_avatar: string | null;
  content: string;
  message_type: string;
  file_url: string;
  is_edited: boolean;
  edited_at: string | null;
  created_at: string;
}

export type TicketStatus =
  | "open"
  | "in_progress"
  | "on_hold"
  | "blocked"
  | "pending_review"
  | "approved"
  | "rejected"
  | "closed";

export interface TicketAttachment {
  id: string;
  ticket: string;
  uploaded_by: string | null;
  uploaded_by_name: string | null;
  file: string;
  caption: string;
  attachment_type: "general" | "completion" | "review";
  created_at: string;
}

export interface TicketComment {
  id: string;
  ticket: string;
  author: string | null;
  author_name: string | null;
  author_avatar: string | null;
  content: string;
  comment_type: "comment" | "status_change" | "completion" | "approval" | "rejection";
  old_status: string;
  new_status: string;
  created_at: string;
}

export interface Brand {
  id: string;
  name: string;
  website: string;
  logo: string | null;
  is_active: boolean;
  created_at: string;
}

export interface DeviceModel {
  id: string;
  brand: string;
  brand_name: string;
  name: string;
  model_number: string;
  screen_type: string;
  screen_size: string;
  is_active: boolean;
  created_at: string;
}

export interface AssetType {
  id: string;
  name: string;
  code: string;
  description: string;
  has_dimensions: boolean;
  has_diagonal: boolean;
  icon: string;
  is_active: boolean;
  created_at: string;
}

export interface Supplier {
  id: string;
  name: string;
  code: string;
  contact_person: string;
  contact_email: string;
  contact_phone: string;
  address: string;
  website: string;
  is_active: boolean;
  service_categories?: string[];
  service_category_names?: string[];
  contacts?: SupplierContact[];
  created_at: string;
}

export interface SupplierServiceCategory {
  id: string;
  name: string;
  description: string;
  is_active: boolean;
  created_at: string;
}

export interface SupplierContact {
  id: string;
  supplier: string;
  name: string;
  designation: string;
  phone: string;
  email: string;
  is_primary: boolean;
  notes: string;
  created_at: string;
}

// ── Setup / master data ──────────────────────────────────────────────
export interface Company {
  id: string;
  name: string;
  legal_name: string;
  logo: string | null;
  address: string;
  city: string;
  state_province: string;
  country: string;
  phone: string;
  email: string;
  website: string;
  tax_id: string;
  registration_number: string;
  default_currency: string;
  is_primary: boolean;
}

export interface NumberingScheme {
  id: string;
  entity: string;
  entity_display: string;
  prefix: string;
  separator: string;
  include_year: boolean;
  padding: number;
  next_number: number;
  is_active: boolean;
  preview: string;
}

export interface PaymentTerms {
  id: string;
  name: string;
  code: string;
  days: number;
  description: string;
  is_active: boolean;
}

export interface TermsTemplate {
  id: string;
  name: string;
  category: string;
  category_display: string;
  body: string;
  is_default: boolean;
  is_active: boolean;
}

export interface WarrantyPeriodPreset {
  id: string;
  label: string;
  months: number;
  is_active: boolean;
}

export type WorkOrderStatus =
  | "draft"
  | "pending_approval"
  | "approved"
  | "issued"
  | "in_progress"
  | "partially_delivered"
  | "delivered"
  | "completed"
  | "cancelled";

export interface WorkOrderItem {
  id?: string;
  asset_type?: string | null;
  asset_type_name?: string | null;
  device_model?: string | null;
  device_model_name?: string | null;
  description: string;
  quantity: number;
  unit_price: string | number;
  received_quantity?: number;
  line_total?: string;
}

export interface WorkOrder {
  id: string;
  wo_number: string;
  title: string;
  description: string;
  order_type: "supply" | "installation" | "supply_install";
  order_type_display?: string;
  status: WorkOrderStatus;
  status_display?: string;
  supplier: string;
  supplier_name?: string;
  client: string | null;
  client_name?: string | null;
  site: string | null;
  site_name?: string | null;
  payment_terms: string | null;
  payment_terms_name?: string | null;
  terms_template: string | null;
  terms_conditions: string;
  safety_instructions: string;
  warranty_months: number | null;
  currency: string;
  order_date: string | null;
  expected_delivery: string | null;
  total_amount: string;
  notes: string;
  items: WorkOrderItem[];
  created_at: string;
  updated_at: string;
}
