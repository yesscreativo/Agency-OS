import { redirect } from "next/navigation";
import { countQuotesByClient, listClients } from "@agency-os/db";
import { getCurrentUser, hasPermission } from "@/lib/auth";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { ClientsList } from "@/components/crm/clients-list";

export const dynamic = "force-dynamic";

interface SearchParams {
  q?: string;
  pagina?: string;
}

export default async function ClientsListPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!hasPermission(user, "client.manage")) redirect("/crm");

  const db = await getSupabaseServerClient();
  const pageSize = 50;
  const { rows, total, page } = await listClients(db, {
    search: searchParams.q,
    page: Number(searchParams.pagina) || 1,
    pageSize,
  });
  const counts = await countQuotesByClient(
    db,
    rows.map((c) => c.id),
  );

  return (
    <ClientsList
      rows={rows.map((c) => ({
        id: c.id,
        code: c.code,
        name: c.name,
        company: c.company,
        responsible: c.responsible,
        email: c.email,
        phone: c.phone,
        quoteCount: counts[c.id] ?? 0,
      }))}
      total={total}
      page={page}
      pageSize={pageSize}
      q={searchParams.q ?? ""}
    />
  );
}
