"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import {
  calcQuote,
  clientPriceFromMargin,
  formatDate,
  formatMoney,
  getQuoteProgress,
  marginPctFromPrices,
} from "@agency-os/domain";
import { Badge, Button, Input, Label, Select, Textarea } from "@agency-os/ui";
import {
  deleteQuote,
  saveCommercialDocs,
  saveQuoteDraft,
  sendQuote,
  setQuoteStatus,
  uploadBrief,
  type QuoteDraftInput,
  type QuoteItemInput,
  type QuoteRecipientInput,
} from "@/lib/quote-actions";
import { sendSupplierOrder } from "@/lib/supplier-order-actions";
import type { QuoteAccess } from "@/lib/auth";
import {
  QUOTE_ITEM_STATUS_META,
  summarizeClientResponse,
  type QuoteItemStatus,
} from "@/lib/quote-item-status";

export interface QuoteFormInitial {
  id: string;
  code: string | null;
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
  purchaseOrder: string | null;
  invoiceNumber: string | null;
  createdAt: string | null;
  sentAt: string | null;
  currentVersion: number | null;
  items: QuoteItemInput[];
  recipients: QuoteRecipientInput[];
}

export interface QuoteStatusOption {
  code: string;
  label: string;
  color: string;
  variant: "soft" | "solid";
  onColor?: string;
}

export interface QuoteVersionView {
  version_number: number;
  created_at: string;
  total: number;
  itemCount: number;
  currency: string;
}

export interface SupplierOrderView {
  supplierName: string;
  supplierEmail: string;
  message: string | null;
  token: string;
  status: string;
  sentAt: string | null;
  confirmedAt: string | null;
}

interface QuoteFormProps {
  initial: QuoteFormInitial | null;
  clients: { id: string; name: string; company: string | null }[];
  kams: { id: string; name: string }[];
  access: QuoteAccess;
  briefSignedUrl: string | null;
  versions?: QuoteVersionView[];
  statuses?: QuoteStatusOption[];
  supplierOrders?: SupplierOrderView[];
}

type ItemRow = QuoteItemInput & { key: string; marginPct: number };

// Key única e irrepetible por fila. Se evita un contador de módulo porque el Fast
// Refresh de dev lo reinicia y provoca colisiones de key entre filas viejas y nuevas
// (React comparte el estado → el texto de una fila aparece en otra).
let keySeq = 0;
const nextKey = () =>
  typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `row-${++keySeq}`;

/** id estable de BD para un ítem nuevo (uuid), generado en el cliente para que el
 * upsert por id conserve la respuesta del cliente y los precios entre guardados. */
