import { redirect } from "next/navigation";
import { listClients, listKams } from "@agency-os/db";
import { getCurrentUser, hasPermission } from "@/lib/auth";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { getQuoteStatusMap } from "@/lib/quote-status-catalog";
import { QuoteForm } from "@/components/crm/quote-form";

export const dynamic = "force-dynamic";

export default async function NewQuotePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!hasPermission(user, "quote.create")) redirect("/crm");

  const db = await getSupabaseServerClient();
  const [{ rows: clients }, kams, statusMap] = await Promise.all([
    listClients(db, { pageSize: 200 }),
    listKams(db, { onlyActive: true }),
    getQuoteStatusMap(db),
  ]);

  const statuses = Object.values(statusMap)
    .filter((m) => m.isActive)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((m) => ({
      code: m.code,
      label: m.label,
      color: m.color,
      variant: m.variant,
      onColor: m.onColor,
    }));

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <a href="/crm" className="text-sm text-muted transition hover:text-ink">
            ← Cotizaciones
          </a>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">Nueva cotización</h1>
        </div>
      </div>
      <QuoteForm
        initial={null}
        clients={clients.map((c) => ({ id: c.id, name: c.name, company: c.company }))}
        kams={kams.map((k) => ({ id: k.id, name: k.name }))}
        canSeeCosts={hasPermission(user, "quote.see_costs")}
        briefSignedUrl={null}
        statuses={statuses}
      />
    </div>
  );
}
