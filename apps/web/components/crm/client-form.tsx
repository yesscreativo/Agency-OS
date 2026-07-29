"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, FieldError, Input, Label } from "@agency-os/ui";
import { saveClient, type ClientInput } from "@/lib/client-actions";

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
export function ClientForm({ initial }: { initial: ClientFormInitial }) {
  const router = useRouter();
  const [form, setForm] = useState<ClientInput>({ ...initial });
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
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
    </div>
  );
}
