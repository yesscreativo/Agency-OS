import { getCurrentUser } from "@/lib/auth";

// Asignar accesos y crear usuarios/roles es exclusivo del Administrador de
// sistema (is_super) — no del permiso puntual users.manage, que hoy también
// podría tener un admin de un módulo (ej. CRM) sin que eso le dé control
// global. Compartido entre access-actions.ts y roles-actions.ts.
export async function requireSuperAdmin() {
  const user = await getCurrentUser();
  if (!user) return { error: "Sesión expirada. Vuelve a iniciar sesión." } as const;
  if (!user.isSuper) {
    return { error: "Solo un Administrador de sistema puede gestionar accesos." } as const;
  }
  const organizationId = user.organizationIds[0];
  if (!organizationId) return { error: "Tu usuario no pertenece a ninguna organización." } as const;
  return { organizationId } as const;
}
