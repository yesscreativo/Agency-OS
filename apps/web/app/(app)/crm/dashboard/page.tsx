import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { listKams, listPipelineQuotes } from "@agency-os/db";
import { formatMoney } from "@agency-os/domain";
import { KpiCard, KpiDot, Table, Td, Th, type KpiTone } from "@agency-os/ui";
import { getCurrentUser, hasPermission } from "@/lib/auth";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { getQuoteStatusMap, resolveStatus } from "@/lib/quote-status-catalog";
import { QUOTE_KPI_ICONS } from "@/components/crm/kpi-icons";

export const dynamic = "force-dynamic";

// El dashboard replica la lógica del cotizador legacy (js/dashboard.js):
// - Excluye Borradores y "Revisión a futuro" de TODAS las métricas.
// - Valor = Σ (precio_cliente × cantidad), SIN IVA (subtotal).
// - Conversión global = (aceptadas+firmadas+cerradas) / (esas + rechazadas).
// - KAM/Clientes: Activas = enviada+en revisión+modificada; Cerradas = aceptadas.
// Mejoras sobre el legacy: colores del catálogo y montos por moneda (no asume COP).
const EXCLUDED = new Set(["draft", "review_future"]);
const CONVERTED = new Set(["accepted", "purchased", "closed"]);
const ACTIVE = new Set(["draft", "sent", "under_review", "modified"]);

type Amounts = Record<string, number>;
function addAmount(acc: Amounts, currency: string, amount: number) {
  acc[currency] = (acc[currency] ?? 0) + amount;
}
/** Valor legacy de una cotización: Σ precio_cliente × cantidad (sin IVA). */
function quoteValue(items: { client_price: number; quantity: number }[]): number {
  return items.reduce((s, i) => s + (i.client_price || 0) * (i.quantity || 1), 0);
}
function amountLines(amounts: Amounts, tone: KpiTone): ReactNode {
  const e = Object.entries(amounts);
  if (e.length === 0) return <div className="font-mono text-[13px] text-muted">$ 0</div>;
  return e.map(([c, a]) => (
    <div key={c} className="flex items-center gap-2">
      <KpiDot tone={tone} />
      <span className="truncate font-mono text-[13px] text-muted">{formatMoney(a, c)}</span>
    </div>
  ));
}
function amountsInline(amounts: Amounts): string {
  const e = Object.entries(amounts);
  if (e.length === 0) return "$ 0";
  return e.map(([c, a]) => formatMoney(a, c)).join("  ·  ");
}
/** Para tarjetas de dinero: un valor principal (COP si existe) + el resto de
 * monedas aparte, para que el número grande no desborde con multi-moneda. */
function moneyMain(amounts: Amounts): { main: string; rest: Amounts } {
  const keys = Object.keys(amounts);
  if (keys.length === 0) return { main: "$ 0", rest: {} };
  const primary = amounts.COP !== undefined ? "COP" : (keys[0] as string);
  const rest: Amounts = { ...amounts };
  delete rest[primary];
  return { main: formatMoney(amounts[primary] ?? 0, primary), rest };
}

// --- Donut (SVG) ---------------------------------------------------------
function polar(cx: number, cy: number, r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}
function arcPath(cx: number, cy: number, oR: number, iR: number, s: number, e: number) {
  if (e - s >= 359.99) e = s + 359.98;
  const o1 = polar(cx, cy, oR, s);
  const o2 = polar(cx, cy, oR, e);
  const i1 = polar(cx, cy, iR, e);
  const i2 = polar(cx, cy, iR, s);
  const large = e - s > 180 ? 1 : 0;
  const f = (v: number) => v.toFixed(3);
  return `M${f(o1.x)} ${f(o1.y)} A${oR} ${oR} 0 ${large} 1 ${f(o2.x)} ${f(o2.y)} L${f(i1.x)} ${f(i1.y)} A${iR} ${iR} 0 ${large} 0 ${f(i2.x)} ${f(i2.y)}Z`;
}

interface SearchParams {
  kam?: string;
  periodo?: string;
  embudo?: string;
}

const PERIODS: { value: string; label: string; days: number | null }[] = [
  { value: "30d", label: "30d", days: 30 },
  { value: "90d", label: "90d", days: 90 },
  { value: "6m", label: "6m", days: 180 },
  { value: "all", label: "Todo", days: null },
];

