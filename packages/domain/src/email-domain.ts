/** Único dominio autorizado para iniciar sesión y ser invitado a Agency OS. */
export const ALLOWED_EMAIL_DOMAIN = "laburuagencia.com";

export function isAllowedEmailDomain(email: string): boolean {
  return email.trim().toLowerCase().endsWith(`@${ALLOWED_EMAIL_DOMAIN}`);
}
