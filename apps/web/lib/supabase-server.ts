import { createSupabaseServerClient } from "@agency-os/db";
import { cookies } from "next/headers";

export async function getSupabaseServerClient() {
  const cookieStore = await cookies();
  return createSupabaseServerClient({
    getAll: () => cookieStore.getAll(),
    setAll: (cookiesToSet) => {
      try {
        cookiesToSet.forEach(({ name, value, options }) => {
          cookieStore.set(name, value, options);
        });
      } catch {
        // Se llama desde un Server Component (solo lectura) — el middleware ya
        // refresca la sesión en cada request, así que esto es seguro de ignorar.
      }
    },
  });
}
