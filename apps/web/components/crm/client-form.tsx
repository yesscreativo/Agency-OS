"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, FieldError, Input, Label } from "@agency-os/ui";
import { deleteClient, saveClient, type ClientInput } from "@/lib/client-actions";

export interface ClientFormInitial {
  id: string;
  name: string;
  company: string;
  code: string;
  nit: string;
  responsible: string;
  email: string;
  phone: string;
}

/** Perfil editable de un cliente (ficha). El código se puede editar; la unicidad
 * la valida el server. La eliminación es soft-delete con confirmación. */
export function ClientForm({
  initial,
  quoteCount,
}: {
  initial: ClientFormInitial;
  quoteCount: number;
}) {
  const router = useRouter();
  const [form, setForm] = useState<ClientInput>({ ...initial });
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isPending, startTransition] = useTransition();

  const set = (key: keyof ClientInput) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
    setSaved(false);
  };

  const onSave = () => {
    setError(null);
    startTransition(async () => {
      const res = await saveClient(form);
      if (res.error) setError(res.error);
      else {
        setSaved(true);
        router.refresh();
      }
    });
  };

  const onDelete = () => {
    setError(null);
    startTransition(async () => {
      const res = await deleteClient(initial.id);
      if (res.error) setError(res.error);
      else router.push("/crm/clientes");
    });
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="cl-name">Nombre *</Label>
          <Input id="cl-name" value={form.name} onChange={set("name")} />
        </div>
        <div>
          <Label htmlFor="cl-code">Código *</Label>
          <Input
            id="cl-code"
            value={form.code}
            onChange={(e) => {
              setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }));
              setSaved(false);
            }}
          />
        </div>
        <div>
          <Label htmlFor="cl-company">Empresa</Label>
          <Input id="cl-company" value={form.company} onChange={set("company")} />
        </div>
        <div>
          <Label htmlFor="cl-nit">NIT</Label>
          <Input id="cl-nit" value={form.nit} onChange={set("nit")} />
        </div>
        <div>
          <Label htmlFor="cl-resp">Responsable</Label>
          <Input id="cl-resp" value={form.responsible} onChange={set("responsible")} />
        </div>
        <div>
          <Label htmlFor="cl-email">Email</Label>
          <Input id="cl-email" type="email" value={form.email} onChange={set("email")} />
        </div>
        <div>
          <Label htmlFor="cl-phone">Teléfono</Label>
          <Input id="cl-phone" value={form.phone} onChange={set("phone")} />
        </div>
      </div>

      {error && <FieldError>{error}</FieldError>}

      <div className="flex flex-wrap items-center gap-3">
        <Button variant="primary" size="sm" disabled={isPending} onClick={onSave}>
          Guardar
        </Button>
        {saved && <span className="text-[13px] text-green">Guardado ✓</span>}
      </div>

      <div className="rounded-lg border border-danger/40 bg-surface p-5">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted">Zona peligro</h3>
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
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => setConfirmDelete(true)}
          >
            Eliminar cliente
          </Button>
        )}
      </div>
    </div>
  );
}