function dashHref(sp: SearchParams, over: Partial<SearchParams>) {
  const p = { kam: sp.kam, periodo: sp.periodo, embudo: sp.embudo, ...over };
  const u = new URLSearchParams();
  if (p.kam) u.set("kam", p.kam);
  if (p.periodo && p.periodo !== "all") u.set("periodo", p.periodo);
  if (p.embudo) u.set("embudo", "1");
  const qs = u.toString();
  return qs ? `/crm/dashboard?${qs}` : "/crm/dashboard";
}

export default async function DashboardPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!hasPermission(user, "quote.dashboard")) redirect("/crm");

  const periodo = searchParams.periodo || "all";
  const showEmbudo = searchParams.embudo === "1";
  const kamId = searchParams.kam || undefined;
  const days = PERIODS.find((p) => p.value === periodo)?.days ?? null;
  let dateFrom: string | undefined;
  if (days) {
    const d = new Date();
    d.setDate(d.getDate() - days);
    dateFrom = d.toISOString();
  }

  const db = await getSupabaseServerClient();
  const [allQuotes, statusMap, kams] = await Promise.all([
    listPipelineQuotes(db, { dateFrom, kamId, includeClosed: true }),
    getQuoteStatusMap(db),
    listKams(db, { onlyActive: true }),
  ]);

  // Excluir borradores y revisión a futuro (como el legacy).
  const quotes = allQuotes.filter((q) => !EXCLUDED.has(q.status));

  // Acumuladores.
  const totalByCurrency: Amounts = {};
  const acceptedByCurrency: Amounts = {};
  const closedByCurrency: Amounts = {};
  let convertedCount = 0;
  let rejectedCount = 0;
  const byType: Record<"proyecto" | "evolutivo", { count: number; amounts: Amounts }> = {
    proyecto: { count: 0, amounts: {} },
    evolutivo: { count: 0, amounts: {} },
  };
  const byStatus = new Map<string, { count: number; amounts: Amounts }>();
  const byKam = new Map<
    string,
    { name: string; count: number; active: number; closed: number; amounts: Amounts }
  >();
  const byClient = new Map<
    string,
    { name: string; count: number; active: number; closed: number; amounts: Amounts }
  >();

  for (const q of quotes) {
    const value = quoteValue(q.quote_items);
    const cur = q.currency;

    addAmount(totalByCurrency, cur, value);
    if (q.status === "accepted") addAmount(acceptedByCurrency, cur, value);
    if (q.status === "closed") addAmount(closedByCurrency, cur, value);
    if (CONVERTED.has(q.status)) convertedCount += 1;
    if (q.status === "rejected") rejectedCount += 1;

    if (q.quote_type === "proyecto" || q.quote_type === "evolutivo") {
      byType[q.quote_type].count += 1;
      addAmount(byType[q.quote_type].amounts, cur, value);
    }

    const st = byStatus.get(q.status) ?? { count: 0, amounts: {} };
    st.count += 1;
    addAmount(st.amounts, cur, value);
    byStatus.set(q.status, st);

    const kKey = q.kam?.id ?? "none";
    const k = byKam.get(kKey) ?? {
      name: q.kam?.name ?? "Sin asignar",
      count: 0,
      active: 0,
      closed: 0,
      amounts: {},
    };
    k.count += 1;
    addAmount(k.amounts, cur, value);
    if (ACTIVE.has(q.status)) k.active += 1;
    else if (q.status === "accepted") k.closed += 1;
    byKam.set(kKey, k);

    const cKey = q.client?.id ?? "none";
    const company = q.client?.company ?? "Sin empresa";
    const name = q.client?.name ?? "Sin contacto";
    const c = byClient.get(cKey) ?? {
      name: `${company} · ${name}`,
      count: 0,
      active: 0,
      closed: 0,
      amounts: {},
    };
    c.count += 1;
    addAmount(c.amounts, cur, value);
    if (ACTIVE.has(q.status)) c.active += 1;
    else if (q.status === "accepted") c.closed += 1;
    byClient.set(cKey, c);
  }

  const totalCount = quotes.length;
  const finalized = convertedCount + rejectedCount;
  const conversion = finalized > 0 ? ((convertedCount / finalized) * 100).toFixed(1) : "0.0";
  const convTone: KpiTone =
    Number(conversion) >= 50 ? "green" : Number(conversion) >= 25 ? "warn" : "danger";
  const pct = (n: number) => (totalCount > 0 ? ((n / totalCount) * 100).toFixed(1) : "0");

  // Donut: estados presentes ordenados por catálogo.
  const donut = [...byStatus.entries()]
    .map(([code, v]) => ({ meta: resolveStatus(statusMap, code), ...v }))
    .sort((a, b) => a.meta.sortOrder - b.meta.sortOrder);
  const donutTotal = donut.reduce((s, d) => s + d.count, 0);
  let acc = 0;
  const gap = 0.8;
  const arcs = donut.map((d) => {
    const sweep = donutTotal > 0 ? (d.count / donutTotal) * 360 : 0;
    const path = arcPath(130, 130, 120, 68, acc + gap / 2, acc + sweep - gap / 2);
    acc += sweep;
    return { ...d, path, pct: donutTotal > 0 ? Math.round((d.count / donutTotal) * 100) : 0 };
  });

  const kamRows = [...byKam.values()].sort(
    (a, b) =>
      Object.values(b.amounts).reduce((s, n) => s + n, 0) -
      Object.values(a.amounts).reduce((s, n) => s + n, 0),
  );
  const clientRows = [...byClient.values()].sort(
    (a, b) =>
      Object.values(b.amounts).reduce((s, n) => s + n, 0) -
      Object.values(a.amounts).reduce((s, n) => s + n, 0),
  );

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard KPIs</h1>
          <p className="mt-1 text-sm text-muted">Métricas clave del negocio.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <form method="GET" action="/crm/dashboard" className="flex items-center gap-2">
            {periodo !== "all" && <input type="hidden" name="periodo" value={periodo} />}
            {showEmbudo && <input type="hidden" name="embudo" value="1" />}
            <select
              name="kam"
              defaultValue={searchParams.kam ?? ""}
              className="rounded-[10px] border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-green"
            >
              <option value="">Todas las KAM/PM</option>
              {kams.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.name}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="cursor-pointer rounded-pill border border-line-strong px-4 py-2 text-sm font-semibold text-ink transition hover:border-green"
            >
              Filtrar
            </button>
          </form>
          <a
            href={dashHref(searchParams, { embudo: showEmbudo ? "" : "1" })}
            className={`rounded-pill border px-4 py-2 text-sm font-semibold transition ${
              showEmbudo ? "border-green text-green" : "border-line-strong text-muted hover:text-ink"
            }`}
          >
            Embudo
          </a>
          <div className="flex items-center gap-1 rounded-pill border border-line p-1">
            {PERIODS.map((p) => {
              const active = periodo === p.value;
              return (
                <a
                  key={p.value}
                  href={dashHref(searchParams, { periodo: p.value })}
                  className={`rounded-pill px-3 py-1.5 text-sm font-semibold transition ${
                    active ? "bg-green text-green-ink" : "text-muted hover:text-ink"
                  }`}
                >
                  {p.label}
                </a>
              );
            })}
          </div>
        </div>
      </div>

      {/* Fila 1: 5 KPIs */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
        <KpiCard
          label="Total cotizaciones"
          value={totalCount}
          hint="Excluye borradores y revisión a futuro"
          icon={QUOTE_KPI_ICONS.total}
          tone="purple"
          highlight
          sub={amountLines(totalByCurrency, "purple")}
        />
        <KpiCard
          label="Tasa conversión"
          value={`${conversion}%`}
          hint="Positivas / finalizadas"
          icon={QUOTE_KPI_ICONS.accepted}
          tone={convTone}
        />
        <KpiCard
          label="Valor total"
          value={<span className="text-[22px] leading-tight">{moneyMain(totalByCurrency).main}</span>}
          hint="Todos los estados"
          icon={QUOTE_KPI_ICONS.total}
          tone="purple"
          sub={
            Object.keys(moneyMain(totalByCurrency).rest).length > 0
              ? amountLines(moneyMain(totalByCurrency).rest, "purple")
              : undefined
          }
        />
        <KpiCard
          label="Valor aceptado"
          value={<span className="text-[22px] leading-tight">{moneyMain(acceptedByCurrency).main}</span>}
          hint="Cotizaciones aceptadas"
          icon={QUOTE_KPI_ICONS.accepted}
          tone="green"
          sub={
            Object.keys(moneyMain(acceptedByCurrency).rest).length > 0
              ? amountLines(moneyMain(acceptedByCurrency).rest, "green")
              : undefined
          }
        />
        <KpiCard
          label="Cerradas"
          value={<span className="text-[22px] leading-tight">{moneyMain(closedByCurrency).main}</span>}
          hint="Negocios cerrados"
          icon={QUOTE_KPI_ICONS.closed}
          tone="neutral"
          sub={
            Object.keys(moneyMain(closedByCurrency).rest).length > 0
              ? amountLines(moneyMain(closedByCurrency).rest, "neutral")
              : undefined
          }
        />
      </div>

      {/* Fila 2: por tipo */}
      <div className="mt-4 grid grid-cols-2 gap-4">
        <KpiCard
          label="Proyectos"
          value={byType.proyecto.count}
          hint={`${pct(byType.proyecto.count)}% del total`}
          icon={QUOTE_KPI_ICONS.sent}
          tone="purple"
          sub={amountLines(byType.proyecto.amounts, "purple")}
        />
        <KpiCard
          label="Evolutivos"
          value={byType.evolutivo.count}
          hint={`${pct(byType.evolutivo.count)}% del total`}
          icon={QUOTE_KPI_ICONS.under_review}
          tone="purple"
          sub={amountLines(byType.evolutivo.amounts, "purple")}
        />
      </div>

      {/* Distribución por etapa (donut) + Embudo (al lado si está activo) */}
      <div className={showEmbudo ? "mt-6 grid gap-6 xl:grid-cols-2" : "mt-6"}>
        <section className="rounded-lg border border-line bg-glass p-6 backdrop-blur-xl">
          <h2 className="text-lg font-bold tracking-tight">Distribución por etapa</h2>
          <p className="mb-6 text-sm text-muted">
            <span className="font-semibold text-ink">¿Dónde están las cotizaciones hoy?</span> Cada
            segmento muestra qué porcentaje del total se encuentra actualmente en esa etapa. Útil
            para ver en qué momento del proceso se acumula más trabajo.
          </p>
          {donutTotal === 0 ? (
            <p className="text-sm text-muted">Sin datos en el período.</p>
          ) : (
            <div className="flex flex-col items-center gap-6">
              <svg viewBox="0 0 260 260" className="h-56 w-56 shrink-0">
                {arcs.map((a) => (
                  <path key={a.meta.code} d={a.path} fill={a.meta.color} opacity="0.9">
                    <title>{`${a.meta.label}: ${a.count} cotizaciones (${a.pct}%) — ${amountsInline(a.amounts)}`}</title>
                  </path>
                ))}
                <text x="130" y="122" textAnchor="middle" className="fill-ink text-[34px] font-bold">
                  {donutTotal}
                </text>
                <text x="130" y="146" textAnchor="middle" className="fill-muted text-[13px]">
                  cots.
                </text>
              </svg>
              <div className="w-full space-y-2">
                {arcs.map((a) => (
                  <div key={a.meta.code} className="flex items-center gap-3 text-sm">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-pill"
                      style={{ background: a.meta.color }}
                    />
                    <span className="flex-1 text-ink">{a.meta.label}</span>
                    <span className="font-mono text-muted">{a.count}</span>
                    <span className="w-10 text-right font-mono font-bold text-ink">{a.pct}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {showEmbudo && (
          <section className="rounded-lg border border-line bg-glass p-6 backdrop-blur-xl">
            <h2 className="text-lg font-bold tracking-tight">Embudo de negocio</h2>
            <p className="mb-6 text-sm text-muted">
              <span className="font-semibold text-ink">¿Cuántas avanzan?</span> El % debajo de cada
              etapa muestra qué fracción del pipeline logró progresar más allá de ella. Un % bajo
              revela dónde se pierden más oportunidades.
            </p>
            {(() => {
              const fc = (codes: string[]) =>
                codes.reduce((s, c) => s + (byStatus.get(c)?.count ?? 0), 0);
              const fa = (codes: string[]): Amounts => {
                const a: Amounts = {};
                for (const c of codes) {
                  const m = byStatus.get(c);
                  if (m) for (const [cur, v] of Object.entries(m.amounts)) addAmount(a, cur, v);
                }
                return a;
              };
              const evalC = fc(["draft"]);
              const negC = fc(["sent", "under_review", "modified"]);
              const cierreC = fc(["accepted", "purchased"]);
              const cerradaC = fc(["closed"]);
              const rechC = fc(["rejected"]);
              const totalF = evalC + negC + cierreC + cerradaC + rechC;
              const p = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);
              const stages = [
                { label: "Evaluación inicial", color: "#ef4444", count: evalC, amounts: fa(["draft"]), conv: p(negC + cierreC + cerradaC, totalF), convLabel: "pasan a negociación" },
                { label: "Negociación activa", color: "#f59e0b", count: negC, amounts: fa(["sent", "under_review", "modified"]), conv: p(cierreC + cerradaC, negC + cierreC + cerradaC), convLabel: "llegan a cierre" },
                { label: "Cierre próximo", color: "#10b981", count: cierreC, amounts: fa(["accepted", "purchased"]), conv: p(cerradaC, cierreC + cerradaC), convLabel: "quedan cerradas" },
                { label: "Cerrada", color: "#059669", count: cerradaC, amounts: fa(["closed"]), conv: p(cerradaC, totalF), convLabel: "tasa de cierre del total" },
                { label: "Rechazada", color: "#ef4444", count: rechC, amounts: fa(["rejected"]), conv: p(rechC, totalF), convLabel: "tasa de rechazo del total" },
              ];
              return (
                <div className="divide-y divide-line">
                  {stages.map((s) => (
                    <div key={s.label} className="py-4 first:pt-0 last:pb-0">
                      <div className="flex items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-pill"
                          style={{ background: s.color }}
                        />
                        <span className="text-sm font-semibold text-ink">{s.label}</span>
                      </div>
                      <div className="mt-1 flex items-end justify-between gap-3">
                        <div>
                          <span className="text-3xl font-bold text-ink">{s.count}</span>
                          <span className="text-xs text-muted"> cots.</span>
                        </div>
                        <div className="font-mono text-sm font-bold text-purple">
                          {amountsInline(s.amounts)}
                        </div>
                      </div>
                      <div className="mt-1 text-xs text-muted">
                        ↓ <span className="font-bold text-purple">{s.conv}%</span> {s.convLabel}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
          </section>
        )}
      </div>

      <div className="mt-6 space-y-6">
        {/* Rendimiento KAM / PM */}
        <section className="rounded-lg border border-line bg-glass p-6 backdrop-blur-xl">
          <h2 className="mb-4 text-lg font-bold tracking-tight">Rendimiento KAM / PM</h2>
          {kamRows.length === 0 ? (
            <p className="text-sm text-muted">Sin datos.</p>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>KAM / PM</Th>
                  <Th className="text-right">#</Th>
                  <Th className="text-right">Activas</Th>
                  <Th className="text-right">Cerradas</Th>
                  <Th className="text-right">Valor total</Th>
                  <Th className="text-right">Conv.</Th>
                </tr>
              </thead>
              <tbody>
                {kamRows.map((k) => (
                  <tr key={k.name} className="transition hover:bg-surface-2">
                    <Td className="text-sm font-semibold">{k.name}</Td>
                    <Td className="text-right font-mono text-sm">{k.count}</Td>
                    <Td className="text-right font-mono text-sm">{k.active}</Td>
                    <Td className="text-right font-mono text-sm font-bold text-green">{k.closed}</Td>
                    <Td className="whitespace-nowrap text-right font-mono text-[12px] text-muted">
                      {amountsInline(k.amounts)}
                    </Td>
                    <Td className="text-right font-mono text-sm">
                      {k.count > 0 ? Math.round((k.closed / k.count) * 100) : 0}%
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </section>

        {/* Top clientes */}
        <section className="rounded-lg border border-line bg-glass p-6 backdrop-blur-xl">
          <h2 className="mb-4 text-lg font-bold tracking-tight">Top clientes</h2>
          {clientRows.length === 0 ? (
            <p className="text-sm text-muted">Sin datos.</p>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Empresa / Cliente</Th>
                  <Th className="text-right">#</Th>
                  <Th className="text-right">Activas</Th>
                  <Th className="text-right">Cerradas</Th>
                  <Th className="text-right">Valor total</Th>
                </tr>
              </thead>
              <tbody>
                {clientRows.map((c) => (
                  <tr key={c.name} className="transition hover:bg-surface-2">
                    <Td className="max-w-[28ch] truncate text-sm font-semibold">{c.name}</Td>
                    <Td className="text-right font-mono text-sm">{c.count}</Td>
                    <Td className="text-right font-mono text-sm">{c.active}</Td>
                    <Td className="text-right font-mono text-sm font-bold text-green">{c.closed}</Td>
                    <Td className="whitespace-nowrap text-right font-mono text-[12px] text-muted">
                      {amountsInline(c.amounts)}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </section>
      </div>
    </div>
  );
}
