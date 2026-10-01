import { NextResponse } from "next/server";
import { isAllowedEmailDomain } from "@agency-os/domain";
import { getSupabaseServerClient } from "@/lib/supabase-server";

// Recibe el `code` del enlace de recuperación/confirmación/OAuth de Supabase
// Auth y lo intercambia por una sesión antes de redirigir (ej. a
// /update-password, /inicio o /portal/activar). El `hd` en el botón de Google
// ya filtra la mayoría de casos, pero la verificación real de dominio ocurre
// acá — salvo que el destino sea el portal, donde la identidad válida es
// `client_contacts`, no el dominio del email (ver 064_client_contacts.sql).
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/inicio";
  const isPortalDestination = next.startsWith("/portal");

  if (code) {
    const supabase = await getSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!isPortalDestination && user?.email && !isAllowedEmailDomain(user.email)) {
        await supabase.auth.signOut();
        return NextResponse.redirect(`${origin}/login?error=dominio`);
      }

      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}${isPortalDestination ? "/portal/login" : "/login"}`);
}
