"use client";

import { useEffect } from "react";
import { createSupabaseBrowserClient } from "@agency-os/db";

/** Puente cliente para los dos formatos en los que Supabase Auth entrega una
 * sesión desde un link de email (invitación, recuperación, magic link):
 * - `?code=...` (PKCE): se intercambia por sesión.
 * - `#access_token=...&refresh_token=...` (fragmento de URL, vía el `/verify`
 *   hosteado de Supabase): nunca llega al servidor — solo el navegador lo ve.
 * Tiene que ser un componente cliente por eso: un route handler no puede leer
 * el fragmento bajo ningún escenario. Una vez hay sesión (cookie puesta por
 * el cliente de Supabase, @supabase/ssr comparte el storage con el server),
 * se pasa la posta a /auth/callback/finish — ahí sí server-side — para
 * decidir el destino final según quién es realmente el usuario. */
export default function AuthCallbackBridge() {
  useEffect(() => {
    (async () => {
      const supabase = createSupabaseBrowserClient();
      const url = new URL(window.location.href);
      const next = url.searchParams.get("next") ?? "/inicio";
      const code = url.searchParams.get("code");

      if (code) {
        await supabase.auth.exchangeCodeForSession(window.location.href);
      } else if (window.location.hash) {
        const hashParams = new URLSearchParams(window.location.hash.slice(1));
        const accessToken = hashParams.get("access_token");
        const refreshToken = hashParams.get("refresh_token");
        if (accessToken && refreshToken) {
          await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
        }
      }

      window.location.replace(`/auth/callback/finish?next=${encodeURIComponent(next)}`);
    })();
  }, []);

  return null;
}
