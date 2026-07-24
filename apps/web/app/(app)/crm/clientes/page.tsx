import { redirect } from "next/navigation";
import { getCurrentUser, hasPermission } from "@/lib/auth";

export default async function ClientsListPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!hasPermission(user, "client.manage")) redirect("/crm");

  return <main className="p-8">Clientes — pendiente (Fase 7).</main>;
}
