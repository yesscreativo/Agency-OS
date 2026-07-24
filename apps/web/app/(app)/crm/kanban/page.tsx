import { redirect } from "next/navigation";
import { getCurrentUser, hasPermission } from "@/lib/auth";

export default async function KanbanPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!hasPermission(user, "quote.pipeline")) redirect("/crm");

  return <main className="p-8">Kanban — pendiente (Fase 7).</main>;
}
