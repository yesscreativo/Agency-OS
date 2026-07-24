import { redirect } from "next/navigation";
import { getCurrentUser, hasPermission } from "@/lib/auth";

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!hasPermission(user, "client.manage")) redirect("/crm");

  const { id } = await params;
  return <main className="p-8">Cliente {id} — pendiente (Fase 7).</main>;
}
