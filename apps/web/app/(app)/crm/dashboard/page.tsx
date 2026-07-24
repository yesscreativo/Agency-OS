import { redirect } from "next/navigation";
import { getCurrentUser, hasPermission } from "@/lib/auth";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!hasPermission(user, "quote.dashboard")) redirect("/crm");

  return <main className="p-8">Dashboard KPIs — pendiente (Fase 7).</main>;
}
