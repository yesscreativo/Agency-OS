import { NextResponse } from "next/server";
import { isAllowedEmailDomain } from "@agency-os/domain";
import { getSupabaseServerClient } from "@/lib/supabase-server";

/** Solo rutas relativas propias — evita que un `next` como "//evil.com" o
 * "http://evil.com" se use como open redirect. */
function safeNext(raw: string | null, fallback: string): string {
  if (raw && raw.startsWith("/") && !raw.startsWith("//")) return raw;
  return fallback;
}

// Se llama DESPUÉS de que /auth/callback (puente cliente) ya estableció la
// sesión — acá la cookie ya está puesta, así que getSupabaseServerClient()
// ve al usuario autenticado sin necesitar ningún `code` ni fragmento.
//
// La identidad válida se verifica SIEMPRE server-side acá — nunca a partir
// de `next` (es un query param, lo arma quien dispara el flujo: el botón de
// Google, o alguien llamando el authorize endpoint de Supabase directo con
// su propio redirectTo). El `hd` del botón de Google es solo una sugerencia
// de UI para Google, no una restricción real.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const next = safeNext(searchParams.get("next"), "/inicio");
  const isPortalDestination = next.startsWith("/portal");

  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user?.email) {
    const allowedByDomain = isAllowedEmailDomain(user.email);
    let isPortalContact = false;
    if (!allowedByDomain) {
      const { data } = await supabase
        .from("client_contacts")
        .select("id")
        .eq("auth_user_id", user.id)
        .maybeSingle();
      isPortalContact = data !== null;
    }

    if (!allowedByDomain && !isPortalContact) {
      await supabase.auth.signOut();
      return NextResponse.redirect(`${origin}/login?error=dominio`);
    }

    return NextResponse.redirect(`${origin}${next}`);
  }

  return NextResponse.redirect(`${origin}${isPortalDestination ? "/portal/login" : "/login"}`);
}
