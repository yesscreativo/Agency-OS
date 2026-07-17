"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { calcQuote, formatDate, formatMoney } from "@agency-os/domain";
import { Button, Input, Label, Select, Textarea } from "@agency-os/ui";
import {
  saveQuoteDraft,
  sendQuote,
  uploadBrief,
  type QuoteDraftInput,
  type QuoteItemInput,
  type QuoteRecipientInput,
} from "@/lib/quote-actions";

export interface QuoteFormInitial {
  id: string;
  status: string;
  clientId: string;
  kamId: string | null;
  quoteType: string | null;
  quoteName: string | null;
  message: string | null;
  internalNotes: string | null;
  currency: string;
  eventDate: string | null;
  hasIva: boolean;
  ivaPercentage: number;
  briefPath: string | null;
  items: QuoteItemInput[];
  recipients: QuoteRecipientInput[];
}

interface QuoteFormProps {
  initial: QuoteFormInitial | null;
  clients: { id: string; name: string; company: string | null }[];
  kams: { id: string; name: string }[];
  canSeeCosts: boolean;
  briefSignedUrl: string | null;
  versions?: { version_number: number; created_at: string }[];
}

type ItemRow = QuoteItemInput & { key: string };

let keySeq = 0;
const nextKey = () => `row-${++keySeq}`;

function emptyItem(isGroup = false): ItemRow {
  return {
    key: nextKey(),
    description: "",
    quantity: 1,
    clientPrice: 0,
    costPrice: 0,
    supplier: "",
    isGroup,
  };
}

type SaveState =
  | { kind: "clean" }
  | { kind: "dirty" }
  | { kind: "saving" }
  | { kind: "saved"; at: string }
  | { kind: "error"; message: string };

