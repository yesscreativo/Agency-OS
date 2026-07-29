import { makeAgencyClient, makeLegacyClient, parseCli, targetOrgId } from "./config";
import { resolvePilot } from "./resolve";
import { upsertRows } from "./db-helpers";
import { resolveKams } from "./kams";
import { copyBriefs } from "./briefs";
import { rollback } from "./rollback";
import { Report } from "./report";
import {
  generateClientCode,
  toClient,
  toItem,
  toQuote,
  toRecipient,
  toSupplierOrder,
  toVersion,
} from "./transform";

async function main() {
  const cli = parseCli(process.argv);
  const legacy = makeLegacyClient();
  const agency = makeAgencyClient();
  const orgId = targetOrgId();
  const report = new Report();

  const scope = cli.onlyClients.length ? cli.onlyClients.join(", ") : "TODOS (migración completa)";
  console.log(`\nMigración legacy → agency-os`);
  console.log(`  clientes: ${scope}`);
  console.log(`  modo:     ${cli.rollback ? "ROLLBACK" : cli.dryRun ? "dry-run" : "ESCRITURA REAL"}`);

  const data = await resolvePilot(legacy, cli);
  console.log(
    `  resuelto: ${data.clients.length} clientes · ${data.quotes.length} cotizaciones · ` +
      `${data.items.length} ítems · ${data.recipients.length} recipients · ` +
      `${data.versions.length} versiones · ${data.supplierOrders.length} órdenes proveedor`,
  );

  if (cli.rollback) {
    await rollback(agency, orgId, data, report);
    report.print({ dryRun: false });
    return;
  }

  // 1. clients (con code único: dedup contra los ya existentes en la org). Si el cliente YA
  // fue migrado (mismo id), se reusa su code actual → re-correr es idempotente (no lo muta).
  const { data: existingClients } = await agency
    .from("clients")
    .select("id,code")
    .eq("organization_id", orgId);
  const existingCodeById = new Map(
    ((existingClients ?? []) as { id: string; code: string | null }[]).map((r) => [r.id, r.code]),
  );
  const taken = new Set(
    ((existingClients ?? []) as { code: string | null }[])
      .map((r) => r.code?.toLowerCase())
      .filter((c): c is string => !!c),
  );
  const clientRows = data.clients.map((c) => {
    const code = existingCodeById.get(c.id) ?? generateClientCode(c, taken, report);
    return toClient(c, orgId, code, report);
  });
  await upsertRows(agency, "clients", clientRows, cli.dryRun, report);

  // 2. kams (FK de quotes.kam_id) → mapa nombre→id.
  const kamMap = await resolveKams(legacy, agency, orgId, data.quotes, cli.dryRun, report);

  // 3. quotes.
  const quoteRows = data.quotes.map((q) => {
    const kamId = q.kam_pm ? kamMap.get(q.kam_pm.trim().toLowerCase()) ?? null : null;
    return toQuote(q, orgId, kamId, report);
  });
  await upsertRows(agency, "quotes", quoteRows, cli.dryRun, report);

  // 4. descendientes de quotes.
  await upsertRows(agency, "quote_items", data.items.map((i) => toItem(i, report)), cli.dryRun, report);
  await upsertRows(agency, "quote_recipients", data.recipients.map(toRecipient), cli.dryRun, report);
  await upsertRows(agency, "quote_versions", data.versions.map(toVersion), cli.dryRun, report);
  await upsertRows(
    agency,
    "supplier_orders",
    data.supplierOrders.map((s) => toSupplierOrder(s, report)),
    cli.dryRun,
    report,
  );

  // 5. briefs (Storage): copiar archivos y reescribir brief_url.
  await copyBriefs(legacy, agency, data.quotes, cli.dryRun, report);

  report.print({ dryRun: cli.dryRun });
}

main().catch((err) => {
  console.error("\n✖ Migración abortada:", err instanceof Error ? err.message : err);
  process.exit(1);
});
