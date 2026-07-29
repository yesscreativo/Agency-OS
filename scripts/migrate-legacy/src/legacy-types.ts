// Formas mínimas de las filas del cotizador legacy (proyecto oiixyyvhqqmcaioamolj).
// Solo los campos que consumimos; el resto del esquema se ignora a propósito.

export interface LegacyClient {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  nit: string | null;
  responsible: string | null;
  created_at: string | null;
}

export interface LegacyQuote {
  id: string;
  client_id: string;
  status: string;
  message: string | null;
  internal_notes: string | null;
  clickup_task_id: string | null;
  created_at: string | null;
  sent_at: string | null;
  accepted_at: string | null;
  rejected_at: string | null;
  closed_at: string | null;
  currency: string | null;
  quote_name: string | null;
  event_date: string | null;
  kam_pm: string | null;
  purchase_order: string | null;
  invoice_number: string | null;
  quote_code: string | null;
  has_iva: boolean | null;
  iva_percentage: number | null;
  brief_url: string | null;
  rejection_reason: string | null;
  quote_type: string | null;
}

export interface LegacyItem {
  id: string;
  quote_id: string;
  description: string;
  quantity: number;
  client_price: number;
  cost_price: number;
  status: string;
  client_comment: string | null;
  sort_order: number | null;
  supplier: string | null;
  is_group: boolean | null;
  created_at: string | null;
}

export interface LegacyRecipient {
  id: string;
  quote_id: string;
  name: string;
  email: string;
  token: string;
  expires_at: string | null;
  viewed_at: string | null;
  client_comment: string | null;
  created_at: string | null;
}

export interface LegacyVersion {
  id: string;
  quote_id: string;
  version_number: number;
  snapshot: unknown;
  created_at: string | null;
}

export interface LegacySupplierOrder {
  id: string;
  quote_id: string;
  supplier_name: string;
  supplier_email: string;
  items: unknown;
  token: string;
  sent_at: string | null;
  confirmed_at: string | null;
  supplier_comment: string | null;
  status: string;
  expires_at: string | null;
  created_at: string | null;
}

export interface LegacyKamPm {
  id: string;
  name: string;
  active: boolean;
}
