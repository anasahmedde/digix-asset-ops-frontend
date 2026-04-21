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
  firmware_version: string;
  hardware_revision: string;
  status: DeviceStatus;
  purchase_date: string | null;
  purchase_price: string | null;
  supplier: string | null;
  invoice_reference: string;
  batch_number: string;
  current_site: string | null;
  site_name: string | null;
  assigned_client: string | null;
  client_name: string | null;
  assigned_technician: string | null;
  installation_date: string | null;
  notes: string;
  created_at: string;
  updated_at: string;
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
  country: string;
  latitude: number | null;
  longitude: number | null;
  contact_person: string;
  contact_phone: string;
  contact_email: string;
  client: string | null;
  is_active: boolean;
  device_count: number;
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
