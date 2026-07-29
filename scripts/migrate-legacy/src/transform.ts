import type { Database } from "@agency-os/db";
import { extractClientCode } from "@agency-os/domain";
import type { Report } from "./report";
import type {
  LegacyClient,
  LegacyItem,
  LegacyQuote,
  LegacyRecipient,
  LegacySupplierOrder,
  LegacyVersion,
} from "./legacy-types";

type Tables = Database["public"]["Tables"];
type QuoteType = Database["public"]["Enums"]["quote_type"];
type ItemStatus = Database["public"]["Enums"]["quote_item_status"];
type SupplierStatus = Database["public"]["Enums"]["supplier_order_status"];

const QUOTE_TYPES: QuoteType[] = ["proyecto", "evolutivo"];
const ITEM_STATUSES: ItemStatus[] = ["pending", "accepted", "rejected", "changes"];
const SUPPLIER_STATUSES: SupplierStatus[] = ["pending", "sent", "confirmed"];

const DAY_MS = 24 * 60 * 60 * 1000;

function addDays(iso: string | null, days: number): string {
  const base = iso ? new Date(iso).getTime() : Date.now();
  return new Date(base + days * DAY_MS).toISOString();
}

/** Genera un código único por org a partir del nombre, evitando colisiones con `taken`. */
export function generateClientCode(
  client: LegacyClient,
  taken: Set<string>,
  report: Report,
): string {
  const base = extractClientCode(client.company || client.name);
  let code = base;
  let n = 1;
  while (taken.has(code.toLowerCase())) {
    code = `${base}${n}`;
    n += 1;
  }
  if (code !== base) {
    report.anomaly(`code de cliente "${base}" ya existía en destino → asignado "${code}" a ${client.name}`);
  }
  taken.add(code.toLowerCase());
  return code;
}

export function toClient(
  c: LegacyClient,
  orgId: string,
  code: string,
  report: Report,
): Tables["clients"]["Insert"] {
  let email = c.email?.trim();
  if (!email) {
    email = `sin-email+${c.id}@migracion.laburu`;
    report.anomaly(`cliente ${c.name} (${c.id}) sin email → placeholder ${email}`);
  }
  return {
    id: c.id,
    organization_id: orgId,
    code,
    name: c.name,
    email,
    phone: c.phone,
    company: c.company,
    nit: c.nit,
    responsible: c.responsible,
    created_at: c.created_at ?? undefined,
  };
}

export function toQuote(
  q: LegacyQuote,
  orgId: string,
  kamId: string | null,
  report: Report,
): Tables["quotes"]["Insert"] {
  let quoteType: QuoteType | null = null;
  if (q.quote_type) {
    if (QUOTE_TYPES.includes(q.quote_type as QuoteType)) {
      quoteType = q.quote_type as QuoteType;
    } else {
      report.anomaly(`quote ${q.quote_code ?? q.id}: quote_type "${q.quote_type}" fuera del enum → null`);
    }
  }
  return {
    id: q.id,
    organization_id: orgId,
    code: q.quote_code,
    client_id: q.client_id,
    status: q.status,
    quote_type: quoteType,
    quote_name: q.quote_name,
    message: q.message,
    internal_notes: q.internal_notes,
    clickup_task_id: q.clickup_task_id,
    currency: q.currency ?? "COP",
    event_date: q.event_date,
    purchase_order: q.purchase_order,
    invoice_number: q.invoice_number,
    has_iva: q.has_iva ?? false,
    iva_percentage: q.iva_percentage == null ? 0 : Number(q.iva_percentage),
    brief_url: q.brief_url, // reescrito luego por briefs.ts si se copia el archivo
    rejection_reason: q.rejection_reason,
    kam_id: kamId,
    // Autoría no migrada en el piloto (no hay usuarios): null explícito.
    created_by: null,
    assigned_to: null,
    sent_by: null,
    sent_at: q.sent_at,
    accepted_at: q.accepted_at,
    rejected_at: q.rejected_at,
    closed_at: q.closed_at,
    created_at: q.created_at ?? undefined,
  };
}

export function toItem(i: LegacyItem, report: Report): Tables["quote_items"]["Insert"] {
  let status: ItemStatus = "pending";
  if (ITEM_STATUSES.includes(i.status as ItemStatus)) {
    status = i.status as ItemStatus;
  } else {
    report.anomaly(`item ${i.id}: status "${i.status}" fuera del enum → pending`);
  }
  return {
    id: i.id,
    quote_id: i.quote_id,
    description: i.description,
    quantity: Number(i.quantity),
    client_price: Number(i.client_price),
    cost_price: Number(i.cost_price),
    status,
    client_comment: i.client_comment,
    sort_order: i.sort_order ?? 0,
    supplier: i.supplier,
    is_group: i.is_group ?? false,
    created_at: i.created_at ?? undefined,
  };
}

export function toRecipient(r: LegacyRecipient): Tables["quote_recipients"]["Insert"] {
  return {
    id: r.id,
    quote_id: r.quote_id,
    name: r.name,
    email: r.email,
    token: r.token, // preservado (histórico, ya vencido)
    expires_at: r.expires_at ?? addDays(r.created_at, 5),
    viewed_at: r.viewed_at,
    client_comment: r.client_comment,
    created_at: r.created_at ?? undefined,
  };
}

export function toVersion(v: LegacyVersion): Tables["quote_versions"]["Insert"] {
  return {
    id: v.id,
    quote_id: v.quote_id,
    version_number: Number(v.version_number),
    snapshot: v.snapshot as Tables["quote_versions"]["Insert"]["snapshot"],
    created_by: null,
    created_at: v.created_at ?? undefined,
  };
}

export function toSupplierOrder(
  s: LegacySupplierOrder,
  report: Report,
): Tables["supplier_orders"]["Insert"] {
  let status: SupplierStatus = "pending";
  if (SUPPLIER_STATUSES.includes(s.status as SupplierStatus)) {
    status = s.status as SupplierStatus;
  } else {
    report.anomaly(`supplier_order ${s.id}: status "${s.status}" fuera del enum → pending`);
  }
  let expiresAt = s.expires_at;
  if (!expiresAt) {
    expiresAt = addDays(s.created_at, 30);
    report.anomaly(`supplier_order ${s.id}: expires_at null → ${expiresAt}`);
  }
  return {
    id: s.id,
    quote_id: s.quote_id,
    supplier_name: s.supplier_name,
    supplier_email: s.supplier_email,
    items: s.items as Tables["supplier_orders"]["Insert"]["items"],
    token: s.token, // preservado
    status,
    sent_at: s.sent_at,
    confirmed_at: s.confirmed_at,
    supplier_comment: s.supplier_comment,
    expires_at: expiresAt,
    message: null, // columna nueva, sin equivalente legacy
    created_at: s.created_at ?? undefined,
  };
}