export function QuoteForm({
  initial,
  clients,
  kams,
  canSeeCosts,
  briefSignedUrl,
  versions = [],
}: QuoteFormProps) {
  const router = useRouter();
  const [quoteId, setQuoteId] = useState<string | null>(initial?.id ?? null);
  const [clientId, setClientId] = useState(initial?.clientId ?? "");
  const [kamId, setKamId] = useState(initial?.kamId ?? "");
  const [quoteType, setQuoteType] = useState(initial?.quoteType ?? "");
  const [quoteName, setQuoteName] = useState(initial?.quoteName ?? "");
  const [message, setMessage] = useState(initial?.message ?? "");
  const [internalNotes, setInternalNotes] = useState(initial?.internalNotes ?? "");
  const [currency, setCurrency] = useState<"COP" | "USD">(
    initial?.currency === "USD" ? "USD" : "COP",
  );
  const [eventDate, setEventDate] = useState(initial?.eventDate ?? "");
  const [hasIva, setHasIva] = useState(initial?.hasIva ?? false);
  const [ivaPercentage, setIvaPercentage] = useState(initial?.ivaPercentage || 19);
  const [items, setItems] = useState<ItemRow[]>(() =>
    initial && initial.items.length > 0
      ? initial.items.map((item) => ({ ...item, key: nextKey() }))
      : [emptyItem()],
  );
  const [recipients, setRecipients] = useState<QuoteRecipientInput[]>(initial?.recipients ?? []);
  const [saveState, setSaveState] = useState<SaveState>({ kind: "clean" });
  const [briefUrl, setBriefUrl] = useState(briefSignedUrl);
  const [isPending, startTransition] = useTransition();

  const dragIndex = useRef<number | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>();

  const buildInput = useCallback((): QuoteDraftInput => {
    return {
      id: quoteId ?? undefined,
      clientId,
      kamId,
      quoteType: quoteType === "proyecto" || quoteType === "evolutivo" ? quoteType : "",
      quoteName,
      message,
      internalNotes,
      currency,
      eventDate,
      hasIva,
      ivaPercentage,
      items: items.map((row) => ({
        description: row.description,
        quantity: row.quantity,
        clientPrice: row.clientPrice,
        costPrice: row.costPrice,
        supplier: row.supplier,
        isGroup: row.isGroup,
      })),
      recipients,
    };
  }, [
    quoteId,
    clientId,
    kamId,
    quoteType,
    quoteName,
    message,
    internalNotes,
    currency,
    eventDate,
    hasIva,
    ivaPercentage,
    items,
    recipients,
  ]);

  // Snapshot de lo último guardado (sin el id) para detectar cambios reales.
  const serialize = (input: QuoteDraftInput) => JSON.stringify({ ...input, id: undefined });
  const lastSaved = useRef<string | null>(null);
  if (lastSaved.current === null) lastSaved.current = serialize(buildInput());

  const persist = useCallback(() => {
    if (!clientId) return;
    const input = buildInput();
    setSaveState({ kind: "saving" });
    startTransition(async () => {
      const result = await saveQuoteDraft(input);
      if (result.error) {
        setSaveState({ kind: "error", message: result.error });
        return;
      }
      // Nota: no se toca window.history aquí — con App Router un replaceState
      // dispara re-navegación y remonta el formulario perdiendo estado en edición.
      if (!quoteId && result.id) setQuoteId(result.id);
      lastSaved.current = serialize(input);
      setSaveState({
        kind: "saved",
        at: new Date().toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" }),
      });
    });
  }, [buildInput, clientId, quoteId]);

  // Autosave con debounce: solo si el contenido difiere del último guardado.
  useEffect(() => {
    if (!clientId) return;
    if (serialize(buildInput()) === lastSaved.current) return;
    setSaveState((s) => (s.kind === "saving" ? s : { kind: "dirty" }));
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(persist, 2500);
    return () => clearTimeout(saveTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    clientId,
    kamId,
    quoteType,
    quoteName,
    message,
    internalNotes,
    currency,
    eventDate,
    hasIva,
    ivaPercentage,
    items,
    recipients,
  ]);

  const totals = useMemo(
    () =>
      calcQuote(
        items.map((item) => ({
          clientPrice: item.clientPrice,
          costPrice: item.costPrice,
          quantity: item.quantity,
          isGroup: item.isGroup,
        })),
        { role: "kam", hasIva, ivaPercentage },
      ),
    [items, hasIva, ivaPercentage],
  );

  const updateItem = (key: string, patch: Partial<QuoteItemInput>) => {
    setItems((rows) => rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  };

  const removeItem = (key: string) => {
    setItems((rows) => (rows.length > 1 ? rows.filter((row) => row.key !== key) : rows));
  };

  const onDrop = (targetIndex: number) => {
    const from = dragIndex.current;
    dragIndex.current = null;
    if (from === null || from === targetIndex) return;
    setItems((rows) => {
      const next = [...rows];
      const [moved] = next.splice(from, 1);
      if (moved) next.splice(targetIndex, 0, moved);
      return next;
    });
  };

  const onBriefSelected = () => {
    const file = fileInput.current?.files?.[0];
    if (!file) return;
    const doUpload = (id: string) => {
      const fd = new FormData();
      fd.set("brief", file);
      startTransition(async () => {
        const result = await uploadBrief(id, fd);
        if (result.error) {
          setSaveState({ kind: "error", message: result.error });
        } else {
          setBriefUrl(file.name);
          setSaveState({
            kind: "saved",
            at: new Date().toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" }),
          });
        }
      });
    };
    if (quoteId) {
      doUpload(quoteId);
    } else if (clientId) {
      // Sin cotización todavía: primero se crea el borrador y luego se sube.
      startTransition(async () => {
        const result = await saveQuoteDraft(buildInput());
        if (result.error || !result.id) {
          setSaveState({ kind: "error", message: result.error ?? "No se pudo guardar." });
          return;
        }
        setQuoteId(result.id);
        doUpload(result.id);
      });
    }
  };

  // Enviar = guardar lo actual y luego disparar la transición a `sent`.
  const onSend = () => {
    if (!clientId) return;
    clearTimeout(saveTimer.current);
    const input = buildInput();
    setSaveState({ kind: "saving" });
    startTransition(async () => {
      const saved = await saveQuoteDraft(input);
      if (saved.error || !saved.id) {
        setSaveState({ kind: "error", message: saved.error ?? "No se pudo guardar." });
        return;
      }
      if (!quoteId) setQuoteId(saved.id);
      lastSaved.current = serialize(input);
      const sent = await sendQuote(saved.id);
      if (sent.error) {
        setSaveState({ kind: "error", message: sent.error });
        return;
      }
      setSaveState({
        kind: "saved",
        at: new Date().toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" }),
      });
      // Enviada: ahora sí navegamos a la URL real (remontar ya no pierde nada).
      router.replace(`/crm/${saved.id}`);
      router.refresh();
    });
  };

  const saveLabel = {
    clean: "Sin cambios",
    dirty: "Cambios sin guardar…",
    saving: "Guardando…",
    saved: `Guardado${saveState.kind === "saved" ? ` · ${saveState.at}` : ""}`,
    error: saveState.kind === "error" ? saveState.message : "",
  }[saveState.kind];

  const inputCell =
    "w-full rounded-[10px] border border-transparent bg-transparent px-2 py-1.5 text-sm text-ink outline-none transition focus:border-green focus:bg-surface";

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-6">
        {/* Datos generales */}
        <section className="rounded-lg border border-line bg-surface p-6">
          <h2 className="text-lg font-bold tracking-tight">Datos generales</h2>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="qf-client">Cliente *</Label>
              <Select
                id="qf-client"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
              >
                <option value="">Selecciona…</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.company ? ` · ${c.company}` : ""}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="qf-kam">KAM / PM</Label>
              <Select id="qf-kam" value={kamId} onChange={(e) => setKamId(e.target.value)}>
                <option value="">Sin asignar</option>
                {kams.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="qf-type">Tipo</Label>
              <Select
                id="qf-type"
                value={quoteType ?? ""}
                onChange={(e) => setQuoteType(e.target.value)}
              >
                <option value="">Sin tipo</option>
                <option value="proyecto">Proyecto</option>
                <option value="evolutivo">Evolutivo</option>
              </Select>
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="qf-name">Nombre de la cotización</Label>
              <Input
                id="qf-name"
                value={quoteName}
                onChange={(e) => setQuoteName(e.target.value)}
                placeholder="Campaña lanzamiento Q3…"
              />
            </div>
            <div>
              <Label htmlFor="qf-date">Fecha del evento</Label>
              <Input
                id="qf-date"
                type="date"
                value={eventDate}
                onChange={(e) => setEventDate(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="qf-currency">Moneda</Label>
              <Select
                id="qf-currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value === "USD" ? "USD" : "COP")}
              >
                <option value="COP">COP — Peso colombiano</option>
                <option value="USD">USD — Dólar</option>
              </Select>
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="qf-message">Mensaje para el cliente</Label>
              <Textarea
                id="qf-message"
                rows={2}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="qf-notes">Notas internas</Label>
              <Textarea
                id="qf-notes"
                rows={2}
                value={internalNotes}
                onChange={(e) => setInternalNotes(e.target.value)}
                placeholder="Solo visibles para el equipo"
              />
            </div>
          </div>
        </section>

        {/* Ítems */}
        <section className="rounded-lg border border-line bg-surface p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-bold tracking-tight">Ítems</h2>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setItems((r) => [...r, emptyItem(true)])}>
                + Grupo
              </Button>
              <Button variant="outline" size="sm" onClick={() => setItems((r) => [...r, emptyItem()])}>
                + Ítem
              </Button>
            </div>
          </div>

          <div className="ds-scroll mt-4 overflow-x-auto">
            <div className="min-w-[640px]">
              <div
                className={`grid ${canSeeCosts ? "grid-cols-[24px_1fr_64px_120px_120px_110px_32px]" : "grid-cols-[24px_1fr_64px_120px_110px_32px]"} gap-2 px-1 pb-2 text-[11px] font-semibold uppercase tracking-wider text-muted`}
              >
                <span />
                <span>Descripción</span>
                <span>Cant.</span>
                <span>Precio cliente</span>
                {canSeeCosts && <span>Costo</span>}
                <span>Proveedor</span>
                <span />
              </div>
              <div className="space-y-1">
                {items.map((item, index) => (
                  <div
                    key={item.key}
                    draggable
                    onDragStart={() => (dragIndex.current = index)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => onDrop(index)}
                    className={`grid ${canSeeCosts ? "grid-cols-[24px_1fr_64px_120px_120px_110px_32px]" : "grid-cols-[24px_1fr_64px_120px_110px_32px]"} items-center gap-2 rounded-[12px] border px-1 py-1 ${
                      item.isGroup
                        ? "border-transparent bg-surface-2"
                        : "border-line bg-bg/40"
                    }`}
                  >
                    <span
                      className="cursor-grab select-none text-center text-faint active:cursor-grabbing"
                      title="Arrastra para reordenar"
                    >
                      ⋮⋮
                    </span>
                    <input
                      value={item.description}
                      onChange={(e) => updateItem(item.key, { description: e.target.value })}
                      placeholder={item.isGroup ? "Nombre del grupo…" : "Descripción del ítem…"}
                      className={`${inputCell} ${item.isGroup ? "font-bold uppercase tracking-wide" : ""}`}
                    />
                    {item.isGroup ? (
                      <span className="col-span-1 text-center text-xs text-faint">—</span>
                    ) : (
                      <input
                        type="number"
                        min={1}
                        value={item.quantity}
                        onChange={(e) => updateItem(item.key, { quantity: Number(e.target.value) })}
                        className={`${inputCell} text-center`}
                      />
                    )}
                    {item.isGroup ? (
                      <span className="text-center text-xs text-faint">—</span>
                    ) : (
                      <input
                        type="number"
                        min={0}
                        value={item.clientPrice}
                        onChange={(e) =>
                          updateItem(item.key, { clientPrice: Number(e.target.value) })
                        }
                        className={`${inputCell} text-right font-mono text-[13px]`}
                      />
                    )}
                    {canSeeCosts &&
                      (item.isGroup ? (
                        <span className="text-center text-xs text-faint">—</span>
                      ) : (
                        <input
                          type="number"
                          min={0}
                          value={item.costPrice}
                          onChange={(e) =>
                            updateItem(item.key, { costPrice: Number(e.target.value) })
                          }
                          className={`${inputCell} text-right font-mono text-[13px]`}
                        />
                      ))}
                    {item.isGroup ? (
                      <span className="text-center text-xs text-faint">—</span>
                    ) : (
                      <input
                        value={item.supplier}
                        onChange={(e) => updateItem(item.key, { supplier: e.target.value })}
                        placeholder="—"
                        className={`${inputCell} text-[13px]`}
                      />
                    )}
                    <button
                      type="button"
                      onClick={() => removeItem(item.key)}
                      aria-label="Eliminar fila"
                      className="cursor-pointer text-center text-faint transition hover:text-danger"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Destinatarios */}
        <section className="rounded-lg border border-line bg-surface p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold tracking-tight">Destinatarios</h2>
              <p className="mt-0.5 text-[13px] text-muted">
                Recibirán el enlace público para responder (expira a los 5 días).
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRecipients((r) => [...r, { name: "", email: "" }])}
            >
              + Destinatario
            </Button>
          </div>
          {recipients.length > 0 && (
            <div className="mt-4 space-y-2">
              {recipients.map((r, i) => (
                <div key={i} className="grid grid-cols-[1fr_1fr_32px] items-center gap-2">
                  <Input
                    value={r.name}
                    placeholder="Nombre"
                    onChange={(e) =>
                      setRecipients((rows) =>
                        rows.map((row, j) => (j === i ? { ...row, name: e.target.value } : row)),
                      )
                    }
                    className="py-2.5"
                  />
                  <Input
                    value={r.email}
                    type="email"
                    placeholder="correo@cliente.com"
                    onChange={(e) =>
                      setRecipients((rows) =>
                        rows.map((row, j) => (j === i ? { ...row, email: e.target.value } : row)),
                      )
                    }
                    className="py-2.5"
                  />
                  <button
                    type="button"
                    aria-label="Quitar destinatario"
                    onClick={() => setRecipients((rows) => rows.filter((_, j) => j !== i))}
                    className="cursor-pointer text-center text-faint transition hover:text-danger"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Panel lateral: totales + brief + guardado */}
      <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
        <div className="rounded-lg border border-line bg-surface p-6">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted">Resumen</h3>
          <dl className="mt-4 space-y-2.5 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted">Subtotal</dt>
              <dd className="font-mono font-bold">
                {formatMoney(totals.subtotalClient, currency)}
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="flex items-center gap-2 text-muted">
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={hasIva}
                    onChange={(e) => {
                      setHasIva(e.target.checked);
                      if (e.target.checked && !ivaPercentage) setIvaPercentage(19);
                    }}
                    className="h-4 w-4 accent-[var(--green)]"
                  />
                  IVA
                </label>
                {hasIva && (
                  <span className="flex items-center gap-1">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={ivaPercentage}
                      onChange={(e) => setIvaPercentage(Number(e.target.value))}
                      className="w-14 rounded-[8px] border border-line-strong bg-bg px-1.5 py-0.5 text-right text-xs text-ink outline-none focus:border-green"
                    />
                    %
                  </span>
                )}
              </dt>
              <dd className="font-mono">{formatMoney(totals.ivaAmount, currency)}</dd>
            </div>
            <div className="flex justify-between border-t border-line pt-2.5 text-base">
              <dt className="font-semibold">Total</dt>
              <dd className="font-mono font-bold text-green">
                {formatMoney(totals.total, currency)}
              </dd>
            </div>
            {canSeeCosts && (
              <>
                <div className="flex justify-between border-t border-line pt-2.5">
                  <dt className="text-muted">Costo total</dt>
                  <dd className="font-mono">{formatMoney(totals.subtotalCost, currency)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted">Margen</dt>
                  <dd
                    className={`font-mono font-bold ${totals.margin >= 0 ? "text-green" : "text-danger"}`}
                  >
                    {formatMoney(totals.margin, currency)} ·{" "}
                    {totals.marginPercentage.toFixed(1)}%
                  </dd>
                </div>
              </>
            )}
          </dl>
        </div>

        <div className="rounded-lg border border-line bg-surface p-6">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted">Brief</h3>
          {briefUrl ? (
            <p className="mt-3 truncate text-sm text-ink">
              📎 <span className="text-muted">{briefUrl.split("/").pop()}</span>
            </p>
          ) : (
            <p className="mt-3 text-[13px] text-muted">Adjunta el brief del proyecto (máx 10 MB).</p>
          )}
          <input
            ref={fileInput}
            type="file"
            className="hidden"
            onChange={onBriefSelected}
            aria-label="Adjuntar brief"
          />
          <Button
            variant="outline"
            size="sm"
            className="mt-3 w-full"
            disabled={!clientId || isPending}
            onClick={() => fileInput.current?.click()}
          >
            {briefUrl ? "Reemplazar brief" : "Adjuntar brief"}
          </Button>
        </div>

        <div className="rounded-lg border border-line bg-surface p-6">
          <div
            className={`text-[13px] ${saveState.kind === "error" ? "text-danger" : "text-muted"}`}
            role="status"
          >
            {clientId ? saveLabel : "Selecciona un cliente para empezar a guardar."}
          </div>
          <Button
            className="mt-3 w-full"
            disabled={!clientId || saveState.kind === "saving"}
            onClick={() => {
              clearTimeout(saveTimer.current);
              persist();
            }}
          >
            Guardar borrador
          </Button>
          <Button
            variant="secondary"
            className="mt-2 w-full"
            disabled={!clientId || isPending}
            onClick={onSend}
          >
            {initial && initial.status !== "draft" ? "Reenviar al cliente" : "Enviar al cliente"}
          </Button>
        </div>

        {quoteId && (
          <div className="rounded-lg border border-line bg-surface p-6">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted">PDF</h3>
            <div className="mt-3 flex flex-col gap-2">
              <a
                href={`/crm/${quoteId}/imprimir?vista=cliente`}
                target="_blank"
                rel="noreferrer"
                className="rounded-pill border border-line-strong px-4 py-2 text-center text-[13px] font-semibold text-ink transition hover:border-green"
              >
                Ver PDF cliente
              </a>
              {canSeeCosts && (
                <a
                  href={`/crm/${quoteId}/imprimir?vista=interna`}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-pill border border-line-strong px-4 py-2 text-center text-[13px] font-semibold text-ink transition hover:border-green"
                >
                  Ver PDF interno (costos)
                </a>
              )}
            </div>
          </div>
        )}

        {versions.length > 0 && (
          <div className="rounded-lg border border-line bg-surface p-6">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted">
              Versiones
            </h3>
            <ul className="mt-3 space-y-2 text-sm">
              {versions.map((v) => (
                <li key={v.version_number} className="flex justify-between">
                  <span className="font-mono font-bold">v{v.version_number}</span>
                  <span className="text-muted">{formatDate(v.created_at)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </aside>
    </div>
  );
}
