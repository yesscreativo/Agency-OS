// Regla de negocio (ver quote_recipients/supplier_orders en supabase/migrations/002_crm.sql)
// y chequeo extraído de js/respuesta.js / js/proveedor.js del cotizador viejo.

export const CLIENT_TOKEN_EXPIRY_DAYS = 5;
export const SUPPLIER_TOKEN_EXPIRY_DAYS = 30;

export function isTokenExpired(
  expiresAt: string | Date | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!expiresAt) return false;
  return new Date(expiresAt) < now;
}
