"use client";

import { useRef, useState, useTransition } from "react";
import { Badge, Button, Input, Label, Modal, Table, Td, Th, readableTextOn } from "@agency-os/ui";
import {
  createQuoteStatus,
  deleteQuoteStatus,
  reorderQuoteStatuses,
  toggleQuoteStatus,
  updateQuoteStatus,
} from "@/lib/quote-status-actions";

export interface QuoteStatusManagerRow {
  id: string;
  code: string;
  label: string;
  color: string;
  isSolid: boolean;
  onColor: string | null;
  isActive: boolean;
  isSystem: boolean;
}

/** Paleta curada del design system para el picker (hexes legibles en ambos temas). */
const SWATCHES = [
  "#9aa1ab",
  "#7eb8ff",
  "#f5c95a",
  "#8b5cf6",
  "#86c99a",
  "#e5675f",
  "#3bc9c9",
  "#1f8f4d",
  "#e879b9",
  "#f59e42",
];

type Editing = null | "new" | QuoteStatusManagerRow;

export function QuoteStatusManager({ statuses }: { statuses: QuoteStatusManagerRow[] }) {
  const [rows, setRows] = useState(statuses);
  const [editing, setEditing] = useState<Editing>(null);
  const [deleting, setDeleting] = useState<QuoteStatusManagerRow | null>(null);
  const [label, setLabel] = useState("");
  const [color, setColor] = useState("#8b5cf6");
  const [isSolid, setIsSolid] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const dragIndex = useRef<number | null>(null);

  const openModal = (target: Exclude<Editing, null>) => {
    setEditing(target);
    setError(null);
    if (target === "new") {
      setLabel("");
      setColor("#8b5cf6");
      setIsSolid(false);
    } else {
      setLabel(target.label);
      setColor(target.color);
      setIsSolid(target.isSolid);
    }
  };

  const submit = () => {
    startTransition(async () => {
      const values = { label, color, isSolid };
      const result =
        editing === "new"
          ? await createQuoteStatus(values)
          : editing
            ? await updateQuoteStatus(editing.id, values)
            : { error: "Sin selección." };
      if (result.error) setError(result.error);
      else setEditing(null);
    });
  };

  const toggle = (row: QuoteStatusManagerRow) => {
    startTransition(async () => {
      await toggleQuoteStatus(row.id, !row.isActive);
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, isActive: !r.isActive } : r)));
    });
  };

  const confirmDelete = () => {
    if (!deleting) return;
    startTransition(async () => {
      const result = await deleteQuoteStatus(deleting.id);
      if (result.error) setError(result.error);
      else {
        setRows((prev) => prev.filter((r) => r.id !== deleting.id));
        setDeleting(null);
      }
    });
  };

  const onDrop = (index: number) => {
    const from = dragIndex.current;
    dragIndex.current = null;
    if (from === null || from === index) return;
    const next = [...rows];
    const [moved] = next.splice(from, 1);
    if (!moved) return;
    next.splice(index, 0, moved);
    setRows(next);
    startTransition(async () => {
      await reorderQuoteStatuses(next.map((r) => r.id));
    });
  };

  // Aviso de contraste: color claro en variante suave puede quedar flojo en tema claro.
  const lightColorSoft = !isSolid && readableTextOn(color) === "#0d0f08";

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Estados</h1>
          <p className="mt-1 text-sm text-muted">
            Personaliza el pipeline: nombre, color, orden y estados propios de tu agencia.
          </p>
        </div>
        <Button onClick={() => openModal("new")}>+ Nuevo estado</Button>
      </div>

      <div className="mt-6">
        <Table>
          <thead>
            <tr>
              <Th className="w-8"> </Th>
              <Th>Estado</Th>
              <Th>Código</Th>
              <Th>Tipo</Th>
              <Th>Activo</Th>
              <Th className="text-right"> </Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr
                key={row.id}
                draggable
                onDragStart={() => (dragIndex.current = index)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => onDrop(index)}
                className="transition hover:bg-surface-2"
              >
                <Td className="cursor-grab select-none text-center text-faint" title="Arrastra para reordenar">
                  ⠿
                </Td>
                <Td>
                  <Badge
                    color={row.color}
                    variant={row.isSolid ? "solid" : "soft"}
                    onColor={row.onColor ?? undefined}
                  >
                    {row.label}
                  </Badge>
                </Td>
                <Td className="font-mono text-xs text-muted">{row.code}</Td>
                <Td>
                  <span className="text-xs text-muted">{row.isSystem ? "Sistema" : "Personalizado"}</span>
                </Td>
                <Td>
                  <Badge tone={row.isActive ? "success" : "neutral"}>
                    {row.isActive ? "Activo" : "Inactivo"}
                  </Badge>
                </Td>
                <Td className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={() => openModal(row)}>
                      Editar
                    </Button>
                    <Button variant="ghost" size="sm" disabled={pending} onClick={() => toggle(row)}>
                      {row.isActive ? "Desactivar" : "Activar"}
                    </Button>
                    {!row.isSystem && (
                      <Button
                        variant="danger"
                        size="sm"
                        disabled={pending}
                        onClick={() => {
                          setError(null);
                          setDeleting(row);
                        }}
                      >
                        Eliminar
                      </Button>
                    )}
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </div>

      {/* Modal crear/editar */}
      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === "new" ? "Nuevo estado" : "Editar estado"}
        description="Se mostrará como etiqueta en la lista y el pipeline de cotizaciones."
        footer={
          <>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancelar
            </Button>
            <Button onClick={submit} disabled={pending || !label.trim()}>
              {pending ? "Guardando…" : "Guardar"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <Label htmlFor="qs-label">Nombre</Label>
            <Input
              id="qs-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Ej. En negociación"
              autoFocus
            />
          </div>

          <div>
            <Label htmlFor="qs-color">Color</Label>
            <div className="flex items-center gap-3">
              <input
                id="qs-color"
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="h-9 w-12 cursor-pointer rounded-md border border-line bg-transparent"
              />
              <div className="flex flex-wrap gap-1.5">
                {SWATCHES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    aria-label={s}
                    onClick={() => setColor(s)}
                    className={`h-6 w-6 rounded-pill border transition ${
                      color.toLowerCase() === s.toLowerCase()
                        ? "border-ink"
                        : "border-line-strong"
                    }`}
                    style={{ background: s }}
                  />
                ))}
              </div>
            </div>
          </div>

          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isSolid}
              onChange={(e) => setIsSolid(e.target.checked)}
              className="h-4 w-4 accent-[var(--green)]"
            />
            Estilo sólido (fondo lleno, para estados finales)
          </label>

          <div className="flex items-center gap-3 rounded-md border border-line bg-surface-2 p-3">
            <span className="text-xs text-muted">Vista previa:</span>
            <Badge color={color} variant={isSolid ? "solid" : "soft"}>
              {label.trim() || "Estado"}
            </Badge>
          </div>

          {lightColorSoft && (
            <p className="text-xs text-warn">
              Color claro: en tema claro el texto puede tener bajo contraste. Considera el estilo
              sólido.
            </p>
          )}
          {error && <p className="text-sm text-danger">{error}</p>}
        </div>
      </Modal>

      {/* Modal confirmar borrado */}
      <Modal
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title="Eliminar estado"
        description={
          deleting
            ? `Se eliminará el estado "${deleting.label}". Esta acción no se puede deshacer.`
            : undefined
        }
        footer={
          <>
            <Button variant="outline" onClick={() => setDeleting(null)}>
              Cancelar
            </Button>
            <Button variant="danger" onClick={confirmDelete} disabled={pending}>
              {pending ? "Eliminando…" : "Eliminar"}
            </Button>
          </>
        }
      >
        {error && deleting && <p className="text-sm text-danger">{error}</p>}
        {!error && (
          <p className="text-sm text-muted">
            Solo se pueden eliminar estados personalizados sin cotizaciones asignadas. Si no, mejor
            desactívalo.
          </p>
        )}
      </Modal>
    </div>
  );
}
