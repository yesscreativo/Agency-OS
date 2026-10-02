"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, FieldError, Input, Label } from "@agency-os/ui";
import { inviteClientContactAction, setClientContactStatusAction } from "@/lib/client-contact-actions";

// Nombrado distinto de ClientContactRow (packages/db, snake_case, fila cruda
// de la tabla) a propósito: este es el shape ya mapeado para la UI.
export interface ClientContactListItem {
  id: string;
  fullName: string;
  email: string;
  status: "invited" | "active" | "disabled";
}

const STATUS_LABEL: Record<ClientContactListItem["status"], string> = {
  invited: "Invitado",
  active: "Activo",
  disabled: "Deshabilitado",
};

const STATUS_TONE: Record<ClientContactListItem["status"], "neutral" | "success" | "danger"> = {
  invited: "neutral",
  active: "success",
  disabled: "danger",
};

export function ClientContactsPanel({
  clientId,
  contacts,
}: {
  clientId: string;
  contacts: ClientContactListItem[];
}) {
  const router = useRouter();
  const [inviting, setInviting] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const onInvite = () => {
    setError(null);
    if (!fullName.trim() || !email.trim()) return setError("Nombre y email son obligatorios.");
    startTransition(async () => {
      const result = await inviteClientContactAction(clientId, fullName, email);
      if (result.error) return setError(result.error);
      setFullName("");
      setEmail("");
      setInviting(false);
      router.refresh();
    });
  };

  const onToggleStatus = (contact: ClientContactListItem) => {
    const next = contact.status === "disabled" ? "active" : "disabled";
    startTransition(async () => {
      await setClientContactStatusAction(contact.id, next);
      router.refresh();
    });
  };

  return (
    <section className="rounded-lg border border-line bg-glass p-6 backdrop-blur-xl">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold tracking-tight">Portal</h2>
        {!inviting && (
          <Button variant="outline" size="sm" onClick={() => setInviting(true)}>
            + Invitar contacto
          </Button>
        )}
      </div>

      {inviting && (
        <div className="mt-4 space-y-3 rounded-md border border-line bg-surface p-4">
          <div>
            <Label htmlFor="contact-name">Nombre</Label>
            <Input id="contact-name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="contact-email">Email</Label>
            <Input id="contact-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <FieldError>{error}</FieldError>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" disabled={isPending} onClick={() => setInviting(false)}>
              Cancelar
            </Button>
            <Button variant="primary" size="sm" disabled={isPending} onClick={onInvite}>
              Invitar
            </Button>
          </div>
        </div>
      )}

      <div className="mt-4 space-y-2">
        {contacts.length === 0 ? (
          <p className="text-sm text-faint">Todavía no hay contactos invitados.</p>
        ) : (
          contacts.map((c) => (
            <div
              key={c.id}
              className="flex items-center justify-between rounded-md border border-line bg-surface px-4 py-2.5"
            >
              <div>
                <div className="text-sm font-semibold text-ink">{c.fullName}</div>
                <div className="text-xs text-muted">{c.email}</div>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={STATUS_TONE[c.status]}>{STATUS_LABEL[c.status]}</Badge>
                {c.status !== "invited" && (
                  <Button variant="ghost" size="sm" disabled={isPending} onClick={() => onToggleStatus(c)}>
                    {c.status === "disabled" ? "Reactivar" : "Deshabilitar"}
                  </Button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
