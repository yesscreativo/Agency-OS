"use server";

import { redirect } from "next/navigation";
import { activateClientContact, createSupabaseServiceRoleClient } from "@agency-os/db";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentClientContact } from "@/lib/portal-auth";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import type { AuthActionState } from "@/lib/auth-actions";

export async function portalLogin(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: "Credenciales inválidas" };

  // Cruce de identidad: un colaborador interno no entra por acá.
  const internalUser = await getCurrentUser();
  if (internalUser) {
    await supabase.auth.signOut();
    return { error: "Esta cuenta es de uso interno — ingresa por /login." };
  }

  const contact = await getCurrentClientContact();
  if (!contact) {
    await supabase.auth.signOut();
    return { error: "No encontramos un acceso de cliente para esta cuenta." };
  }
  if (contact.status === "disabled") {
    await supabase.auth.signOut();
    return { error: "Tu acceso fue deshabilitado. Contacta a tu agencia." };
  }

  redirect("/portal");
}

export async function portalLogout() {
  const supabase = await getSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/portal/login");
}

export async function requestPortalPasswordReset(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = String(formData.get("email") ?? "").trim();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${siteUrl}/auth/callback?next=/portal/activar`,
  });
  if (error) return { error: "No se pudo enviar el correo de recuperación" };

  return { error: null, success: true };
}

/** Sirve tanto para activar (primer password tras la invitación) como para
 * completar un reset — mismo patrón que /update-password del lado interno. */
export async function portalSetPassword(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const password = String(formData.get("password") ?? "");
  if (password.length < 8) {
    return { error: "La contraseña debe tener al menos 8 caracteres" };
  }

  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: "No se pudo actualizar la contraseña" };

  const contact = await getCurrentClientContact();
  if (contact && contact.status === "invited") {
    const service = createSupabaseServiceRoleClient();
    await activateClientContact(service, contact.id);
  }

  redirect("/portal");
}
