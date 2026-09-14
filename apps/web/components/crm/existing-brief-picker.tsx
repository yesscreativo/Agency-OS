"use client";

import { useEffect, useMemo, useState } from "react";
import { formatDate } from "@agency-os/domain";
import { Input, Modal } from "@agency-os/ui";
import { fetchExistingBriefs, type ExistingBriefOption } from "@/lib/quote-actions";

type Scope = "client" | "all";

interface ExistingBriefPickerProps {
  open: boolean;
  onClose: () => void;
  quoteId: string | null;
  clientId: string;
  onSelect: (briefPath: string, fileName: string) => void;
}

const EXT_ICON: Record<string, string> = {
  pdf: "📄",
  doc: "📝",
  docx: "📝",
  xls: "📊",
  xlsx: "📊",
  ppt: "📑",
  pptx: "📑",
};

const fileExt = (name: string) => name.split(".").pop()?.toLowerCase() ?? "";

export function ExistingBriefPicker({
  open,
  onClose,
  quoteId,
  clientId,
  onSelect,
}: ExistingBriefPickerProps) {
  const [scope, setScope] = useState<Scope>("client");
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<ExistingBriefOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    fetchExistingBriefs(quoteId, scope === "client" ? clientId : null)
      .then((result) => {
        if (result.error) setError(result.error);
        else setItems(result.items ?? []);
      })
      .finally(() => setLoading(false));
  }, [open, scope, quoteId, clientId]);

  // Al reabrir, siempre arranca en "este cliente" y sin búsqueda pendiente.
  useEffect(() => {
    if (open) {
      setScope("client");
      setSearch("");
    }
  }, [open]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return items;
    return items.filter(
      (item) =>
        item.fileName.toLowerCase().includes(term) ||
        (item.clientName ?? "").toLowerCase().includes(term) ||
        (item.code ?? "").toLowerCase().includes(term),
    );
  }, [items, search]);

  return (
    <Modal open={open} onClose={onClose} title="Archivos existentes" size="lg">
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setScope("client")}
            className={`rounded-pill px-3 py-1 text-[13px] font-medium ${
              scope === "client" ? "bg-purple-soft text-purple" : "text-muted hover:text-ink"
            }`}
          >
            Este cliente
          </button>
          <button
            type="button"
            onClick={() => setScope("all")}
            className={`rounded-pill px-3 py-1 text-[13px] font-medium ${
              scope === "all" ? "bg-purple-soft text-purple" : "text-muted hover:text-ink"
            }`}
          >
            Todos
          </button>
        </div>

        <Input
          placeholder="Buscar por nombre, cliente o código…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <div className="max-h-[50vh] overflow-y-auto">
          {loading && <p className="py-6 text-center text-[13px] text-muted">Cargando…</p>}
          {error && <p className="py-6 text-center text-[13px] text-danger">{error}</p>}
          {!loading && !error && filtered.length === 0 && (
            <p className="py-6 text-center text-[13px] text-muted">
              {items.length === 0 ? "No hay briefs subidos todavía." : "Sin resultados."}
            </p>
          )}
          {!loading && !error && filtered.length > 0 && (
            <ul className="flex flex-col gap-2">
              {filtered.map((item) => (
                <li key={`${item.quoteId}-${item.briefPath}`}>
                  <button
                    type="button"
                    onClick={() => {
                      onSelect(item.briefPath, item.fileName);
                      onClose();
                    }}
                    className="flex w-full items-center gap-3 rounded-lg border border-line p-3 text-left hover:border-accent hover:bg-glass"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded border border-line bg-glass text-lg">
                      {item.previewUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={item.previewUrl}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span>{EXT_ICON[fileExt(item.fileName)] ?? "📎"}</span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-ink">{item.fileName}</p>
                      <p className="truncate text-[12px] text-muted">
                        {item.clientName ?? "Sin cliente"}
                        {item.code ? ` · ${item.code}` : ""}
                        {item.uploadedAt ? ` · ${formatDate(item.uploadedAt)}` : ""}
                      </p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Modal>
  );
}