const newItemId = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${++keySeq}`;

function emptyItem(isGroup = false): ItemRow {
  return {
    key: nextKey(),
    id: newItemId(),
    description: "",
    quantity: 1,
    clientPrice: 0,
    costPrice: 0,
    supplier: "",
    isGroup,
    marginPct: 0,
  };
}

type SaveState =
  | { kind: "clean" }
  | { kind: "dirty" }
  | { kind: "saving" }
  | { kind: "saved"; at: string }
  | { kind: "error"; message: string };

function nowLabel() {
  return new Date().toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });
}

function autoGrow(el: HTMLTextAreaElement) {
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
}

// Miles con punto (es-CO) para los campos de precio; mejora la lectura de montos.
const formatThousands = (n: number) => (Number.isFinite(n) ? Math.round(n) : 0).toLocaleString("es-CO");
const parseThousands = (s: string) => {
  const digits = s.replace(/\D/g, "");
  return digits ? parseInt(digits, 10) : 0;
};

export function QuoteForm({
  initial,
  clients,
  kams,
  access,
  briefSignedUrl,
  versions = [],
  statuses = [],
  supplierOrders = [],
}: QuoteFormProps) {
  const {
    seeCost,
    seeClientPrice,
    seeMargin,
    canEdit,
    canSend,
    canManageInternal,
    canSendSupplierOrder,
    priceRole,
  } = access;
  const router = useRouter();
  const [quoteId, setQuoteId] = useState<string | null>(initial?.id ?? null);
  const [clientId, setClientId] = useState(initial?.clientId ?? "");
  // Si la KAM asignada ya no está entre las opciones (fue desactivada), el select
  // arranca en "Sin asignar" y al guardar queda null.
  const [kamId, setKamId] = useState(
    initial?.kamId && kams.some((k) => k.id === initial.kamId) ? initial.kamId : "",
  );
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
      ? initial.items.map((item) => ({
          ...item,
          key: nextKey(),
          marginPct: marginPctFromPrices(item.costPrice, item.clientPrice),
        }))
      : [emptyItem()],
  );
  const [recipients, setRecipients] = useState<QuoteRecipientInput[]>(initial?.recipients ?? []);
  const [saveState, setSaveState] = useState<SaveState>({ kind: "clean" });
  const [briefUrl, setBriefUrl] = useState(briefSignedUrl);
  const [isPending, startTransition] = useTransition();

  // Estado / documentos comerciales / eliminar (solo cuando la cotización ya existe).
  const [status, setStatus] = useState(initial?.status ?? "draft");
  const [purchaseOrder, setPurchaseOrder] = useState(initial?.purchaseOrder ?? "");
  const [invoiceNumber, setInvoiceNumber] = useState(initial?.invoiceNumber ?? "");
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Filtro por proveedor (solo de vista; no altera lo que se guarda).
  const [supplierFilter, setSupplierFilter] = useState("");
  // Grupos colapsados (solo de vista): key del ítem-grupo → sus ítems ocultos.
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const toggleGroup = (key: string) =>
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  // Formularios de envío a proveedor (email + mensaje) por proveedor.
  const [supplierForms, setSupplierForms] = useState<
    Record<string, { email: string; message: string }>
  >({});

  const dragIndex = useRef<number | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>();
  const itemsBox = useRef<HTMLDivElement>(null);

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
        id: row.id,
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
    if (!clientId || !canEdit) return;
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
      setSaveState({ kind: "saved", at: nowLabel() });
    });
  }, [buildInput, clientId, quoteId, canEdit]);

  // Autosave con debounce: solo si el contenido difiere del último guardado.
  useEffect(() => {
    if (!clientId || !canEdit) return;
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

  // Filtro por proveedor: oculta ítems que no coinciden; los grupos siempre visibles.
  const supplierFilterNorm = supplierFilter.trim().toLowerCase();
  const isVisible = useCallback(
    (item: ItemRow) =>
      item.isGroup ||
      !supplierFilterNorm ||
      (item.supplier ?? "").toLowerCase().includes(supplierFilterNorm),
    [supplierFilterNorm],
  );

  // Totales calculados solo con los ítems visibles (paridad recalc() del legacy,
  // que excluye las filas ocultas por el filtro de proveedor).
  const totals = useMemo(
    () =>
      calcQuote(
        items
          .filter(isVisible)
          .map((item) => ({
            clientPrice: item.clientPrice,
            costPrice: item.costPrice,
            quantity: item.quantity,
            isGroup: item.isGroup,
          })),
        { role: priceRole, hasIva, ivaPercentage },
      ),
    [items, isVisible, hasIva, ivaPercentage, priceRole],
  );

  const updateItem = (key: string, patch: Partial<ItemRow>) => {
    setItems((rows) => rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  };

  // Recálculo margen ↔ precios (paridad onItemPriceChange del legacy: % = markup sobre costo).
  const onClientPriceChange = (key: string, value: number) => {
    setItems((rows) =>
      rows.map((r) =>
        r.key === key
          ? { ...r, clientPrice: value, marginPct: marginPctFromPrices(r.costPrice, value) }
          : r,
      ),
    );
  };
  const onCostChange = (key: string, value: number) => {
    setItems((rows) =>
      rows.map((r) => {
        if (r.key !== key) return r;
        // Si hay markup fijado, se mantiene y se recalcula el precio cliente;
        // si no, se recalcula el % desde los precios.
        if (r.marginPct) {
          return { ...r, costPrice: value, clientPrice: clientPriceFromMargin(value, r.marginPct) };
        }
        return { ...r, costPrice: value, marginPct: marginPctFromPrices(value, r.clientPrice) };
      }),
    );
  };
  const onMarginChange = (key: string, value: number) => {
    setItems((rows) =>
      rows.map((r) =>
        r.key === key
          ? { ...r, marginPct: value, clientPrice: clientPriceFromMargin(r.costPrice, value) }
          : r,
      ),
    );
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

  // Auto-crecer los textarea de descripción (que el texto largo no se corte).
  useLayoutEffect(() => {
    itemsBox.current
      ?.querySelectorAll<HTMLTextAreaElement>("textarea[data-autogrow]")
      .forEach(autoGrow);
  }, [items]);

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
          setSaveState({ kind: "saved", at: nowLabel() });
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
      setSaveState({ kind: "saved", at: nowLabel() });
      setStatus("sent");
      // Enviada: ahora sí navegamos a la URL real (remontar ya no pierde nada).
      router.replace(`/crm/${saved.id}`);
      router.refresh();
    });
  };

  const onStatusChange = (code: string) => {
    if (!quoteId || code === status) return;
    const prev = status;
    setStatus(code);
    startTransition(async () => {
      const res = await setQuoteStatus(quoteId, code);
      if (res.error) {
        setStatus(prev);
        setSaveState({ kind: "error", message: res.error });
      } else {
        setSaveState({ kind: "saved", at: nowLabel() });
        router.refresh();
      }
    });
  };

  const onSaveCommercialDocs = () => {
    if (!quoteId) return;
    startTransition(async () => {
      const res = await saveCommercialDocs(quoteId, { purchaseOrder, invoiceNumber });
      if (res.error) setSaveState({ kind: "error", message: res.error });
      else setSaveState({ kind: "saved", at: nowLabel() });
    });
  };

  const onDelete = () => {
    if (!quoteId) return;
    startTransition(async () => {
      const res = await deleteQuote(quoteId);
      if (res.error) setSaveState({ kind: "error", message: res.error });
      else router.push("/crm");
    });
  };

  const onSendSupplierOrder = (name: string, email: string, message: string) => {
    if (!quoteId) return;
    startTransition(async () => {
      const res = await sendSupplierOrder(quoteId, {
        supplierName: name,
        supplierEmail: email,
        message,
      });
      if (res.error) setSaveState({ kind: "error", message: res.error });
      else {
        setSaveState({ kind: "saved", at: nowLabel() });
        router.refresh();
      }
    });
  };

  const saveLabel = {
    clean: "Sin cambios",
    dirty: "Cambios sin guardar…",
    saving: "Guardando…",
    saved: `Guardado${saveState.kind === "saved" ? ` · ${saveState.at}` : ""}`,
    error: saveState.kind === "error" ? saveState.message : "",
  }[saveState.kind];

  // Celdas editables: transparentes con texto brillante; el borde/relleno solo aparece
  // al pasar el mouse o al enfocar (evita cajas pálidas que se leen como vacías).
  const inputCell =
    "w-full rounded-[10px] border border-transparent bg-transparent px-2.5 py-2 text-sm text-ink outline-none transition hover:border-line-strong focus:border-green focus:bg-surface focus:shadow-focus";

  const isAccepted = status === "accepted";
  const statusMeta = statuses.find((s) => s.code === status);
  const progress = getQuoteProgress(status);
  const progressBar = {
    danger: "bg-danger",
    warn: "bg-warn",
    success: "bg-green",
    neutral: "bg-faint",
  }[progress.tone];

  // Numeración visible de ítems (los grupos no cuentan).
  let itemCounter = 0;
  const rowNumbers = items.map((it) => (it.isGroup ? null : ++itemCounter));

  // A qué grupo pertenece cada ítem (por índice) + resumen por grupo (nº ítems y
  // subtotal con el precio que ve el rol), para colapsar y mostrar el resumen plegado.
  const groupKeyOf: (string | null)[] = [];
  const groupStats = new Map<string, { count: number; subtotal: number }>();
  {
    let current: string | null = null;
    for (const it of items) {
      if (it.isGroup) {
        current = it.key;
        if (!groupStats.has(it.key)) groupStats.set(it.key, { count: 0, subtotal: 0 });
        groupKeyOf.push(null);
      } else {
        groupKeyOf.push(current);
        if (current) {
          const s = groupStats.get(current)!;
          s.count += 1;
          s.subtotal += (seeClientPrice ? it.clientPrice : it.costPrice) * it.quantity;
        }
      }
    }
  }

  // Proveedores presentes en los ítems (para las órdenes a proveedores).
  const supplierGroups = useMemo(() => {
    const map = new Map<string, { name: string; items: ItemRow[] }>();
    for (const it of items) {
      if (it.isGroup) continue;
      const s = (it.supplier ?? "").trim();
      if (!s) continue;
      if (!map.has(s)) map.set(s, { name: s, items: [] });
      map.get(s)!.items.push(it);
    }
    return [...map.values()];
  }, [items]);

  // Respuesta del cliente (solo lectura, tomada del snapshot del server para que
  // no cambie mientras el equipo edita la cotización).
  const clientResponse = useMemo(() => {
    if (!initial) return null;
    const realItems = initial.items.filter((it) => !it.isGroup);
    const statuses = realItems.map((it) => (it.status ?? "pending") as QuoteItemStatus);
    const summary = summarizeClientResponse(statuses);
    const recipient =
      initial.recipients.find((r) => r.viewedAt || r.clientComment) ?? null;
    if (!summary && !recipient?.viewedAt) return null;
    return { realItems, summary, recipient };
  }, [initial]);

  // Plantilla de columnas de la grilla de ítems, dinámica según qué precios ve el
  // rol y si puede editar (arrastrar/eliminar). Se usa como estilo inline porque
  // Tailwind no puede generar clases arbitrarias en runtime.
  const itemGridTemplate = [
    canEdit ? "24px" : null, // arrastrar
    "28px", // #
    "minmax(220px,1fr)", // descripción
    "56px", // cantidad
    seeClientPrice ? "104px" : null, // precio cliente
    seeMargin ? "78px" : null, // % margen
    seeCost ? "104px" : null, // precio costo
    "128px", // proveedor
    "112px", // subtotal
    canEdit ? "28px" : null, // eliminar
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_340px]">
      <div className="space-y-6">
        {/* Datos generales */}
        <section className="rounded-lg border border-line bg-glass p-6 backdrop-blur-xl">
          <h2 className="text-lg font-bold tracking-tight">Datos generales</h2>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <Label htmlFor="qf-client">Cliente *</Label>
              <Select
                id="qf-client"
                value={clientId}
                disabled={!canEdit}
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
              <Select
                id="qf-kam"
                value={kamId}
                disabled={!canEdit}
                onChange={(e) => setKamId(e.target.value)}
              >
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
                disabled={!canEdit}
                onChange={(e) => setQuoteType(e.target.value)}
              >
                <option value="">Sin tipo</option>
                <option value="proyecto">Proyecto</option>
                <option value="evolutivo">Evolutivo</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="qf-name">Nombre de la cotización</Label>
              <Input
                id="qf-name"
                value={quoteName}
                disabled={!canEdit}
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
                disabled={!canEdit}
                onChange={(e) => setEventDate(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="qf-currency">Moneda</Label>
              <Select
                id="qf-currency"
                value={currency}
                disabled={!canEdit}
                onChange={(e) => setCurrency(e.target.value === "USD" ? "USD" : "COP")}
              >
                <option value="COP">COP — Peso colombiano</option>
                <option value="USD">USD — Dólar</option>
              </Select>
            </div>
            <div className="sm:col-span-3">
              <Label htmlFor="qf-message">Mensaje para el cliente</Label>
              <Textarea
                id="qf-message"
                rows={2}
                value={message}
                disabled={!canEdit}
                onChange={(e) => setMessage(e.target.value)}
              />
            </div>
            <div className="sm:col-span-3">
              <Label htmlFor="qf-notes">Notas internas</Label>
              <Textarea
                id="qf-notes"
                rows={2}
                value={internalNotes}
                disabled={!canEdit}
                onChange={(e) => setInternalNotes(e.target.value)}
                placeholder="Solo visibles para el equipo"
              />
            </div>
          </div>
        </section>

        {/* Ítems */}
        <section className="rounded-lg border border-line bg-glass p-6 backdrop-blur-xl">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-bold tracking-tight">Ítems</h2>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Input
                  value={supplierFilter}
                  onChange={(e) => setSupplierFilter(e.target.value)}
                  placeholder="Filtrar por proveedor…"
                  className="w-52 py-2"
                  aria-label="Filtrar por proveedor"
                />
                {supplierFilter && (
                  <button
                    type="button"
                    onClick={() => setSupplierFilter("")}
                    aria-label="Limpiar filtro"
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-faint hover:text-ink"
                  >
                    ✕
                  </button>
                )}
              </div>
              {canEdit && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setItems((r) => [...r, emptyItem(true)])}
                  >
                    + Grupo
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setItems((r) => [...r, emptyItem()])}
                  >
                    + Ítem
                  </Button>
                </>
              )}
            </div>
          </div>

          {supplierFilterNorm && (
            <p className="mt-2 text-[13px] text-warn">
              Mostrando solo ítems del proveedor «{supplierFilter}». Los totales reflejan ese
              proveedor.
            </p>
          )}

          <div className="ds-scroll mt-4 overflow-x-auto">
            <div className="min-w-[900px]" ref={itemsBox}>
              <div
                className="grid gap-2 border-b border-line px-2 pb-2.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted"
                style={{ gridTemplateColumns: itemGridTemplate }}
              >
                {canEdit && <span />}
                <span className="text-center text-purple">#</span>
                <span>Descripción</span>
                <span className="text-center">Cant.</span>
                {seeClientPrice && <span className="text-right">Precio cliente</span>}
                {seeMargin && <span className="text-right">% Margen</span>}
                {seeCost && <span className="text-right">Precio costo</span>}
                <span>Proveedor</span>
                <span className="text-right">Subtotal</span>
                {canEdit && <span />}
              </div>
              <div className="mt-1.5 space-y-1.5">
                {items.map((item, index) => {
                  if (!isVisible(item)) return null;
                  const groupKey = groupKeyOf[index];
                  if (!item.isGroup && groupKey && collapsedGroups.has(groupKey)) return null;
                  const isCollapsed = item.isGroup && collapsedGroups.has(item.key);
                  // El subtotal usa el precio que el rol ve (cliente para admin/viewer,
                  // costo para el creador).
                  const shownPrice = seeClientPrice ? item.clientPrice : item.costPrice;
                  const rowSubtotal = item.isGroup ? 0 : shownPrice * item.quantity;
                  return (
                    <div
                      key={item.key}
                      draggable={canEdit}
                      onDragStart={() => (dragIndex.current = index)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => onDrop(index)}
                      className={`grid items-start gap-2 rounded-[14px] border px-2 py-2 transition ${
                        item.isGroup
                          ? "border-l-2 border-l-purple border-y-transparent border-r-transparent bg-purple-soft/50"
                          : "border-line bg-surface-2/30 hover:border-line-strong hover:bg-surface-2/70"
                      }`}
                      style={{ gridTemplateColumns: itemGridTemplate }}
                    >
                      {canEdit && (
                        <span
                          className="cursor-grab select-none pt-2 text-center text-faint transition hover:text-muted active:cursor-grabbing"
                          title="Arrastra para reordenar"
                        >
                          ⋮⋮
                        </span>
                      )}
                      {item.isGroup ? (
                        <button
                          type="button"
                          onClick={() => toggleGroup(item.key)}
                          aria-expanded={!isCollapsed}
                          title={isCollapsed ? "Expandir grupo" : "Colapsar grupo"}
                          className="cursor-pointer select-none pt-1.5 text-center text-purple transition hover:text-purple/70"
                        >
                          {isCollapsed ? "▸" : "▾"}
                        </button>
                      ) : (
                        <span className="mt-0.5 flex h-6 w-6 items-center justify-center justify-self-center rounded-[8px] bg-purple-soft font-mono text-[11px] font-bold text-purple">
                          {rowNumbers[index] ?? "—"}
                        </span>
                      )}
                      <textarea
                        data-autogrow
                        rows={1}
                        value={item.description}
                        readOnly={!canEdit}
                        onChange={(e) => {
                          updateItem(item.key, { description: e.target.value });
                          autoGrow(e.currentTarget);
                        }}
                        placeholder={item.isGroup ? "Nombre del grupo…" : "Descripción del ítem…"}
                        className={
                          item.isGroup
                            ? "w-full resize-none overflow-hidden border-0 bg-transparent px-1 py-1.5 text-sm font-bold uppercase tracking-wide leading-snug text-purple outline-none placeholder:text-purple/50"
                            : `${inputCell} resize-none overflow-hidden leading-snug`
                        }
                      />
                      {item.isGroup ? (
                        <span />
                      ) : (
                        <input
                          type="number"
                          min={1}
                          value={item.quantity}
                          readOnly={!canEdit}
                          onChange={(e) =>
                            updateItem(item.key, { quantity: Number(e.target.value) })
                          }
                          className={`${inputCell} text-center`}
                        />
                      )}
                      {seeClientPrice &&
                        (item.isGroup ? (
                          <span />
                        ) : (
                          <input
                            type="text"
                            inputMode="numeric"
                            value={item.clientPrice ? formatThousands(item.clientPrice) : ""}
                            placeholder="0"
                            readOnly={!canEdit}
                            onChange={(e) =>
                              onClientPriceChange(item.key, parseThousands(e.target.value))
                            }
                            className={`${inputCell} text-right font-mono text-[13px]`}
                          />
                        ))}
                      {seeMargin &&
                        (item.isGroup ? (
                          <span />
                        ) : (
                          <input
                            type="number"
                            step="0.1"
                            value={Number(item.marginPct.toFixed(1))}
                            readOnly={!canEdit}
                            onChange={(e) => onMarginChange(item.key, Number(e.target.value))}
                            className={`${inputCell} text-right font-mono text-[13px] ${
                              item.marginPct < 0 ? "text-warn" : ""
                            }`}
                          />
                        ))}
                      {seeCost &&
                        (item.isGroup ? (
                          <span />
                        ) : (
                          <input
                            type="text"
                            inputMode="numeric"
                            value={item.costPrice ? formatThousands(item.costPrice) : ""}
                            placeholder="0"
                            readOnly={!canEdit}
                            onChange={(e) => onCostChange(item.key, parseThousands(e.target.value))}
                            className={`${inputCell} text-right font-mono text-[13px]`}
                          />
                        ))}
                      {item.isGroup ? (
                        <span />
                      ) : (
                        <input
                          value={item.supplier}
                          readOnly={!canEdit}
                          onChange={(e) => updateItem(item.key, { supplier: e.target.value })}
                          placeholder="—"
                          className={`${inputCell} text-[13px]`}
                        />
                      )}
                      <span className="pt-2 text-right font-mono text-[13px] font-bold text-ink">
                        {item.isGroup
                          ? isCollapsed
                            ? `${groupStats.get(item.key)?.count ?? 0} ít · ${formatMoney(
                                groupStats.get(item.key)?.subtotal ?? 0,
                                currency,
                              )}`
                            : ""
                          : formatMoney(rowSubtotal, currency)}
                      </span>
                      {canEdit && (
                        <button
                          type="button"
                          onClick={() => removeItem(item.key)}
                          aria-label="Eliminar fila"
                          className="cursor-pointer pt-2.5 text-center text-faint transition hover:text-danger"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        {/* Respuesta del cliente (solo lectura; llega del enlace público) */}
        {clientResponse && (
          <section className="rounded-lg border border-line bg-glass p-6 backdrop-blur-xl">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">
                Respuesta del cliente
              </h2>
              {clientResponse.summary && (
                <Badge
                  tone={clientResponse.summary.tone}
                  color={clientResponse.summary.color}
                >
                  {clientResponse.summary.label}
                </Badge>
              )}
            </div>

            <div className="mt-4 space-y-2">
              {clientResponse.realItems.map((it, i) => {
                const meta = QUOTE_ITEM_STATUS_META[(it.status ?? "pending") as QuoteItemStatus];
                return (
                  <div
                    key={i}
                    className="rounded-[12px] border border-line bg-bg/40 px-4 py-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="min-w-0 truncate text-sm font-semibold">
                        {it.description || "—"}
                      </span>
                      <Badge tone={meta.tone} color={meta.color}>
                        {meta.label}
                      </Badge>
                    </div>
                    {it.clientComment && (
                      <p className="mt-1.5 text-[13px] text-muted">“{it.clientComment}”</p>
                    )}
                  </div>
                );
              })}
            </div>

            {(clientResponse.recipient?.clientComment ||
              clientResponse.recipient?.viewedAt) && (
              <div className="mt-4 border-t border-line pt-3 text-[13px] text-muted">
                {clientResponse.recipient?.clientComment && (
                  <p className="text-ink">“{clientResponse.recipient.clientComment}”</p>
                )}
                {clientResponse.recipient?.viewedAt && (
                  <p className="mt-1">
                    {clientResponse.recipient.name || "Cliente"} · visto el{" "}
                    {formatDate(clientResponse.recipient.viewedAt)}
                  </p>
                )}
              </div>
            )}
          </section>
        )}

        {/* Órdenes a proveedores (solo con la cotización aceptada; gestión interna) */}
        {quoteId && isAccepted && canSendSupplierOrder && supplierGroups.length > 0 && (
          <section className="rounded-lg border border-line bg-glass p-6 backdrop-blur-xl">
            <h2 className="text-lg font-bold tracking-tight">Órdenes a proveedores</h2>
            <p className="mt-0.5 text-[13px] text-muted">
              Envía a cada proveedor la orden con sus ítems. El proveedor recibe un correo con el
              detalle.
            </p>
            <div className="mt-4 space-y-4">
              {supplierGroups.map((group) => {
                const existing = supplierOrders.find((o) => o.supplierName === group.name);
                const form = supplierForms[group.name] ?? {
                  email: existing?.supplierEmail ?? "",
                  message: existing?.message ?? "",
                };
                const sent = existing?.status === "sent" || existing?.status === "confirmed";
                const confirmed = existing?.status === "confirmed";
                return (
                  <div key={group.name} className="rounded-[12px] border border-line bg-bg/40 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="font-bold">{group.name}</h3>
                      {confirmed ? (
                        <Badge tone="success">Confirmó recepción</Badge>
                      ) : sent ? (
                        <Badge tone="info">Orden enviada</Badge>
                      ) : (
                        <Badge tone="neutral">Pendiente de envío</Badge>
                      )}
                    </div>
                    <ul className="mt-2 space-y-1 text-[13px] text-muted">
                      {group.items.map((it, i) => (
                        <li key={i} className="flex justify-between gap-3">
                          <span className="truncate">{it.description || "—"}</span>
                          <span className="font-mono">×{it.quantity}</span>
                        </li>
                      ))}
                    </ul>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      <div>
                        <Label htmlFor={`so-email-${group.name}`}>Email del proveedor</Label>
                        <Input
                          id={`so-email-${group.name}`}
                          type="email"
                          value={form.email}
                          placeholder="proveedor@correo.com"
                          onChange={(e) =>
                            setSupplierForms((s) => ({
                              ...s,
                              [group.name]: { ...form, email: e.target.value },
                            }))
                          }
                        />
                      </div>
                      <div>
                        <Label htmlFor={`so-msg-${group.name}`}>Mensaje (opcional)</Label>
                        <Input
                          id={`so-msg-${group.name}`}
                          value={form.message}
                          placeholder="Notas para el proveedor…"
                          onChange={(e) =>
                            setSupplierForms((s) => ({
                              ...s,
                              [group.name]: { ...form, message: e.target.value },
                            }))
                          }
                        />
                      </div>
                    </div>
                    <Button
                      variant={sent ? "outline" : "secondary"}
                      size="sm"
                      className="mt-3"
                      disabled={isPending || !form.email.trim()}
                      onClick={() => onSendSupplierOrder(group.name, form.email, form.message)}
                    >
                      {sent ? "Reenviar orden" : "Enviar orden"}
                    </Button>
                    {/* Confirmada: la orden vale como orden de compra → CTA para abrirla/descargarla. */}
                    {confirmed && existing?.token && (
                      <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-line pt-3">
                        <a
                          href={`/proveedor/${existing.token}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-pill border border-line-strong bg-surface px-3 py-1.5 text-[13px] font-semibold text-ink transition hover:border-green"
                        >
                          Ver / descargar orden de compra ↗
                        </a>
                        <span className="text-xs text-muted">
                          Ábrela y usa Imprimir (Cmd+P) para guardar el PDF.
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Destinatarios (solo quien puede enviar al cliente) */}
        {canSend && (
        <section className="rounded-lg border border-line bg-glass p-6 backdrop-blur-xl">
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
        )}
      </div>

      {/* Panel lateral */}
      <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
        {/* Estado + acciones */}
        {quoteId && (
          <div className="rounded-lg border border-line bg-glass p-6 backdrop-blur-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted">Estado</h3>
              {statusMeta && (
                <Badge
                  color={statusMeta.color}
                  variant={statusMeta.variant}
                  onColor={statusMeta.onColor}
                >
                  {statusMeta.label}
                </Badge>
              )}
            </div>
            {canManageInternal && (
              <Select
                className="mt-3"
                value={status}
                onChange={(e) => onStatusChange(e.target.value)}
                disabled={isPending}
                aria-label="Cambiar estado"
              >
                {statuses.length === 0 && <option value={status}>{status}</option>}
                {statuses.map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.label}
                  </option>
                ))}
              </Select>
            )}

            {/* Progreso del deal */}
            <div className="mt-4">
              <div className="flex items-center justify-between text-[13px]">
                <span className="text-muted">{progress.stage}</span>
                <span className="font-mono font-bold">{progress.pct}%</span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-pill bg-surface-2">
                <div
                  className={`h-full rounded-pill transition-all ${progressBar}`}
                  style={{ width: `${progress.pct}%` }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Resumen */}
        <div className="rounded-lg border border-line bg-glass p-6 backdrop-blur-xl">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted">Resumen</h3>
          <dl className="mt-4 space-y-2.5 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted">Subtotal</dt>
              <dd className="font-mono font-bold">{formatMoney(totals.subtotalClient, currency)}</dd>
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
              <dd className="font-mono font-bold text-green">{formatMoney(totals.total, currency)}</dd>
            </div>
            {seeCost && (
              <div className="flex justify-between border-t border-line pt-2.5">
                <dt className="text-muted">Costo total</dt>
                <dd className="font-mono">{formatMoney(totals.subtotalCost, currency)}</dd>
              </div>
            )}
            {seeMargin && (
              <div className="flex justify-between">
                <dt className="text-muted">Margen</dt>
                <dd
                  className={`font-mono font-bold ${totals.margin >= 0 ? "text-green" : "text-warn"}`}
                >
                  {formatMoney(totals.margin, currency)} · {totals.marginPercentage.toFixed(1)}%
                </dd>
              </div>
            )}
            <div className="flex justify-between border-t border-line pt-2.5">
              <dt className="text-muted">Ítems</dt>
              <dd className="font-mono">{totals.itemCount}</dd>
            </div>
            {initial?.createdAt && (
              <div className="flex justify-between">
                <dt className="text-muted">Creada</dt>
                <dd>{formatDate(initial.createdAt)}</dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt className="text-muted">Enviada</dt>
              <dd>{initial?.sentAt ? formatDate(initial.sentAt) : "—"}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">Versión</dt>
              <dd className="font-mono">
                {initial?.currentVersion ? `v${initial.currentVersion}` : "—"}
              </dd>
            </div>
          </dl>
        </div>

        {/* Documentos comerciales (solo aceptada; gestión interna) */}
        {quoteId && isAccepted && canManageInternal && (
          <div className="rounded-lg border border-line bg-glass p-6 backdrop-blur-xl">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted">
              Documentos comerciales
            </h3>
            <div className="mt-3 space-y-3">
              <div>
                <Label htmlFor="qf-po">Orden de compra</Label>
                <Input
                  id="qf-po"
                  value={purchaseOrder}
                  onChange={(e) => setPurchaseOrder(e.target.value)}
                  placeholder="OC-2026-001"
                />
              </div>
              <div>
                <Label htmlFor="qf-invoice">Número de factura</Label>
                <Input
                  id="qf-invoice"
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                  placeholder="FE-2026-001"
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                disabled={isPending}
                onClick={onSaveCommercialDocs}
              >
                Guardar documentos
              </Button>
            </div>
          </div>
        )}

        {/* Brief (gestión interna) */}
        {canManageInternal && (
        <div className="rounded-lg border border-line bg-glass p-6 backdrop-blur-xl">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted">Brief</h3>
          {briefUrl ? (
            <p className="mt-3 truncate text-sm text-ink">
              📎 <span className="text-muted">{briefUrl.split("/").pop()}</span>
            </p>
          ) : (
            <p className="mt-3 text-[13px] text-muted">
              Adjunta el brief del proyecto (máx 10 MB).
            </p>
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
        )}

        {/* Guardado + envío */}
        {(canEdit || canSend) && (
        <div className="rounded-lg border border-line bg-glass p-6 backdrop-blur-xl">
          <div
            className={`text-[13px] ${saveState.kind === "error" ? "text-danger" : "text-muted"}`}
            role="status"
          >
            {clientId ? saveLabel : "Selecciona un cliente para empezar a guardar."}
          </div>
          {canEdit && (
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
          )}
          {canSend && (
            <Button
              variant="secondary"
              className="mt-2 w-full"
              disabled={!clientId || isPending}
              onClick={onSend}
            >
              {initial && initial.status !== "draft" ? "Reenviar al cliente" : "Enviar al cliente"}
            </Button>
          )}
        </div>
        )}

        {/* PDF */}
        {quoteId && (
          <div className="rounded-lg border border-line bg-glass p-6 backdrop-blur-xl">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted">Exportar</h3>
            <div className="mt-3 flex flex-col gap-2">
              <a
                href={`/crm/${quoteId}/imprimir?vista=cliente`}
                target="_blank"
                rel="noreferrer"
                className="rounded-pill border border-line-strong px-4 py-2 text-center text-[13px] font-semibold text-ink transition hover:border-green"
              >
                Ver PDF cliente
              </a>
              {seeMargin && (
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

        {/* Historial de versiones */}
        {versions.length > 0 && (
          <div className="rounded-lg border border-line bg-glass p-6 backdrop-blur-xl">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted">
              Historial de versiones
            </h3>
            <ul className="mt-3 space-y-2">
              {versions.map((v, i) => (
                <li
                  key={v.version_number}
                  className="rounded-[12px] border border-line bg-bg/40 px-3 py-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold">v{v.version_number}</span>
                    {i === 0 && <Badge tone="info">Actual</Badge>}
                  </div>
                  <div className="mt-1 flex items-center justify-between text-[13px] text-muted">
                    <span>
                      {formatDate(v.created_at)} · {v.itemCount} ítems
                    </span>
                    <span className="font-mono font-bold text-ink">
                      {formatMoney(v.total, v.currency)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Eliminar (gestión interna) */}
        {quoteId && canManageInternal && (
          <div className="rounded-lg border border-danger/40 bg-glass p-6 backdrop-blur-xl">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted">Acciones</h3>
            {confirmDelete ? (
              <div className="mt-3">
                <p className="text-[13px] text-muted">¿Eliminar esta cotización?</p>
                <div className="mt-2 flex gap-2">
                  <Button variant="danger" size="sm" disabled={isPending} onClick={onDelete}>
                    Sí, eliminar
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setConfirmDelete(false)}>
                    Cancelar
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="mt-3 w-full border-danger/40 text-danger hover:border-danger"
                onClick={() => setConfirmDelete(true)}
              >
                Eliminar cotización
              </Button>
            )}
          </div>
        )}
      </aside>
    </div>
  );
}
