import "server-only";
import { getSupabaseServerClient } from "./supabase-server";

export interface CurrentUser {
  id: string;
  email: string;
  fullName: string;
  /** id de la fila people, para "Mi perfil". */
  personId: string | null;
  organizationIds: string[];
  roles: { code: string; name: string }[];
  permissionCodes: Set<string>;
  /** Códigos de módulo a los que el usuario tiene acceso. */
  moduleCodes: string[];
  /** Administrador de sistema: ve/gestiona todos los módulos y pasa cualquier permiso. */
  isSuper: boolean;
}

type UserRoleRow = {
  organization_id: string;
  roles: {
    code: string;
    name: string;
    is_super: boolean;
    module_code: string | null;
    role_permissions: { permissions: { code: string } | null }[];
  } | null;
};

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: appUser } = await supabase
    .from("users")
    .select("id, person_id, people(full_name)")
    .eq("id", user.id)
    .single();

  const { data: userRoles } = await supabase
    .from("user_roles")
    .select(
      "organization_id, roles(code, name, is_super, module_code, role_permissions(permissions(code)))",
    )
    .eq("user_id", user.id)
    .returns<UserRoleRow[]>();

  const roleRows = (userRoles ?? [])
    .map((ur) => ur.roles)
    .filter((role): role is NonNullable<UserRoleRow["roles"]> => role !== null);

  const roles = roleRows.map((role) => ({ code: role.code, name: role.name }));

  const permissionCodes = new Set<string>();
  for (const ur of userRoles ?? []) {
    for (const rp of ur.roles?.role_permissions ?? []) {
      if (rp.permissions?.code) permissionCodes.add(rp.permissions.code);
    }
  }

  const organizationIds = [...new Set((userRoles ?? []).map((ur) => ur.organization_id))];
  const isSuper = roleRows.some((role) => role.is_super);

  // Acceso a módulos: super → todos los activos; si no, los module_code de sus roles.
  let moduleCodes: string[];
  if (isSuper) {
    const { data: activeModules } = await supabase
      .from("modules")
      .select("code")
      .eq("is_active", true)
      .order("sort_order");
    moduleCodes = (activeModules ?? []).map((m) => m.code);
  } else {
    moduleCodes = [
      ...new Set(
        roleRows
          .map((role) => role.module_code)
          .filter((code): code is string => code !== null),
      ),
    ];
  }

  const typedAppUser = appUser as
    | { person_id: string; people: { full_name: string } | null }
    | null;

  return {
    id: user.id,
    email: user.email ?? "",
    fullName: typedAppUser?.people?.full_name ?? user.email ?? "",
    personId: typedAppUser?.person_id ?? null,
    organizationIds,
    roles,
    permissionCodes,
    moduleCodes,
    isSuper,
  };
}

export function hasPermission(user: CurrentUser | null, code: string): boolean {
  if (!user) return false;
  return user.isSuper || user.permissionCodes.has(code);
}

export function canAccessModule(user: CurrentUser | null, moduleCode: string): boolean {
  return user?.moduleCodes.includes(moduleCode) ?? false;
}

/** Alcance del usuario sobre las cotizaciones (matriz de permisos CRM).
 * Centraliza qué precios ve y qué acciones puede hacer, para no repetir la
 * lógica en lista/detalle/formulario/PDF/actions. `priceRole` alimenta el
 * `calcQuote` del dominio: "creator" usa el costo como precio a mostrar. */
export interface QuoteAccess {
  /** Ve/edita el precio costo (crm_admin, crm_creator). */
  seeCost: boolean;
  /** Ve/edita el precio cliente (crm_admin, crm_viewer). */
  seeClientPrice: boolean;
  /** El margen solo se ve con ambos precios → solo el admin. */
  seeMargin: boolean;
  /** Crea cotizaciones (quote.create). */
  canCreate: boolean;
  /** Edita cotizaciones e ítems (quote.update). */
  canEdit: boolean;
  /** Envía al cliente y gestiona destinatarios (quote.send). */
  canSend: boolean;
  /** Estado, docs comerciales, brief, órdenes a proveedor y eliminar (quote.approve). */
  canManageInternal: boolean;
  /** Qué precio es "el precio" a mostrar: cliente para admin/viewer, costo para creator. */
  priceRole: "kam" | "creator";
}

export function quoteAccess(user: CurrentUser | null): QuoteAccess {
  const seeCost = hasPermission(user, "quote.see_costs");
  const seeClientPrice = hasPermission(user, "quote.see_client_price");
  return {
    seeCost,
    seeClientPrice,
    seeMargin: seeCost && seeClientPrice,
    canCreate: hasPermission(user, "quote.create"),
    canEdit: hasPermission(user, "quote.update"),
    canSend: hasPermission(user, "quote.send"),
    canManageInternal: hasPermission(user, "quote.approve"),
    priceRole: seeClientPrice ? "kam" : "creator",
  };
}
