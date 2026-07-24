import { redirect } from "next/navigation";
import { getPerson } from "@agency-os/db";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { ProfileForm } from "@/components/profile-form";

export const dynamic = "force-dynamic";

export default async function PerfilPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const db = await getSupabaseServerClient();
  const person = user.personId ? await getPerson(db, user.personId) : null;

  return (
    <div>
      <h1 className="text-3xl font-bold tracking-tight">Mi perfil</h1>
      <p className="mt-1 text-sm text-muted">Administra tus datos y tu contraseña.</p>

      <div className="mt-8">
        <ProfileForm initialName={person?.full_name ?? user.fullName} email={user.email} />
      </div>
    </div>
  );
}
