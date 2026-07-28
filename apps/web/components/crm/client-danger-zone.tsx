"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, FieldError } from "@agency-os/ui";
import { deleteClient } from "@/lib/client-actions";

/** Zona de peligro de la ficha de cliente (soft-delete con confirmación).
 * Vive en el sidebar, separada del formulario de perfil. */
export function ClientDangerZone({
  clientId,
  quoteCount,
}: {
  clientId: string;
  quoteCount: number;
}) {
  const router = useRouter();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const onDelete = () => {
    setError(null);
    startTransition(async () => {
      const res = await deleteClient(clientId);
      if (res.error) setError(res.error);
      else router.push("/crm/clientes");
    });
  };

  return (
    <div className="rounded-lg border border-danger/40 bg-glass p-5 backdrop-blur-xl">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-muted">Zona peligro</h3>
      {error && (
        <div className="mt-3">
          <FieldError>{error}</FieldError>
        </div>
      )}
      {confirmDelete ? (
        <div className="mt-3 space-y-3">
          <p className="text-[13px] text-muted">
            {quoteCount > 0
              ? `Este cliente tiene ${quoteCount} cotización${quoteCount === 1 ? "" : "es"}. Se ocultará de las listas y del selector de nueva cotización, pero esas cotizaciones lo seguirán mostrando. ¿Eliminar?`
              : "Se ocultará de las listas y del selector de nueva cotización. ¿Eliminar?"}
          </p>
          <div className="flex gap-3">
            <Button variant="danger" size="sm" disabled={isPending} onClick={onDelete}>
              Sí, eliminar
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={isPending}
              onClick={() => setConfirmDelete(false)}
            >
              Cancelar
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="outline" size="sm" className="mt-3" onClick={() => setConfirmDelete(true)}>
          Eliminar cliente
        </Button>
      )}
    </div>
  );
}
