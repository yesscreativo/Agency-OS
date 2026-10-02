import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";

type ConfirmType = "signup" | "invite" | "magiclink" | "recovery" | "email_change" | "email";

const confirmTypes = new Set<ConfirmType>([
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
]);

function safeNext(raw: string | null): string {
  if (raw && raw.startsWith("/") && !raw.startsWith("//")) return raw;
  return "/inicio";
}

function parseConfirmType(raw: string | null): ConfirmType | null {
  return raw && confirmTypes.has(raw as ConfirmType) ? (raw as ConfirmType) : null;
}

/**
 * Confirma invitaciones y recuperaciones generadas por el Send Email Hook.
 * A diferencia del /verify hospedado de Supabase, verifyOtp establece la
 * sesión directamente en cookies y evita depender de un fragmento de URL.
 */
export async function GET(request: Request) {
  const { origin, searchParams } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = parseConfirmType(searchParams.get("type"));
  const next = safeNext(searchParams.get("next"));
  const isPortalDestination = next.startsWith("/portal");
  const loginPath = isPortalDestination ? "/portal/login" : "/login";

  if (!tokenHash || !type) {
    return NextResponse.redirect(`${origin}${loginPath}?error=enlace-invalido`);
  }

  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });

  if (error) {
    return NextResponse.redirect(`${origin}${loginPath}?error=enlace-invalido`);
  }

  const finishUrl = new URL("/auth/callback/finish", origin);
  finishUrl.searchParams.set("next", next);
  return NextResponse.redirect(finishUrl);
}
